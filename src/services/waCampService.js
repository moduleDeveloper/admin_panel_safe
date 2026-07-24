import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache';

const TABLE_NAME = 'WaCamp';
const TEMPLATE_EMBED = 'WaTemp(id, name, trust_id, language, type, var_count)';
const MAX_FETCH = 200;

// New rows (created via wa_camp_curi) only have a combined `scheduled_at`
// column — split it into date/time strings so the existing UI keeps working.
function splitScheduledAt(scheduledAt) {
  if (!scheduledAt) return { date: '', time: '' };
  const parsed = new Date(scheduledAt);
  if (Number.isNaN(parsed.getTime())) return { date: '', time: '' };
  const pad = (n) => String(n).padStart(2, '0');
  return {
    date: `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`,
    time: `${pad(parsed.getHours())}:${pad(parsed.getMinutes())}`,
  };
}

function normalizeRow(row = {}) {
  const derived = splitScheduledAt(row.scheduled_at);
  return {
    id: row.id,
    template_id: row.template_id || null,
    template: row.WaTemp || null,
    schedule_date: row.schedule_date || derived.date,
    schedule_time: row.schedule_time || derived.time,
    sender_list: Array.isArray(row.sender_list) ? row.sender_list : [],
    status: row.status || 'pending',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    raw: row,
  };
}

async function fetchWaCampById(id) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select(`*, ${TEMPLATE_EMBED}`)
    .eq('id', id)
    .single();
  return { data: data ? normalizeRow(data) : null, error };
}

export async function fetchWaCampsByTrust(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(
    `wa-camp:list:${trustId}`,
    async () => {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select(`*, WaTemp!inner(id, name, trust_id, language, type, var_count)`)
        .eq('WaTemp.trust_id', trustId)
        .order('created_at', { ascending: false })
        .range(0, MAX_FETCH - 1);

      return { data: (data || []).map(normalizeRow), error };
    },
    12000
  );
}

export async function createWaCamp(payload = {}) {
  if (!payload.template_id) return { data: null, error: { message: 'Template is required.' } };
  if (!payload.schedule_date) return { data: null, error: { message: 'Schedule date is required.' } };
  if (!payload.schedule_time) return { data: null, error: { message: 'Schedule time is required.' } };

  const row = {
    template_id: payload.template_id,
    schedule_date: payload.schedule_date,
    schedule_time: payload.schedule_time,
    sender_list: Array.isArray(payload.sender_list) ? payload.sender_list : [],
    status: String(payload.status || 'pending').trim() || 'pending',
  };

  const { data, error } = await supabase.from(TABLE_NAME).insert([row]).select('id').single();
  if (error) return { data: null, error };

  invalidateCache('wa-camp:');
  return fetchWaCampById(data.id);
}

export async function updateWaCamp(campId, updates = {}) {
  if (!campId) return { data: null, error: { message: 'No campaign id provided.' } };

  const payload = {
    ...(updates.template_id !== undefined ? { template_id: updates.template_id } : {}),
    ...(updates.schedule_date !== undefined ? { schedule_date: updates.schedule_date } : {}),
    ...(updates.schedule_time !== undefined ? { schedule_time: updates.schedule_time } : {}),
    ...(updates.sender_list !== undefined
      ? { sender_list: Array.isArray(updates.sender_list) ? updates.sender_list : [] }
      : {}),
    ...(updates.status !== undefined ? { status: String(updates.status || 'pending').trim() || 'pending' } : {}),
    updated_at: new Date().toISOString(),
  };

  const { error: updateError } = await supabase.from(TABLE_NAME).update(payload).eq('id', campId).select('id').single();
  if (updateError) return { data: null, error: updateError };

  invalidateCache('wa-camp:');
  return fetchWaCampById(campId);
}

// Sends the raw uploaded rows straight to wa_camp_curi — it validates the
// template/service, enforces max_camp_size, cleans up each row's phone number,
// and inserts the WaCamp row itself. Create-only (no edit support).
export async function submitWaCampaign({ trustId, templateId, rows, scheduledAt }) {
  if (!templateId) return { data: null, error: { message: 'Template is required.' } };
  if (!scheduledAt) return { data: null, error: { message: 'Scheduled date and time are required.' } };
  if (!Array.isArray(rows) || !rows.length) {
    return { data: null, error: { message: 'Upload a file with at least one row first.' } };
  }

  const { data, error } = await supabase.rpc('wa_camp_curi', {
    p_wa_temp_id: templateId,
    p_trust_id: trustId,
    p_rows: rows,
    p_scheduled_at: scheduledAt,
  });

  if (error) return { data: null, error: { message: error.message || 'Unable to submit campaign.' } };
  if (data?.success === false) return { data: null, error: { message: data.error || 'Unable to submit campaign.' } };

  invalidateCache('wa-camp:');
  return { data, error: null };
}

export async function deleteWaCamp(campId) {
  if (!campId) return { error: { message: 'No campaign id provided.' } };

  const { error } = await supabase.from(TABLE_NAME).delete().eq('id', campId);
  if (!error) invalidateCache('wa-camp:');
  return { error };
}
