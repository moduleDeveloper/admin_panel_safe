import { supabase } from '../../../core/lib/supabase';
import { cachedQuery, invalidateCache } from '../../../core/services/requestCache';

const MASTER_FEATURE_COLUMNS = 'id, name, subname, remarks, created_at, updated_at';
const MASTER_SUB_FEATURE_COLUMNS = 'id, feature_id, sub_feature_name, remark, created_at, updated_at';
const SUB_FEATURE_FLAG_COLUMNS = `
  id,
  trust_id,
  sub_feature_id,
  tier,
  enabled,
  icon_url,
  display_name,
  tagline,
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

function normalizeOptionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function isDuplicateError(error) {
  if (!error) return false;
  if (DUPLICATE_ERROR_CODES.has(String(error.code || ''))) return true;
  const message = String(error.message || '').toLowerCase();
  return message.includes('duplicate key') || message.includes('unique constraint');
}

function toTier(value) {
  return value === 'vip' ? 'vip' : 'gen';
}

function buildDefaultSubFeatureFlagPayload({
  subFeature,
  trustId,
  tier,
  enabled = false,
  overrides = {},
}) {
  return {
    trust_id: String(trustId),
    sub_feature_id: subFeature.id,
    tier: toTier(tier),
    enabled: !!enabled,
    display_name: normalizeOptionalText(overrides.display_name),
    tagline: normalizeText(overrides.tagline, subFeature.remark || ''),
    icon_url: normalizeText(overrides.icon_url, ''),
    route: normalizeText(overrides.route, ''),
    quick_order:
      overrides.quick_order === null || overrides.quick_order === undefined || overrides.quick_order === ''
        ? null
        : Number(overrides.quick_order),
  };
}

export async function fetchMasterFeaturesForSubFeatures() {
  return cachedQuery('subfeature-control:master', async () => {
    const { data, error } = await supabase
      .from('features')
      .select(MASTER_FEATURE_COLUMNS)
      .order('name', { ascending: true });

    return { data: data || [], error };
  }, 30000);
}

export async function fetchSubFeaturesByFeature(featureId) {
  if (!featureId) return { data: [], error: null };

  return cachedQuery(`subfeature-control:list:${featureId}`, async () => {
    const { data, error } = await supabase
      .from('sub_features')
      .select(MASTER_SUB_FEATURE_COLUMNS)
      .eq('feature_id', featureId)
      .order('sub_feature_name', { ascending: true });

    return { data: data || [], error };
  }, 15000);
}

export async function fetchSubFeatureFlagsByTrustTierAndFeature(trustId, tier, featureId) {
  if (!trustId || !featureId) return { data: [], error: null };

  return cachedQuery(`subfeature-control:flags:${trustId}:${toTier(tier)}:${featureId}`, async () => {
    const { data, error } = await supabase
      .from('sub_feature_flags')
      .select(`
        ${SUB_FEATURE_FLAG_COLUMNS},
        sub_features!inner (
          id,
          feature_id,
          sub_feature_name,
          remark
        )
      `)
      .eq('trust_id', String(trustId))
      .eq('tier', toTier(tier))
      .eq('sub_features.feature_id', featureId)
      .order('quick_order', { ascending: true, nullsFirst: false })
      .order('display_name', { ascending: true });

    return { data: data || [], error };
  }, 12000);
}

export function mergeSubFeaturesWithFlags(masterSubFeatures, subFeatureFlags, trustId, tier) {
  const flagBySubFeatureId = new Map((subFeatureFlags || []).map((flag) => [flag.sub_feature_id, flag]));

  return (masterSubFeatures || []).map((subFeature) => {
    const flag = flagBySubFeatureId.get(subFeature.id) || null;

    return {
      sub_feature_id: subFeature.id,
      parent_feature_id: subFeature.feature_id,
      master_name: subFeature.sub_feature_name || '',
      master_subname: subFeature.remark || '',
      trust_id: String(trustId || ''),
      tier: toTier(tier),
      flag_id: flag?.id || null,
      is_enabled: flag?.enabled ?? false,
      display_name: normalizeOptionalText(flag?.display_name),
      tagline: normalizeText(flag?.tagline, subFeature.remark || ''),
      icon_url: normalizeText(flag?.icon_url, ''),
      route: normalizeText(flag?.route, ''),
      quick_order: flag?.quick_order ?? null,
      created_at: flag?.created_at || subFeature.created_at || null,
      updated_at: flag?.updated_at || subFeature.updated_at || null,
    };
  });
}

async function fetchSubFeatureFlagByKey({ subFeatureId, trustId, tier }) {
  return supabase
    .from('sub_feature_flags')
    .select(SUB_FEATURE_FLAG_COLUMNS)
    .eq('sub_feature_id', subFeatureId)
    .eq('trust_id', String(trustId))
    .eq('tier', toTier(tier))
    .maybeSingle();
}

export async function createSubFeatureFlagIfMissing({
  subFeature,
  trustId,
  tier,
  enabled = false,
  overrides = {},
}) {
  const { data: existing, error: existingError } = await fetchSubFeatureFlagByKey({
    subFeatureId: subFeature.id,
    trustId,
    tier,
  });

  if (existingError) return { data: null, error: existingError };
  if (existing) return { data: existing, error: null };

  const payload = buildDefaultSubFeatureFlagPayload({
    subFeature,
    trustId,
    tier,
    enabled,
    overrides,
  });

  const { data: inserted, error: insertError } = await supabase
    .from('sub_feature_flags')
    .insert([payload])
    .select(SUB_FEATURE_FLAG_COLUMNS)
    .single();

  if (!insertError) {
    invalidateCache('subfeature-control:flags:');
    return { data: inserted, error: null };
  }
  if (!isDuplicateError(insertError)) return { data: null, error: insertError };

  const { data: duplicateSafe, error: duplicateSafeError } = await fetchSubFeatureFlagByKey({
    subFeatureId: subFeature.id,
    trustId,
    tier,
  });

  return { data: duplicateSafe, error: duplicateSafeError };
}

export async function updateSubFeatureFlagById(flagId, updates) {
  const normalizedUpdates = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('sub_feature_flags')
    .update(normalizedUpdates)
    .eq('id', flagId)
    .select(SUB_FEATURE_FLAG_COLUMNS)
    .single();

  if (!error) invalidateCache('subfeature-control:flags:');
  return { data, error };
}

export async function toggleSubFeatureEnabled({ mergedSubFeature, trustId, tier, isEnabled }) {
  let flagId = mergedSubFeature.flag_id;

  if (!flagId) {
    const { data: ensuredFlag, error: ensureError } = await createSubFeatureFlagIfMissing({
      subFeature: {
        id: mergedSubFeature.sub_feature_id,
        sub_feature_name: mergedSubFeature.master_name,
        remark: mergedSubFeature.master_subname,
      },
      trustId,
      tier,
      enabled: isEnabled,
      overrides: {
        display_name: mergedSubFeature.display_name,
        tagline: mergedSubFeature.tagline,
        icon_url: mergedSubFeature.icon_url,
        route: mergedSubFeature.route,
        quick_order: mergedSubFeature.quick_order,
      },
    });

    if (ensureError) return { data: null, error: ensureError };
    flagId = ensuredFlag.id;
  }

  return updateSubFeatureFlagById(flagId, { enabled: !!isEnabled });
}

export async function saveSubFeatureCustomization({ mergedSubFeature, trustId, tier, updates }) {
  let flagId = mergedSubFeature.flag_id;

  if (!flagId) {
    const { data: ensuredFlag, error: ensureError } = await createSubFeatureFlagIfMissing({
      subFeature: {
        id: mergedSubFeature.sub_feature_id,
        sub_feature_name: mergedSubFeature.master_name,
        remark: mergedSubFeature.master_subname,
      },
      trustId,
      tier,
      enabled: mergedSubFeature.is_enabled,
      overrides: updates,
    });

    if (ensureError) return { data: null, error: ensureError };
    flagId = ensuredFlag.id;
  }

  return updateSubFeatureFlagById(flagId, updates);
}

export function mergeSingleSubFeatureWithFlag(mergedSubFeature, flag) {
  if (!flag) return mergedSubFeature;

  return {
    ...mergedSubFeature,
    flag_id: flag.id,
    trust_id: String(flag.trust_id || ''),
    tier: toTier(flag.tier),
    is_enabled: flag.enabled ?? false,
    display_name: normalizeOptionalText(flag.display_name),
    tagline: normalizeText(flag.tagline, mergedSubFeature.master_subname || ''),
    icon_url: normalizeText(flag.icon_url, ''),
    route: normalizeText(flag.route, ''),
    quick_order: flag.quick_order ?? null,
    created_at: flag.created_at || mergedSubFeature.created_at || null,
    updated_at: flag.updated_at || mergedSubFeature.updated_at || null,
  };
}
