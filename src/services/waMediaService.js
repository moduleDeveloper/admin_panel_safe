import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache';

const TABLE_NAME = 'WaMedia';
const BUCKET = 'wa-media';
const MAX_FETCH = 200;

function uniqueId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extensionFromFile(file) {
  const fromName = String(file?.name || '').split('.').pop()?.toLowerCase();
  if (fromName && fromName.length <= 8) return fromName;
  const mime = String(file?.type || '').toLowerCase();
  return mime.split('/').pop() || 'bin';
}

function typeFromFile(file) {
  const mime = String(file?.type || '').toLowerCase();
  if (mime.startsWith('image/')) return 'image';
  if (mime.startsWith('video/')) return 'video';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime === 'application/pdf') return 'document';
  return 'document';
}

function buildMediaPath(trustId, file) {
  const ext = extensionFromFile(file);
  const safeTrustId = String(trustId || 'misc').replace(/[^a-zA-Z0-9_-]/g, '') || 'misc';
  return `${safeTrustId}/${Date.now()}-${uniqueId()}.${ext}`;
}

function extractStorageObjectPath(rawUrl = '') {
  const value = String(rawUrl || '').trim();
  if (!value) return null;
  try {
    const parsed = new URL(value);
    const parts = parsed.pathname.split('/').filter(Boolean);
    const objectIdx = parts.findIndex((part, idx) =>
      part === 'object' && parts[idx - 2] === 'storage' && parts[idx - 1] === 'v1'
    );
    if (objectIdx < 0) return null;
    const bucket = String(parts[objectIdx + 2] || '').trim();
    if (bucket !== BUCKET) return null;
    return decodeURIComponent(parts.slice(objectIdx + 3).join('/'));
  } catch {
    return null;
  }
}

function normalizeRow(row = {}) {
  return {
    id: row.id,
    trust_id: row.trust_id || null,
    name: row.name || '',
    purpose: row.purpose || '',
    public_url: row.public_url || '',
    type: row.type || '',
    extn: row.extn || '',
    size: row.size ?? null,
    is_active: row.is_active !== false,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    raw: row,
  };
}

export async function fetchWaMediaByTrust(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(
    `wa-media:list:${trustId}`,
    async () => {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .eq('trust_id', trustId)
        .order('created_at', { ascending: false })
        .range(0, MAX_FETCH - 1);

      if (error) console.error('[WA:Media] fetchWaMediaByTrust failed', { trustId, error });
      return { data: (data || []).map(normalizeRow), error };
    },
    12000
  );
}

// Uploads the file exactly as selected — no resizing, re-encoding, or compression.
export async function uploadWaMediaFile(file, { trustId = null } = {}) {
  if (!file) return { data: null, error: { message: 'No file selected.' } };

  const path = buildMediaPath(trustId, file);
  const { error: uploadError } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: '3600',
    upsert: false,
    contentType: file.type || undefined,
  });

  if (uploadError) {
    console.error('[WA:Media] uploadWaMediaFile failed', { path, trustId, uploadError });
    if (String(uploadError.message || '').toLowerCase().includes('bucket not found')) {
      return {
        data: null,
        error: { ...uploadError, message: `Storage bucket "${BUCKET}" not found. Create this bucket in Supabase Storage first.` },
      };
    }
    return { data: null, error: uploadError };
  }

  const { data: publicData } = supabase.storage.from(BUCKET).getPublicUrl(path);
  if (!publicData?.publicUrl) {
    console.error('[WA:Media] uploadWaMediaFile missing public URL', { path, trustId });
    return { data: null, error: { message: 'Uploaded file but failed to generate public URL.' } };
  }

  return {
    data: {
      path,
      publicUrl: publicData.publicUrl,
      type: typeFromFile(file),
      extn: extensionFromFile(file),
      size: file.size,
    },
    error: null,
  };
}

export async function createWaMedia(payload = {}) {
  if (!payload.trust_id) return { data: null, error: { message: 'No trust id provided.' } };

  const row = {
    trust_id: payload.trust_id,
    name: String(payload.name || '').trim(),
    purpose: String(payload.purpose || '').trim() || null,
    public_url: payload.public_url || null,
    type: payload.type || null,
    extn: payload.extn || null,
    is_active: payload.is_active !== false,
    ...(payload.size !== undefined ? { size: payload.size } : {}),
  };

  const { data, error } = await supabase.from(TABLE_NAME).insert([row]).select('*').single();
  if (error) console.error('[WA:Media] createWaMedia failed', { row, error });
  else invalidateCache('wa-media:');
  return { data: data ? normalizeRow(data) : null, error };
}

export async function updateWaMedia(mediaId, updates = {}, trustId = null) {
  if (!mediaId) return { data: null, error: { message: 'No media id provided.' } };

  const payload = {
    ...(updates.name !== undefined ? { name: String(updates.name || '').trim() } : {}),
    ...(updates.purpose !== undefined ? { purpose: String(updates.purpose || '').trim() || null } : {}),
    ...(updates.is_active !== undefined ? { is_active: updates.is_active !== false } : {}),
    ...(updates.public_url !== undefined ? { public_url: updates.public_url } : {}),
    ...(updates.type !== undefined ? { type: updates.type } : {}),
    ...(updates.extn !== undefined ? { extn: updates.extn } : {}),
    ...(updates.size !== undefined ? { size: updates.size } : {}),
    updated_at: new Date().toISOString(),
  };

  let query = supabase.from(TABLE_NAME).update(payload).eq('id', mediaId);
  if (trustId) query = query.eq('trust_id', trustId);

  const { data, error } = await query.select('*').single();
  if (error) console.error('[WA:Media] updateWaMedia failed', { mediaId, payload, error });
  else invalidateCache('wa-media:');
  return { data: data ? normalizeRow(data) : null, error };
}

// Uploads a new file for an existing media record, points the record at it, then removes the old storage object.
export async function replaceWaMediaFile(mediaId, file, { trustId = null, oldPublicUrl = '' } = {}) {
  if (!mediaId) return { data: null, error: { message: 'No media id provided.' } };
  if (!file) return { data: null, error: { message: 'No file selected.' } };

  const { data: uploaded, error: uploadError } = await uploadWaMediaFile(file, { trustId });
  if (uploadError) return { data: null, error: uploadError };

  const { data, error } = await updateWaMedia(
    mediaId,
    {
      public_url: uploaded.publicUrl,
      type: uploaded.type,
      extn: uploaded.extn,
      size: Math.round((uploaded.size / 1024) * 100) / 100,
    },
    trustId
  );
  if (error) return { data: null, error };

  const oldPath = extractStorageObjectPath(oldPublicUrl);
  if (oldPath) {
    await supabase.storage.from(BUCKET).remove([oldPath]);
  }

  return { data, error: null };
}

export async function deleteWaMedia(mediaId, trustId = null, publicUrl = '') {
  if (!mediaId) return { error: { message: 'No media id provided.' } };

  const objectPath = extractStorageObjectPath(publicUrl);
  if (objectPath) {
    await supabase.storage.from(BUCKET).remove([objectPath]);
  }

  let query = supabase.from(TABLE_NAME).delete().eq('id', mediaId);
  if (trustId) query = query.eq('trust_id', trustId);

  const { error } = await query;
  if (error) console.error('[WA:Media] deleteWaMedia failed', { mediaId, error });
  else invalidateCache('wa-media:');
  return { error };
}
