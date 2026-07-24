import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { badRequest } from '../utils/helpers.js';

const TABLE_NAME = 'WaTemp';
const VAR_TABLE_NAME = 'WaTempVar';
const MAX_FETCH = 200;
const SELECT_WITH_RELATIONS =
  '*, WaService(id, name, provider, purpose, is_active), WaMedia(id, name, purpose, type, extn, public_url, is_active), WaTempVar(*)';

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
    wa_media_id: row.wa_media_id || null,
    waMedia: row.WaMedia || null,
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
  };
}

async function fetchTemplateById(id) {
  const { data, error } = await supabaseAdmin
    .from(TABLE_NAME)
    .select(SELECT_WITH_RELATIONS)
    .eq('id', id)
    .single();
  return { data: data ? normalizeRow(data) : null, error };
}

export async function getWaTemplatesHandler(req, res) {
  try {
    const trustId = String(req.params?.trustId || '').trim();
    if (!trustId) return badRequest(res, 'trustId is required.');

    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select(SELECT_WITH_RELATIONS)
      .eq('trust_id', trustId)
      .order('created_at', { ascending: false })
      .range(0, MAX_FETCH - 1);

    if (error) return res.status(500).json({ error: error.message || 'Failed to fetch templates.' });
    return res.json({ data: (data || []).map(normalizeRow) });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch templates.' });
  }
}

// `type` and `approved` are not settable via the wa_temp_curl RPC (the RPC only
// upserts WaService/WaMedia/WaTemp core fields + WaTempVar), so this handler
// calls the RPC first and then patches those two columns directly.
export async function saveWaTemplateHandler(req, res) {
  try {
    const {
      trustId,
      templateId = null,
      waServiceId,
      waMediaId,
      name,
      language,
      text,
      type,
      purpose,
      footer,
      approved,
      variables = [],
    } = req.body || {};

    const cleanTrustId = String(trustId || '').trim();
    if (!cleanTrustId) return badRequest(res, 'trustId is required.');

    if (!templateId) {
      if (!String(waServiceId || '').trim()) return badRequest(res, 'Service provider is required.');
      if (!String(name || '').trim()) return badRequest(res, 'Name is required.');
    }

    const cleanVariables = (Array.isArray(variables) ? variables : []).filter((v) =>
      String(v?.var_key || '').trim()
    );

    const wa_temp_payload = {
      ...(templateId ? { id: templateId } : {}),
      ...(name !== undefined ? { name: String(name || '').trim() } : {}),
      ...(language !== undefined ? { language: String(language || 'en').trim() || 'en' } : {}),
      ...(text !== undefined ? { text: String(text || '').trim() || null } : {}),
      ...(purpose !== undefined ? { purpose: String(purpose || '').trim() || null } : {}),
      ...(footer !== undefined ? { footer: String(footer || '').trim() || null } : {}),
      ...(waServiceId !== undefined ? { wa_service_id: waServiceId || null } : {}),
      ...(waMediaId !== undefined ? { wa_media_id: waMediaId || null } : {}),
    };

    const wa_temp_vars_payload = cleanVariables.map((v) => ({
      var_key: String(v.var_key || '').trim(),
      display_label: String(v.display_label || '').trim() || null,
      source_table: String(v.source_table || '').trim() || null,
      source_column: String(v.source_column || '').trim() || null,
      fallback_value: String(v.fallback_value || '').trim() || null,
    }));

    const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('wa_temp_curl', {
      p_trust_id: cleanTrustId,
      p_wa_service: null,
      p_wa_temp: wa_temp_payload,
      p_wa_media: null,
      p_wa_temp_vars: wa_temp_vars_payload,
    });

    if (rpcError) return res.status(500).json({ error: rpcError.message || 'Failed to save template.' });

    const waTempId = rpcResult?.wa_temp_id;
    if (!waTempId) return res.status(500).json({ error: 'Template save did not return an id.' });

    if (variables !== undefined) {
      const { data: existingVars, error: existingVarsError } = await supabaseAdmin
        .from(VAR_TABLE_NAME)
        .select('id, var_key')
        .eq('wa_temp_id', waTempId);

      if (existingVarsError) {
        return res.status(500).json({ error: existingVarsError.message || 'Failed to sync variables.' });
      }

      const keptKeys = new Set(cleanVariables.map((v) => String(v.var_key || '').trim()));
      const staleIds = (existingVars || [])
        .filter((v) => !keptKeys.has(v.var_key))
        .map((v) => v.id);

      if (staleIds.length) {
        const { error: staleDeleteError } = await supabaseAdmin
          .from(VAR_TABLE_NAME)
          .delete()
          .in('id', staleIds);
        if (staleDeleteError) {
          return res.status(500).json({ error: staleDeleteError.message || 'Failed to remove old variables.' });
        }
      }
    }

    const followUpUpdate = {};
    if (variables !== undefined) followUpUpdate.var_count = cleanVariables.length;
    if (type !== undefined) followUpUpdate.type = String(type || '').trim() || null;
    if (approved !== undefined) followUpUpdate.approved = approved === true;

    if (Object.keys(followUpUpdate).length) {
      const { error: followUpError } = await supabaseAdmin
        .from(TABLE_NAME)
        .update(followUpUpdate)
        .eq('id', waTempId);
      if (followUpError) return res.status(500).json({ error: followUpError.message || 'Failed to save template.' });
    }

    const { data: fullTemplate, error: fetchError } = await fetchTemplateById(waTempId);
    if (fetchError) return res.status(500).json({ error: fetchError.message || 'Failed to reload template.' });

    return res.json({ data: fullTemplate });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to save template.' });
  }
}
