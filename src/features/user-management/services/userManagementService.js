import { supabase } from '../../../core/lib/supabase';
import { cachedQuery, invalidateCache } from '../../../core/services/requestCache';

const USER_COLUMNS = `
  id,
  trust_id,
  user_reg_id,
  created_at,
  updated_at,
  users_reg:user_reg_id (
    id,
    name,
    email,
    mobile,
    secret_code
  )
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

  return { value: normalized, error: null };
}

function normalizeUserRow(row = {}) {
  const userReg = Array.isArray(row.users_reg) ? row.users_reg[0] : row.users_reg;

  return {
    id: row.id,
    trust_id: row.trust_id,
    user_reg_id: row.user_reg_id || userReg?.id || null,
    name: userReg?.name || '',
    email: userReg?.email || '',
    mobile_no: userReg?.mobile || '',
    secret_code: userReg?.secret_code || null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

async function fetchUserLink(userId) {
  if (!userId) return { data: null, error: { message: 'User id is required.' } };

  const { data, error } = await supabase
    .from('users')
    .select('id, trust_id, user_reg_id')
    .eq('id', userId)
    .single();

  return { data, error };
}

async function fetchUserById(userId) {
  if (!userId) return { data: null, error: { message: 'User id is required.' } };

  const { data, error } = await supabase
    .from('users')
    .select(USER_COLUMNS)
    .eq('id', userId)
    .single();

  return { data: data ? normalizeUserRow(data) : null, error };
}

export async function fetchUsersByTrustId(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(`user-management:users:${trustId}`, async () => {
    const { data, error } = await supabase
      .from('users')
      .select(USER_COLUMNS)
      .eq('trust_id', trustId)
      .order('created_at', { ascending: false, nullsFirst: false });

    return { data: (data || []).map(normalizeUserRow), error };
  }, 10000);
}

export async function fetchFeatureCatalog(trustId, tier = 'general') {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(`user-management:enabled-features:${trustId}:${tier}`, async () => {
    const { data, error } = await supabase
      .from('feature_flags')
      .select(`
        id,
        features_id,
        display_name,
        tagline,
        quick_order,
        features (
          ${FEATURE_COLUMNS}
        )
      `)
      .eq('trust_id', trustId)
      .eq('tier', tier)
      .eq('is_enabled', true)
      .order('quick_order', { ascending: true, nullsFirst: false })
      .order('display_name', { ascending: true });

    if (error) return { data: [], error };

    const enabledFeatures = (data || [])
      .filter((flag) => flag.features_id && flag.features)
      .map((flag) => ({
        id: flag.features_id,
        name: String(flag.display_name || flag.features.name || '').trim() || 'Untitled Feature',
        subname: String(flag.tagline || flag.features.subname || '').trim(),
        remarks: flag.features.remarks || '',
      }));

    return { data: enabledFeatures, error: null };
  }, 10000);
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

  const userRegPayload = {
    name,
    email: String(payload.email || '').trim() || null,
    mobile: String(payload.mobile_no || '').trim() || null,
    secret_code: secretCode,
  };

  const { data: userReg, error: userRegError } = await supabase
    .from('users_reg')
    .insert([userRegPayload])
    .select('id')
    .single();

  if (userRegError) return { data: null, error: userRegError };

  const { data: user, error } = await supabase
    .from('users')
    .insert([{ trust_id: trustId, user_reg_id: userReg.id }])
    .select(USER_COLUMNS)
    .single();

  if (error) {
    await supabase.from('users_reg').delete().eq('id', userReg.id);
    return { data: null, error };
  }

  invalidateCache('user-management:');
  return { data: normalizeUserRow(user), error: null };
}

export async function updatePanelUser(userId, payload = {}) {
  if (!userId) return { data: null, error: { message: 'User id is required.' } };

  const name = String(payload.name || '').trim();
  if (!name) return { data: null, error: { message: 'Name is required.' } };

  const { value: secretCode, error: secretError } = parseSecretCode(payload.secret_code);
  if (secretError) return { data: null, error: secretError };

  const { data: userLink, error: linkError } = await fetchUserLink(userId);
  if (linkError) return { data: null, error: linkError };
  if (!userLink?.user_reg_id) {
    return { data: null, error: { message: 'Linked user registration was not found.' } };
  }

  const userRegPayload = {
    name,
    email: String(payload.email || '').trim() || null,
    mobile: String(payload.mobile_no || '').trim() || null,
    secret_code: secretCode,
    updated_at: new Date().toISOString(),
  };

  const { error: userRegError } = await supabase
    .from('users_reg')
    .update(userRegPayload)
    .eq('id', userLink.user_reg_id);

  if (userRegError) return { data: null, error: userRegError };

  await supabase
    .from('users')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', userId);

  const { data, error } = await fetchUserById(userId);
  if (!error) invalidateCache('user-management:');
  return { data, error };
}

export async function deletePanelUser(userId) {
  if (!userId) return { error: { message: 'User id is required.' } };

  const { data: userLink, error: linkError } = await fetchUserLink(userId);
  if (linkError) return { error: linkError };

  const { error } = await supabase.from('users').delete().eq('id', userId);
  if (!error) {
    if (userLink?.user_reg_id) {
      await supabase.from('users_reg').delete().eq('id', userLink.user_reg_id);
    }
    invalidateCache('user-management:');
  }
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
    .map((item) => {
      const canAdd = !!item.can_add;
      const canEdit = !!item.can_edit;
      const canDelete = !!item.can_delete;

      return {
        user_id: userId,
        feature_id: item.feature_id,
        can_view: !!item.can_view || canAdd || canEdit || canDelete,
        can_edit: canEdit,
        can_delete: canDelete,
        can_add: canAdd,
      };
    })
    .filter((item) => item.can_view || item.can_edit || item.can_delete || item.can_add);

  if (!activeRows.length) {
    invalidateCache('user-management:');
    return { error: null };
  }

  const { error } = await supabase.from('user_roles').insert(activeRows);
  if (!error) invalidateCache('user-management:');
  return { error };
}

