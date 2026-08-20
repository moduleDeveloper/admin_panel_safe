import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache';

/**
 * Fetch all feature_flags for a given trust_id, joined with features table.
 * Sorted by quick_order asc, then display_name asc.
 */
export async function fetchFeatureFlags(trustId) {
  return cachedQuery(`features:flags:${trustId}`, async () => {
    const { data, error } = await supabase
      .from('feature_flags')
      .select(`
        id,
        features_id,
        trust_id,
        is_enabled,
        tier,
        name,
        description,
        display_name,
        tagline,
        icon_url,
        route,
        quick_order,
        features (
          id,
          name,
          subname,
          remarks
        )
      `)
      .eq('trust_id', trustId)
      .order('quick_order', { ascending: true, nullsFirst: false })
      .order('display_name', { ascending: true });

    return { data, error };
  }, 15000);
}

/**
 * Fetch ALL features (master list) — for admin "add feature" dropdown.
 */
export async function fetchAllFeatures() {
  return cachedQuery('features:all', async () => {
    const { data, error } = await supabase
      .from('features')
      .select('id, name, subname, remarks')
      .order('name', { ascending: true });

    return { data, error };
  }, 30000);
}

/**
 * Toggle is_enabled for a feature_flag row.
 */
export async function toggleFeatureFlag(flagId, isEnabled) {
  const { data, error } = await supabase
    .from('feature_flags')
    .update({ is_enabled: isEnabled, updated_at: new Date().toISOString() })
    .eq('id', flagId)
    .select()
    .single();

  if (!error) {
    invalidateCache('features:');
    invalidateCache('user-management:enabled-features:');
  }
  return { data, error };
}

/**
 * Update editable fields of a feature_flag.
 */
export async function updateFeatureFlag(flagId, updates) {
  const { data, error } = await supabase
    .from('feature_flags')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', flagId)
    .select()
    .single();

  if (!error) {
    invalidateCache('features:');
    invalidateCache('user-management:enabled-features:');
  }
  return { data, error };
}

/**
 * Add a new feature_flag for a trust (link an existing feature to a trust).
 */
export async function addFeatureFlag({ featuresId, trustId, displayName, tagline, route, quickOrder, tier = 'general' }) {
  const { data, error } = await supabase
    .from('feature_flags')
    .insert([{
      features_id: featuresId,
      trust_id: trustId,
      display_name: displayName,
      tagline,
      route,
      quick_order: quickOrder,
      tier,
      is_enabled: true,
    }])
    .select()
    .single();

  if (!error) {
    invalidateCache('features:');
    invalidateCache('user-management:enabled-features:');
  }
  return { data, error };
}

/**
 * Delete a feature_flag row (remove feature from trust).
 */
export async function deleteFeatureFlag(flagId) {
  const { error } = await supabase
    .from('feature_flags')
    .delete()
    .eq('id', flagId);

  if (!error) {
    invalidateCache('features:');
    invalidateCache('user-management:enabled-features:');
  }
  return { error };
}

/**
 * Create a brand-new master feature in the features table.
 */
export async function createFeature({ name, subname, remarks }) {
  const { data, error } = await supabase
    .from('features')
    .insert([{ name, subname: subname || '', remarks: remarks || '' }])
    .select()
    .single();

  if (!error) {
    invalidateCache('features:');
    invalidateCache('user-management:enabled-features:');
  }
  return { data, error };
}
