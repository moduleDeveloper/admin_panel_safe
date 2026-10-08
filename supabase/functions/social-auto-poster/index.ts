import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.50.0';

const BLOTATO_POST_URL = 'https://api.blotato.com/v2/posts';
const AUTO_POST_TIMEZONE = Deno.env.get('AUTO_POST_TIMEZONE') || 'Asia/Kolkata';
const MAX_IMAGES_PER_TRUST_PER_RUN = Number(Deno.env.get('MAX_IMAGES_PER_TRUST_PER_RUN') || 20);

const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
}

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function nowHHMMInTimeZone(timeZone: string) {
  const dtf = new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  return dtf.format(new Date());
}

function normalizeTimeToHHMM(value: string | null) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw.slice(0, 5);
}

function isWithinOneMinuteWindow(targetHHMM: string, nowHHMM: string) {
  const [tH, tM] = targetHHMM.split(':').map(Number);
  const [nH, nM] = nowHHMM.split(':').map(Number);
  if ([tH, tM, nH, nM].some((n) => Number.isNaN(n))) return false;

  const targetMins = tH * 60 + tM;
  const nowMins = nH * 60 + nM;
  const diff = Math.abs(targetMins - nowMins);
  const wrappedDiff = 1440 - diff;
  return Math.min(diff, wrappedDiff) <= 1;
}

function composeCaption(description: string | null, hashtags: string | null) {
  const text = [String(description || '').trim(), String(hashtags || '').trim()]
    .filter(Boolean)
    .join('\n\n')
    .trim();
  return text || ' ';
}

