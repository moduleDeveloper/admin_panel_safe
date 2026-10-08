import { supabase } from '../../../core/lib/supabase';
import { cachedQuery, invalidateCache } from '../../../core/services/requestCache';
import { COUNTRIES, DEFAULT_COUNTRY, normalizePhoneInput } from '../../auth/constants/countries';

// All user management goes through this RPC:
//   manage_adminPanel_by_trustdetails(p_trust_id uuid, p_action text, p_payload jsonb)
// Actions: read | user_create | user_update | user_delete
//          user_role_create | user_role_update | user_role_delete
//
// users_reg is the master identity; users is the trust-wise membership.
// user_update does not touch roles, so permissions are synced with the user_role_* actions.
const ADMIN_PANEL_RPC = 'manage_adminPanel_by_trustdetails';

const PERMISSION_KEYS = ['can_view', 'can_add', 'can_edit', 'can_delete'];

const ERROR_MESSAGES = {
  TRUST_ID_REQUIRED: 'Trust is required.',
  TRUST_NOT_FOUND: 'Trust not found.',
  INVALID_ACTION: 'This action is not supported by the server.',
  NAME_REQUIRED: 'Name is required.',
  MOBILE_OR_EMAIL_REQUIRED: 'Enter a mobile number or an email.',
  INVALID_SECRET_CODE: 'Secret code must be exactly 6 digits.',
  IDENTITY_CONFLICT: 'This mobile number and email belong to two different registered people.',
  USER_REG_NOT_FOUND: 'Registered user not found.',
  USER_ID_REQUIRED: 'User id is required.',
  USER_NOT_FOUND_IN_TRUST: 'This user does not belong to the selected trust.',
  ROLES_MUST_BE_ARRAY: 'Permissions are in an invalid format.',
  FEATURE_ID_REQUIRED: 'Feature is required for every permission.',
  FEATURE_NOT_FOUND: 'One of the selected features no longer exists.',
  USER_ID_AND_FEATURE_ID_REQUIRED: 'User and feature are required for a permission.',
  USER_ROLE_ALREADY_EXISTS: 'This permission already exists. Reload and try again.',
  USER_ROLE_ID_REQUIRED: 'Permission id is required.',
  USER_ROLE_NOT_FOUND_IN_TRUST: 'Permission not found for this trust. Reload and try again.',
  INVALID_INPUT_FORMAT: 'Some values are in an invalid format.',
  DUPLICATE_VALUE: 'This mobile number or email is already in use.',
  FOREIGN_KEY_VIOLATION: 'This user is still linked to other records, so it cannot be changed or deleted.',
  UNHANDLED_ACTION: 'The server could not handle this request.',
};

function toErrorMessage(response) {
  const code = response?.error;
  if (!code) return 'Something went wrong. Please try again.';
  if (ERROR_MESSAGES[code]) return ERROR_MESSAGES[code];
  if (response?.message) return response.message;
  if (response?.detail) return `Server error: ${response.detail}`;
  const text = String(code).replace(/_/g, ' ').toLowerCase();
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

async function callAdminPanel(trustId, action, payload = {}) {
  if (!trustId) return { data: null, meta: null, error: { message: 'Trust is required.' } };

  const { data, error } = await supabase.rpc(ADMIN_PANEL_RPC, {
    p_trust_id: trustId,
    p_action: action,
    p_payload: payload,
  });

  if (error) return { data: null, meta: null, error };
  if (!data?.success) {
    return { data: null, meta: data, error: { code: data?.error, message: toErrorMessage(data) } };
  }
  return { data: data.data ?? null, meta: data, error: null };
}

function withImpliedView(item) {
  const flags = {
    can_add: !!item.can_add,
    can_edit: !!item.can_edit,
    can_delete: !!item.can_delete,
  };
  return { ...flags, can_view: !!item.can_view || flags.can_add || flags.can_edit || flags.can_delete };
}

function isActive(flags) {
  return PERMISSION_KEYS.some((key) => flags[key]);
}

const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]{2,}$/;

export function findCountry(iso) {
  return COUNTRIES.find((item) => item.iso === iso) || DEFAULT_COUNTRY;
}

// Stored mobiles are plain digits: Indian numbers as 10 local digits (the server strips a
// leading 91), other countries with their dial code in front.
export function splitStoredMobile(value) {
  const digits = String(value ?? '').replace(/\D/g, '');
  if (!digits) return { country: DEFAULT_COUNTRY, phone: '' };
  if (digits.length === DEFAULT_COUNTRY.max) return { country: DEFAULT_COUNTRY, phone: digits };

  const parsed = normalizePhoneInput(`+${digits}`, DEFAULT_COUNTRY);
  const codeLength = parsed.country.code.replace(/\D/g, '').length;
  const matchedCode = digits.startsWith(parsed.country.code.replace(/\D/g, ''));
  // Unknown or malformed legacy numbers are shown untrimmed so validation flags them
  // instead of silently cutting digits off.
  if (!matchedCode || digits.length - codeLength !== parsed.phone.length) {
    return { country: DEFAULT_COUNTRY, phone: digits };
  }
  return parsed;
}

