import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache';

function normalizeRow(row = {}) {
  return {
    id: row.id,
    trust_id: row.trust_id || row.p_trust_id || null,
    provider: row.provider || '',
    purpose: row.purpose || '',
    name: row.name || '',
    wa_number: row.wa_number || '',
    company_id: row.company_id || '',
    endpoint: row.endpoint || '',
    api_token: row.api_token || '',
    is_active: row.is_active !== false,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    raw: row,
  };
}

export async function fetchWaServicesByTrust(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(
    `wa-service:list:${trustId}`,
    async () => {
<<<<<<< HEAD
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .eq('trust_id', trustId)
        .order('created_at', { ascending: false })
        .range(0, MAX_FETCH - 1);

      return { data: (data || []).map(normalizeRow), error };
=======
      const { data, error } = await supabase.rpc('manage_wa_service', {
        p_action: 'get',
        p_trust_id: trustId,
      });
      if (error) {
        console.error('[WA:ServiceProvider] fetchWaServicesByTrust RPC failed', { trustId, error });
        return { data: [], error };
      }
      const rows = Array.isArray(data) ? data : data?.data || [];
      return { data: rows.map(normalizeRow), error: null };
>>>>>>> 5b70b4f (Whatsapp wired with API)
    },
    12000
  );
}

export async function createWaService(payload = {}) {
  const row = {
    trust_id: payload.trust_id || null,
    provider: String(payload.provider || '').trim(),
    purpose: String(payload.purpose || '').trim(),
    name: String(payload.name || '').trim(),
    wa_number: String(payload.wa_number || '').trim() || null,
    company_id: String(payload.company_id || '').trim() || null,
    endpoint: String(payload.endpoint || '').trim() || null,
    api_token: String(payload.api_token || '').trim() || null,
    is_active: payload.is_active !== false,
  };

<<<<<<< HEAD
  const { data, error } = await supabase.from(TABLE_NAME).insert([row]).select('*').single();
  if (!error) invalidateCache('wa-service:');
  return { data: data ? normalizeRow(data) : null, error };
=======
  const { data, error } = await supabase.rpc('manage_wa_service', {
    p_action: 'create',
    p_trust_id: row.trust_id,
    p_payload: row,
  });
  if (error) console.error('[WA:ServiceProvider] createWaService RPC failed', { row, error });
  else invalidateCache('wa-service:');
  const result = Array.isArray(data) ? data[0] : data?.data?.[0] || data;
  return { data: result ? normalizeRow(result) : null, error };
>>>>>>> 5b70b4f (Whatsapp wired with API)
}

export async function updateWaService(serviceId, updates = {}, trustId = null) {
  if (!serviceId) return { data: null, error: { message: 'No service id provided.' } };

  const payload = {
    ...(updates.provider !== undefined ? { provider: String(updates.provider || '').trim() } : {}),
    ...(updates.purpose !== undefined ? { purpose: String(updates.purpose || '').trim() } : {}),
    ...(updates.name !== undefined ? { name: String(updates.name || '').trim() } : {}),
    ...(updates.wa_number !== undefined ? { wa_number: String(updates.wa_number || '').trim() || null } : {}),
    ...(updates.company_id !== undefined ? { company_id: String(updates.company_id || '').trim() || null } : {}),
    ...(updates.endpoint !== undefined ? { endpoint: String(updates.endpoint || '').trim() || null } : {}),
    ...(updates.api_token !== undefined ? { api_token: String(updates.api_token || '').trim() || null } : {}),
    ...(updates.is_active !== undefined ? { is_active: updates.is_active !== false } : {}),
    updated_at: new Date().toISOString(),
  };

<<<<<<< HEAD
  let query = supabase.from(TABLE_NAME).update(payload).eq('id', serviceId);
  if (trustId) query = query.eq('trust_id', trustId);

  const { data, error } = await query.select('*').single();
  if (!error) invalidateCache('wa-service:');
  return { data: data ? normalizeRow(data) : null, error };
=======
  const { data, error } = await supabase.rpc('manage_wa_service', {
    p_action: 'update',
    p_trust_id: trustId,
    p_id: serviceId,
    p_payload: payload,
  });
  if (error) console.error('[WA:ServiceProvider] updateWaService RPC failed', { serviceId, payload, error });
  else invalidateCache('wa-service:');
  const result = Array.isArray(data) ? data[0] : data?.data?.[0] || data;
  return { data: result ? normalizeRow(result) : null, error };
>>>>>>> 5b70b4f (Whatsapp wired with API)
}

export async function deleteWaService(serviceId, trustId = null) {
  if (!serviceId) return { error: { message: 'No service id provided.' } };

<<<<<<< HEAD
  let query = supabase.from(TABLE_NAME).delete().eq('id', serviceId);
  if (trustId) query = query.eq('trust_id', trustId);

  const { error } = await query;
  if (!error) invalidateCache('wa-service:');
=======
  const { error } = await supabase.rpc('manage_wa_service', {
    p_action: 'delete',
    p_trust_id: trustId,
    p_id: serviceId,
  });
  if (error) console.error('[WA:ServiceProvider] deleteWaService RPC failed', { serviceId, error });
  else invalidateCache('wa-service:');
>>>>>>> 5b70b4f (Whatsapp wired with API)
  return { error };
}
