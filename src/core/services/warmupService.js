import { fetchEventsByTrust } from '../../features/extra/services/eventsService';
import { fetchNoticeboardByTrust } from '../../features/extra/services/noticeboardService';
import { fetchFacilitiesByTrust } from '../../features/extra/services/facilitiesService';
import { fetchDonationsByTrust } from '../../features/extra/services/donationsService';

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
