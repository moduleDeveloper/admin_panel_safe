import { supabase } from '../../../core/lib/supabase';
import { invalidateCache } from '../../../core/services/requestCache';

const DASHBOARD_TABLE = 'dashboard';

function toNonNegativeInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(Math.trunc(num), 0);
}

function normalizeDashboardRow(row = {}) {
  return {
    id: row.id || null,
    trust_id: row.trust_id || null,
    app_downloads: toNonNegativeInt(row.app_downloads),
    live_app_users: toNonNegativeInt(row.live_app_users),
    total_members: toNonNegativeInt(row.total_members),
    panel_users: toNonNegativeInt(row.panel_users),
    live_events: toNonNegativeInt(row.live_events),
    elected_members: toNonNegativeInt(row.elected_members),
    committee_members: toNonNegativeInt(row.committee_members),
    vip_patron_members: toNonNegativeInt(row.vip_patron_members),
    posts_on_social_media: toNonNegativeInt(row.posts_on_social_media),
    gallery_uploads: toNonNegativeInt(row.gallery_uploads),
    announcements_sent: toNonNegativeInt(row.announcements_sent),
    referral_activities: toNonNegativeInt(row.referral_activities),
    updated_at: row.updated_at || null,
  };
}

export async function fetchDashboardByTrustId(trustId) {
  if (!trustId) return { data: null, error: { message: 'No trust id provided.' } };

  const { data, error } = await supabase
    .from(DASHBOARD_TABLE)
    .select('*')
    .eq('trust_id', trustId)
    .maybeSingle();

  return { data: data ? normalizeDashboardRow(data) : null, error };
}

export async function upsertDashboardByTrustId(trustId, payload = {}) {
  if (!trustId) return { data: null, error: { message: 'No trust id provided.' } };

  const row = {
    trust_id: trustId,
    app_downloads: toNonNegativeInt(payload.app_downloads),
    live_app_users: toNonNegativeInt(payload.live_app_users),
    total_members: toNonNegativeInt(payload.total_members),
    panel_users: toNonNegativeInt(payload.panel_users),
    live_events: toNonNegativeInt(payload.live_events),
    elected_members: toNonNegativeInt(payload.elected_members),
    committee_members: toNonNegativeInt(payload.committee_members),
    vip_patron_members: toNonNegativeInt(payload.vip_patron_members),
    posts_on_social_media: toNonNegativeInt(payload.posts_on_social_media),
    gallery_uploads: toNonNegativeInt(payload.gallery_uploads),
    announcements_sent: toNonNegativeInt(payload.announcements_sent),
    referral_activities: toNonNegativeInt(payload.referral_activities),
  };

  const { data, error } = await supabase
    .from(DASHBOARD_TABLE)
    .upsert(row, { onConflict: 'trust_id' })
    .select('*')
    .single();

  if (!error) invalidateCache('dashboard:');
  return { data: data ? normalizeDashboardRow(data) : null, error };
}

// ── Trust-scoped Member creation insights (source of truth: Members.created_at) ─
// Members has no trust_id; trust association comes from reg_members (trust_id, members_id),
// joined with an inner embed so only Members linked to the selected trust are counted.
const MEMBERS_TABLE = 'Members';
const MEMBER_TRUST_JOIN = 'reg_members!inner(trust_id)';
const MEMBER_INSIGHT_FIELDS = `members_id, "Name", "Mobile", created_at, ${MEMBER_TRUST_JOIN}`;

// Parses a local 'YYYY-MM-DD' string into local midnight; returns null if invalid.
function parseLocalDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || ''));
  if (!match) return null;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? null : date;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function normalizeMemberInsightRow(row = {}) {
  return {
    members_id: row.members_id ?? null,
    name: row.Name ? String(row.Name) : '',
    mobile: row.Mobile != null ? String(row.Mobile) : '',
    created_at: row.created_at || null,
  };
}

/**
 * Read-only Member creation stats for Members associated with `trustId`.
 * `from` / `to` are local calendar dates ('YYYY-MM-DD'), both inclusive.
 * Queried as created_at >= start(from) AND created_at < start(to + 1 day).
 */
export async function fetchMemberCreationStats({ trustId, from, to, recentLimit = 10 } = {}) {
  if (!trustId) return { data: null, error: { message: 'No trust id provided.' } };
  const fromStart = parseLocalDate(from);
  const toStart = parseLocalDate(to);
  if (!fromStart || !toStart) return { data: null, error: { message: 'Invalid date range.' } };
  if (fromStart > toStart) return { data: null, error: { message: 'From date must be on or before To date.' } };

  const rangeFromIso = fromStart.toISOString();
  const rangeToExclusiveIso = addDays(toStart, 1).toISOString();

  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const todayStartIso = todayStart.toISOString();
  const tomorrowStartIso = addDays(todayStart, 1).toISOString();

  const limit = Math.max(toNonNegativeInt(recentLimit, 10), 1);

  const countTrustMembers = () => supabase
    .from(MEMBERS_TABLE)
    .select(`members_id, ${MEMBER_TRUST_JOIN}`, { count: 'exact', head: true })
    .eq('reg_members.trust_id', trustId);
  const selectTrustMembers = () => supabase
    .from(MEMBERS_TABLE)
    .select(MEMBER_INSIGHT_FIELDS)
    .eq('reg_members.trust_id', trustId);

  const [totalRes, todayRes, periodRes, latestRes, recentRes] = await Promise.all([
    countTrustMembers(),
    countTrustMembers()
      .gte('created_at', todayStartIso)
      .lt('created_at', tomorrowStartIso),
    countTrustMembers()
      .gte('created_at', rangeFromIso)
      .lt('created_at', rangeToExclusiveIso),
    selectTrustMembers()
      .not('created_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1),
    selectTrustMembers()
      .gte('created_at', rangeFromIso)
      .lt('created_at', rangeToExclusiveIso)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  const error = totalRes.error || todayRes.error || periodRes.error || latestRes.error || recentRes.error || null;
  if (error) return { data: null, error };

  const lastMember = Array.isArray(latestRes.data) && latestRes.data[0]
    ? normalizeMemberInsightRow(latestRes.data[0])
    : null;

  return {
    data: {
      totalMembers: toNonNegativeInt(totalRes.count),
      createdToday: toNonNegativeInt(todayRes.count),
      createdInPeriod: toNonNegativeInt(periodRes.count),
      lastCreatedAt: lastMember?.created_at || null,
      lastMember,
      recentMembers: (recentRes.data || []).map(normalizeMemberInsightRow),
    },
    error: null,
  };
}
