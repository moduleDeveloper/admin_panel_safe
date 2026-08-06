import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache';

const BUCKET = 'wa-media';

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
  if (!row) return null;
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

function unwrapRpcRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.data)) return data.data;
  if (data && typeof data === 'object' && data.id) return [data];
  return [];
}

function unwrapRpcRow(data) {
  if (Array.isArray(data)) return data[0] || null;
  if (Array.isArray(data?.data)) return data.data[0] || null;
  if (data && typeof data === 'object' && data.id) return data;
  return null;
}

function buildMediaPayload(payload = {}) {
  return {
    ...(payload.name !== undefined ? { p_name: String(payload.name || '').trim() } : {}),
    ...(payload.purpose !== undefined ? { p_purpose: String(payload.purpose || '').trim() || null } : {}),
    ...(payload.public_url !== undefined ? { p_public_url: payload.public_url || null } : {}),
    ...(payload.type !== undefined ? { p_type: payload.type || null } : {}),
    ...(payload.extn !== undefined ? { p_extn: payload.extn || null } : {}),
    ...(payload.is_active !== undefined ? { p_is_active: payload.is_active !== false } : {}),
    ...(payload.size !== undefined ? { p_size: payload.size } : {}),
  };
}

async function manageWaMediaRpc(params) {
  const { data, error } = await supabase.rpc('manage_wa_media', params);
  return { data, error };
}

export async function fetchWaMediaByTrust(trustId, type = null) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(
    `wa-media:list:${trustId}:${type || 'all'}`,
    async () => {
      const { data, error } = await manageWaMediaRpc({
        p_action: 'get',
        p_trust_id: trustId,
        ...(type ? { p_type: type } : {}),
      });

<<<<<<< HEAD
      return { data: (data || []).map(normalizeRow), error };
=======
      if (error) {
        console.error('[WA:Media] fetchWaMediaByTrust RPC failed', { trustId, type, error });
        return { data: [], error };
      }

      return { data: unwrapRpcRows(data).map(normalizeRow), error: null };
>>>>>>> 5b70b4f (Whatsapp wired with API)
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

  const { data, error } = await manageWaMediaRpc({
    p_action: 'insert',
    p_trust_id: payload.trust_id,
    ...buildMediaPayload(payload),
  });

<<<<<<< HEAD
  const { data, error } = await supabase.from(TABLE_NAME).insert([row]).select('*').single();
  if (!error) invalidateCache('wa-media:');
  return { data: data ? normalizeRow(data) : null, error };
=======
  if (error) {
    console.error('[WA:Media] createWaMedia RPC failed', { payload, error });
    return { data: null, error };
  }

  invalidateCache('wa-media:');
  return { data: normalizeRow(unwrapRpcRow(data)), error: null };
>>>>>>> 5b70b4f (Whatsapp wired with API)
}

export async function updateWaMedia(mediaId, updates = {}, trustId = null) {
  if (!mediaId) return { data: null, error: { message: 'No media id provided.' } };

<<<<<<< HEAD
  const payload = {
    ...(updates.name !== undefined ? { name: String(updates.name || '').trim() } : {}),
    ...(updates.purpose !== undefined ? { purpose: String(updates.purpose || '').trim() || null } : {}),
    ...(updates.is_active !== undefined ? { is_active: updates.is_active !== false } : {}),
    updated_at: new Date().toISOString(),
  };
=======
  const { data, error } = await manageWaMediaRpc({
    p_action: 'update',
    p_id: mediaId,
    ...(trustId ? { p_trust_id: trustId } : {}),
    ...buildMediaPayload(updates),
  });
>>>>>>> 5b70b4f (Whatsapp wired with API)

  if (error) {
    console.error('[WA:Media] updateWaMedia RPC failed', { mediaId, updates, error });
    return { data: null, error };
  }

<<<<<<< HEAD
  const { data, error } = await query.select('*').single();
  if (!error) invalidateCache('wa-media:');
  return { data: data ? normalizeRow(data) : null, error };
=======
  invalidateCache('wa-media:');
  return { data: normalizeRow(unwrapRpcRow(data)), error: null };
>>>>>>> 5b70b4f (Whatsapp wired with API)
}

export async function deleteWaMedia(mediaId, trustId = null, publicUrl = '') {
  if (!mediaId) return { error: { message: 'No media id provided.' } };

  const { error } = await manageWaMediaRpc({
    p_action: 'delete',
    p_id: mediaId,
    ...(trustId ? { p_trust_id: trustId } : {}),
  });

  if (error) {
    console.error('[WA:Media] deleteWaMedia RPC failed', { mediaId, error });
    return { error };
  }

  const objectPath = extractStorageObjectPath(publicUrl);
  if (objectPath) {
    await supabase.storage.from(BUCKET).remove([objectPath]);
  }

<<<<<<< HEAD
  let query = supabase.from(TABLE_NAME).delete().eq('id', mediaId);
  if (trustId) query = query.eq('trust_id', trustId);

  const { error } = await query;
  if (!error) invalidateCache('wa-media:');
  return { error };
=======
  invalidateCache('wa-media:');
  return { error: null };
>>>>>>> 5b70b4f (Whatsapp wired with API)
}
