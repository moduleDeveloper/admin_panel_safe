import { supabase } from '../lib/supabase';

const CAMPAIGN_COLUMNS = 'id, name, org_type, cause, template_name, status, trust_id, created_at';
const SCHEDULE_COLUMNS = 'id, campaign_id, scheduled_at, batch_size, status, created_at';

async function fetchRows(tableName, columns) {
  const { data, error } = await supabase
    .from(tableName)
    .select(columns)
    .order('created_at', { ascending: false, nullsFirst: false });

  if (error) {
    return { data: null, error: { message: error.message || `Failed to load ${tableName}.` } };
  }

  return { data: Array.isArray(data) ? data : [], error: null };
}

export async function fetchCampaigns({ trustId }) {
  const cleanTrustId = String(trustId || '').trim();
  if (!cleanTrustId) return { data: null, error: { message: 'trustId is required.' } };

  const { data, error } = await supabase
    .from('mktCampaign')
    .select(CAMPAIGN_COLUMNS)
    .eq('trust_id', cleanTrustId)
    .order('created_at', { ascending: false, nullsFirst: false });

  if (error) {
    return { data: null, error: { message: error.message || 'Failed to load campaigns.' } };
  }

  return { data: Array.isArray(data) ? data : [], error: null };
}

export async function fetchSchedules() {
  return fetchRows('mktSchedule', SCHEDULE_COLUMNS);
}

export async function setupCampaign(payload) {
  const cleanPayload = payload && typeof payload === 'object' && !Array.isArray(payload) ? payload : {};
  const { data, error } = await supabase.rpc('setup_campaign', { payload: cleanPayload });

  if (error) {
    return { data: null, error: { message: error.message || 'Failed to setup campaign.' } };
  }

  if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
    return { data: null, error: { message: data.error || 'Failed to setup campaign.' } };
  }

  return { data, error: null };
}
