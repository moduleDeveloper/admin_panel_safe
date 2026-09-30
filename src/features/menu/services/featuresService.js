import { supabase } from '../../../core/lib/supabase';
import { cachedQuery, invalidateCache } from '../../../core/services/requestCache';

const ADMIN_PANEL_RPC = 'manage_adminPanel_by_trustdetails';

async function callRpc(trustId, action, payload = {}) {
  const { data, error } = await supabase.rpc(ADMIN_PANEL_RPC, {
    p_trust_id: trustId,
    p_action: action,
    p_payload: payload,
  });
  if (error) return { data: null, error };
  if (!data?.success) return { data: null, error: { message: data?.error || 'RPC_ERROR' } };
  return { data: data.data ?? null, error: null };
}

export async function fetchFeatureFlags(trustId) {
  return cachedQuery(`features:flags:${trustId}`, async () => {
    const { data, error } = await callRpc(trustId, 'feature_flag_read');
    if (error) return { data: null, error };
    return { data: data?.feature_flags || [], error: null };
  }, 15000);
}

export async function fetchAllFeatures(trustId) {
  return cachedQuery('features:all', async () => {
    const { data, error } = await callRpc(trustId, 'read');
    if (error) return { data: null, error };
    return { data: data?.features || [], error: null };
  }, 30000);
}

export async function toggleFeatureFlag(trustId, flagId, isEnabled) {
  const { data, error } = await callRpc(trustId, 'feature_flag_toggle', {
    id: flagId,
    is_enabled: isEnabled,
  });
  if (!error) {
    invalidateCache('features:');
    invalidateCache('user-management:enabled-features:');
  }
  return { data, error };
}

export async function updateFeatureFlag(trustId, flagId, updates) {
  const { data, error } = await callRpc(trustId, 'feature_flag_update', {
    id: flagId,
    ...updates,
  });
  if (!error) {
    invalidateCache('features:');
    invalidateCache('user-management:enabled-features:');
  }
  return { data, error };
}

export async function addFeatureFlag({ featuresId, trustId, displayName, tagline, route, quickOrder, tier = 'general', iconUrl, isEnabled = true }) {
  const { data, error } = await callRpc(trustId, 'feature_flag_create', {
    features_id: featuresId,
    display_name: displayName || null,
    tagline: tagline || null,
    route: route || null,
    quick_order: quickOrder != null && quickOrder !== '' ? Number(quickOrder) : null,
    tier,
    is_enabled: isEnabled,
    icon_url: iconUrl || null,
  });
  if (!error) {
    invalidateCache('features:');
    invalidateCache('user-management:enabled-features:');
  }
  return { data, error };
}

export async function deleteFeatureFlag() {
  return { error: { message: 'Feature deletion is not supported via the admin panel RPC.' } };
}

export async function createFeature() {
  return { data: null, error: { message: 'Master feature creation is not supported via the admin panel RPC.' } };
}
