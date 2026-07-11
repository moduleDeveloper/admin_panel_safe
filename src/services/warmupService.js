import { fetchSponsors, fetchSponsorFlashByTrust } from './sponsorsService';
import { fetchGalleryFolders } from './galleryService';
import { fetchEventsByTrust } from './eventsService';
import { fetchNoticeboardByTrust } from './noticeboardService';
import { fetchFacilitiesByTrust } from './facilitiesService';
import { fetchContactTrustByTrust } from './contactTrustService';
import { fetchDonationsByTrust } from './donationsService';
import { fetchMarqueeUpdatesByTrust } from './marqueeService';

let warmedTrustId = null;

export async function warmupTrustData(trustId) {
  if (!trustId) return;
  if (warmedTrustId === trustId) return;
  warmedTrustId = trustId;

  await Promise.allSettled([
    fetchSponsors(trustId),
    fetchSponsorFlashByTrust(trustId),
    fetchGalleryFolders(trustId),
    fetchEventsByTrust(trustId),
    fetchNoticeboardByTrust(trustId),
    fetchFacilitiesByTrust(trustId),
    fetchContactTrustByTrust(trustId),
    fetchDonationsByTrust(trustId),
    fetchMarqueeUpdatesByTrust(trustId),
  ]);
}

export function resetWarmupMarker() {
  warmedTrustId = null;
}
