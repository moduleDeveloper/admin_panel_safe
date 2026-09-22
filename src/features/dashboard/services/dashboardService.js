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
