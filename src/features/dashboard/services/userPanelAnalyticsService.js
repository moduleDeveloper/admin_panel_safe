import { supabase } from '../../../core/lib/supabase';

// User panel activity is read only through:
//   page_tracking_rpc(p_action text, p_payload jsonb)
// Action: up_activity_view  payload { trust_id, user_reg_id?, limit, offset }
//   user_reg_id omitted -> activity of all users in the trust
// Response: { success, data: [], limit, offset }  (no total_count; limit is capped at 500)
const PAGE_TRACKING_RPC = 'page_tracking_rpc';
const ACTION_ACTIVITY_VIEW = 'up_activity_view';

export const ACTIVITY_PAGE_SIZE = 500;
export const ACTIVITY_MAX_ROWS = 50000;

function toErrorMessage(response) {
  if (response?.message) return response.message;
  if (response?.detail) return `Server error: ${response.detail}`;
  const code = response?.error;
  if (!code) return 'Unable to load user activity.';
  const text = String(code).replace(/_/g, ' ').toLowerCase();
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}.`;
}

/** Fetches one RPC page. Throws on validation, transport or `success: false` errors. */
export async function fetchUserPanelActivityPage({
  trustId,
  userRegId,
  limit = ACTIVITY_PAGE_SIZE,
  offset = 0,
} = {}) {
  if (!trustId) throw new Error('Trust is required.');

  const { data, error } = await supabase.rpc(PAGE_TRACKING_RPC, {
    p_action: ACTION_ACTIVITY_VIEW,
    p_payload: {
      trust_id: trustId,
      ...(userRegId ? { user_reg_id: userRegId } : {}),
      limit,
      offset,
    },
  });

  if (error) throw error;
  if (!data?.success) throw new Error(toErrorMessage(data));

  return Array.isArray(data.data) ? data.data : [];
}

/**
 * Collects every matching row by repeating the same RPC in batches of ACTIVITY_PAGE_SIZE
 * until a short batch comes back (or ACTIVITY_MAX_ROWS is reached).
 * `signal` stops the loop early; `onProgress(rowCount)` reports rows loaded so far.
 * Resolves to { rows, truncated }.
 */
export async function fetchAllUserPanelActivity({ trustId, userRegId, signal, onProgress } = {}) {
  const rows = [];
  let offset = 0;
  let truncated = false;

  while (!signal?.aborted) {
    const batch = await fetchUserPanelActivityPage({
      trustId,
      userRegId,
      limit: ACTIVITY_PAGE_SIZE,
      offset,
    });
    rows.push(...batch);
    onProgress?.(rows.length);

    if (batch.length < ACTIVITY_PAGE_SIZE) break;
    if (rows.length >= ACTIVITY_MAX_ROWS) {
      truncated = true;
      break;
    }
    offset += ACTIVITY_PAGE_SIZE;
  }

  return { rows, truncated };
}