function composeMobile(country, phone) {
  if (!phone) return null;
  return country.iso === DEFAULT_COUNTRY.iso ? phone : `${country.code.replace(/\D/g, '')}${phone}`;
}

// Field-level validation for the editor; returns { name?, email?, mobile_no? } messages.
// originalUser is the saved user when editing (null when creating).
export function validateUserForm(form = {}, originalUser = null) {
  const errors = {};
  const country = findCountry(form.mobile_country);
  const email = String(form.email || '').trim();
  const phone = String(form.mobile_no || '').trim();
  const secretCode = String(form.secret_code ?? '').trim();
  const originalSecret = String(originalUser?.secret_code ?? '').trim();

  // Secret code is mandatory. An unchanged legacy code (e.g. 7 digits) is left as is.
  if (!secretCode) {
    errors.secret_code = 'Secret code is required.';
  } else if (secretCode !== originalSecret && !/^\d{6}$/.test(secretCode)) {
    errors.secret_code = ERROR_MESSAGES.INVALID_SECRET_CODE;
  }

  if (!String(form.name || '').trim()) errors.name = ERROR_MESSAGES.NAME_REQUIRED;
  if (email && !EMAIL_PATTERN.test(email)) errors.email = 'Enter one valid email address.';
  if (phone && (phone.length < country.min || phone.length > country.max)) {
    const digits = country.min === country.max ? `${country.min}` : `${country.min}-${country.max}`;
    errors.mobile_no = `Enter a valid ${digits}-digit mobile number.`;
  }
  if (!email && !phone) errors.mobile_no = ERROR_MESSAGES.MOBILE_OR_EMAIL_REQUIRED;
  return errors;
}

function buildUserFields(form = {}, originalUser = null) {
  const errors = validateUserForm(form, originalUser);
  const firstError = Object.values(errors)[0];
  if (firstError) return { fields: null, error: { message: firstError } };

  const fields = {
    name: String(form.name || '').trim(),
    email: String(form.email || '').trim() || null,
    mobile_no: composeMobile(findCountry(form.mobile_country), String(form.mobile_no || '').trim()),
  };

  // The server rejects any supplied secret_code that isn't exactly 6 digits, so send it only
  // when it changed; an unchanged legacy code stays untouched on update.
  const secretCode = String(form.secret_code ?? '').trim();
  if (secretCode !== String(originalUser?.secret_code ?? '').trim()) {
    fields.secret_code = secretCode;
  }

  return { fields, error: null };
}

// Maps a user exactly as the RPC returns it (read / user_create / user_update):
// { user_id, user_reg_id, trust_id, name, email, mobile, secret_code, user_roles, ... }
// `id` is set to user_id because edit, delete and role sync send `id` = users.id.
function normalizeUser(user) {
  if (!user) return null;
  const secretCode = user.secret_code ?? null;
  const mobile = user.mobile ?? null;
  const { country, phone } = splitStoredMobile(mobile);

  return {
    ...user,
    id: user.user_id ?? null,
    name: user.name ?? '',
    email: user.email ?? null,
    mobile_no: mobile === null ? null : String(mobile),
    mobile_country: country.iso,
    mobile_local: phone,
    secret_code: secretCode === null ? null : String(secretCode),
    user_roles: Array.isArray(user.user_roles) ? user.user_roles : [],
  };
}

function buildFeatureCatalog(features = [], featureFlags = [], tier = 'general') {
  const featureById = new Map((features || []).map((feature) => [String(feature.id), feature]));
  const flagByFeatureId = new Map(
    (featureFlags || [])
      .filter((flag) => flag.tier === tier && flag.features_id)
      .map((flag) => [String(flag.features_id), flag]),
  );

  // Enabled flags for this tier
  const enabledIds = new Set(
    (featureFlags || [])
      .filter((flag) => flag.tier === tier && flag.is_enabled && flag.features_id)
      .map((flag) => String(flag.features_id)),
  );

  // Master features with Display_upanel === false that are not already covered by an enabled flag
  const upanelFalseIds = new Set(
    (features || [])
      .filter((f) => f.Display_upanel === false && !enabledIds.has(String(f.id)))
      .map((f) => String(f.id)),
  );

  return Array.from(new Set([...enabledIds, ...upanelFalseIds]))
    .map((featureId) => {
      const feature = featureById.get(featureId);
      if (!feature) return null;
      return { flag: flagByFeatureId.get(featureId) || null, feature };
    })
    .filter(Boolean)
    .sort((a, b) => {
      const orderA = a.flag?.quick_order ?? Number.POSITIVE_INFINITY;
      const orderB = b.flag?.quick_order ?? Number.POSITIVE_INFINITY;
      if (orderA !== orderB) return orderA - orderB;
      return String(a.flag?.display_name || a.feature.name || '').localeCompare(
        String(b.flag?.display_name || b.feature.name || ''),
      );
    })
    .map(({ flag, feature }) => ({
      id: flag ? flag.features_id : feature.id,
      name: String(flag?.display_name || feature.name || '').trim() || 'Untitled Feature',
      subname: String(flag?.tagline || feature.subname || '').trim(),
      remarks: feature.remarks || '',
    }));
}

