import { supabase } from '../../../core/lib/supabase';
import { cachedQuery, invalidateCache } from '../../../core/services/requestCache';
import { getAllowedImageFormatsMessage, prepareImageFileForUpload } from '../../../core/utils/imageUpload';

const TABLE_NAME = 'events';
const EVENTS_BUCKET = String(import.meta?.env?.VITE_EVENTS_BUCKET || 'events').trim() || 'events';
const LEGACY_EVENTS_BUCKETS = new Set(['events', 'event', 'events_bucket']);
const MAX_EVENTS_FETCH = 20;

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
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

function buildEventAttachmentPath(trustId, file) {
  const ext = extensionFromFile(file);
  const safeTrustId = String(trustId || 'misc').replace(/[^a-zA-Z0-9_-]/g, '') || 'misc';
  return `${safeTrustId}/${Date.now()}-${uniqueId()}.${ext}`;
}

function normalizeEventAttachmentUrl(rawUrl) {
  const url = String(rawUrl || '').trim();
  if (!url || url.startsWith('data:')) return url;

  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split('/');
    const storageIdx = parts.findIndex((part) => part === 'storage');
    if (storageIdx < 0) return url;

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

    if (bucketInUrl !== EVENTS_BUCKET && LEGACY_EVENTS_BUCKETS.has(bucketInUrl)) {
      parts[bucketIdx] = EVENTS_BUCKET;
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
    title: row.title || '',
    description: row.description || '',
    attachments: Array.isArray(row.attachments)
      ? row.attachments.map(normalizeEventAttachmentUrl).filter(Boolean)
      : [],
    location: row.location || '',
    startEventDate: row.startEventDate || null,
    startTime: row.startTime ?? row.start_time ?? null,
    endTime: row.endTime ?? row.end_time ?? null,
    endEventDate: row.endEventDate || null,
    is_registration_required: !!row.is_registration_required,
    status: row.status || 'active',
    created_by: row.created_by || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    raw: row,
  };
}

export async function fetchEventsByTrust(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(`events:list:${trustId}`, async () => {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('trust_id', trustId)
      .order('startEventDate', { ascending: true })
      .order('startTime', { ascending: true })
      .order('endEventDate', { ascending: true })
      .order('title', { ascending: true })
      .range(0, MAX_EVENTS_FETCH - 1);

    return { data: (data || []).map(normalizeRow), error };
  }, 12000);
}

export async function fetchEventById(trustId, eventId) {
  if (!trustId || !eventId) return { data: null, error: { message: 'Missing trust or event id.' } };

  return cachedQuery(`events:item:${trustId}:${eventId}`, async () => {
    const { data, error } = await supabase
      .from(TABLE_NAME)
      .select('*')
      .eq('trust_id', trustId)
      .eq('id', eventId)
      .maybeSingle();

    return { data: data ? normalizeRow(data) : null, error };
  }, 12000);
}

export async function uploadEventAttachment(file, { trustId = null } = {}) {
  if (!file) return { data: null, error: { message: 'No attachment file provided.' } };
  const prepared = await prepareImageFileForUpload(file);
  if (prepared.error || !prepared.file) {
    return { data: null, error: { message: prepared.error?.message || getAllowedImageFormatsMessage() } };
  }
  const uploadFile = prepared.file;

  const path = buildEventAttachmentPath(trustId, uploadFile);
  const { error: uploadError } = await supabase
    .storage
    .from(EVENTS_BUCKET)
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
          message: `Storage bucket "${EVENTS_BUCKET}" not found. Create this bucket in Supabase Storage or set VITE_EVENTS_BUCKET correctly.`,
        },
      };
    }
    return { data: null, error: uploadError };
  }

  const { data: publicData } = supabase
    .storage
    .from(EVENTS_BUCKET)
    .getPublicUrl(path);

  return {
    data: {
      path,
      publicUrl: normalizeEventAttachmentUrl(publicData?.publicUrl || null),
      warning: prepared.warning || '',
    },
    error: null,
  };
}

export async function createEvent(payload = {}) {
  if (!payload.trust_id) return { data: null, error: { message: 'No trust id provided.' } };

  const row = {
    trust_id: payload.trust_id,
    title: String(payload.title || '').trim(),
    description: String(payload.description || '').trim() || null,
    attachments: Array.isArray(payload.attachments)
      ? payload.attachments.map(normalizeEventAttachmentUrl).filter(Boolean)
      : [],
    location: String(payload.location || '').trim() || null,
    startEventDate: payload.startEventDate || null,
    startTime: payload.startTime || null,
    endTime: payload.endTime || null,
    endEventDate: payload.endEventDate || null,
    type: payload.type || 'general',
    status: payload.status || 'active',
    created_by: payload.created_by || null,
  };

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .insert([row])
    .select('*')
    .single();

  if (!error) invalidateCache('events:');
  return { data: data ? normalizeRow(data) : null, error };
}

export async function updateEvent(eventId, updates = {}, trustId = null) {
  if (!eventId) return { data: null, error: { message: 'No event id provided.' } };

  const payload = {
    ...(updates.title !== undefined ? { title: String(updates.title || '').trim() } : {}),
    ...(updates.description !== undefined
      ? { description: String(updates.description || '').trim() || null }
      : {}),
    ...(updates.attachments !== undefined
      ? {
        attachments: Array.isArray(updates.attachments)
          ? updates.attachments.map(normalizeEventAttachmentUrl).filter(Boolean)
          : [],
      }
      : {}),
    ...(updates.location !== undefined
      ? { location: String(updates.location || '').trim() || null }
      : {}),
    ...(updates.startEventDate !== undefined ? { startEventDate: updates.startEventDate || null } : {}),
    ...(updates.startTime !== undefined ? { startTime: updates.startTime || null } : {}),
    ...(updates.endTime !== undefined ? { endTime: updates.endTime || null } : {}),
    ...(updates.endEventDate !== undefined ? { endEventDate: updates.endEventDate || null } : {}),
    ...(updates.status !== undefined ? { status: updates.status } : {}),
    ...(updates.type !== undefined ? { type: updates.type } : {}),
    updated_at: new Date().toISOString(),
  };

  let query = supabase
    .from(TABLE_NAME)
    .update(payload)
    .eq('id', eventId);

  if (trustId) {
    query = query.eq('trust_id', trustId);
  }

  const { data, error } = await query
    .select('*')
    .single();

  if (!error) invalidateCache('events:');
  return { data: data ? normalizeRow(data) : null, error };
}

export async function deleteEvent(eventId, trustId = null) {
  if (!eventId) return { error: { message: 'No event id provided.' } };

  let query = supabase
    .from(TABLE_NAME)
    .delete()
    .eq('id', eventId);

  if (trustId) {
    query = query.eq('trust_id', trustId);
  }

  const { error } = await query;
  if (!error) invalidateCache('events:');
  return { error };
}
