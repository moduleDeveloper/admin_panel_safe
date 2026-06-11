import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache';
import { getAllowedImageFormatsMessage, prepareImageFileForUpload } from '../utils/imageUpload';

const REGISTERED_TABLE_CANDIDATES = ['reg_members', 'registered_members'];
const MEMBER_TABLE_CANDIDATES = ['Members', 'members'];
const MEMBER_PROFILE_TABLE_CANDIDATES = ['member_profiles'];
const FAMILY_MEMBERS_TABLE_CANDIDATES = ['family_members'];
const MEMBER_NOMINATIONS_TABLE_CANDIDATES = ['member_nominations'];
const OTHER_MEMBERSHIPS_TABLE_CANDIDATES = ['other_memberships'];
const MEMBER_ROLES_TABLE = 'member_roles';
const PROFILE_PHOTO_BUCKET = 'profile_photo';
const MEMBER_FETCH_CHUNK_SIZE = 100;
const MEMBER_ROLE_FETCH_CHUNK_SIZE = 50;
const TABLE_PAGE_SIZE = 1000;

let resolvedRegisteredTable = null;
let resolvedMembersTable = null;
let resolvedRegisteredTables = null;
let resolvedMemberTables = null;

function invalidateMemberCaches() {
  invalidateCache('members:');
  invalidateCache('nominations:');
}

function pickFirst(row = {}, keys = []) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null) return value;
  }
  return null;
}

async function resolveTable(candidates, cacheKey) {
  if (cacheKey === 'registered' && resolvedRegisteredTable) return resolvedRegisteredTable;
  if (cacheKey === 'members' && resolvedMembersTable) return resolvedMembersTable;

  let lastError = null;
  for (const table of candidates) {
    const { error } = await supabase.from(table).select('*').limit(1);
    if (!error) {
      if (cacheKey === 'registered') resolvedRegisteredTable = table;
      if (cacheKey === 'members') resolvedMembersTable = table;
      return table;
    }
    lastError = error;
  }

  throw lastError || new Error(`Unable to resolve ${cacheKey} table.`);
}

async function resolveAvailableTables(candidates, cacheKey) {
  if (cacheKey === 'registered' && resolvedRegisteredTables) return resolvedRegisteredTables;
  if (cacheKey === 'members' && resolvedMemberTables) return resolvedMemberTables;

  const availableTables = [];
  let lastError = null;

  for (const table of candidates) {
    const { error } = await supabase.from(table).select('*').limit(1);
    if (!error) availableTables.push(table);
    else lastError = error;
  }

  if (!availableTables.length) {
    throw lastError || new Error(`Unable to resolve ${cacheKey} tables.`);
  }

  if (cacheKey === 'registered') resolvedRegisteredTables = availableTables;
  if (cacheKey === 'members') resolvedMemberTables = availableTables;
  return availableTables;
}

function getMemberUniqueId(row = {}) {
  return pickFirst(row, ['member_id', 'members_id', 'id']);
}

function getRegisteredMemberId(row = {}) {
  return pickFirst(row, ['member_id', 'members_id', 'Member ID', 'memberId']);
}

function getTrustId(row = {}) {
  return pickFirst(row, ['trust_id', 'trustId', 'trustid', 'Trust ID']);
}

function getMembershipNumber(row = {}) {
  return pickFirst(row, ['membership_number', 'Membership number', 'Membership Number', 'membership no', 'membership_no']);
}

function chunkValues(values = [], size = MEMBER_FETCH_CHUNK_SIZE) {
  const chunks = [];
  for (let index = 0; index < values.length; index += size) {
    chunks.push(values.slice(index, index + size));
  }
  return chunks;
}

async function fetchAllRows(queryBuilder) {
  const allRows = [];
  let from = 0;

  while (true) {
    const to = from + TABLE_PAGE_SIZE - 1;
    const { data, error } = await queryBuilder.range(from, to);
    if (error) return { data: [], error };

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < TABLE_PAGE_SIZE) break;
    from += TABLE_PAGE_SIZE;
  }

  return { data: allRows, error: null };
}

function normalizeMemberRow(row = {}, currentTrustId = null) {
  const memberTrustId = getTrustId(row);
  const normalizedTrustId = memberTrustId ? String(memberTrustId) : '';
  const normalizedCurrentTrustId = currentTrustId ? String(currentTrustId) : '';
  const isEditable = !!normalizedTrustId && normalizedTrustId === normalizedCurrentTrustId;

  return {
    member_id: getMemberUniqueId(row),
    trust_id: memberTrustId,
    name: pickFirst(row, ['name', 'Name']) || '',
    company_name: pickFirst(row, ['company_name', 'Company Name']) || '',
    address_home: pickFirst(row, ['address_home', 'Address Home']) || '',
    address_office: pickFirst(row, ['address_office', 'Address Office']) || '',
    resident_landline: pickFirst(row, ['resident_landline', 'Resident Landline']) || '',
    office_landline: pickFirst(row, ['office_landline', 'Office Landline']) || '',
    mobile: pickFirst(row, ['mobile', 'Mobile']) || '',
    email: pickFirst(row, ['email', 'Email']) || '',
    serial_no: pickFirst(row, ['S.No.']) || null,
    is_editable: isEditable,
    member_type: isEditable ? 'my' : 'others',
  };
}

function normalizeRegisteredRow(row = {}, memberRow = {}, currentTrustId = null) {
  const registrationTrustId = getTrustId(row);
  const memberTrustId = getTrustId(memberRow);
  const normalizedMemberTrustId = memberTrustId ? String(memberTrustId) : '';
  const normalizedCurrentTrustId = currentTrustId ? String(currentTrustId) : '';
  const isEditable = !!normalizedMemberTrustId && normalizedMemberTrustId === normalizedCurrentTrustId;
  const normalizedMember = normalizeMemberRow(memberRow, currentTrustId);

  return {
    id: pickFirst(row, ['id']),
    ...normalizedMember,
    trust_id: registrationTrustId,
    member_id: getRegisteredMemberId(row) || normalizedMember.member_id,
    membership_number: getMembershipNumber(row) || '',
    role: pickFirst(row, ['role', 'Role', 'role_name', 'designation']) || '',
    joined_date: pickFirst(row, ['joined_date', 'Joined Date', 'joining_date']) || '',
    is_active: pickFirst(row, ['is_active', 'Is Active', 'active']) !== false,
    is_editable: isEditable,
    member_type: isEditable ? 'my' : 'others',
  };
}