// Brings the user's roles in line with the permission rows shown in the editor:
// create missing, update changed, delete ones switched fully off.
// Roles for features not shown (e.g. disabled for this trust) are left alone.
async function syncUserRoles(trustId, userId, existingRoles = [], roleRows = []) {
  const roleByFeatureId = new Map((existingRoles || []).map((role) => [String(role.feature_id), role]));
  const operations = [];

  (roleRows || []).forEach((row) => {
    if (!row?.feature_id) return;
    const desired = withImpliedView(row);
    const existing = roleByFeatureId.get(String(row.feature_id));

    if (!existing) {
      if (isActive(desired)) {
        operations.push({ action: 'user_role_create', payload: { user_id: userId, feature_id: row.feature_id, ...desired } });
      }
      return;
    }

    if (!isActive(desired)) {
      operations.push({ action: 'user_role_delete', payload: { id: existing.id }, featureId: row.feature_id });
      return;
    }

    if (PERMISSION_KEYS.some((key) => !!existing[key] !== desired[key])) {
      operations.push({ action: 'user_role_update', payload: { id: existing.id, ...desired } });
    }
  });

  if (!operations.length) return { roles: existingRoles, error: null };

  const results = await Promise.all(
    operations.map((operation) => callAdminPanel(trustId, operation.action, operation.payload)),
  );

  const nextRoles = new Map(roleByFeatureId);
  let firstError = null;
  results.forEach((result, index) => {
    const operation = operations[index];
    if (result.error) {
      firstError = firstError || result.error;
      return;
    }
    if (operation.action === 'user_role_delete') {
      nextRoles.delete(String(operation.featureId));
    } else if (result.data?.feature_id) {
      nextRoles.set(String(result.data.feature_id), result.data);
    }
  });

  return { roles: Array.from(nextRoles.values()), error: firstError };
}

async function finishUserSave(trustId, user, meta, roleRows) {
  const { roles, error: roleError } = await syncUserRoles(trustId, user.id, user.user_roles, roleRows);
  invalidateCache('user-management:');

  const data = { ...user, user_roles: roles };
  if (roleError) {
    return {
      data,
      meta,
      error: { message: `User saved, but some permissions failed: ${roleError.message}` },
    };
  }
  return { data, meta, error: null };
}

export async function fetchUserManagementData(trustId, tier = 'general') {
  if (!trustId) return { data: { users: [], features: [] }, error: null };

  return cachedQuery(`user-management:read:${trustId}:${tier}`, async () => {
    const { data, error } = await callAdminPanel(trustId, 'read');
    if (error) return { data: { users: [], features: [] }, error };

    const users = (data?.users || [])
      .map(normalizeUser)
      .sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));

    return {
      data: { users, features: buildFeatureCatalog(data?.features, data?.feature_flags, tier) },
      error: null,
    };
  }, 10000);
}

// Creates the user, or links the already-registered person (same mobile/email) to this trust.
export async function createPanelUser(trustId, form = {}, roleRows = []) {
  const { fields, error: fieldError } = buildUserFields(form);
  if (fieldError) return { data: null, meta: null, error: fieldError };

  const roles = (roleRows || [])
    .filter((row) => row?.feature_id)
    .map((row) => ({ feature_id: row.feature_id, ...withImpliedView(row) }))
    .filter(isActive);

  const { data, meta, error } = await callAdminPanel(trustId, 'user_create', { ...fields, roles });
  if (error) return { data: null, meta, error };

  // A reused membership may already have roles beyond what was sent; sync makes them match the editor.
  return finishUserSave(trustId, normalizeUser(data), meta, roleRows);
}

export async function updatePanelUser(trustId, originalUser, form = {}, roleRows = []) {
  if (!originalUser?.id) return { data: null, meta: null, error: { message: 'User id is required.' } };

  const { fields, error: fieldError } = buildUserFields(form, originalUser);
  if (fieldError) return { data: null, meta: null, error: fieldError };

  const { data, meta, error } = await callAdminPanel(trustId, 'user_update', { id: originalUser.id, ...fields });
  if (error) return { data: null, meta, error };

  return finishUserSave(trustId, normalizeUser(data), meta, roleRows);
}

// Removes the trust membership with its roles and sessions. The users_reg identity is
// deleted too when no other trust still links to it (data.user_reg_deleted).
export async function deletePanelUser(trustId, userId) {
  if (!userId) return { data: null, error: { message: 'User id is required.' } };

  const { data, error } = await callAdminPanel(trustId, 'user_delete', { id: userId });
  if (!error) invalidateCache('user-management:');
  return { data, error };
}
