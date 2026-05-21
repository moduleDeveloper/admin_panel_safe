import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { badRequest } from '../utils/helpers.js';

const PLATFORM_CONFIG = {
  instagram: { accountColumn: 'Instagram', target: 'instagram' },
  facebook_page: { accountColumn: 'FB-Page', target: 'facebook' },
  facebook_account: { accountColumn: 'FB-Account', target: 'facebook' },
  youtube: { accountColumn: 'Youtube', target: 'youtube' },
};

function buildTargetObject({ platform, targetType, accountId }) {
  const id = String(accountId || '').trim();
  const base = {
    targetType,
    id,
    accountId: id,
  };

  if (platform === 'facebook_page' || platform === 'facebook_account') {
    return {
      ...base,
      pageId: id,
    };
  }

  return base;
}

function withTimeoutSignal(timeoutMs = 20000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timeout) };
}

function normalizePlatforms(value) {
  const list = Array.isArray(value) ? value : [];
  return list.map((item) => String(item || '').trim().toLowerCase()).filter(Boolean);
}

function normalizePostType(mediaType, postTypeRaw) {
  const media = String(mediaType || '').trim().toLowerCase();
  if (media === 'image') return 'post';
  const postType = String(postTypeRaw || 'post').trim().toLowerCase();
  return ['post', 'reel', 'story'].includes(postType) ? postType : 'post';
}

async function appendSocialPostResultToAssetMeta({ trustId, mediaAssetId, payload }) {
  const cleanAssetId = String(mediaAssetId || '').trim();
  if (!cleanAssetId) return;

  const { data: asset, error: assetError } = await supabaseAdmin
    .from('video_assets')
    .select('id, project_id, meta')
    .eq('id', cleanAssetId)
    .maybeSingle();
  if (assetError || !asset?.id || !asset?.project_id) return;

  const { data: project, error: projectError } = await supabaseAdmin
    .from('video_projects')
    .select('id, trust_id')
    .eq('id', asset.project_id)
    .eq('trust_id', trustId)
    .maybeSingle();
  if (projectError || !project?.id) return;

  const currentMeta = asset?.meta && typeof asset.meta === 'object' && !Array.isArray(asset.meta)
    ? asset.meta
    : {};

  const nextMeta = {
    ...currentMeta,
    last_social_post_results: payload,
  };

  await supabaseAdmin
    .from('video_assets')
    .update({ meta: nextMeta })
    .eq('id', cleanAssetId);
}

export async function getSocialAccountsHandler(req, res) {
  try {
    const trustId = String(req.params?.trustId || '').trim();
    if (!trustId) return badRequest(res, 'trustId is required.');

    const { data, error } = await supabaseAdmin
      .from('social_media_accounts')
      .select('id, trust_id, "Instagram", "FB-Page", "FB-Account", "Youtube", "X", "Threads", "Blotato-API"')
      .eq('trust_id', trustId)
      .maybeSingle();

    if (error) return res.status(500).json({ error: error.message || 'Failed to fetch social accounts.' });
    if (!data) return res.status(404).json({ error: 'No social accounts configured' });

    return res.json({
      account: {
        id: data.id,
        trust_id: data.trust_id,
        hasBlotatoKey: Boolean(String(data?.['Blotato-API'] || '').trim()),
        instagram: data?.Instagram || null,
        facebook_page: data?.['FB-Page'] || null,
        facebook_account: data?.['FB-Account'] || null,
        youtube: data?.Youtube || null,
        x: data?.X || null,
        threads: data?.Threads || null,
      },
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch social accounts.' });
  }
}

export async function postToSocialHandler(req, res) {
  try {
    const trustId = String(req.body?.trustId || '').trim();
    const mediaUrl = String(req.body?.mediaUrl || '').trim();
    const mediaType = String(req.body?.mediaType || '').trim().toLowerCase();
    const caption = String(req.body?.caption || '').trim();
    const mediaAssetId = String(req.body?.mediaAssetId || '').trim();
    const platforms = normalizePlatforms(req.body?.platforms);
    const postType = normalizePostType(mediaType, req.body?.postType);

    if (!trustId) return badRequest(res, 'trustId is required.');
    if (!mediaUrl) return badRequest(res, 'mediaUrl is required.');
    if (!['video', 'image'].includes(mediaType)) return badRequest(res, 'mediaType must be video or image.');
    if (!platforms.length) return badRequest(res, 'platforms is required.');

    const unsupported = platforms.filter((platform) => !PLATFORM_CONFIG[platform]);
    if (unsupported.length) return badRequest(res, `Unsupported platforms: ${unsupported.join(', ')}`);

    const { data: account, error: accountError } = await supabaseAdmin
      .from('social_media_accounts')
      .select('id, trust_id, "Blotato-API", "Instagram", "FB-Page", "FB-Account", "Youtube"')
      .eq('trust_id', trustId)
      .maybeSingle();

    if (accountError) return res.status(500).json({ error: accountError.message || 'Failed to fetch social account config.' });
    if (!account) return res.status(404).json({ error: 'No social accounts configured' });

    const blotatoApiKey = String(account?.['Blotato-API'] || '').trim();
    if (!blotatoApiKey) return badRequest(res, 'Blotato API key missing for this trust.');

    const results = [];
    for (const platform of platforms) {
      const config = PLATFORM_CONFIG[platform];
      const accountId = account?.[config.accountColumn];
      if (!accountId) {
        results.push({ platform, status: 'skipped', error: 'Not configured' });
        continue;
      }

      const requestBody = {
        post: {
          accountId: String(accountId),
          target: buildTargetObject({
            platform,
            targetType: config.target,
            accountId,
          }),
          content: {
            platform: config.target,
            text: caption || '',
            mediaUrls: [mediaUrl],
            ...(postType === 'reel' ? { videoType: 'REELS' } : {}),
            ...(postType === 'story' ? { videoType: 'STORY' } : {}),
          },
        },
      };

      const timer = withTimeoutSignal(20000);
      try {
        const response = await fetch('https://backend.blotato.com/v2/posts', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'blotato-api-key': blotatoApiKey,
          },
          body: JSON.stringify(requestBody),
          signal: timer.signal,
        });
        const data = await response.json().catch(() => ({}));
        if (!response.ok) {
          results.push({
            platform,
            status: 'failed',
            error: data?.error || data?.message || `Request failed (${response.status})`,
          });
        } else {
          results.push({
            platform,
            status: 'success',
            data,
          });
        }
      } catch (error) {
        results.push({
          platform,
          status: 'failed',
          error: error?.name === 'AbortError' ? 'Request timed out after 20s' : (error?.message || 'Unknown error'),
        });
      } finally {
        timer.clear();
      }
    }

    await appendSocialPostResultToAssetMeta({
      trustId,
      mediaAssetId,
      payload: {
        at: new Date().toISOString(),
        media_url: mediaUrl,
        media_type: mediaType,
        post_type: postType,
        caption,
        results,
      },
    });

    return res.json({ results });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to post to social media.' });
  }
}
