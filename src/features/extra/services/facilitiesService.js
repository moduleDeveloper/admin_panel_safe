import { supabase } from '../../../core/lib/supabase';
import { cachedQuery, invalidateCache } from '../../../core/services/requestCache';
import { getAllowedImageFormatsMessage, prepareImageFileForUpload } from '../../../core/utils/imageUpload';

const TABLE_NAME = 'facilities';
const FACILITIES_BUCKET = String(import.meta?.env?.VITE_FACILITIES_BUCKET || 'facilities').trim() || 'facilities';
const LEGACY_FACILITIES_BUCKETS = new Set(['facilities']);
const MAX_FETCH = 50;

function uniqueId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extensionFromFile(file) {
  const fromName = String(file?.name || '').split('.').pop()?.toLowerCase();
  if (fromName) {
    if (fromName === 'jpeg' || fromName === 'jpg' || fromName === 'jfif') return 'jpg';
    if (fromName.length <= 5) return fromName;
  }
  const mime = String(file?.type || '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

function buildAttachmentPath(trustId, file) {
  const ext = extensionFromFile(file);
  const safeTrustId = String(trustId || 'misc').replace(/[^a-zA-Z0-9_-]/g, '') || 'misc';
  return `${safeTrustId}/${Date.now()}-${uniqueId()}.${ext}`;
}

function extractStorageObjectInfo(rawUrl = '') {
  const value = String(rawUrl || '').trim();
  if (!value || value.startsWith('data:')) return null;

  try {
    const parsed = new URL(value);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const objectIdx = parts.findIndex((part, idx) =>
      part === 'object' &&
      parts[idx - 2] === 'storage' &&
      parts[idx - 1] === 'v1'
    );
    if (objectIdx < 0) return null;

    const bucket = String(parts[objectIdx + 2] || '').trim();
    const objectPath = decodeURIComponent(parts.slice(objectIdx + 3).join('/'));
    if (!bucket || !objectPath) return null;
    return { bucket, objectPath };
  } catch {
    return null;
  }
}

function normalizeFacilitiesBucket(bucket = '') {
  if (bucket === FACILITIES_BUCKET) return bucket;
  if (LEGACY_FACILITIES_BUCKETS.has(bucket)) return FACILITIES_BUCKET;
  return bucket;
}

export async function resolveFacilitiesAttachmentUrl(rawUrl = '') {
  const info = extractStorageObjectInfo(rawUrl);
  if (!info) return { data: { signedUrl: String(rawUrl || '').trim() }, error: null };

  const bucket = normalizeFacilitiesBucket(info.bucket);
  if (!bucket) return { data: { signedUrl: String(rawUrl || '').trim() }, error: null };

  const { data } = supabase.storage.from(bucket).getPublicUrl(info.objectPath);
  if (!data?.publicUrl) {
    return { data: { signedUrl: String(rawUrl || '').trim() }, error: null };
  }

  return { data: { signedUrl: data.publicUrl }, error: null };
}

async function refreshAttachmentsWithPublicUrls(attachments = []) {
  if (!Array.isArray(attachments) || !attachments.length) return [];

  const resolved = await Promise.all(
    attachments.map(async (item) => {
      const raw = String(item || '').trim();
      if (!raw || raw.startsWith('data:')) return raw;
      const { data } = await resolveFacilitiesAttachmentUrl(raw);
      return String(data?.signedUrl || raw).trim();
    })
  );

  return resolved.filter(Boolean);
}

function normalizeRow(row = {}) {
  return {
    id: row.id,
    trust_id: row.trust_id,
    type: row.type,
    name: row.name || '',
    description: row.description || '',
    attachments: Array.isArray(row.attachments) ? row.attachments : [],
    status: row.status || 'active',
    created_by: row.created_by || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    raw: row,
  };
}

export async function fetchFacilitiesByTrust(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(
    `facilities:list:${trustId}`,
    async () => {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .eq('trust_id', trustId)
        .order('created_at', { ascending: false })
        .range(0, MAX_FETCH - 1);

      if (error) return { data: [], error };

      const normalizedRows = await Promise.all(
        (data || []).map(async (row) => {
          const normalized = normalizeRow(row);
          const refreshedAttachments = await refreshAttachmentsWithPublicUrls(normalized.attachments);
          return { ...normalized, attachments: refreshedAttachments };
        })
      );

      return { data: normalizedRows, error: null };
    },
    12000
  );
}

export async function uploadFacilitiesAttachment(file, { trustId = null } = {}) {
  if (!file) return { data: null, error: { message: 'No attachment file provided.' } };
  const prepared = await prepareImageFileForUpload(file);
  if (prepared.error || !prepared.file) {
    return { data: null, error: { message: prepared.error?.message || getAllowedImageFormatsMessage() } };
  }
  const uploadFile = prepared.file;

  const path = buildAttachmentPath(trustId, uploadFile);
  const { error: uploadError } = await supabase.storage.from(FACILITIES_BUCKET).upload(path, uploadFile, {
    cacheControl: '3600',
    upsert: false,
    contentType: uploadFile.type || undefined,
  });

  if (uploadError) {
    if (String(uploadError.message || '').toLowerCase().includes('bucket not found')) {
      return {
        data: null,
        error: {
          ...uploadError,
          message: `Storage bucket "${FACILITIES_BUCKET}" not found. Create this bucket in Supabase Storage or set VITE_FACILITIES_BUCKET correctly.`,
        },
      };
    }
    return { data: null, error: uploadError };
  }

  const { data: publicData } = supabase
    .storage
    .from(FACILITIES_BUCKET)
    .getPublicUrl(path);

  if (!publicData?.publicUrl) {
    return {
      data: null,
      error: { message: 'Uploaded image but failed to generate public URL.' },
    };
  }

  return {
    data: {
      path,
      publicUrl: publicData.publicUrl || null,
      warning: prepared.warning || '',
    },
    error: null,
  };
}

export async function createFacility(payload = {}) {
  if (!payload.trust_id) return { data: null, error: { message: 'No trust id provided.' } };

  const normalizedAttachments = await refreshAttachmentsWithPublicUrls(
    Array.isArray(payload.attachments) ? payload.attachments : []
  );

  const row = {
    trust_id: payload.trust_id,
    type: payload.type || 'gen',
    name: String(payload.name || '').trim(),
    description: String(payload.description || '').trim() || null,
    attachments: normalizedAttachments,
    status: payload.status || 'active',
    created_by: payload.created_by || null,
  };

  const { data, error } = await supabase.from(TABLE_NAME).insert([row]).select('*').single();
  if (!error) invalidateCache('facilities:');
  return { data: data ? normalizeRow(data) : null, error };
}

export async function updateFacility(facilityId, updates = {}, trustId = null) {
  if (!facilityId) return { data: null, error: { message: 'No facility id provided.' } };

  const normalizedAttachments =
    updates.attachments !== undefined
      ? await refreshAttachmentsWithPublicUrls(Array.isArray(updates.attachments) ? updates.attachments : [])
      : undefined;

  const payload = {
    ...(updates.name !== undefined ? { name: String(updates.name || '').trim() } : {}),
    ...(updates.description !== undefined
      ? { description: String(updates.description || '').trim() || null }
      : {}),
    ...(updates.attachments !== undefined
      ? { attachments: normalizedAttachments || [] }
      : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.type !== undefined ? { type: updates.type } : {}),
    updated_at: new Date().toISOString(),
  };

  let query = supabase.from(TABLE_NAME).update(payload).eq('id', facilityId);
  if (trustId) query = query.eq('trust_id', trustId);

  const { data, error } = await query.select('*').single();
  if (!error) invalidateCache('facilities:');
  return { data: data ? normalizeRow(data) : null, error };
}

export async function deleteFacility(facilityId, trustId = null) {
  if (!facilityId) return { error: { message: 'No facility id provided.' } };

  let query = supabase.from(TABLE_NAME).delete().eq('id', facilityId);
  if (trustId) query = query.eq('trust_id', trustId);

  const { error } = await query;
  if (!error) invalidateCache('facilities:');
  return { error };
}