async function postToBlotato(apiKey: string, payload: unknown) {
  const response = await fetch(BLOTATO_POST_URL, {
    method: 'POST',
    headers: {
      'X-API-Key': apiKey,
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  if (!response.ok) {
    throw new Error(`Blotato API error (${response.status}): ${responseText}`);
  }
  try {
    return JSON.parse(responseText);
  } catch {
    return { raw: responseText };
  }
}

function firstNonEmptyString(values: unknown[]) {
  for (const value of values) {
    const normalized = String(value ?? '').trim();
    if (normalized) return normalized;
  }
  return '';
}

function extractPostMeta(result: unknown) {
  const source = (result && typeof result === 'object') ? (result as Record<string, unknown>) : {};
  const post = (source.post && typeof source.post === 'object') ? (source.post as Record<string, unknown>) : {};
  const data = (source.data && typeof source.data === 'object') ? (source.data as Record<string, unknown>) : {};

  const submissionId = firstNonEmptyString([
    source.submissionId,
    source.submission_id,
    source.id,
    post.submissionId,
    post.submission_id,
    post.id,
    data.submissionId,
    data.submission_id,
    data.id,
  ]);

  const publicUrl = firstNonEmptyString([
    source.publicUrl,
    source.public_url,
    source.url,
    source.postUrl,
    source.post_url,
    post.publicUrl,
    post.public_url,
    post.url,
    post.postUrl,
    post.post_url,
    data.publicUrl,
    data.public_url,
    data.url,
    data.postUrl,
    data.post_url,
  ]);

  return {
    submissionId: submissionId || null,
    publicUrl: publicUrl || null,
  };
}

async function fetchFolderIdsByTrust(trustId: string) {
  const { data, error } = await supabase
    .from('gallery_folders')
    .select('id')
    .eq('trust_id', trustId);

  if (error) throw error;
  return (data || []).map((row) => row.id).filter(Boolean);
}

Deno.serve(async () => {
  const startedAt = new Date().toISOString();
  const nowHHMM = nowHHMMInTimeZone(AUTO_POST_TIMEZONE);

  const summary = {
    startedAt,
    timezone: AUTO_POST_TIMEZONE,
    nowHHMM,
    dueTrusts: 0,
    scannedImages: 0,
    postedImages: 0,
    skippedImages: 0,
    errors: [] as string[],
  };

  try {
    const { data: accounts, error: accountsError } = await supabase
      .from('social_media_accounts')
      .select('id, trust_id, "Blotato-API", "Instagram", "FB-Account", "FB-Page", "TimeForAutoInput"');

    if (accountsError) {
      throw accountsError;
    }

    const dueAccounts = (accounts || []).filter((row) => {
      const targetTime = normalizeTimeToHHMM(row['TimeForAutoInput']);
      if (!targetTime) return false;
      return isWithinOneMinuteWindow(targetTime, nowHHMM);
    });

    summary.dueTrusts = dueAccounts.length;

    for (const account of dueAccounts) {
      const trustId = String(account.trust_id || '').trim();
      const apiKey = String(account['Blotato-API'] || '').trim();
      const instagramAccountId = account['Instagram'];
      const facebookAccountId = account['FB-Account'];
      const facebookPageId = account['FB-Page'];

      if (!trustId) {
        summary.errors.push(`Skipping account ${account.id}: missing trust_id.`);
        continue;
      }
      if (!apiKey) {
        summary.errors.push(`Skipping trust ${trustId}: missing Blotato API key.`);
        continue;
      }

      const folderIds = await fetchFolderIdsByTrust(trustId);
      if (!folderIds.length) {
        continue;
      }

      const { data: photos, error: photosError } = await supabase
        .from('gallery_photos')
        .select('id')
        .in('folder_id', folderIds);

      if (photosError) {
        summary.errors.push(`Trust ${trustId}: failed to read gallery photos (${photosError.message}).`);
        continue;
      }

      const photoIds = (photos || []).map((row) => row.id).filter(Boolean);
      if (!photoIds.length) {
        continue;
      }

      const { data: images, error: imagesError } = await supabase
        .from('Images')
        .select('id, "Description", "Hashtags", "Approved", created_by, gallery_photo_id, gallery_photo:gallery_photos(public_url, storage_path)')
        .in('gallery_photo_id', photoIds)
        .in('Approved', ['approved', 'Approved'])
        .order('created_at', { ascending: true })
        .limit(MAX_IMAGES_PER_TRUST_PER_RUN);

      if (imagesError) {
        summary.errors.push(`Trust ${trustId}: failed to read approved images (${imagesError.message}).`);
        continue;
      }

      for (const image of images || []) {
        summary.scannedImages += 1;
        const mediaUrl = image.gallery_photo?.public_url || image.gallery_photo?.storage_path || '';
        const caption = composeCaption(image['Description'], image['Hashtags']);

        if (!mediaUrl) {
          summary.skippedImages += 1;
          summary.errors.push(`Image ${image.id}: missing media URL.`);
          continue;
        }

        const platformCalls: Array<Promise<unknown>> = [];
        let calledPlatformCount = 0;

        if (instagramAccountId) {
          calledPlatformCount += 1;
          platformCalls.push(
            postToBlotato(apiKey, {
              post: {
                accountId: String(instagramAccountId),
                content: {
                  text: caption,
                  mediaUrls: [mediaUrl],
                  platform: 'instagram',
                },
                target: { targetType: 'instagram' },
              },
            })
          );
        }

        if (facebookAccountId && facebookPageId) {
          calledPlatformCount += 1;
          platformCalls.push(
            postToBlotato(apiKey, {
              post: {
                accountId: String(facebookAccountId),
                content: {
                  text: caption,
                  mediaUrls: [mediaUrl],
                  platform: 'facebook',
                },
                target: {
                  targetType: 'facebook',
                  pageId: String(facebookPageId),
                },
              },
            })
          );
        }

        if (!calledPlatformCount) {
          summary.skippedImages += 1;
          summary.errors.push(`Trust ${trustId}, image ${image.id}: no target platform configured.`);
          continue;
        }

        let callResults: unknown[] = [];
        try {
          callResults = await Promise.all(platformCalls);
        } catch (error) {
          summary.skippedImages += 1;
          summary.errors.push(`Trust ${trustId}, image ${image.id}: ${String(error)}`);
          continue;
        }

        const extracted = callResults.map(extractPostMeta);
        const resolvedSubmissionId =
          extracted.find((entry) => entry.submissionId)?.submissionId || null;
        const resolvedPublicUrl =
          extracted.find((entry) => entry.publicUrl)?.publicUrl || null;

        const { error: updateError } = await supabase
          .from('Images')
          .update({
            Approved: 'posted',
            postStatus: 'posted',
            blotatoSubmissionId: resolvedSubmissionId,
            publicUrl: resolvedPublicUrl,
          })
          .eq('id', image.id)
          .eq('Approved', 'approved');

        if (updateError) {
          summary.skippedImages += 1;
          summary.errors.push(`Image ${image.id}: posted but status update failed (${updateError.message}).`);
          continue;
        }

        summary.postedImages += 1;
      }
    }

    return new Response(JSON.stringify(summary), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  } catch (error) {
    summary.errors.push(String(error));
    return new Response(JSON.stringify(summary), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
});
