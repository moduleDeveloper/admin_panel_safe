import { supabase } from '../lib/supabase';
import { cachedQuery } from './requestCache';

const TABLE_NAME = 'WaCampAudience';
const CAMP_EMBED = 'WaCamp!inner(id, trust_id, scheduled_at, status, WaTemp(id, name, language))';
const MAX_FETCH = 200;

function normalizeRow(row = {}) {
  return {
    id: row.id,
    camp_id: row.camp_id || null,
    campaign: row.WaCamp || null,
    template: row.WaCamp?.WaTemp || null,
    phone: row.phone || '',
    variables: row.variables && typeof row.variables === 'object' ? row.variables : {},
    status: row.status || 'pending',
    provider_message_id: row.provider_message_id || '',
    sent_at: row.sent_at || null,
    delivered_at: row.delivered_at || null,
    schedule_date_time: row.schedule_date_time || null,
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    raw: row,
  };
}

export async function fetchWaCampAudienceByTrust(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(
    `wa-camp-audience:list:${trustId}`,
    async () => {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select(`*, ${CAMP_EMBED}`)
        .eq('WaCamp.trust_id', trustId)
        .order('created_at', { ascending: false })
        .range(0, MAX_FETCH - 1);

      if (error) console.error('[WA:Audience] fetchWaCampAudienceByTrust failed', { trustId, error });
      return { data: (data || []).map(normalizeRow), error };
    },
    12000
  );
}
