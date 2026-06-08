import { supabase } from '../lib/supabase';

const TRUST_ICON_BUCKET = (import.meta.env.VITE_TRUST_ICON_BUCKET || 'trust-icons').trim();

/**
 * Create a new trust
 */
export async function createTrust(superuserId, { name, legalName, iconUrl, remark, templateId = null }) {
  if (!superuserId) return { data: null, error: { message: 'No superuser ID provided' } };
  if (!name?.trim()) return { data: null, error: { message: 'Trust name is required' } };

  const trustData = {
    name: name.trim(),
    legal_name: legalName?.trim() || null,
    icon_url: iconUrl?.trim() || null,
    remark: remark?.trim() || null,
    version: 1,
  };

  // Only add superuser_id if it's provided and is a valid UUID
  if (superuserId && typeof superuserId === 'string' && superuserId.length > 0) {
    trustData.superuser_id = superuserId;
  }

  // Only add template_id if it's provided and is a valid UUID
  if (templateId && typeof templateId === 'string' && templateId.length > 0) {
    trustData.template_id = templateId;
  }

  const { data, error } = await supabase
    .from('Trust')
    .insert([trustData])
    .select()
    .single();

  return { data, error };
}

/**
 * Fetch trust details by ID
 */
export async function fetchTrustDetails(trustId) {
  if (!trustId) return { data: null, error: { message: 'No trust ID provided' } };

  const { data, error } = await supabase
    .from('Trust')
    .select('*')
    .eq('id', trustId)
    .single();

  return { data, error };
}

/**
 * Update trust terms_content and privacy_content
 */
export async function updateTrustContent(trustId, { termsContent, privacyContent }) {
  if (!trustId) return { data: null, error: { message: 'No trust ID provided' } };

  const { data, error } = await supabase
    .from('Trust')
    .update({
      terms_content: termsContent,
      privacy_content: privacyContent,
    })
    .eq('id', trustId)
    .select()
    .single();

  return { data, error };
}

/**
 * Update trust basic info
 */
export async function updateTrustInfo(trustId, updates) {
  if (!trustId) return { data: null, error: { message: 'No trust ID provided' } };

  const { data, error } = await supabase
    .from('Trust')
    .update(updates)
    .eq('id', trustId)
    .select()
    .single();

  return { data, error };
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
