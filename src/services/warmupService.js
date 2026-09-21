import { fetchEventsByTrust } from './eventsService';
import { fetchNoticeboardByTrust } from './noticeboardService';
import { fetchFacilitiesByTrust } from './facilitiesService';
import { fetchDonationsByTrust } from './donationsService';

let warmedTrustId = null;

export async function warmupTrustData(trustId) {
  if (!trustId) return;
  if (warmedTrustId === trustId) return;
  warmedTrustId = trustId;

  await Promise.allSettled([
    fetchEventsByTrust(trustId),
    fetchNoticeboardByTrust(trustId),
    fetchFacilitiesByTrust(trustId),
    fetchDonationsByTrust(trustId),
  ]);
}

export function resetWarmupMarker() {
  warmedTrustId = null;
}
