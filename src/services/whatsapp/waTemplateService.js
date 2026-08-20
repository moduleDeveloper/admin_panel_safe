import { supabase } from '../../lib/supabase';
import { cachedQuery, invalidateCache } from '../requestCache.js';

function normalizeApiBase(rawBase) {
  const base = String(rawBase || 'http://localhost:8080').trim().replace(/\/+$/, '');
  return base.replace(/\/api$/i, '');
}

const API_BASE = normalizeApiBase(import.meta.env.VITE_VIDEO_BACKEND_URL);

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: options.method || 'GET',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: options.body ? JSON.stringify(options.body) : undefined,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return {
      data: null,
      error: {
        message: data?.error || `Request failed (${response.status})`,
        debug: data?.debug || null,
      },
    };
  }

  return { data, error: null };
}

function buildTemplateRequestPayload(payload = {}, variables = [], templateId = null) {
  return {
    trustId: payload.trust_id || null,
    templateId: templateId || null,
    waServiceId: payload.wa_service_id || null,
    waMediaId: payload.wa_media_id || null,
    name: String(payload.name || '').trim(),
    language: String(payload.language || 'en').trim() || 'en',
    text: String(payload.text || '').trim(),
    type: payload.type !== undefined ? String(payload.type || '').trim() : undefined,
    purpose: payload.purpose !== undefined ? String(payload.purpose || '').trim() : undefined,
    footer: payload.footer !== undefined ? String(payload.footer || '').trim() : undefined,
    approved: payload.approved === true,
    variables: (Array.isArray(variables) ? variables : [])
      .filter((v) => String(v?.var_key || '').trim())
      .map((v) => ({
        var_key: String(v.var_key || '').trim(),
        display_label: String(v.display_label || '').trim() || null,
      })),
  };
}

export async function fetchWaTemplatesByTrust(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(
    `wa-template:list:${trustId}`,
    async () => {
      try {
        const { data, error } = await requestJson(`/api/whatsapp-templates/${encodeURIComponent(trustId)}`);
        if (error) {
          console.error('[WA:Template] fetchWaTemplatesByTrust API error', { trustId, error });
          return { data: [], error: { message: error.message || 'Unable to load templates.' } };
        }
        const rows = Array.isArray(data?.data) ? data.data : [];
        return { data: rows, error: null };
      } catch (err) {
        console.error('[WA:Template] fetchWaTemplatesByTrust threw', { trustId, err });
        return { data: [], error: { message: err.message || 'Unable to load templates.' } };
      }
    },
    12000
  );
}

export async function createWaTemplate(payload = {}, variables = []) {
  if (!payload.trust_id) return { data: null, error: { message: 'No trust id provided.' } };
  if (!payload.wa_service_id) return { data: null, error: { message: 'Service provider is required.' } };

  try {
    const { data, error } = await requestJson('/api/whatsapp-templates', {
      method: 'POST',
      body: buildTemplateRequestPayload(payload, variables, null),
    });
    if (error) {
      return { data: null, error: { message: error.message || 'Unable to save template.' } };
    }
    invalidateCache('wa-template:');
    return { data: data?.data || null, error: null };
  } catch (err) {
    return { data: null, error: { message: err.message || 'Unable to save template.' } };
  }
}

export async function updateWaTemplate(templateId, updates = {}, variables = [], trustId = null) {
  if (!templateId) return { data: null, error: { message: 'No template id provided.' } };

  try {
    const { data, error } = await requestJson('/api/whatsapp-templates', {
      method: 'POST',
      body: buildTemplateRequestPayload({ ...updates, trust_id: trustId }, variables, templateId),
    });
    if (error) {
      return { data: null, error: { message: error.message || 'Unable to update template.' } };
    }
    invalidateCache('wa-template:');
    return { data: data?.data || null, error: null };
  } catch (err) {
    return { data: null, error: { message: err.message || 'Unable to update template.' } };
  }
}

// Reads the recipient-sheet column names (phone, contact_name, template variables)
// straight from the template's stored curl payload — used to generate a blank
// Excel template for the Campaign module's sender-list upload.
export async function fetchWaTempColumns(templateId, trustId) {
  if (!templateId) return { data: null, error: { message: 'No template id provided.' } };

  try {
    const { data, error } = await supabase.rpc('wa_temp_format', {
      p_wa_temp_id: templateId,
      p_trust_id: trustId,
    });
    if (error) {
      console.error('[WA:Template] fetchWaTempColumns RPC error', { templateId, trustId, error });
      return { data: null, error: { message: error.message || 'Unable to fetch template columns.' } };
    }
    return { data, error: null };
  } catch (err) {
    console.error('[WA:Template] fetchWaTempColumns threw', { templateId, trustId, err });
    return { data: null, error: { message: err.message || 'Unable to fetch template columns.' } };
  }
}
