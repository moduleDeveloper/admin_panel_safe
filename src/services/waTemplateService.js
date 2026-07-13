import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache';

const TABLE_NAME = 'WaTemp';
const VAR_TABLE_NAME = 'WaTempVar';
const MAX_FETCH = 200;

function normalizeVarRow(row = {}) {
  return {
    id: row.id,
    wa_temp_id: row.wa_temp_id,
    var_key: row.var_key || '',
    display_label: row.display_label || '',
    source_table: row.source_table || '',
    source_column: row.source_column || '',
    fallback_value: row.fallback_value || '',
    created_at: row.created_at || null,
  };
}

function normalizeRow(row = {}) {
  return {
    id: row.id,
    trust_id: row.trust_id || null,
    wa_service_id: row.wa_service_id || null,
    waService: row.WaService || null,
    name: row.name || '',
    language: row.language || 'en',
    text: row.text || '',
    type: row.type || '',
    purpose: row.purpose || '',
    footer: row.footer || '',
    approved: row.approved === true,
    var_count: row.var_count ?? 0,
    variables: Array.isArray(row.WaTempVar) ? row.WaTempVar.map(normalizeVarRow) : [],
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    raw: row,
  };
}

export async function fetchWaTemplatesByTrust(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(
    `wa-template:list:${trustId}`,
    async () => {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*, WaService(id, name, provider, purpose, is_active), WaTempVar(*)')
        .eq('trust_id', trustId)
        .order('created_at', { ascending: false })
        .range(0, MAX_FETCH - 1);

      return { data: (data || []).map(normalizeRow), error };
    },
    12000
  );
}

export async function createWaTemplate(payload = {}, variables = []) {
  if (!payload.trust_id) return { data: null, error: { message: 'No trust id provided.' } };
  if (!payload.wa_service_id) return { data: null, error: { message: 'Service provider is required.' } };

  const row = {
    trust_id: payload.trust_id,
    wa_service_id: payload.wa_service_id,
    name: String(payload.name || '').trim(),
    language: String(payload.language || 'en').trim() || 'en',
    text: String(payload.text || '').trim() || null,
    type: String(payload.type || '').trim() || null,
    purpose: String(payload.purpose || '').trim() || null,
    footer: String(payload.footer || '').trim() || null,
    approved: payload.approved === true,
    var_count: Array.isArray(variables) ? variables.length : 0,
  };

  const { data, error } = await supabase.from(TABLE_NAME).insert([row]).select('*').single();
  if (error) return { data: null, error };

  const cleanVariables = (variables || []).filter((v) => String(v.var_key || '').trim());
  if (cleanVariables.length) {
    const varRows = cleanVariables.map((v) => ({
      wa_temp_id: data.id,
      var_key: String(v.var_key || '').trim(),
      display_label: String(v.display_label || '').trim() || null,
      source_table: String(v.source_table || '').trim() || null,
      source_column: String(v.source_column || '').trim() || null,
      fallback_value: String(v.fallback_value || '').trim() || null,
    }));
    const { error: varError } = await supabase.from(VAR_TABLE_NAME).insert(varRows);
    if (varError) {
      invalidateCache('wa-template:');
      return { data: null, error: varError };
    }
  }

  invalidateCache('wa-template:');
  return fetchWaTemplateById(data.id);
}

async function fetchWaTemplateById(id) {
  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('*, WaService(id, name, provider, purpose, is_active), WaTempVar(*)')
    .eq('id', id)
    .single();
  return { data: data ? normalizeRow(data) : null, error };
}

export async function updateWaTemplate(templateId, updates = {}, variables = [], trustId = null) {
  if (!templateId) return { data: null, error: { message: 'No template id provided.' } };

  const payload = {
    ...(updates.wa_service_id !== undefined ? { wa_service_id: updates.wa_service_id } : {}),
    ...(updates.name !== undefined ? { name: String(updates.name || '').trim() } : {}),
    ...(updates.language !== undefined ? { language: String(updates.language || 'en').trim() || 'en' } : {}),
    ...(updates.text !== undefined ? { text: String(updates.text || '').trim() || null } : {}),
    ...(updates.type !== undefined ? { type: String(updates.type || '').trim() || null } : {}),
    ...(updates.purpose !== undefined ? { purpose: String(updates.purpose || '').trim() || null } : {}),
    ...(updates.footer !== undefined ? { footer: String(updates.footer || '').trim() || null } : {}),
    ...(updates.approved !== undefined ? { approved: updates.approved === true } : {}),
    var_count: Array.isArray(variables) ? variables.filter((v) => String(v.var_key || '').trim()).length : 0,
    updated_at: new Date().toISOString(),
  };

  let query = supabase.from(TABLE_NAME).update(payload).eq('id', templateId);
  if (trustId) query = query.eq('trust_id', trustId);

  const { error: updateError } = await query.select('id').single();
  if (updateError) return { data: null, error: updateError };

  const { error: deleteVarsError } = await supabase.from(VAR_TABLE_NAME).delete().eq('wa_temp_id', templateId);
  if (deleteVarsError) {
    invalidateCache('wa-template:');
    return { data: null, error: deleteVarsError };
  }

  const cleanVariables = (variables || []).filter((v) => String(v.var_key || '').trim());
  if (cleanVariables.length) {
    const varRows = cleanVariables.map((v) => ({
      wa_temp_id: templateId,
      var_key: String(v.var_key || '').trim(),
      display_label: String(v.display_label || '').trim() || null,
      source_table: String(v.source_table || '').trim() || null,
      source_column: String(v.source_column || '').trim() || null,
      fallback_value: String(v.fallback_value || '').trim() || null,
    }));
    const { error: varError } = await supabase.from(VAR_TABLE_NAME).insert(varRows);
    if (varError) {
      invalidateCache('wa-template:');
      return { data: null, error: varError };
    }
  }

  invalidateCache('wa-template:');
  return fetchWaTemplateById(templateId);
}

export async function deleteWaTemplate(templateId, trustId = null) {
  if (!templateId) return { error: { message: 'No template id provided.' } };

  let query = supabase.from(TABLE_NAME).delete().eq('id', templateId);
  if (trustId) query = query.eq('trust_id', trustId);

  const { error } = await query;
  if (!error) invalidateCache('wa-template:');
  return { error };
}
