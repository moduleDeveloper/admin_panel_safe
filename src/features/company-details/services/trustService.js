import { supabase } from '../../../core/lib/supabase';
import { invalidateCache } from '../../../core/services/requestCache';

const TRUST_ICON_BUCKET = (import.meta.env.VITE_TRUST_ICON_BUCKET || 'feature_logo').trim();

// All Trust reads/writes go through this RPC:
//   manage_adminPanel_by_trustdetails(p_trust_id uuid, p_action text, p_payload jsonb)
// Trust actions: trust_read | trust_create | trust_update
// `name` is required on trust_create and is NOT editable via trust_update.
// On trust_update only keys present in the payload change; '' clears a column.
const ADMIN_PANEL_RPC = 'manage_adminPanel_by_trustdetails';

const TRUST_ERROR_MESSAGES = {
  TRUST_ID_REQUIRED: 'No trust ID provided',
  TRUST_NOT_FOUND: 'Trust not found.',
  TRUST_NAME_REQUIRED: 'Trust name is required',
  TRUST_ID_ALREADY_EXISTS: 'A trust with this ID already exists.',
  TRUST_NAME_NOT_EDITABLE: 'Trust name cannot be edited.',
  INVALID_ACTION: 'This action is not supported by the server.',
  INVALID_INPUT_FORMAT: 'Some values are in an invalid format.',
  DUPLICATE_VALUE: 'This value is already in use.',
};

function toTrustErrorMessage(response) {
  const code = response?.error;
  if (TRUST_ERROR_MESSAGES[code]) return TRUST_ERROR_MESSAGES[code];
  if (response?.message) return response.message;
  if (response?.detail) return `Server error: ${response.detail}`;
  return 'Something went wrong. Please try again.';
}

async function callTrustRpc(trustId, action, payload = {}) {
  const { data, error } = await supabase.rpc(ADMIN_PANEL_RPC, {
    p_trust_id: trustId || null,
    p_action: action,
    p_payload: payload,
  });

  if (error) return { data: null, error };
  if (!data?.success) {
    return { data: null, error: { code: data?.error, message: toTrustErrorMessage(data) } };
  }
  return { data: data.data ?? null, error: null };
}

// Trust rows are also cached by authService (dashboard, sidebar, linked trusts).
function invalidateTrustCaches(trustId) {
  if (trustId) invalidateCache(`auth:trust:${trustId}`);
  invalidateCache('auth:trusts:');
}

/**
 * Create a new trust
 */
export async function createTrust(superuserId, { name, legalName, iconUrl, remark, templateId = null }) {
  if (!superuserId) return { data: null, error: { message: 'No superuser ID provided' } };
  if (!name?.trim()) return { data: null, error: { message: 'Trust name is required' } };

  const result = await callTrustRpc(null, 'trust_create', {
    name: name.trim(),
    legal_name: legalName?.trim() || '',
    icon_url: iconUrl?.trim() || '',
    remark: remark?.trim() || '',
    template_id: templateId || '',
    superuser_id: superuserId,
    version: 1,
  });

  if (!result.error) invalidateTrustCaches(result.data?.id);
  return result;
}

/**
 * Fetch trust details by ID
 */
export async function fetchTrustDetails(trustId) {
  if (!trustId) return { data: null, error: { message: 'No trust ID provided' } };
  return callTrustRpc(trustId, 'trust_read');
}

/**
 * Update trust fields (any Trust column except `name`).
 */
export async function updateTrustDetails(trustId, updates = {}) {
  if (!trustId) return { data: null, error: { message: 'No trust ID provided' } };
  if (Object.prototype.hasOwnProperty.call(updates, 'name')) {
    return {
      data: null,
      error: { code: 'TRUST_NAME_NOT_EDITABLE', message: TRUST_ERROR_MESSAGES.TRUST_NAME_NOT_EDITABLE },
    };
  }

  const result = await callTrustRpc(trustId, 'trust_update', updates);
  if (!result.error) invalidateTrustCaches(trustId);
  return result;
}

/**
 * Update trust terms_content and privacy_content
 */
export async function updateTrustContent(trustId, { termsContent, privacyContent }) {
  return updateTrustDetails(trustId, {
    terms_content: termsContent ?? '',
    privacy_content: privacyContent ?? '',
  });
}

/**
 * Update trust basic info
 */
export async function updateTrustInfo(trustId, updates) {
  return updateTrustDetails(trustId, updates);
}

/**
 * Upload trust icon to storage and return public URL
 */
export async function uploadTrustIcon(file, { ownerId } = {}) {
  if (!file) return { data: null, error: { message: 'No file provided' } };
  if (!ownerId) return { data: null, error: { message: 'No trust ID provided' } };

  const extension = String(file.name || 'icon.png').split('.').pop()?.toLowerCase() || 'png';
  const safeExt = extension.replace(/[^a-z0-9]/g, '') || 'png';
  const path = `${ownerId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`;

  const { error: uploadError } = await supabase.storage
    .from(TRUST_ICON_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || undefined,
    });

  if (uploadError) {
    return { data: null, error: uploadError };
  }

  const { data: publicData } = supabase.storage.from(TRUST_ICON_BUCKET).getPublicUrl(path);
  return {
    data: {
      bucket: TRUST_ICON_BUCKET,
      path,
      publicUrl: publicData?.publicUrl || '',
    },
    error: null,
  };
}
