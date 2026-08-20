import { supabase } from '../../lib/supabase';
import { cachedQuery, invalidateCache } from '../requestCache';

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
    template: row.template || row.WaTemp || row.wa_temp || null,
    schedule_date: row.schedule_date || derived.date,
    schedule_time: row.schedule_time || derived.time,
    sender_list: Array.isArray(row.sender_list) ? row.sender_list : [],
    status: row.status || 'pending',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    raw: row,
  };
}

function unwrapRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function unwrapRow(data) {
  if (Array.isArray(data)) return data[0] || null;
  if (Array.isArray(data?.rows)) return data.rows[0] || null;
  if (Array.isArray(data?.data)) return data.data[0] || null;
  if (data?.data && typeof data.data === 'object' && data.data.id) return data.data;
  if (data?.row && typeof data.row === 'object' && data.row.id) return data.row;
  if (data && typeof data === 'object' && data.id) return data;
  return null;
}

function buildCampPayload(payload = {}) {
  return {
    ...(payload.template_id !== undefined ? { p_template_id: payload.template_id || null } : {}),
    ...(payload.schedule_date !== undefined ? { p_schedule_date: payload.schedule_date || null } : {}),
    ...(payload.schedule_time !== undefined ? { p_schedule_time: payload.schedule_time || null } : {}),
    ...(payload.sender_list !== undefined
      ? { p_sender_list: Array.isArray(payload.sender_list) ? payload.sender_list : [] }
      : {}),
    ...(payload.status !== undefined ? { p_status: String(payload.status || 'pending').trim() || 'pending' } : {}),
  };
}

async function manageWaCampRpc(params) {
  const { data, error } = await supabase.rpc('manage_wa_camp', params);
  return { data, error };
}

async function fetchWaCampById(id, trustId) {
  if (!id || !trustId) return { data: null, error: { message: 'No campaign id provided.' } };

  const { data, error } = await manageWaCampRpc({
    p_action: 'get',
    p_trust_id: trustId,
    p_id: id,
  });
  if (error) {
    console.error('[WA:Campaign] fetchWaCampById RPC failed', { id, trustId, error });
    return { data: null, error };
  }

  const row = unwrapRow(data);
  if (!row) return { data: null, error: { message: 'Campaign not found.' } };
  return { data: normalizeRow(row), error: null };
}

export async function fetchWaCampsByTrust(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(
    `wa-camp:list:${trustId}`,
    async () => {
      const { data, error } = await manageWaCampRpc({
        p_action: 'list',
        p_trust_id: trustId,
      });

      if (error) {
        console.error('[WA:Campaign] fetchWaCampsByTrust RPC failed', { trustId, error });
        return { data: [], error };
      }

      return { data: unwrapRows(data).map((row) => normalizeRow(row)), error: null };
    },
    12000
  );
}

export async function createWaCamp(payload = {}) {
  if (!payload.template_id) return { data: null, error: { message: 'Template is required.' } };
  if (!payload.schedule_date) return { data: null, error: { message: 'Schedule date is required.' } };
  if (!payload.schedule_time) return { data: null, error: { message: 'Schedule time is required.' } };
  if (!payload.trust_id) return { data: null, error: { message: 'No trust id provided.' } };

  const { data, error } = await manageWaCampRpc({
    p_action: 'insert',
    p_trust_id: payload.trust_id,
    ...buildCampPayload(payload),
  });
  if (error) {
    console.error('[WA:Campaign] createWaCamp RPC failed', { payload, error });
    return { data: null, error };
  }

  invalidateCache('wa-camp:');
  const row = unwrapRow(data);
  if (row) return { data: normalizeRow(row), error: null };
  return fetchWaCampById(data?.data?.id || data?.id || null, payload.trust_id);
}

export async function updateWaCamp(campId, updates = {}, trustId = null) {
  if (!campId) return { data: null, error: { message: 'No campaign id provided.' } };
  if (!trustId) return { data: null, error: { message: 'No trust id provided.' } };

  const { data, error } = await manageWaCampRpc({
    p_action: 'update',
    p_trust_id: trustId,
    p_id: campId,
    ...buildCampPayload(updates),
  });

  if (error) {
    console.error('[WA:Campaign] updateWaCamp RPC failed', { campId, trustId, updates, error });
    return { data: null, error };
  }

  invalidateCache('wa-camp:');
  const row = unwrapRow(data);
  if (row) return { data: normalizeRow(row), error: null };
  return fetchWaCampById(campId, trustId);
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

  if (error) {
    console.error('[WA:Campaign] submitWaCampaign RPC error', { trustId, templateId, error });
    return { data: null, error: { message: error.message || 'Unable to submit campaign.' } };
  }
  if (data?.success === false) {
    console.error('[WA:Campaign] submitWaCampaign rejected', { trustId, templateId, data });
    return { data: null, error: { message: data.error || 'Unable to submit campaign.' } };
  }

  invalidateCache('wa-camp:');
  return { data, error: null };
}

export async function deleteWaCamp(campId, trustId = null) {
  if (!campId) return { error: { message: 'No campaign id provided.' } };

  const { error } = await manageWaCampRpc({
    p_action: 'delete',
    p_trust_id: trustId,
    p_id: campId,
  });
  if (error) console.error('[WA:Campaign] deleteWaCamp RPC failed', { campId, error });
  else invalidateCache('wa-camp:');
  return { error };
}
