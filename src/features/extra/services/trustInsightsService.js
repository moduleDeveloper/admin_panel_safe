import { supabase } from '../../../core/lib/supabase';

// ── Global Trust creation insights (source of truth: Trust.created_at) ────────
const TRUST_TABLE = 'Trust';

function toNonNegativeInt(value, fallback = 0) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(Math.trunc(num), 0);
}

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

/**
 * Read-only, global Trust creation stats.
 * `from` / `to` are local calendar dates ('YYYY-MM-DD'), both inclusive.
 * Queried as created_at >= start(from) AND created_at < start(to + 1 day).
 */
export async function fetchTrustCreationStats({ from, to, listLimit = 500 } = {}) {
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

  const limit = Math.max(toNonNegativeInt(listLimit, 500), 1);

  const [totalRes, todayRes, periodRes, latestRes, listRes] = await Promise.all([
    supabase
      .from(TRUST_TABLE)
      .select('id', { count: 'exact', head: true }),
    supabase
      .from(TRUST_TABLE)
      .select('id', { count: 'exact', head: true })
      .gte('created_at', todayStartIso)
      .lt('created_at', tomorrowStartIso),
    supabase
      .from(TRUST_TABLE)
      .select('id', { count: 'exact', head: true })
      .gte('created_at', rangeFromIso)
      .lt('created_at', rangeToExclusiveIso),
    supabase
      .from(TRUST_TABLE)
      .select('id, name, created_at')
      .not('created_at', 'is', null)
      .order('created_at', { ascending: false })
      .limit(1),
    supabase
      .from(TRUST_TABLE)
      .select('id, name, icon_url, created_at, superuser:superuser_id(name, mobile)')
      .gte('created_at', rangeFromIso)
      .lt('created_at', rangeToExclusiveIso)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  const error = totalRes.error || todayRes.error || periodRes.error || latestRes.error || listRes.error || null;
  if (error) return { data: null, error };

  const latest = Array.isArray(latestRes.data) ? latestRes.data[0] : null;
  return {
    data: {
      totalTrusts: toNonNegativeInt(totalRes.count),
      createdToday: toNonNegativeInt(todayRes.count),
      createdInPeriod: toNonNegativeInt(periodRes.count),
      lastTrust: latest ? { id: latest.id, name: latest.name || '', created_at: latest.created_at || null } : null,
      trusts: (listRes.data || []).map((row) => ({
        id: row.id,
        name: row.name || '',
        icon_url: row.icon_url || '',
        created_at: row.created_at || null,
        superuser_mobile: row.superuser?.mobile || '',
      })),
    },
    error: null,
  };
}
