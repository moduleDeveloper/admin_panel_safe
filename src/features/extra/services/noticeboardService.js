import { supabase } from '../../../core/lib/supabase';
import { cachedQuery, invalidateCache } from '../../../core/services/requestCache';
import { getAllowedImageFormatsMessage, prepareImageFileForUpload } from '../../../core/utils/imageUpload';

const TABLE_NAME = 'noticeboard';
const NOTICEBOARD_BUCKET = String(import.meta?.env?.VITE_NOTICEBOARD_BUCKET || 'noticeboard').trim() || 'noticeboard';
const LEGACY_NOTICEBOARD_BUCKETS = new Set(['noticeboard', 'noticeborad', 'notice_board']);
const MAX_NOTICE_FETCH = 20;

function uniqueId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extensionFromFile(file) {
  const fromName = String(file?.name || '').split('.').pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  const mime = String(file?.type || '').toLowerCase();
  if (mime.includes('pdf')) return 'pdf';
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

function buildNoticeboardAttachmentPath(trustId, file) {
  const ext = extensionFromFile(file);
  const safeTrustId = String(trustId || 'misc').replace(/[^a-zA-Z0-9_-]/g, '') || 'misc';
  return `${safeTrustId}/${Date.now()}-${uniqueId()}.${ext}`;
}

function normalizeNoticeboardAttachmentUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url || url.startsWith('data:')) return url;

  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');
    const objectIdx = parts.findIndex((part, idx) =>
      part === 'object' &&
      parts[idx - 2] === 'storage' &&
      parts[idx - 1] === 'v1'
    );

    if (objectIdx < 0) return url;

    const modeIdx = objectIdx + 1;
    const bucketIdx = objectIdx + 2;
    const mode = String(parts[modeIdx] || '').trim();
    const bucketInUrl = String(parts[bucketIdx] || '').trim();
    if (!bucketInUrl) return url;

    if (mode === 'sign') {
      parts[modeIdx] = 'public';
      parsed.pathname = parts.join('/');
      parsed.search = '';
      return parsed.toString();
    }

    if (bucketInUrl !== NOTICEBOARD_BUCKET && LEGACY_NOTICEBOARD_BUCKETS.has(bucketInUrl)) {
      parts[bucketIdx] = NOTICEBOARD_BUCKET;
      parsed.pathname = parts.join('/');
      return parsed.toString();
    }
  } catch {
    return url;
  }

  return url;
}

function normalizeRow(row = {}) {
  return {
    id: row.id,
    trust_id: row.trust_id,
    type: row.type,
    name: row.name || '',
    description: row.description || '',
    attachments: Array.isArray(row.attachments)
      ? row.attachments.map(normalizeNoticeboardAttachmentUrl).filter(Boolean)
      : [],
    start_date: row.start_date || null,
    end_date: row.end_date || null,
    status: row.status || 'active',
    created_by: row.created_by || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    raw: row,
  };
}

export async function fetchNoticeboardByTrust(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(`notice:list:${trustId}`, async () => {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('trust_id', trustId)
      .order('created_at', { ascending: false })
      .range(0, MAX_NOTICE_FETCH - 1);

    return { data: (data || []).map(normalizeRow), error };
  }, 12000);
}

export async function fetchNoticeById(trustId, noticeId) {
  if (!trustId || !noticeId) return { data: null, error: { message: 'Missing trust or notice id.' } };

  return cachedQuery(`notice:item:${trustId}:${noticeId}`, async () => {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('trust_id', trustId)
      .eq('id', noticeId)
      .maybeSingle();

    return { data: data ? normalizeRow(data) : null, error };
  }, 12000);
}

export async function uploadNoticeboardAttachment(file, { trustId = null } = {}) {
  if (!file) return { data: null, error: { message: 'No attachment file provided.' } };
  const mimeType = String(file.type || '').toLowerCase();
  const isAllowedImage = mimeType.startsWith('image/');
  const isAllowedPdf = mimeType === 'application/pdf';
  if (!isAllowedImage && !isAllowedPdf) {
    return { data: null, error: { message: 'Please select a valid image or PDF file.' } };
  }

  let uploadFile = file;
  let warning = '';
  if (isAllowedImage) {
    const prepared = await prepareImageFileForUpload(file);
    if (prepared.error || !prepared.file) {
      return { data: null, error: { message: prepared.error?.message || getAllowedImageFormatsMessage() } };
    }
    uploadFile = prepared.file;
    warning = prepared.warning || '';
  }

  const path = buildNoticeboardAttachmentPath(trustId, uploadFile);
  const { error: uploadError } = await supabase
    .storage
    .from(NOTICEBOARD_BUCKET)
    .upload(path, uploadFile, {
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
          message: `Storage bucket "${NOTICEBOARD_BUCKET}" not found. Create this bucket in Supabase Storage or set VITE_NOTICEBOARD_BUCKET correctly.`,
        },
      };
    }
    return { data: null, error: uploadError };
  }

  const { data: publicData } = supabase
    .storage
    .from(NOTICEBOARD_BUCKET)
    .getPublicUrl(path);

  return {
    data: {
      path,
      publicUrl: normalizeNoticeboardAttachmentUrl(publicData?.publicUrl || null),
      warning,
    },
    error: null,
  };
}

export async function createNotice(payload = {}) {
  if (!payload.trust_id) return { data: null, error: { message: 'No trust id provided.' } };

  const row = {
    trust_id: payload.trust_id,
    type: payload.type || 'gen',
    name: String(payload.name || '').trim(),
    description: String(payload.description || '').trim() || null,
    attachments: Array.isArray(payload.attachments)
      ? payload.attachments.map(normalizeNoticeboardAttachmentUrl).filter(Boolean)
      : [],
    start_date: payload.start_date || null,
    end_date: payload.end_date || null,
    status: payload.status || 'active',
    created_by: payload.created_by || null,
  };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert([row])
    .select('*')
    .single();

  if (!error) invalidateCache('notice:');
  return { data: data ? normalizeRow(data) : null, error };
}

export async function updateNotice(noticeId, updates = {}, trustId = null) {
  if (!noticeId) return { data: null, error: { message: 'No notice id provided.' } };

  const payload = {
    ...(updates.name !== undefined ? { name: String(updates.name || '').trim() } : {}),
    ...(updates.description !== undefined
      ? { description: String(updates.description || '').trim() || null }
      : {}),
    ...(updates.attachments !== undefined
      ? {
        attachments: Array.isArray(updates.attachments)
          ? updates.attachments.map(normalizeNoticeboardAttachmentUrl).filter(Boolean)
          : [],
      }
      : {}),
    ...(updates.start_date !== undefined ? { start_date: updates.start_date || null } : {}),
    ...(updates.end_date !== undefined ? { end_date: updates.end_date || null } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.type !== undefined ? { type: updates.type } : {}),
    updated_at: new Date().toISOString(),
  };

  let query = supabase
    .from(TABLE_NAME)
    .update(payload)
    .eq('id', noticeId);

  if (trustId) {
    query = query.eq('trust_id', trustId);
  }

  const { data, error } = await query
    .select('*')
    .single();

  if (!error) invalidateCache('notice:');
  return { data: data ? normalizeRow(data) : null, error };
}

export async function deleteNotice(noticeId, trustId = null) {
  if (!noticeId) return { error: { message: 'No notice id provided.' } };

  let query = supabase
    .from(TABLE_NAME)
    .delete()
    .eq('id', noticeId);

  if (trustId) {
    query = query.eq('trust_id', trustId);
  }

  const { error } = await query;
  if (!error) invalidateCache('notice:');
  return { error };
}
