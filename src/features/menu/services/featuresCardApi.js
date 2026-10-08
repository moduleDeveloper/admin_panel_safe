import { supabase } from '../../../core/lib/supabase';

const FEATURE_FLAG_TIER_DEFAULT = 'general';
const SUB_FEATURE_FLAG_TIER_DEFAULT = 'gen';

function normalizeFeatureTier(tier) {
  return tier === 'vip' ? 'vip' : FEATURE_FLAG_TIER_DEFAULT;
}

function normalizeSubFeatureTier(tier) {
  return tier === 'vip' ? 'vip' : SUB_FEATURE_FLAG_TIER_DEFAULT;
}

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function normalizeOptionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeRoute(value) {
  const route = String(value ?? '').trim();
  if (!route) return '';
  if (route.startsWith('/')) return route;
  if (route.startsWith('http://') || route.startsWith('https://')) return route;
  return `/${route}`;
}

function byOrderThenName(a, b) {
  const aOrder = Number.isFinite(a.quick_order) ? a.quick_order : Number.MAX_SAFE_INTEGER;
  const bOrder = Number.isFinite(b.quick_order) ? b.quick_order : Number.MAX_SAFE_INTEGER;
  if (aOrder !== bOrder) return aOrder - bOrder;
  return a.display_name.localeCompare(b.display_name);
}

async function fetchEnabledFeatureFlags({ trustId, tier }) {
  const { data, error } = await supabase
    .from('feature_flags')
    .select(`
      id,
      features_id,
      is_enabled,
      display_name,
      tagline,
      icon_url,
      route,
      quick_order,
      name,
      description,
      features (
        id,
        name,
        subname
      )
    `)
    .eq('trust_id', trustId)
    .eq('tier', normalizeFeatureTier(tier))
    .eq('is_enabled', true)
    .order('quick_order', { ascending: true, nullsFirst: false })
    .order('display_name', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function fetchSubFeaturesByFeatureIds(featureIds) {
  if (!featureIds.length) return [];

  const { data, error } = await supabase
    .from('sub_features')
    .select('id,feature_id,sub_feature_name,remark')
    .in('feature_id', featureIds)
    .order('sub_feature_name', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function fetchEnabledSubFeatureFlags({ trustId, tier, subFeatureIds }) {
  if (!subFeatureIds.length) return [];

  const { data, error } = await supabase
    .from('sub_feature_flags')
    .select('sub_feature_id,enabled,display_name,tagline,icon_url,route,quick_order')
    .eq('trust_id', String(trustId))
    .eq('tier', normalizeSubFeatureTier(tier))
    .eq('enabled', true)
    .in('sub_feature_id', subFeatureIds)
    .order('quick_order', { ascending: true, nullsFirst: false })
    .order('display_name', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function fetchFeaturesCardData({ trustId, tier = FEATURE_FLAG_TIER_DEFAULT }) {
  if (!trustId) return [];

  const featureFlags = await fetchEnabledFeatureFlags({ trustId, tier });
  if (!featureFlags.length) return [];

  const featureIds = featureFlags.map((feature) => feature.features_id).filter(Boolean);
  const subFeatures = await fetchSubFeaturesByFeatureIds(featureIds);
  const subFeatureIds = subFeatures.map((subFeature) => subFeature.id);
  const enabledSubFeatureFlags = await fetchEnabledSubFeatureFlags({ trustId, tier, subFeatureIds });

  const subFeatureFlagById = new Map(
    enabledSubFeatureFlags.map((flag) => [flag.sub_feature_id, flag]),
  );

  const subFeaturesByFeatureId = subFeatures.reduce((acc, subFeature) => {
    const list = acc.get(subFeature.feature_id) || [];
    list.push(subFeature);
    acc.set(subFeature.feature_id, list);
    return acc;
  }, new Map());

  const cards = featureFlags.map((featureFlag) => {
    const relatedSubFeatures = subFeaturesByFeatureId.get(featureFlag.features_id) || [];

    const options = relatedSubFeatures
      .map((subFeature) => {
        const subFeatureFlag = subFeatureFlagById.get(subFeature.id);
        if (!subFeatureFlag?.enabled) return null;

        return {
          id: subFeature.id,
          display_name: normalizeOptionalText(subFeatureFlag.display_name),
          tagline: normalizeText(subFeatureFlag.tagline, subFeature.remark || ''),
          icon_url: normalizeText(subFeatureFlag.icon_url),
          route: normalizeRoute(subFeatureFlag.route),
          quick_order: subFeatureFlag.quick_order ?? null,
        };
      })
      .filter(Boolean)
      .sort(byOrderThenName);

    return {
      id: featureFlag.features_id,
      feature_flag_id: featureFlag.id,
      display_name: normalizeOptionalText(featureFlag.display_name),
      tagline: normalizeText(
        featureFlag.tagline,
        featureFlag.description || featureFlag.features?.subname || '',
      ),
      icon_url: normalizeText(featureFlag.icon_url),
      route: normalizeRoute(featureFlag.route),
      quick_order: featureFlag.quick_order ?? null,
      sub_features: options,
    };
  });

  return cards.sort(byOrderThenName);
}

export const FEATURES_CARD_MAPPING_EXAMPLE = {
  id: 'feature_uuid',
  feature_flag_id: 'feature_flag_uuid',
  display_name: 'Feature Label',
  tagline: 'Feature short description',
  icon_url: 'https://cdn.example.com/icon.svg',
  route: '/feature-route',
  quick_order: 1,
  sub_features: [
    {
      id: 'sub_feature_uuid',
      display_name: 'Sub Feature Label',
      tagline: 'Sub feature short description',
      icon_url: 'https://cdn.example.com/sub-icon.svg',
      route: '/sub-feature-route',
      quick_order: 1,
    },
  ],
};