function normalizeMemberProfileRow(row = {}) {
  return {
    profile_photo_url: pickFirst(row, ['profile_photo_url']) || '',
    gender: pickFirst(row, ['gender']) || '',
    date_of_birth: pickFirst(row, ['date_of_birth']) || '',
    blood_group: pickFirst(row, ['blood_group']) || '',
    marital_status: pickFirst(row, ['marital_status']) || '',
    nationality: pickFirst(row, ['nationality']) || '',
    aadhaar_id: pickFirst(row, ['aadhaar_id']) || '',
    emergency_contact_name: pickFirst(row, ['emergency_contact_name']) || '',
    emergency_contact_number: pickFirst(row, ['emergency_contact_number']) || '',
    spouse_name: pickFirst(row, ['spouse_name']) || '',
    spouse_contact: pickFirst(row, ['spouse_contact']) || '',
    no_of_children: pickFirst(row, ['no_of_children']) ?? '',
    facebook: pickFirst(row, ['facebook']) || '',
    twitter: pickFirst(row, ['twitter']) || '',
    instagram: pickFirst(row, ['instagram']) || '',
    linkedin: pickFirst(row, ['linkedin']) || '',
    whatsapp: pickFirst(row, ['whatsapp']) || '',
  };
}

function buildMemberProfilePayload(payload = {}, memberId) {
  const rawChildren = payload.no_of_children;
  const normalizedChildren =
    rawChildren === '' || rawChildren === null || rawChildren === undefined
      ? null
      : Number.isFinite(Number(rawChildren))
        ? Number(rawChildren)
        : rawChildren;

  return {
    members_id: memberId,
    profile_photo_url: payload.profile_photo_url || null,
    gender: payload.gender || null,
    date_of_birth: payload.date_of_birth || null,
    blood_group: payload.blood_group || null,
    marital_status: payload.marital_status || null,
    nationality: payload.nationality || null,
    aadhaar_id: payload.aadhaar_id || null,
    emergency_contact_name: payload.emergency_contact_name || null,
    emergency_contact_number: payload.emergency_contact_number || null,
    spouse_name: payload.spouse_name || null,
    spouse_contact: payload.spouse_contact || null,
    no_of_children: normalizedChildren,
    facebook: payload.facebook || null,
    twitter: payload.twitter || null,
    instagram: payload.instagram || null,
    linkedin: payload.linkedin || null,
    whatsapp: payload.whatsapp || null,
  };
}

function normalizeFamilyMemberRow(row = {}) {
  return {
    id: pickFirst(row, ['id']),
    members_id: pickFirst(row, ['members_id', 'member_id']),
    name: pickFirst(row, ['name']) || '',
    relation: pickFirst(row, ['relation']) || '',
    gender: pickFirst(row, ['gender']) || '',
    age: pickFirst(row, ['age']) ?? '',
    blood_group: pickFirst(row, ['blood_group']) || '',
    contact_no: pickFirst(row, ['contact_no']) || '',
    email: pickFirst(row, ['email']) || '',
    address: pickFirst(row, ['address']) || '',
    created_at: pickFirst(row, ['created_at']) || null,
    updated_at: pickFirst(row, ['updated_at']) || null,
  };
}

function normalizeOtherMembershipRow(row = {}) {
  return {
    id: pickFirst(row, ['id']),
    member_id: pickFirst(row, ['member_id']),
    member_name: pickFirst(row, ['member_name']) || '',
    member_phone: pickFirst(row, ['member_phone']) || '',
    trust_id: pickFirst(row, ['trust_id']),
    organisation_name: pickFirst(row, ['organisation_name']) || '',
    membership_no: pickFirst(row, ['membership_no']) || '',
    membership_type: pickFirst(row, ['membership_type']) || '',
    is_active: pickFirst(row, ['is_active']) !== false,
    remark: pickFirst(row, ['remark']) || '',
    created_at: pickFirst(row, ['created_at']) || null,
  };
}

function normalizeMemberNominationRow(row = {}) {
  return {
    id: pickFirst(row, ['id']),
    trust_id: pickFirst(row, ['trust_id']),
    member_id: pickFirst(row, ['member_id']),
    reg_id: pickFirst(row, ['reg_id']),
    family_member_id: pickFirst(row, ['family_member_id']),
    nominee_type: pickFirst(row, ['nominee_type']) || 'primary',
    status: pickFirst(row, ['status']) || 'pending',
    created_at: pickFirst(row, ['created_at']) || null,
    updated_at: pickFirst(row, ['updated_at']) || null,
  };
}

function buildOtherMembershipPayload(payload = {}, trustId = null) {
  return {
    member_id: payload.member_id?.trim() || null,
    member_name: payload.member_name?.trim() || null,
    member_phone: payload.member_phone?.trim() || null,
    trust_id: trustId || payload.trust_id || null,
    organisation_name: payload.organisation_name?.trim() || null,
    membership_no: payload.membership_no?.trim() || '',
    membership_type: payload.membership_type?.trim() || null,
    is_active: payload.is_active !== false,
    remark: payload.remark?.trim() || null,
  };
}

function buildFamilyMemberPayload(payload = {}, memberId) {
  const parsedAge =
    payload.age === '' || payload.age === null || payload.age === undefined
      ? null
      : Number.isFinite(Number(payload.age))
        ? Number(payload.age)
        : null;

  return {
    members_id: memberId,
    name: payload.name?.trim() || '',
    relation: payload.relation?.trim() || '',
    gender: payload.gender?.trim() || null,
    age: parsedAge,
    blood_group: payload.blood_group?.trim() || null,
    contact_no: payload.contact_no?.trim() || null,
    email: payload.email?.trim() || null,
    address: payload.address?.trim() || null,
  };
}

