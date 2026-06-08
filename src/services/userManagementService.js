import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache';

const USER_COLUMNS = `
  id,
  trust_id,
  name,
  email,
  mobile_no,
  secret_code,
  created_at,
  updated_at
`;

const USER_ROLE_COLUMNS = `
  id,
  user_id,
  feature_id,
  can_view,
  can_edit,
  can_delete,
  can_add,
  created_at,
  updated_at
`;

const FEATURE_COLUMNS = `
  id,
  name,
  subname,
  remarks
`;

function parseSecretCode(value) {
  const normalized = String(value ?? '').trim();
  if (!normalized) return { value: null, error: null };
  if (!/^\d+$/.test(normalized)) {
    return { value: null, error: { message: 'Secret code must contain digits only.' } };
  }

  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) {
    return { value: null, error: { message: 'Secret code is invalid.' } };
  }
  return { value: parsed, error: null };
}

export async function fetchUsersByTrustId(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(`user-management:users:${trustId}`, async () => {
    const { data, error } = await supabase
      .from('users')
      .select(USER_COLUMNS)
      .eq('trust_id', trustId)
      .order('created_at', { ascending: false, nullsFirst: false });

    return { data: data || [], error };
  }, 10000);
}

export async function fetchFeatureCatalog() {
  return cachedQuery('user-management:features', async () => {
    const { data, error } = await supabase
      .from('features')
      .select(FEATURE_COLUMNS)
      .order('name', { ascending: true });

    return { data: data || [], error };
  }, 30000);
}

export async function fetchUserRolesByUserId(userId) {
  if (!userId) return { data: [], error: null };

  return cachedQuery(`user-management:roles:${userId}`, async () => {
    const { data, error } = await supabase
      .from('user_roles')
      .select(USER_ROLE_COLUMNS)
      .eq('user_id', userId);

    return { data: data || [], error };
  }, 7000);
}

export async function createPanelUser(trustId, payload = {}) {
  if (!trustId) return { data: null, error: { message: 'Trust is required.' } };

  const name = String(payload.name || '').trim();
  if (!name) return { data: null, error: { message: 'Name is required.' } };

  const { value: secretCode, error: secretError } = parseSecretCode(payload.secret_code);
  if (secretError) return { data: null, error: secretError };

  const insertPayload = {
    trust_id: trustId,
    name,
    email: String(payload.email || '').trim() || null,
    mobile_no: String(payload.mobile_no || '').trim() || null,
    secret_code: secretCode,
  };

  const { data, error } = await supabase
    .from('users')
    .insert([insertPayload])
    .select(USER_COLUMNS)
    .single();

  if (!error) invalidateCache('user-management:');
  return { data, error };
}

export async function updatePanelUser(userId, payload = {}) {
  if (!userId) return { data: null, error: { message: 'User id is required.' } };

  const name = String(payload.name || '').trim();
  if (!name) return { data: null, error: { message: 'Name is required.' } };

  const { value: secretCode, error: secretError } = parseSecretCode(payload.secret_code);
  if (secretError) return { data: null, error: secretError };

  const updatePayload = {
    name,
    email: String(payload.email || '').trim() || null,
    mobile_no: String(payload.mobile_no || '').trim() || null,
    secret_code: secretCode,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('users')
    .update(updatePayload)
    .eq('id', userId)
    .select(USER_COLUMNS)
    .single();

  if (!error) invalidateCache('user-management:');
  return { data, error };
}

export async function deletePanelUser(userId) {
  if (!userId) return { error: { message: 'User id is required.' } };
  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (!error) invalidateCache('user-management:');
  return { error };
}

export async function replaceUserRoles(userId, roleRows = []) {
  if (!userId) return { error: { message: 'User id is required for permissions.' } };

  const { error: deleteError } = await supabase
    .from('user_roles')
    .delete()
    .eq('user_id', userId);

  if (deleteError) return { error: deleteError };

  const activeRows = (roleRows || [])
    .filter((item) => item && item.feature_id)
    .map((item) => ({
      user_id: userId,
      feature_id: item.feature_id,
      can_view: !!item.can_view,
      can_edit: !!item.can_edit,
      can_delete: !!item.can_delete,
      can_add: !!item.can_add,
    }))
    .filter((item) => item.can_view || item.can_edit || item.can_delete || item.can_add);

  if (!activeRows.length) {
    invalidateCache('user-management:');
    return { error: null };
  }

  const { error } = await supabase.from('user_roles').insert(activeRows);
  if (!error) invalidateCache('user-management:');
  return { error };
}

