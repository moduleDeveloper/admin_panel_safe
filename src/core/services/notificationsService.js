import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache';

const NOTIFICATIONS_TABLE = 'notifications';
const ALLOWED_TYPES = ['general', 'vip'];

function normalizeType(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ALLOWED_TYPES.includes(normalized) ? normalized : 'general';
}

function pickFirst(row = {}, keys = []) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

function normalizeNotificationRow(row = {}) {
  return {
    id: pickFirst(row, ['id']),
    trust_id: pickFirst(row, ['trust_id']),
    title: pickFirst(row, ['title']) || '',
    message: pickFirst(row, ['message']) || '',
    type: normalizeType(pickFirst(row, ['type']) || 'general'),
    target_audience: pickFirst(row, ['target_audience']) || 'all',
    is_read: pickFirst(row, ['is_read']) === true,
    sent_by: pickFirst(row, ['sent_by']),
    created_at: pickFirst(row, ['created_at']),
    updated_at: pickFirst(row, ['updated_at']),
  };
}

export async function fetchNotificationsByTrustId(trustId) {
  if (!trustId) return { data: [], error: null };
  const cacheKey = `notifications:trust:${trustId}`;

  return cachedQuery(cacheKey, async () => {
    const { data, error } = await supabase
      .from(NOTIFICATIONS_TABLE)
      .select('*')
      .eq('trust_id', trustId)
      .order('created_at', { ascending: false, nullsFirst: false });

    if (error) return { data: [], error };
    return { data: (data || []).map(normalizeNotificationRow), error: null };
  }, 10000);
}

export async function createNotification(payload = {}) {
  if (!payload.trust_id) return { data: null, error: { message: 'No trust id provided.' } };

  const row = {
    trust_id: payload.trust_id,
    title: String(payload.title || '').trim(),
    message: String(payload.message || '').trim(),
    type: normalizeType(payload.type),
    target_audience: String(payload.target_audience || 'all').trim() || 'all',
    is_read: payload.is_read === true,
    sent_by: payload.sent_by || null,
  };

  const { data, error } = await supabase
    .from(NOTIFICATIONS_TABLE)
    .insert([row])
    .select('*')
    .single();

  if (!error) invalidateCache('notifications:');
  return { data: data ? normalizeNotificationRow(data) : null, error };
}

export async function updateNotification(notificationId, updates = {}, trustId = null) {
  if (!notificationId) return { data: null, error: { message: 'No notification id provided.' } };

  const payload = {
    ...(updates.title !== undefined ? { title: String(updates.title || '').trim() } : {}),
    ...(updates.message !== undefined ? { message: String(updates.message || '').trim() } : {}),
    ...(updates.type !== undefined ? { type: normalizeType(updates.type) } : {}),
    ...(updates.target_audience !== undefined
      ? { target_audience: String(updates.target_audience || 'all').trim() || 'all' }
      : {}),
    ...(updates.is_read !== undefined ? { is_read: updates.is_read === true } : {}),
    ...(updates.sent_by !== undefined ? { sent_by: updates.sent_by || null } : {}),
    updated_at: new Date().toISOString(),
  };

  let query = supabase
    .from(NOTIFICATIONS_TABLE)
    .update(payload)
    .eq('id', notificationId);

  if (trustId) {
    query = query.eq('trust_id', trustId);
  }

  const { data, error } = await query
    .select('*')
    .single();

  if (!error) invalidateCache('notifications:');
  return { data: data ? normalizeNotificationRow(data) : null, error };
}

export async function deleteNotification(notificationId, trustId = null) {
  if (!notificationId) return { error: { message: 'No notification id provided.' } };

  let query = supabase
    .from(NOTIFICATIONS_TABLE)
    .delete()
    .eq('id', notificationId);

  if (trustId) {
    query = query.eq('trust_id', trustId);
  }

  const { error } = await query;
  if (!error) invalidateCache('notifications:');
  return { error };
}