async function upsertMemberProfileByMemberId(memberId, payload = {}) {
  const profilePayload = buildMemberProfilePayload(payload, memberId);

  for (const table of MEMBER_PROFILE_TABLE_CANDIDATES) {
    const existingQuery = await supabase
      .from(table)
      .select('members_id')
      .eq('members_id', memberId)
      .limit(1)
      .maybeSingle();

    if (!existingQuery.error) {
      if (existingQuery.data?.members_id) {
        const { error } = await supabase
          .from(table)
          .update(profilePayload)
          .eq('members_id', memberId);
        if (error) return { error };
        return { error: null };
      }

      const { error } = await supabase.from(table).insert([profilePayload]);
      if (error) return { error };
      return { error: null };
    }

    const message = String(existingQuery.error?.message || '').toLowerCase();
    if (message.includes('does not exist')) continue;
    return { error: existingQuery.error };
  }

  return { error: null };
}

export async function fetchFamilyMembersByMemberId(memberId) {
  if (!memberId) return { data: [], error: null };
  return cachedQuery(`members:family:${memberId}`, async () => {
    const familyTable = await resolveTable(FAMILY_MEMBERS_TABLE_CANDIDATES, 'family_members');
    const { data, error } = await supabase
      .from(familyTable)
      .select('*')
      .eq('members_id', memberId)
      .order('created_at', { ascending: true, nullsFirst: false });

    if (error) {
      // Backward compatibility for alternate key naming if schema differs
      if (String(error?.message || '').toLowerCase().includes('members_id')) {
        const fallback = await supabase
          .from(familyTable)
          .select('*')
          .eq('member_id', memberId)
          .order('created_at', { ascending: true, nullsFirst: false });

        if (fallback.error) return { data: [], error: fallback.error };
        return { data: (fallback.data || []).map(normalizeFamilyMemberRow), error: null };
      }
      return { data: [], error };
    }

    return { data: (data || []).map(normalizeFamilyMemberRow), error: null };
  }, 12000);
}

function buildMemberNominationPayload(payload = {}, trustId = null) {
  return {
    trust_id: trustId || payload.trust_id || null,
    member_id: payload.member_id || null,
    reg_id: payload.reg_id || null,
    family_member_id: payload.family_member_id || null,
    nominee_type: String(payload.nominee_type || 'primary').trim().toLowerCase() === 'secondary' ? 'secondary' : 'primary',
    status: ['active', 'pending', 'revoked'].includes(String(payload.status || 'pending').trim().toLowerCase())
      ? String(payload.status).trim().toLowerCase()
      : 'pending',
  };
}

