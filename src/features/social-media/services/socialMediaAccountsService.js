import { supabase } from '../../../core/lib/supabase';
import { cachedQuery, invalidateCache } from '../../../core/services/requestCache';

const SOCIAL_MEDIA_ACCOUNTS_TABLE = 'social_media_accounts';

function normalizeRow(row = {}) {
  return {
    id: row.id || '',
    trustId: row.trust_id || null,
    blotatoApi: row['Blotato-API'] || '',
    instagram: row.Instagram ?? null,
    fbAccount: row['FB-Account'] ?? null,
    fbPage: row['FB-Page'] ?? null,
    youtube: row.Youtube ?? null,
    x: row.X ?? null,
    threads: row.Threads ?? null,
    keywords: row.KeyWords || '',
    region: row.region || '',
    timeForAutoInput: row['TimeForAutoInput'] || '',
    uploadPostApi: row['upload-Post-Api'] || '',
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    raw: row,
  };
}

export async function fetchSocialMediaAccountByTrust(trustId) {
  if (!trustId) return { data: null, error: null };

  return cachedQuery(`social-media-accounts:trust:${trustId}`, async () => {
    const { data, error } = await supabase
      .from(SOCIAL_MEDIA_ACCOUNTS_TABLE)
      .select('*')
      .eq('trust_id', trustId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    return { data: data ? normalizeRow(data) : null, error };
  }, 10000);
}

export async function createSocialMediaAccount(payload) {
  const { data, error } = await supabase
    .from(SOCIAL_MEDIA_ACCOUNTS_TABLE)
    .insert([payload])
    .select('*')
    .single();

  if (!error) invalidateCache('social-media-accounts:');
  return { data: data ? normalizeRow(data) : null, error };
}

export async function upsertSocialMediaAccountByTrust(payload) {
  if (!payload?.trust_id) {
    return { data: null, error: { message: 'trust_id is required for upsert.' } };
  }

  const { data, error } = await supabase
    .from(SOCIAL_MEDIA_ACCOUNTS_TABLE)
    .upsert(payload, { onConflict: 'trust_id' })
    .select('*')
    .single();

  if (!error) invalidateCache('social-media-accounts:');
  return { data: data ? normalizeRow(data) : null, error };
}

export async function updateSocialMediaAccount(id, updates) {
  if (!id) return { data: null, error: { message: 'Social media account id is required.' } };

  const { data, error } = await supabase
    .from(SOCIAL_MEDIA_ACCOUNTS_TABLE)
    .update(updates)
    .eq('id', id)
    .select('*')
    .single();

  if (!error) invalidateCache('social-media-accounts:');
  return { data: data ? normalizeRow(data) : null, error };
}
