import { supabase } from '../../../core/lib/supabase';
import { cachedQuery, invalidateCache } from '../../../core/services/requestCache';

const ADMIN_PANEL_RPC = 'manage_adminPanel_by_trustdetails';
const FEATURE_LOGO_BUCKET = (import.meta.env.VITE_FEATURE_LOGO_BUCKET || 'feature_logo').trim();

const DUPLICATE_ERROR_CODES = new Set(['23505']);

function normalizeText(value, fallback = '') {
  const text = String(value ?? '').trim();
  return text || fallback;
}

function normalizeOptionalText(value) {
  const text = String(value ?? '').trim();
  return text || null;
}

function sanitizePathSegment(value, fallback = 'item') {
  return String(value || fallback)
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '') || fallback;
}

async function rpcCall(trustId, action, payload = {}) {
  const { data, error } = await supabase.rpc(ADMIN_PANEL_RPC, {
    p_trust_id: trustId,
    p_action: action,
    p_payload: payload,
  });
  if (error) {
    console.error(`[RPC ERROR] action=${action}`, { message: error.message, details: error.details, hint: error.hint, code: error.code, payload });
    return { data: null, error };
  }
  if (!data?.success) {
    console.error(`[RPC FAIL] action=${action}`, { rpcError: data?.error, data, payload });
    return { data: null, error: { message: data?.error || 'RPC_ERROR', code: data?.error } };
  }
  return { data: data.data ?? null, error: null };
}

export async function uploadFeatureLogo(file, { trustId, ownerId, type = 'feature' } = {}) {
  if (!file) return { data: null, error: { message: 'No file provided' } };
  if (!trustId) return { data: null, error: { message: 'No trust ID provided' } };

  const extension = String(file.name || 'icon.png').split('.').pop()?.toLowerCase() || 'png';
  const safeExt = extension.replace(/[^a-z0-9]/g, '') || 'png';
  const safeTrustId = sanitizePathSegment(trustId, 'trust');
  const safeOwnerId = sanitizePathSegment(ownerId, 'item');
  const safeType = sanitizePathSegment(type, 'feature');
  const path = `${safeTrustId}/${safeType}/${safeOwnerId}/${Date.now()}-${Math.random().toString(36).slice(2, 10)}.${safeExt}`;

  const { error: uploadError } = await supabase.storage
    .from(FEATURE_LOGO_BUCKET)
    .upload(path, file, {
      cacheControl: '3600',
      upsert: true,
      contentType: file.type || undefined,
    });

  if (uploadError) return { data: null, error: uploadError };

  const { data: publicData } = supabase.storage.from(FEATURE_LOGO_BUCKET).getPublicUrl(path);
  return {
    data: {
      bucket: FEATURE_LOGO_BUCKET,
      path,
      publicUrl: publicData?.publicUrl || '',
    },
    error: null,
  };
}

export async function fetchMasterFeatures(trustId) {
  return cachedQuery('feature-control:master', async () => {
    const { data, error } = await rpcCall(trustId, 'read');
    if (error) return { data: [], error };
    return { data: data?.features || [], error: null };
  }, 30000);
}


export async function fetchFeatureFlagsByTrustAndTier(trustId, tier) {
  return cachedQuery(`feature-control:flags:${trustId}:${tier}`, async () => {
    const { data, error } = await rpcCall(trustId, 'feature_flag_read');
    if (error) return { data: [], error };
    const allFlags = data?.feature_flags || [];
    const filtered = tier ? allFlags.filter((ff) => ff.tier === tier) : allFlags;
    return { data: filtered, error: null };
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
      display_name: normalizeOptionalText(flag?.display_name),
      tagline: normalizeText(flag?.tagline, feature.subname || ''),
      icon_url: normalizeText(flag?.icon_url, ''),
      route: normalizeText(flag?.route, ''),
      quick_order: flag?.quick_order ?? null,
      display_in_app: normalizeText(flag?.display_in_app, feature.Default_display || 'home'),
      name: normalizeText(flag?.name, feature.name || ''),
      description: normalizeText(flag?.description, ''),
      trust_name: normalizeText(flag?.trust_name, ''),
      created_at: flag?.created_at || feature.created_at || null,
      updated_at: flag?.updated_at || feature.updated_at || null,
      display_upanel: feature.Display_upanel ?? true,
      display_option: feature.Display_option || null,
      default_display: feature.Default_display || null,
    };
  });
}

