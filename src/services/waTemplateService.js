import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache.js';

function normalizeApiBase(rawBase) {
  const base = String(rawBase || 'http://localhost:8080').trim().replace(/\/+$/, '');
  return base.replace(/\/api$/i, '');
}

const API_BASE = normalizeApiBase(import.meta.env.VITE_VIDEO_BACKEND_URL);

export async function fetchWaTemplatesByTrust(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(
    `wa-template:list:${trustId}`,
    async () => {
      try {
        const response = await fetch(`${API_BASE}/api/whatsapp-templates/${encodeURIComponent(trustId)}`);
        const json = await response.json().catch(() => ({}));
        if (!response.ok) {
          return { data: [], error: { message: json?.error || `Request failed (${response.status})` } };
        }
        return { data: json.data || [], error: null };
      } catch (err) {
        return { data: [], error: { message: err.message || 'Unable to load templates.' } };
      }
    },
    12000
  );
}

async function saveWaTemplateRequest(payload) {
  try {
    const response = await fetch(`${API_BASE}/api/whatsapp-templates`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok) {
      return { data: null, error: { message: json?.error || `Request failed (${response.status})` } };
    }
    invalidateCache('wa-template:');
    return { data: json.data, error: null };
  } catch (err) {
    return { data: null, error: { message: err.message || 'Unable to save template.' } };
  }
}

export async function createWaTemplate(payload = {}, variables = []) {
  if (!payload.trust_id) return { data: null, error: { message: 'No trust id provided.' } };
  if (!payload.wa_service_id) return { data: null, error: { message: 'Service provider is required.' } };

  return saveWaTemplateRequest({
    trustId: payload.trust_id,
    waServiceId: payload.wa_service_id,
    waMediaId: payload.wa_media_id || null,
    name: payload.name,
    language: payload.language,
    text: payload.text,
    type: payload.type,
    purpose: payload.purpose,
    footer: payload.footer,
    approved: payload.approved,
    variables,
  });
}

export async function updateWaTemplate(templateId, updates = {}, variables = [], trustId = null) {
  if (!templateId) return { data: null, error: { message: 'No template id provided.' } };

  return saveWaTemplateRequest({
    templateId,
    trustId,
    ...(updates.wa_service_id !== undefined ? { waServiceId: updates.wa_service_id } : {}),
    ...(updates.wa_media_id !== undefined ? { waMediaId: updates.wa_media_id } : {}),
    ...(updates.name !== undefined ? { name: updates.name } : {}),
    ...(updates.language !== undefined ? { language: updates.language } : {}),
    ...(updates.text !== undefined ? { text: updates.text } : {}),
    ...(updates.type !== undefined ? { type: updates.type } : {}),
    ...(updates.purpose !== undefined ? { purpose: updates.purpose } : {}),
    ...(updates.footer !== undefined ? { footer: updates.footer } : {}),
    ...(updates.approved !== undefined ? { approved: updates.approved } : {}),
    variables,
  });
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
    if (error) return { data: null, error: { message: error.message || 'Unable to fetch template columns.' } };
    return { data, error: null };
  } catch (err) {
    return { data: null, error: { message: err.message || 'Unable to fetch template columns.' } };
  }
}
