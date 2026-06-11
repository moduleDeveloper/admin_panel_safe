import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache';

export const ADMIN_SUPERUSER_SESSION_KEY = 'admin:superuserId';
export const ADMIN_NAME_SESSION_KEY = 'admin:userName';
export const ADMIN_MOBILE_SESSION_KEY = 'admin:mobile';

function digitsOnly(value = '') {
  return String(value).replace(/\D/g, '');
}

function buildMobileCandidates(phone, countryCode = '+91') {
  const local = digitsOnly(phone).slice(-10);
  const cc = digitsOnly(countryCode);
  const base = [
    local,
    `${cc}${local}`,
    `+${cc}${local}`,
    `0${local}`,
  ].filter(Boolean);

  return [...new Set(base)];
}

/**
 * Check if a mobile number exists in the superuser table.
 * Returns { data: superuser_row | null, error }
 */
export async function validatePhone(mobile) {
  const { data, error } = await supabase
    .from('superuser')
    .select('id, name, mobile, is_active')
    .eq('mobile', mobile)
    .maybeSingle();

  return { data, error };
}

/**
 * Flexible mobile lookup to handle +country/without country formats.
 * Returns { data: superuser_row | null, error, candidates }
 */
export async function findSuperuserByMobile(phone, countryCode = '+91') {
  const candidates = buildMobileCandidates(phone, countryCode);

  const { data, error } = await supabase
    .from('superuser')
    .select('id, name, mobile, is_active, secretcode')
    .in('mobile', candidates);

  if (error) return { data: null, error, candidates };
  if (!data?.length) return { data: null, error: null, candidates };

  // Prefer exact candidate order match first.
  for (const candidate of candidates) {
    const match = data.find((row) => row.mobile === candidate);
    if (match) return { data: match, error: null, candidates };
  }

  // Fallback: compare by last 10 digits.
  const local = digitsOnly(phone).slice(-10);
  const fallback = data.find((row) => digitsOnly(row.mobile).endsWith(local));
  return { data: fallback || data[0], error: null, candidates };
}

export async function findLinkedTrustsByRegisteredMobile(phone, countryCode = '+91') {
  const candidates = buildMobileCandidates(phone, countryCode)
    .map((value) => digitsOnly(value))
    .filter(Boolean);

  const numericCandidates = [...new Set(candidates
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value)))];

  if (!numericCandidates.length) {
    return {
      data: { member: null, registrations: [], trusts: [] },
      error: null,
      candidates,
    };
  }

  const { data: registrations, error: registrationError } = await supabase
    .from('reg_members')
    .select('id, trust_id, members_id, Mobile, Name, role, joined_date, is_active, "Membership number"')
    .in('Mobile', numericCandidates);

  if (registrationError) {
    return {
      data: { member: null, registrations: [], trusts: [] },
      error: registrationError,
      candidates,
    };
  }

  const rows = registrations || [];
  if (!rows.length) {
    return {
      data: { member: null, registrations: [], trusts: [] },
      error: null,
      candidates,
    };
  }

  const local = digitsOnly(phone).slice(-10);
  const matchingRegistrations = rows.filter((row) => digitsOnly(row?.Mobile).endsWith(local));
  const normalizedRegistrations = matchingRegistrations.length ? matchingRegistrations : rows;

  const memberIds = [...new Set(normalizedRegistrations.map((row) => row.members_id).filter(Boolean))];
  const trustIds = [...new Set(normalizedRegistrations.map((row) => row.trust_id).filter(Boolean))];

  let memberRows = [];
  if (memberIds.length) {
    const { data, error } = await supabase
      .from('Members')
      .select('*')
      .in('members_id', memberIds);
    if (error) {
      return {
        data: { member: null, registrations: [], trusts: [] },
        error,
        candidates,
      };
    }
    memberRows = data || [];
  }

  let trustRows = [];
  if (trustIds.length) {
    const { data, error } = await supabase
      .from('Trust')
      .select('*')
      .in('id', trustIds)
      .order('name', { ascending: true });
    if (error) {
      return {
        data: { member: null, registrations: [], trusts: [] },
        error,
        candidates,
      };
    }
    trustRows = data || [];
  }

  const memberMap = new Map(memberRows.map((row) => [String(row.members_id), row]));
  const trustMap = new Map(trustRows.map((row) => [String(row.id), row]));

  const enrichedRegistrations = normalizedRegistrations.map((row) => ({
    ...row,
    member: memberMap.get(String(row.members_id)) || null,
    trust: trustMap.get(String(row.trust_id)) || null,
  }));

  const primaryMember =
    enrichedRegistrations.find((row) => row.member)?.member ||
    (memberRows[0] || null);

  const uniqueTrusts = [];
  const seenTrustIds = new Set();
  for (const row of enrichedRegistrations) {
    const trust = row.trust;
    if (!trust?.id || seenTrustIds.has(String(trust.id))) continue;
    seenTrustIds.add(String(trust.id));
    uniqueTrusts.push({
      ...trust,
      registration: {
        id: row.id,
        role: row.role || '',
        joined_date: row.joined_date || '',
        is_active: row.is_active !== false,
        membership_number: row['Membership number'] || '',
        registered_name: row.Name || row.member?.Name || '',
        registered_mobile: row.Mobile || row.member?.Mobile || null,
      },
      member: row.member || null,
    });
  }

  return {
    data: {
      member: primaryMember,
      registrations: enrichedRegistrations,
      trusts: uniqueTrusts,
    },
    error: null,
    candidates,
  };
}

