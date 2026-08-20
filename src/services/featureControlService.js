import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache';

const MASTER_FEATURE_COLUMNS = 'id, name, subname, remarks, created_at, updated_at';
const FLAG_COLUMNS = `
  id,
  features_id,
  trust_id,
  is_enabled,
  tier,
  name,
  description,
  trust_name,
  display_name,
  tagline,
  icon_url,
  route,
  quick_order,
  created_at,
  updated_at
`;

const DUPLICATE_ERROR_CODES = new Set(['23505']);

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function isDuplicateError(error) {
  if (!error) return false;
  if (DUPLICATE_ERROR_CODES.has(String(error.code || ''))) return true;
  const message = String(error.message || '').toLowerCase();
  return message.includes('duplicate key') || message.includes('unique constraint');
}

function buildDefaultFeatureFlagPayload({ feature, trustId, tier, isEnabled = false, trustName = '', overrides = {} }) {
  return {
    features_id: feature.id,
    trust_id: trustId,
    tier,
    is_enabled: !!isEnabled,
    display_name: normalizeText(overrides.display_name, feature.name || ''),
    name: normalizeText(overrides.name, feature.name || ''),
    tagline: normalizeText(overrides.tagline, feature.subname || ''),
    description: normalizeText(overrides.description, ''),
    trust_name: normalizeText(overrides.trust_name, trustName),
    icon_url: normalizeText(overrides.icon_url, ''),
    route: normalizeText(overrides.route, ''),
    quick_order:
      overrides.quick_order === null || overrides.quick_order === undefined || overrides.quick_order === ''
        ? null
        : Number(overrides.quick_order),
  };
}

export async function fetchMasterFeatures() {
  return cachedQuery('feature-control:master', async () => {
    const { data, error } = await supabase
      .from('features')
      .select(MASTER_FEATURE_COLUMNS)
      .order('name', { ascending: true });

    return { data: data || [], error };
  }, 30000);
}

export async function fetchSubFeatureCountsByFeatureIds(featureIds = []) {
  if (!featureIds.length) return { data: {}, error: null };

  const { data, error } = await supabase
    .from('sub_features')
    .select('feature_id')
    .in('feature_id', featureIds);

  if (error) return { data: {}, error };

  const counts = (data || []).reduce((acc, row) => {
    const key = String(row.feature_id || '');
    if (!key) return acc;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});

  return { data: counts, error: null };
}

export async function fetchFeatureFlagsByTrustAndTier(trustId, tier) {
  return cachedQuery(`feature-control:flags:${trustId}:${tier}`, async () => {
    const { data, error } = await supabase
      .from('feature_flags')
      .select(FLAG_COLUMNS)
      .eq('trust_id', trustId)
      .eq('tier', tier)
      .order('quick_order', { ascending: true, nullsFirst: false })
      .order('display_name', { ascending: true });

    return { data: data || [], error };
  }, 12000);
}

export function mergeFeaturesWithFlags(masterFeatures, featureFlags, trustId, tier) {
  const flagByFeatureId = new Map((featureFlags || []).map((flag) => [flag.features_id, flag]));

  return (masterFeatures || []).map((feature) => {
    const flag = flagByFeatureId.get(feature.id) || null;

    return {
      feature_id: feature.id,
      master_name: feature.name || '',
      master_subname: feature.subname || '',
      master_remarks: feature.remarks || '',
      trust_id: trustId,
      tier,
      flag_id: flag?.id || null,
      is_enabled: flag?.is_enabled ?? false,
      display_name: normalizeText(flag?.display_name, feature.name || ''),
      tagline: normalizeText(flag?.tagline, feature.subname || ''),
      icon_url: normalizeText(flag?.icon_url, ''),
      route: normalizeText(flag?.route, ''),
      quick_order: flag?.quick_order ?? null,
      name: normalizeText(flag?.name, feature.name || ''),
      description: normalizeText(flag?.description, ''),
      trust_name: normalizeText(flag?.trust_name, ''),
      created_at: flag?.created_at || feature.created_at || null,
      updated_at: flag?.updated_at || feature.updated_at || null,
    };
  });
}