export async function createFeatureFlagIfMissing({ feature, trustId, tier, isEnabled = false, trustName = '', overrides = {} }) {
  const payload = {
    features_id: feature.id,
    tier: tier || 'general',
    is_enabled: !!isEnabled,
    display_name: normalizeOptionalText(overrides.display_name) || null,
    name: normalizeText(overrides.name, feature.name || '') || null,
    tagline: normalizeText(overrides.tagline, feature.subname || '') || null,
    description: normalizeText(overrides.description, '') || null,
    trust_name: normalizeText(overrides.trust_name, trustName) || null,
    icon_url: normalizeText(overrides.icon_url, '') || null,
    route: normalizeText(overrides.route, '') || null,
    quick_order:
      overrides.quick_order === null || overrides.quick_order === undefined || overrides.quick_order === ''
        ? null
        : Number(overrides.quick_order),
    display_in_app: normalizeText(overrides.display_in_app, 'home') || null,
  };

  const { data: rpcData, error: rpcError } = await supabase.rpc(ADMIN_PANEL_RPC, {
    p_trust_id: trustId,
    p_action: 'feature_flag_create',
    p_payload: payload,
  });

  if (rpcError) return { data: null, error: rpcError };

  if (!rpcData?.success) {
    if (rpcData?.error === 'FEATURE_FLAG_ALREADY_EXISTS') {
      const { data: readData, error: readError } = await rpcCall(trustId, 'feature_flag_read');
      if (readError) return { data: null, error: readError };
      const existing = (readData?.feature_flags || []).find((ff) => ff.features_id === feature.id) || null;
      return { data: existing, error: null };
    }
    return { data: null, error: { message: rpcData?.error || 'RPC_ERROR', code: rpcData?.error } };
  }

  invalidateCache('feature-control:flags:');
  invalidateCache('user-management:enabled-features:');
  return { data: rpcData.data, error: null };
}

export async function updateFeatureFlagById(trustId, flagId, updates) {
  const { data, error } = await rpcCall(trustId, 'feature_flag_update', {
    id: flagId,
    ...updates,
  });

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
    return { data: ensuredFlag, error: null };
  }

  const { data: rpcData, error } = await supabase.rpc(ADMIN_PANEL_RPC, {
    p_trust_id: trustId,
    p_action: 'feature_flag_toggle',
    p_payload: { id: flagId, is_enabled: !!isEnabled },
  });

  if (error) return { data: null, error };
  if (!rpcData?.success) return { data: null, error: { message: rpcData?.error || 'RPC_ERROR' } };

  invalidateCache('feature-control:flags:');
  invalidateCache('user-management:enabled-features:');
  return { data: rpcData.data, error: null };
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
    return { data: ensuredFlag, error: null };
  }

  return updateFeatureFlagById(trustId, flagId, updates);
}

export function mergeSingleFeatureWithFlag(mergedFeature, flag) {
  if (!flag) return mergedFeature;

  return {
    ...mergedFeature,
    flag_id: flag.id,
    trust_id: flag.trust_id,
    tier: flag.tier,
    is_enabled: flag.is_enabled ?? false,
    display_name: normalizeOptionalText(flag.display_name),
    tagline: normalizeText(flag.tagline, mergedFeature.master_subname || ''),
    icon_url: normalizeText(flag.icon_url, ''),
    route: normalizeText(flag.route, ''),
    quick_order: flag.quick_order ?? null,
    display_in_app: normalizeText(flag.display_in_app, mergedFeature.default_display || 'home'),
    name: normalizeText(flag.name, mergedFeature.master_name || ''),
    description: normalizeText(flag.description, ''),
    trust_name: normalizeText(flag.trust_name, ''),
    created_at: flag.created_at || mergedFeature.created_at || null,
    updated_at: flag.updated_at || mergedFeature.updated_at || null,
  };
}