export async function findMembersByMobile(phone, countryCode = '+91') {
  const candidates = buildMobileCandidates(phone, countryCode)
    .map((value) => digitsOnly(value))
    .filter(Boolean);

  const numericCandidates = [...new Set(candidates
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value)))];

  if (!numericCandidates.length) {
    return { data: [], error: null, candidates };
  }

  const { data, error } = await supabase
    .from('Members')
    .select('*')
    .in('Mobile', numericCandidates);

  if (error) return { data: [], error, candidates };

  const local = digitsOnly(phone).slice(-10);
  const rows = (data || []).filter((row) => digitsOnly(row?.Mobile).endsWith(local));
  const normalized = rows.length ? rows : (data || []);

  return {
    data: normalized,
    error: null,
    candidates,
  };
}

export async function findTrustsByMemberId(memberId) {
  if (!memberId) return { data: [], error: null };

  const { data: registrations, error: registrationError } = await supabase
    .from('reg_members')
    .select('id, trust_id, members_id, Mobile, Name, role, joined_date, is_active, "Membership number"')
    .eq('members_id', memberId);

  if (registrationError) return { data: [], error: registrationError };
  const rows = registrations || [];
  if (!rows.length) return { data: [], error: null };

  const trustIds = [...new Set(rows.map((row) => row.trust_id).filter(Boolean))];
  if (!trustIds.length) return { data: [], error: null };

  const { data: trustRows, error: trustError } = await supabase
    .from('Trust')
    .select('*')
    .in('id', trustIds)
    .order('name', { ascending: true });

  if (trustError) return { data: [], error: trustError };

  const trustMap = new Map((trustRows || []).map((row) => [String(row.id), row]));
  return {
    data: rows
      .map((row) => trustMap.get(String(row.trust_id)))
      .filter(Boolean)
      .map((trust) => {
        const reg = rows.find((row) => String(row.trust_id) === String(trust.id)) || null;
        return {
          ...trust,
          registration: reg
            ? {
                id: reg.id,
                role: reg.role || '',
                joined_date: reg.joined_date || '',
                is_active: reg.is_active !== false,
                membership_number: reg['Membership number'] || '',
                registered_name: reg.Name || '',
                registered_mobile: reg.Mobile || null,
              }
            : null,
        };
      }),
    error: null,
  };
}

/**
 * Fetch all trusts linked to a superuser.
 * Returns { data: Trust[] | null, error }
 */
