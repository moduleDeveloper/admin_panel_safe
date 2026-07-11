import { supabase } from '../lib/supabase';

export async function fetchMktOrgFilterValues({ trustId = null } = {}) {
  let query = supabase.from('mktDataOrg').select('type, cause, city, source');

  if (trustId) {
    query = query.eq('trust_id', trustId);
  }

  const { data, error } = await query.limit(1000);
  if (error) {
    return { data: null, error: { message: error.message || 'Failed to load filter values.' } };
  }

  return { data: Array.isArray(data) ? data : [], error: null };
}

export async function searchMktData({ search }) {
  const cleanSearch = String(search || '').trim();
  if (!cleanSearch) return { data: null, error: { message: 'Search text is required.' } };

  const { data, error } = await supabase.rpc('search_mkt_data', { p_search: cleanSearch });
  if (error) {
    return { data: null, error: { message: error.message || 'Failed to search marketing data.' } };
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
    return { data: null, error: { message: data.error || 'Failed to search marketing data.' } };
  }

  return { data, error: null };
}

export async function manageMktData({ type, id = '', data = {} }) {
  const cleanType = String(type || '').trim();
  const cleanId = String(id || '').trim();
  if (!cleanType) return { data: null, error: { message: 'Type is required.' } };

  const payload = data && typeof data === 'object' && !Array.isArray(data) ? data : {};
  const { data: responseData, error } = await supabase.rpc('mkt_data_manager', {
    p_type: cleanType,
    p_id: cleanId || null,
    p_data: payload,
  });

  if (error) {
    return { data: null, error: { message: error.message || 'Failed to update marketing data.' } };
  }
  if (responseData && typeof responseData === 'object' && !Array.isArray(responseData) && responseData.error) {
    return { data: null, error: { message: responseData.error || 'Failed to update marketing data.' } };
  }

  return { data: responseData, error: null };
}