async function fetchMemberNominationLookups(rows = []) {
  const memberIds = [...new Set(rows.map((row) => String(row.member_id || '')).filter(Boolean))];
  const regIds = [...new Set(rows.map((row) => String(row.reg_id || '')).filter(Boolean))];
  const familyIds = [...new Set(rows.map((row) => String(row.family_member_id || '')).filter(Boolean))];

  const [memberRes, regRes, familyRes] = await Promise.all([
    memberIds.length
      ? supabase.from('Members').select('*').in('members_id', memberIds)
      : Promise.resolve({ data: [], error: null }),
    regIds.length
      ? supabase.from('reg_members').select('*').in('id', regIds)
      : Promise.resolve({ data: [], error: null }),
    familyIds.length
      ? supabase.from('family_members').select('*').in('id', familyIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (memberRes.error) return { error: memberRes.error };
  if (regRes.error) return { error: regRes.error };
  if (familyRes.error) return { error: familyRes.error };

  const memberMap = new Map((memberRes.data || []).map((row) => [String(row.members_id), row]));
  const regMap = new Map((regRes.data || []).map((row) => [String(row.id), row]));
  const familyMap = new Map((familyRes.data || []).map((row) => [String(row.id), row]));

  return {
    error: null,
    memberMap,
    regMap,
    familyMap,
  };
}

export async function fetchMemberNominationsByTrust(trustId) {
  if (!trustId) return { data: [], error: null };
  return cachedQuery(`nominations:trust:${trustId}`, async () => {
    const table = await resolveTable(MEMBER_NOMINATIONS_TABLE_CANDIDATES, 'member_nominations');
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('trust_id', trustId)
      .order('created_at', { ascending: false, nullsFirst: false });

    if (error) return { data: [], error };
    const rows = (data || []).map(normalizeMemberNominationRow);
    const lookups = await fetchMemberNominationLookups(rows);
    if (lookups.error) return { data: [], error: lookups.error };

    const enriched = rows.map((row) => ({
      ...row,
      member: lookups.memberMap.get(String(row.member_id)) || null,
      registration: lookups.regMap.get(String(row.reg_id)) || null,
      family_member: lookups.familyMap.get(String(row.family_member_id)) || null,
    }));

    return { data: enriched, error: null };
  }, 12000);
}

export async function createMemberNomination(payload = {}, trustId = null) {
  if (!payload.member_id) return { data: null, error: { message: 'Registered member is required.' } };
  if (!payload.reg_id) return { data: null, error: { message: 'Registration record is required.' } };
  if (!payload.family_member_id) return { data: null, error: { message: 'Family member is required.' } };

  const table = await resolveTable(MEMBER_NOMINATIONS_TABLE_CANDIDATES, 'member_nominations');
  const insertPayload = buildMemberNominationPayload(payload, trustId);
  const { data, error } = await supabase
    .from(table)
    .insert([insertPayload])
    .select('*')
    .single();

  if (error) return { data: null, error };
  invalidateMemberCaches();
  return { data: normalizeMemberNominationRow(data), error: null };
}

export async function updateMemberNomination(nominationId, payload = {}, trustId = null) {
  if (!nominationId) return { data: null, error: { message: 'Nomination id is required.' } };

  const table = await resolveTable(MEMBER_NOMINATIONS_TABLE_CANDIDATES, 'member_nominations');
  const updatePayload = buildMemberNominationPayload(payload, trustId);
  const { data, error } = await supabase
    .from(table)
    .update(updatePayload)
    .eq('id', nominationId)
    .select('*')
    .single();

  if (error) return { data: null, error };
  invalidateMemberCaches();
  return { data: normalizeMemberNominationRow(data), error: null };
}

export async function deleteMemberNomination(nominationId) {
  if (!nominationId) return { error: { message: 'Nomination id is required.' } };
  const table = await resolveTable(MEMBER_NOMINATIONS_TABLE_CANDIDATES, 'member_nominations');
  const { error } = await supabase.from(table).delete().eq('id', nominationId);
  if (!error) invalidateMemberCaches();
  return { error };
}

function extensionFromImageFile(file) {
  const fromName = String(file?.name || '').split('.').pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  const mime = String(file?.type || '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  return 'jpg';
}

function buildProfilePhotoPath(memberId, file) {
  const ext = extensionFromImageFile(file);
  const safeMemberId = String(memberId || 'unknown').replace(/[^a-zA-Z0-9_-]/g, '') || 'unknown';
  return `profile_photo/${safeMemberId}/${Date.now()}.${ext}`;
}

export async function uploadMemberProfilePhoto(memberId, file) {
  if (!memberId) return { data: null, error: { message: 'Member id is required for profile photo upload.' } };
  if (!file) return { data: null, error: { message: 'No profile photo file provided.' } };
  const prepared = await prepareImageFileForUpload(file);
  if (prepared.error || !prepared.file) {
    return { data: null, error: { message: prepared.error?.message || getAllowedImageFormatsMessage() } };
  }
  const uploadFile = prepared.file;

  const path = buildProfilePhotoPath(memberId, uploadFile);
  const { error: uploadError } = await supabase
    .storage
    .from(PROFILE_PHOTO_BUCKET)
    .upload(path, uploadFile, {
      cacheControl: '3600',
      upsert: false,
      contentType: uploadFile.type || undefined,
    });

  if (uploadError) return { data: null, error: uploadError };

  const { data: publicData } = supabase
    .storage
    .from(PROFILE_PHOTO_BUCKET)
    .getPublicUrl(path);

  return {
    data: {
      path,
      publicUrl: publicData?.publicUrl || null,
      warning: prepared.warning || '',
    },
    error: null,
  };
}

export async function fetchOtherMembershipsByMemberId(memberId) {
  if (!memberId) return { data: [], error: null };
  const cacheKey = `members:other-memberships:${memberId}`;

  return cachedQuery(cacheKey, async () => {
    const table = await resolveTable(OTHER_MEMBERSHIPS_TABLE_CANDIDATES, 'other_memberships');
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('member_id', memberId)
      .order('created_at', { ascending: false, nullsFirst: false });

    if (error) return { data: [], error };
    return { data: (data || []).map(normalizeOtherMembershipRow), error: null };
  }, 12000);
}

export async function fetchOtherMembershipsByTrustId(trustId) {
  if (!trustId) return { data: [], error: null };
  const cacheKey = `members:other-memberships:trust:${trustId}`;

  return cachedQuery(cacheKey, async () => {
    const table = await resolveTable(OTHER_MEMBERSHIPS_TABLE_CANDIDATES, 'other_memberships');
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('trust_id', trustId)
      .order('created_at', { ascending: false, nullsFirst: false });

    if (error) return { data: [], error };
    return { data: (data || []).map(normalizeOtherMembershipRow), error: null };
  }, 12000);
}

export async function fetchOtherMembershipById(otherMembershipId) {
  if (!otherMembershipId) return { data: null, error: { message: 'Other membership id is required.' } };

  const table = await resolveTable(OTHER_MEMBERSHIPS_TABLE_CANDIDATES, 'other_memberships');
  const { data, error } = await supabase
    .from(table)
    .select('*')
    .eq('id', otherMembershipId)
    .maybeSingle();

  if (error) return { data: null, error };
  return { data: data ? normalizeOtherMembershipRow(data) : null, error: null };
}

export async function createOtherMembership(payload = {}, trustId = null) {
  if (!payload?.membership_no?.trim()) {
    return { data: null, error: { message: 'Membership No is required.' } };
  }

  const table = await resolveTable(OTHER_MEMBERSHIPS_TABLE_CANDIDATES, 'other_memberships');
  const insertPayload = buildOtherMembershipPayload(payload, trustId);
  const { data, error } = await supabase
    .from(table)
    .insert([insertPayload])
    .select('*')
    .single();

  if (error) return { data: null, error };
  invalidateMemberCaches();
  return { data: normalizeOtherMembershipRow(data), error: null };
}

export async function updateOtherMembership(otherMembershipId, payload = {}, trustId = null) {
  if (!otherMembershipId) return { data: null, error: { message: 'Other membership id is required.' } };
  if (!payload?.membership_no?.trim()) return { data: null, error: { message: 'Membership No is required.' } };

  const table = await resolveTable(OTHER_MEMBERSHIPS_TABLE_CANDIDATES, 'other_memberships');
  const updatePayload = buildOtherMembershipPayload(payload, trustId);
  const { data, error } = await supabase
    .from(table)
    .update(updatePayload)
    .eq('id', otherMembershipId)
    .select('*')
    .single();

  if (error) return { data: null, error };
  invalidateMemberCaches();
  return { data: normalizeOtherMembershipRow(data), error: null };
}

export async function deleteOtherMembership(otherMembershipId) {
  if (!otherMembershipId) return { error: { message: 'Other membership id is required.' } };
  const table = await resolveTable(OTHER_MEMBERSHIPS_TABLE_CANDIDATES, 'other_memberships');
  const { error } = await supabase.from(table).delete().eq('id', otherMembershipId);
  if (!error) invalidateMemberCaches();
  return { error };
}

export async function createFamilyMember(memberId, payload = {}) {
  if (!memberId) return { data: null, error: { message: 'Member id is required.' } };
  if (!payload?.name?.trim()) return { data: null, error: { message: 'Family member name is required.' } };
  if (!payload?.relation?.trim()) return { data: null, error: { message: 'Relation is required.' } };

  const familyTable = await resolveTable(FAMILY_MEMBERS_TABLE_CANDIDATES, 'family_members');
  const insertPayload = buildFamilyMemberPayload(payload, memberId);
  const { data, error } = await supabase
    .from(familyTable)
    .insert([insertPayload])
    .select('*')
    .single();

  if (error) return { data: null, error };
  invalidateMemberCaches();
  return { data: normalizeFamilyMemberRow(data), error: null };
}

export async function updateFamilyMember(familyMemberId, memberId, payload = {}) {
  if (!familyMemberId) return { data: null, error: { message: 'Family member id is required.' } };
  if (!payload?.name?.trim()) return { data: null, error: { message: 'Family member name is required.' } };
  if (!payload?.relation?.trim()) return { data: null, error: { message: 'Relation is required.' } };

  const familyTable = await resolveTable(FAMILY_MEMBERS_TABLE_CANDIDATES, 'family_members');
  const updatePayload = buildFamilyMemberPayload(payload, memberId);
  const query = supabase
    .from(familyTable)
    .update(updatePayload)
    .eq('id', familyMemberId)
    .select('*')
    .single();

  const { data, error } = memberId ? await query.eq('members_id', memberId) : await query;
  if (error) return { data: null, error };
  invalidateMemberCaches();
  return { data: normalizeFamilyMemberRow(data), error: null };
}

export async function deleteFamilyMember(familyMemberId, memberId) {
  if (!familyMemberId) return { error: { message: 'Family member id is required.' } };
  const familyTable = await resolveTable(FAMILY_MEMBERS_TABLE_CANDIDATES, 'family_members');
  const query = supabase.from(familyTable).delete().eq('id', familyMemberId);
  const { error } = memberId ? await query.eq('members_id', memberId) : await query;
  if (!error) invalidateMemberCaches();
  return { error };
}

function buildMemberPayload(payload, trustId, table) {
  if (table === 'members') {
    return {
      name: payload.name,
      address_home: payload.address_home || null,
      company_name: payload.company_name || null,
      address_office: payload.address_office || null,
      resident_landline: payload.resident_landline || null,
      office_landline: payload.office_landline || null,
      mobile: payload.mobile || null,
      email: payload.email || null,
      trust_id: trustId || null,
    };
  }

  return {
    Name: payload.name,
    'Address Home': payload.address_home || null,
    'Company Name': payload.company_name || null,
    'Address Office': payload.address_office || null,
    'Resident Landline': payload.resident_landline || null,
    'Office Landline': payload.office_landline || null,
    Mobile: payload.mobile || null,
    Email: payload.email || null,
    trust_id: trustId ? String(trustId) : null,
  };
}

function buildRegisteredPayload(payload, trustId, memberId, table) {
  if (table === 'registered_members') {
    return {
      trust_id: trustId,
      member_id: memberId,
      membership_number: payload.membership_number || null,
      role: payload.role || null,
      joined_date: payload.joined_date || null,
      is_active: payload.is_active !== false,
    };
  }

  return {
    trust_id: trustId,
    members_id: memberId,
    'Membership number': payload.membership_number || null,
    role: payload.role || null,
    joined_date: payload.joined_date || null,
    is_active: payload.is_active !== false,
  };
}

async function fetchMemberRowsByIds(memberIds) {
  const memberTables = await resolveAvailableTables(MEMBER_TABLE_CANDIDATES, 'members');
  if (!memberIds.length) return { data: [], error: null, table: memberTables[0] };

  const ids = [...new Set(memberIds.filter(Boolean))];
  const idChunks = chunkValues(ids);
  const combinedRows = [];
  let lastTable = memberTables[0];

  for (const membersTable of memberTables) {
    const idColumn = membersTable === 'members' ? 'member_id' : 'members_id';
    lastTable = membersTable;
    const chunkResults = await Promise.all(
      idChunks.map((chunk) => supabase.from(membersTable).select('*').in(idColumn, chunk))
    );
    const errored = chunkResults.find((result) => result.error);
    if (errored?.error) return { data: [], error: errored.error, table: membersTable };
    combinedRows.push(...chunkResults.flatMap((result) => result.data || []));
  }

  return { data: combinedRows, error: null, table: lastTable };
}

async function fetchRegisteredRowsByTrustId(trustId) {
  if (!trustId) return { data: [], error: null };

  const registeredTables = await resolveAvailableTables(REGISTERED_TABLE_CANDIDATES, 'registered');
  const tableResults = await Promise.all(
    registeredTables.map((registeredTable) =>
      fetchAllRows(
        supabase
          .from(registeredTable)
          .select('*')
          .eq('trust_id', trustId)
      )
    )
  );

  const errored = tableResults.find((result) => result.error);
  if (errored?.error) return { data: [], error: errored.error };
  return { data: tableResults.flatMap((result) => result.data || []), error: null };
}

async function fetchRegisteredMembersByIds(registrationIds = [], currentTrustId = null) {
  const uniqueRegistrationIds = [...new Set((registrationIds || []).filter(Boolean))];
  if (!uniqueRegistrationIds.length) return { data: [], error: null };

  const registeredTable = await resolveTable(REGISTERED_TABLE_CANDIDATES, 'registered');
  const idChunks = chunkValues(uniqueRegistrationIds);
  const chunkResults = await Promise.all(
    idChunks.map((chunk) => supabase.from(registeredTable).select('*').in('id', chunk))
  );
  const errored = chunkResults.find((result) => result.error);
  if (errored?.error) return { data: [], error: errored.error };

  const registeredRows = chunkResults.flatMap((result) => result.data || []);
  if (!registeredRows.length) return { data: [], error: null };

  const memberIds = registeredRows.map(getRegisteredMemberId).filter(Boolean);
  const { data: memberRows, error: memberError } = await fetchMemberRowsByIds(memberIds);
  if (memberError) return { data: [], error: memberError };

  const memberMap = new Map((memberRows || []).map((row) => [String(getMemberUniqueId(row)), row]));
  const normalized = registeredRows.map((row) =>
    normalizeRegisteredRow(row, memberMap.get(String(getRegisteredMemberId(row))) || {}, currentTrustId)
  );

  return { data: normalized, error: null };
}

async function fetchRegisteredRowById(id, currentTrustId) {
  const registeredTable = await resolveTable(REGISTERED_TABLE_CANDIDATES, 'registered');
  const { data: regRow, error } = await supabase.from(registeredTable).select('*').eq('id', id).single();
  if (error) return { data: null, error };

  const memberId = getRegisteredMemberId(regRow);
  const { data: memberRows, error: memberError } = await fetchMemberRowsByIds([memberId]);
  if (memberError) return { data: null, error: memberError };

  const memberRow = (memberRows || []).find((item) => String(getMemberUniqueId(item)) === String(memberId)) || {};
  return { data: normalizeRegisteredRow(regRow, memberRow, currentTrustId), error: null };
}

export async function fetchRegisteredMembersByTrust(trustId) {
  if (!trustId) return { data: [], error: null };
  return cachedQuery(`members:registered-by-trust:${trustId}`, async () => {
    const registeredTables = await resolveAvailableTables(REGISTERED_TABLE_CANDIDATES, 'registered');
    const tableResults = await Promise.all(
      registeredTables.map((registeredTable) =>
        fetchAllRows(
          supabase
            .from(registeredTable)
            .select('*')
            .eq('trust_id', trustId)
            .order('joined_date', { ascending: false, nullsFirst: false })
        )
      )
    );
    const errored = tableResults.find((result) => result.error);
    if (errored?.error) return { data: [], error: errored.error };
    const registeredRows = tableResults.flatMap((result) => result.data || []);

    const memberIds = (registeredRows || []).map(getRegisteredMemberId).filter(Boolean);
    const { data: memberRows, error: memberError } = await fetchMemberRowsByIds(memberIds);
    if (memberError) return { data: [], error: memberError };

    const memberMap = new Map((memberRows || []).map((row) => [String(getMemberUniqueId(row)), row]));
    const normalized = (registeredRows || []).map((row) =>
      normalizeRegisteredRow(row, memberMap.get(String(getRegisteredMemberId(row))) || {}, trustId)
    );

    return { data: normalized, error: null };
  }, 12000);
}

export async function fetchAllMembersDirectory(currentTrustId) {
  return cachedQuery(`members:directory:all:${currentTrustId || 'all'}`, async () => {
    const memberTables = await resolveAvailableTables(MEMBER_TABLE_CANDIDATES, 'members');
    const tableResults = await Promise.all(
      memberTables.map((membersTable) =>
        fetchAllRows(supabase.from(membersTable).select('*'))
      )
    );
    const errored = tableResults.find((result) => result.error);
    if (errored?.error) return { data: [], error: errored.error };
    const memberRows = tableResults.flatMap((result) => result.data || []);

    return { data: memberRows.map((row) => normalizeMemberRow(row, currentTrustId)), error: null };
  }, 12000);
}

export async function fetchMembersDirectoryPage(
  currentTrustId,
  { from = 0, to = 19 } = {}
) {
  const pageKey = `members:directory:page:${currentTrustId || 'all'}:${from}:${to}`;
  return cachedQuery(pageKey, async () => {
    const memberTables = await resolveAvailableTables(MEMBER_TABLE_CANDIDATES, 'members');
    const tableResults = await Promise.all(
      memberTables.map(async (membersTable) => {
        const { data, error } = await supabase
          .from(membersTable)
          .select('*')
          .range(from, to);
        return { data: data || [], error };
      })
    );
    const errored = tableResults.find((result) => result.error);
    if (errored?.error) return { data: [], error: errored.error };
    const memberRows = tableResults.flatMap((result) => result.data || []);
    return { data: memberRows.map((row) => normalizeMemberRow(row, currentTrustId)), error: null };
  }, 10000);
}

export async function fetchRegisteredMembersDirectory(currentTrustId) {
  const cacheKey = `members:directory:registered:${currentTrustId || 'all'}`;
  return cachedQuery(cacheKey, async () => {
  const allRows = [];
  let from = 0;

  while (true) {
    const to = from + TABLE_PAGE_SIZE - 1;
    const { data, error } = await fetchRegisteredMembersDirectoryPage(currentTrustId, { from, to });
    if (error) return { data: [], error };

    const rows = data || [];
    allRows.push(...rows);

    if (rows.length < TABLE_PAGE_SIZE) break;
    from += TABLE_PAGE_SIZE;
  }

  return { data: allRows, error: null };
  }, 12000);
}

export async function fetchRegisteredMembersDirectoryPage(currentTrustId, { from = 0, to = TABLE_PAGE_SIZE - 1 } = {}) {
  const pageKey = `members:directory:registered-page:${currentTrustId || 'all'}:${from}:${to}`;
  return cachedQuery(pageKey, async () => {
  const registeredTable = await resolveTable(REGISTERED_TABLE_CANDIDATES, 'registered');

  let query = supabase
    .from(registeredTable)
    .select('*')
    .order('joined_date', { ascending: false, nullsFirst: false })
    .range(from, to);

  if (currentTrustId) query = query.eq('trust_id', currentTrustId);

  const { data: registeredRows, error } = await query;

  if (error) return { data: [], error };

  const rows = registeredRows || [];
  if (!rows.length) return { data: [], error: null };

  const memberIds = rows.map(getRegisteredMemberId).filter(Boolean);
  const { data: memberRows, error: memberError } = await fetchMemberRowsByIds(memberIds);
  if (memberError) return { data: [], error: memberError };

  const memberMap = new Map((memberRows || []).map((row) => [String(getMemberUniqueId(row)), row]));
  const normalized = rows.map((row) =>
    normalizeRegisteredRow(row, memberMap.get(String(getRegisteredMemberId(row))) || {}, currentTrustId)
  );

  return { data: normalized, error: null };
  }, 10000);
}

export async function registerExistingMember(trustId, memberId, payload = {}) {
  const registeredTable = await resolveTable(REGISTERED_TABLE_CANDIDATES, 'registered');
  const memberIdColumn = registeredTable === 'registered_members' ? 'member_id' : 'members_id';

  const existingQuery = await supabase
    .from(registeredTable)
    .select('*')
    .eq('trust_id', trustId)
    .eq(memberIdColumn, memberId)
    .limit(1)
    .maybeSingle();

  if (existingQuery.error) return { data: null, error: existingQuery.error };

  const registrationPayload = buildRegisteredPayload(payload, trustId, memberId, registeredTable);

  if (existingQuery.data?.id) {
    const { error } = await supabase
      .from(registeredTable)
      .update(registrationPayload)
      .eq('id', existingQuery.data.id);

    if (error) return { data: null, error };
    invalidateMemberCaches();
    return fetchRegisteredRowById(existingQuery.data.id, trustId);
  }

  const { data, error } = await supabase
    .from(registeredTable)
    .insert([registrationPayload])
    .select('id')
    .single();

  if (error) return { data: null, error };
  invalidateMemberCaches();
  return fetchRegisteredRowById(data.id, trustId);
}

export async function createMember(trustId, payload) {
  const membersTable = await resolveTable(MEMBER_TABLE_CANDIDATES, 'members');
  const memberIdColumn = membersTable === 'members' ? 'member_id' : 'members_id';
  const memberPayload = buildMemberPayload(payload, trustId, membersTable);

  const { data, error } = await supabase
    .from(membersTable)
    .insert([memberPayload])
    .select('*')
    .single();

  if (error) return { data: null, error };

  const createdMemberId = data?.[memberIdColumn];
  if (!createdMemberId) return { data: null, error: { message: 'Member id not returned after create.' } };

  const result = await registerExistingMember(trustId, createdMemberId, payload);
  if (!result?.error) invalidateMemberCaches();
  return result;
}

export async function updateRegisteredMember(registrationId, payload, currentTrustId) {
  const registration = await fetchRegisteredRowById(registrationId, currentTrustId);
  if (registration.error) return registration;
  if (!registration.data) return { data: null, error: { message: 'Registered member not found.' } };

  const membersTable = await resolveTable(MEMBER_TABLE_CANDIDATES, 'members');
  const memberIdColumn = membersTable === 'members' ? 'member_id' : 'members_id';
  const registeredTable = await resolveTable(REGISTERED_TABLE_CANDIDATES, 'registered');
  const memberPayload = buildMemberPayload(payload, currentTrustId, membersTable);
  const memberId = registration.data.member_id;

  const { error: memberError } = await supabase
    .from(membersTable)
    .update(memberPayload)
    .eq(memberIdColumn, memberId);

  if (memberError) return { data: null, error: memberError };

  const registeredPayload = buildRegisteredPayload(payload, currentTrustId, memberId, registeredTable);
  const { error: registrationError } = await supabase
    .from(registeredTable)
    .update(registeredPayload)
    .eq('id', registrationId)
    .eq('trust_id', currentTrustId);

  if (registrationError) return { data: null, error: registrationError };

  const { error: memberProfileError } = await upsertMemberProfileByMemberId(memberId, payload);
  if (memberProfileError) return { data: null, error: memberProfileError };

  invalidateMemberCaches();
  return fetchRegisteredRowById(registrationId, currentTrustId);
}

export async function updateRegisteredMembership(registrationId, payload, currentTrustId) {
  const registeredTable = await resolveTable(REGISTERED_TABLE_CANDIDATES, 'registered');
  const registration = await fetchRegisteredRowById(registrationId, currentTrustId);
  if (registration.error) return registration;
  if (!registration.data) return { data: null, error: { message: 'Registered member not found.' } };

  const registeredPayload = buildRegisteredPayload(
    payload,
    currentTrustId,
    registration.data.member_id,
    registeredTable
  );

  const { error } = await supabase
    .from(registeredTable)
    .update(registeredPayload)
    .eq('id', registrationId)
    .eq('trust_id', currentTrustId);

  if (error) return { data: null, error };

  invalidateMemberCaches();
  return fetchRegisteredRowById(registrationId, currentTrustId);
}

export async function unregisterRegisteredMember(registrationId, currentTrustId) {
  const registeredTable = await resolveTable(REGISTERED_TABLE_CANDIDATES, 'registered');
  const { error } = await supabase
    .from(registeredTable)
    .delete()
    .eq('id', registrationId)
    .eq('trust_id', currentTrustId);

  if (!error) invalidateMemberCaches();
  return { error };
}

export async function fetchMemberProfileView({ registrationId = null, memberId = null, trustId = null } = {}) {
  const profileKey = `members:profile:${registrationId || ''}:${memberId || ''}:${trustId || ''}`;
  return cachedQuery(profileKey, async () => {
  const registeredTable = await resolveTable(REGISTERED_TABLE_CANDIDATES, 'registered');
  const memberIdColumn = registeredTable === 'registered_members' ? 'member_id' : 'members_id';

  let registrationRow = null;
  let registrationError = null;
  let currentMemberId = memberId ? String(memberId) : null;

  if (registrationId) {
    const query = supabase
      .from(registeredTable)
      .select('*')
      .eq('id', registrationId)
      .limit(1)
      .maybeSingle();

    if (trustId) query.eq('trust_id', trustId);

    const { data, error } = await query;
    if (error) registrationError = error;
    registrationRow = data || null;
    currentMemberId = currentMemberId || String(getRegisteredMemberId(registrationRow) || '');
  } else if (currentMemberId) {
    const query = supabase
      .from(registeredTable)
      .select('*')
      .eq(memberIdColumn, currentMemberId)
      .limit(1);

    if (trustId) query.eq('trust_id', trustId);

    const { data, error } = await query.maybeSingle();
    if (error) registrationError = error;
    registrationRow = data || null;
  }

  if (!currentMemberId) {
    return { data: null, error: registrationError || { message: 'Member id is required to load profile.' } };
  }

  const { data: memberRows, error: memberError } = await fetchMemberRowsByIds([currentMemberId]);
  if (memberError) return { data: null, error: memberError };

  const memberRow = (memberRows || []).find((row) => String(getMemberUniqueId(row)) === currentMemberId) || {};
  const normalizedMember = normalizeMemberRow(memberRow, trustId);

  let profileRow = null;
  let profileError = null;
  for (const table of MEMBER_PROFILE_TABLE_CANDIDATES) {
    const { data, error } = await supabase
      .from(table)
      .select('*')
      .eq('members_id', currentMemberId)
      .limit(1)
      .maybeSingle();

    if (!error) {
      profileRow = data || null;
      profileError = null;
      break;
    }

    if (String(error?.message || '').toLowerCase().includes('does not exist')) {
      profileError = null;
      profileRow = null;
      break;
    }

    profileError = error;
  }

  if (profileError) return { data: null, error: profileError };

  const registeredData = registrationRow
    ? normalizeRegisteredRow(registrationRow, memberRow, trustId)
    : {
        id: null,
        membership_number: '',
        role: '',
      };

  return {
    data: {
      registration_id: registeredData.id || registrationId || null,
      trust_id: registeredData.trust_id || null,
      member_id: currentMemberId,
      name: normalizedMember.name || '',
      address_home: normalizedMember.address_home || '',
      company_name: normalizedMember.company_name || '',
      address_office: normalizedMember.address_office || '',
      resident_landline: normalizedMember.resident_landline || '',
      office_landline: normalizedMember.office_landline || '',
      mobile: normalizedMember.mobile || '',
      email: normalizedMember.email || '',
      membership_number: registeredData.membership_number || '',
      role: registeredData.role || '',
      joined_date: registeredData.joined_date || '',
      is_active: registeredData.is_active !== false,
      is_editable: registeredData.is_editable === true,
      member_type: registeredData.member_type || 'others',
      ...normalizeMemberProfileRow(profileRow || {}),
    },
    error: null,
  };
  }, 10000);
}

function normalizeMemberRoleRow(row = {}, registeredMemberMap = new Map()) {
  const regId = pickFirst(row, ['reg_id']);
  const member = registeredMemberMap.get(String(regId)) || null;
  return {
    id: pickFirst(row, ['id']),
    reg_id: regId || null,
    role_type: pickFirst(row, ['role_type']) || '',
    title: pickFirst(row, ['title']) || '',
    subtitle: pickFirst(row, ['subtitle']) || '',
    created_at: pickFirst(row, ['created_at']) || null,
    member,
  };
}

export async function createMemberRole(payload = {}) {
  const regId = String(payload?.reg_id || '').trim();
  if (!regId) return { data: null, error: { message: 'Registered member is required.' } };

  const normalizedTitle = String(payload?.title || '').trim();
  if (!normalizedTitle) return { data: null, error: { message: 'Title is required.' } };

  const now = new Date().toISOString();
  const insertPayload = {
    reg_id: regId,
    role_type: String(payload?.role_type || '').trim() || null,
    title: normalizedTitle,
    subtitle: String(payload?.subtitle || '').trim() || null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from(MEMBER_ROLES_TABLE)
    .insert([insertPayload])
    .select('*')
    .single();

  if (error) return { data: null, error };
  invalidateMemberCaches();
  return {
    data: {
      id: pickFirst(data, ['id']),
      reg_id: pickFirst(data, ['reg_id']),
      role_type: pickFirst(data, ['role_type']) || '',
      title: pickFirst(data, ['title']) || '',
      subtitle: pickFirst(data, ['subtitle']) || '',
      created_at: pickFirst(data, ['created_at']) || null,
    },
    error: null,
  };
}

export async function updateMemberRole(roleId, updates = {}) {
  if (!roleId) return { data: null, error: { message: 'Role id is required.' } };

  const payload = {
    ...(updates.role_type !== undefined ? { role_type: String(updates.role_type || '').trim() || null } : {}),
    ...(updates.title !== undefined ? { title: String(updates.title || '').trim() || null } : {}),
    ...(updates.subtitle !== undefined ? { subtitle: String(updates.subtitle || '').trim() || null } : {}),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from(MEMBER_ROLES_TABLE)
    .update(payload)
    .eq('id', roleId)
    .select('*')
    .single();

  if (error) return { data: null, error };
  invalidateMemberCaches();
  return {
    data: {
      id: pickFirst(data, ['id']),
      role_type: pickFirst(data, ['role_type']) || '',
      title: pickFirst(data, ['title']) || '',
      subtitle: pickFirst(data, ['subtitle']) || '',
      created_at: pickFirst(data, ['created_at']) || null,
    },
    error: null,
  };
}

async function fetchMemberRoleRowsByRegistrationIds(registrationIds = []) {
  const uniqueRegistrationIds = [...new Set((registrationIds || []).filter(Boolean))];
  if (!uniqueRegistrationIds.length) return { data: [], error: null };

  const idChunks = chunkValues(uniqueRegistrationIds, MEMBER_ROLE_FETCH_CHUNK_SIZE);
  const chunkResults = await Promise.all(
    idChunks.map((chunk) =>
      supabase
        .from(MEMBER_ROLES_TABLE)
        .select('*')
        .in('reg_id', chunk)
        .order('created_at', { ascending: false, nullsFirst: false })
    )
  );
  const errored = chunkResults.find((result) => result.error);
  if (errored?.error) return { data: [], error: errored.error };
  const allRoleRows = chunkResults.flatMap((result) => result.data || []);

  allRoleRows.sort((left, right) => {
    const leftCreatedAt = pickFirst(left, ['created_at']);
    const rightCreatedAt = pickFirst(right, ['created_at']);

    if (!leftCreatedAt && !rightCreatedAt) return 0;
    if (!leftCreatedAt) return 1;
    if (!rightCreatedAt) return -1;
    return String(rightCreatedAt).localeCompare(String(leftCreatedAt));
  });

  return { data: allRoleRows, error: null };
}

export async function fetchMemberRolesByTrust(trustId) {
  if (!trustId) return { data: [], error: null };
  const cacheKey = `members:member-roles:${trustId}`;
  const normalizedTrustId = String(trustId);

  return cachedQuery(cacheKey, async () => {
    const { data: registeredRows, error: registeredRowsError } = await fetchRegisteredRowsByTrustId(trustId);
    if (registeredRowsError) return { data: [], error: registeredRowsError };

    const registrationIds = (registeredRows || []).map((item) => item?.id).filter(Boolean);
    if (!registrationIds.length) return { data: [], error: null };

    const { data: roleRows, error: rolesError } = await fetchMemberRoleRowsByRegistrationIds(registrationIds);
    if (rolesError) return { data: [], error: rolesError };
    if (!(roleRows || []).length) return { data: [], error: null };

    const roleRegistrationIds = [...new Set((roleRows || []).map((item) => item?.reg_id).filter(Boolean))];
    const { data: roleRegisteredMembers, error: roleRegisteredMembersError } = await fetchRegisteredMembersByIds(
      roleRegistrationIds,
      trustId
    );
    if (roleRegisteredMembersError) return { data: [], error: roleRegisteredMembersError };

    const registeredMemberMap = new Map((roleRegisteredMembers || []).map((item) => [String(item.id), item]));
    const normalized = (roleRows || [])
      .map((row) => normalizeMemberRoleRow(row, registeredMemberMap))
      .filter((item) => item.member && item.reg_id)
      .filter((item) => String(item?.member?.trust_id || '') === normalizedTrustId);

    return { data: normalized, error: null };
  }, 12000);
}