export async function fetchLinkedTrusts(superuserId) {
  return cachedQuery(`auth:trusts:${superuserId}`, async () => {
    const { data, error } = await supabase
      .from('Trust')
      .select('id, name, icon_url, remark, legal_name, gst_number, pan_number, website, email_id, remark1, remark2, remark3')
      .eq('superuser_id', superuserId)
      .order('name', { ascending: true });

    return { data, error };
  }, 30000);
}

/**
 * Fetch full Trust details by ID (includes terms_content, privacy_content).
 * Returns { data: Trust | null, error }
 */
export async function fetchTrustDetails(trustId) {
  return cachedQuery(`auth:trust:${trustId}`, async () => {
    const { data, error } = await supabase
      .from('Trust')
      .select('id, name, icon_url, remark, legal_name, terms_content, privacy_content, created_at, gst_number, pan_number, website, email_id, remark1, remark2, remark3')
      .eq('id', trustId)
      .maybeSingle();

    return { data, error };
  }, 20000);
}

/**
 * Update Trust details by ID.
 * Returns { data: Trust | null, error }
 */
export async function updateTrustDetails(trustId, updates = {}) {
  const { data, error } = await supabase
    .from('Trust')
    .update(updates)
    .eq('id', trustId)
    .select('id, name, icon_url, remark, legal_name, terms_content, privacy_content, created_at, gst_number, pan_number, website, email_id, remark1, remark2, remark3')
    .maybeSingle();

  if (!error) {
    invalidateCache(`auth:trust:${trustId}`);
    invalidateCache('auth:trusts:');
  }
  return { data, error };
}

/**
 * Insert a new superuser into the superuser table.
 * Stores only the last 10 digits of the mobile number (without country code).
 * Returns { data: superuser_row | null, error }
 */
export async function insertSuperuser(mobile, name) {
  // Extract only the last 10 digits
  const cleanMobile = digitsOnly(mobile).slice(-10);
  
  const { data, error } = await supabase
    .from('superuser')
    .insert([{ mobile: cleanMobile, name, is_active: true }])
    .select('id, name, mobile, is_active')
    .single();

  return { data, error };
}

/**
 * Simulate OTP send (replace with real SMS gateway later).
 * Returns { success: true }
 */
export async function sendOtp(mobile) {
  // TODO: integrate with SMS provider (Twilio, MSG91, etc.)
  console.log(`[DEV] OTP sent to ${mobile} → use 123456 to verify`);
  return { success: true };
}

/**
 * Simulate OTP verification.
 * In production: call your SMS gateway verify API here.
 */
export async function verifyOtp(mobile, otp) {
  const code = digitsOnly(otp);
  const candidates = buildMobileCandidates(mobile);
  const { data, error } = await supabase
    .from('superuser')
    .select('id, mobile, is_active, secretcode')
    .in('mobile', candidates);

  if (error) return { valid: false, reason: 'lookup_error', error };

  if (data?.length) {
    const matched = candidates
      .map((candidate) => data.find((row) => row.mobile === candidate))
      .find(Boolean) || data[0];

    const secret = digitsOnly(matched?.secretcode);
    if (!secret) return { valid: false, reason: 'secretcode_missing' };
    return { valid: secret === code, reason: secret === code ? null : 'secretcode_mismatch' };
  }

  // New user fallback (demo OTP)
  const valid = code === '123456';
  return { valid, reason: valid ? null : 'otp_mismatch' };
}

export async function recordAdminSessionAction({
  superuserId,
  name = null,
  mobile = null,
  actionType,
  metadata = {},
} = {}) {
  if (!superuserId || !actionType) {
    return { data: null, error: { message: 'superuserId and actionType are required.' } };
  }

  const payload = {
    superuser_id: superuserId,
    name: name ? String(name).slice(0, 100) : null,
    mobile: mobile ? String(mobile).slice(0, 15) : null,
    action_type: actionType,
    metadata: metadata && typeof metadata === 'object' ? metadata : {},
  };

  const { data, error } = await supabase
    .from('admin_session')
    .insert([payload])
    .select('id, superuser_id, action_type, action_at, session_id')
    .single();

  return { data, error };
}
