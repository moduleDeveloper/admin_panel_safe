import { supabase } from '../../../core/lib/supabase';
import { cachedQuery } from '../../../core/services/requestCache';

const TABLE_CANDIDATES = ['Trustee', 'trustees', 'trustee', 'Trustees'];

function normalizeTrustee(row = {}, index = 0) {
  const name =
    row.name ||
    row.trustee_name ||
    row.full_name ||
    row.member_name ||
    row.person_name ||
    row.title ||
    row.trustee ||
    'Unnamed Trustee';

  const role =
    row.role ||
    row.designation ||
    row.position ||
    row.type ||
    row.category ||
    '';

  const id =
    row.id ||
    row.trustee_id ||
    row.user_id ||
    row.person_id ||
    `${index}`;

  return { id, name, role };
}

/**
 * Fetch trustees for a trust id. Tries a few common table names.
 * Returns { data: Array<{id, name, role}>, error }
 */
export async function fetchTrustees(trustId) {
  if (!trustId) return { data: [], error: null };
  return cachedQuery(`trustees:list:${trustId}`, async () => {
    let lastError = null;

    for (const table of TABLE_CANDIDATES) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('trust_id', trustId);

      if (!error) {
        const normalized = (data || []).map(normalizeTrustee);
        return { data: normalized, error: null };
      }

      lastError = error;
      const message = error?.message || '';
      if (!/relation .* does not exist/i.test(message)) {
        return { data: [], error };
      }
    }

    return { data: [], error: lastError };
  }, 20000);
}