async function fetchFeatureFlagByKey({ featureId, trustId, tier }) {
  return supabase
    .from('feature_flags')
    .select(FLAG_COLUMNS)
    .eq('features_id', featureId)
    .eq('trust_id', trustId)
    .eq('tier', tier)
    .maybeSingle();
}

export async function createFeatureFlagIfMissing({ feature, trustId, tier, isEnabled = false, trustName = '', overrides = {} }) {
  const { data: existing, error: existingError } = await fetchFeatureFlagByKey({
    featureId: feature.id,
    trustId,
    tier,
  });

  if (existingError) {
    return { data: null, error: existingError };
  }

  if (existing) {
    return { data: existing, error: null };
  }

  const payload = buildDefaultFeatureFlagPayload({ feature, trustId, tier, isEnabled, trustName, overrides });

  const { data: inserted, error: insertError } = await supabase
    .from('feature_flags')
    .insert([payload])
    .select(FLAG_COLUMNS)
    .single();

  if (!insertError) {
    invalidateCache('feature-control:flags:');
    invalidateCache('user-management:enabled-features:');
    return { data: inserted, error: null };
  }

  if (!isDuplicateError(insertError)) {
    return { data: null, error: insertError };
  }

  const { data: duplicateSafe, error: duplicateSafeError } = await fetchFeatureFlagByKey({
    featureId: feature.id,
    trustId,
    tier,
  });

  return { data: duplicateSafe, error: duplicateSafeError };
}

export async function updateFeatureFlagById(flagId, updates) {
  const normalizedUpdates = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('feature_flags')
    .update(normalizedUpdates)
    .eq('id', flagId)
    .select(FLAG_COLUMNS)
    .single();

  if (!error) {
    invalidateCache('feature-control:flags:');
    invalidateCache('user-management:enabled-features:');
  }
  return { data, error };
}

export async function toggleFeatureEnabled({ mergedFeature, trustId, tier, isEnabled, trustName = '' }) {
  let flagId = mergedFeature.flag_id;

  if (!flagId) {
    const { data: ensuredFlag, error: ensureError } = await createFeatureFlagIfMissing({
      feature: {
        id: mergedFeature.feature_id,
        name: mergedFeature.master_name,
        subname: mergedFeature.master_subname,
      },
      trustId,
      tier,
      isEnabled,
      trustName,
      overrides: {
        display_name: mergedFeature.display_name,
        tagline: mergedFeature.tagline,
        name: mergedFeature.name,
      },
    });

    if (ensureError) return { data: null, error: ensureError };
    flagId = ensuredFlag.id;
  }

  return updateFeatureFlagById(flagId, { is_enabled: !!isEnabled });
}

export async function saveFeatureCustomization({ mergedFeature, trustId, tier, trustName = '', updates }) {
  let flagId = mergedFeature.flag_id;

  if (!flagId) {
    const { data: ensuredFlag, error: ensureError } = await createFeatureFlagIfMissing({
      feature: {
        id: mergedFeature.feature_id,
        name: mergedFeature.master_name,
        subname: mergedFeature.master_subname,
      },
      trustId,
      tier,
      isEnabled: mergedFeature.is_enabled,
      trustName,
      overrides: updates,
    });

    if (ensureError) return { data: null, error: ensureError };
    flagId = ensuredFlag.id;
  }

  return updateFeatureFlagById(flagId, updates);
}

export function mergeSingleFeatureWithFlag(mergedFeature, flag) {
  if (!flag) return mergedFeature;

  return {
    ...mergedFeature,
    flag_id: flag.id,
    trust_id: flag.trust_id,
    tier: flag.tier,
    is_enabled: flag.is_enabled ?? false,
    display_name: normalizeText(flag.display_name, mergedFeature.master_name || ''),
    tagline: normalizeText(flag.tagline, mergedFeature.master_subname || ''),
    icon_url: normalizeText(flag.icon_url, ''),
    route: normalizeText(flag.route, ''),
    quick_order: flag.quick_order ?? null,
    name: normalizeText(flag.name, mergedFeature.master_name || ''),
    description: normalizeText(flag.description, ''),
    trust_name: normalizeText(flag.trust_name, ''),
    created_at: flag.created_at || mergedFeature.created_at || null,
    updated_at: flag.updated_at || mergedFeature.updated_at || null,
  };
}
