import { config } from '../config/config.js';

const FAL_BASE = 'https://queue.fal.run';
const FAL_DIRECT_BASE = 'https://fal.run';
const DEFAULT_FAL_HTTP_TIMEOUT_MS = 30000;

function getRemainingMs(deadlineAt, fallbackMs = DEFAULT_FAL_HTTP_TIMEOUT_MS) {
  const fallback = Math.max(1000, Number(fallbackMs || DEFAULT_FAL_HTTP_TIMEOUT_MS));
  if (!Number.isFinite(Number(deadlineAt)) || Number(deadlineAt) <= 0) return fallback;
  const remaining = Number(deadlineAt) - Date.now();
  if (remaining <= 0) throw new Error(`Fal image-to-video global timeout after ${fallback}ms across models.`);
  return Math.max(1000, Math.min(fallback, remaining));
}

async function fetchJsonWithTimeout(url, options = {}, timeoutMs = DEFAULT_FAL_HTTP_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || DEFAULT_FAL_HTTP_TIMEOUT_MS)));
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const data = await response.json().catch(() => ({}));
    return { response, data };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Request timed out after ${timeoutMs}ms for ${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function getAuthHeaders() {
  if (!config.falApiKey) {
    throw new Error('Missing FAL_API_KEY in backend env.');
  }

  return {
    Authorization: `Key ${config.falApiKey}`,
    'Content-Type': 'application/json',
  };
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toFalDurationString(durationSec) {
  const n = Number(durationSec || 0);
  if (!Number.isFinite(n) || n <= 0) return '8s';
  const rounded = Math.max(1, Math.min(12, Math.round(n)));
  if (rounded === 5) return '6s';
  return `${rounded}s`;
}

async function fetchResultPayload(statusData, deadlineAt = 0, totalTimeoutMs = DEFAULT_FAL_HTTP_TIMEOUT_MS) {
  const responseUrl = statusData?.response_url;
  const statusUrl = statusData?.status_url;
  const requestUrl = statusUrl ? String(statusUrl).replace(/\/status(\?.*)?$/, '') : '';
  const candidateUrls = [responseUrl, requestUrl].filter(Boolean);

  if (candidateUrls.length === 0) return statusData;

  for (const url of candidateUrls) {
    for (let attempt = 1; attempt <= 6; attempt += 1) {
      const { response: resultResponse, data: resultData } = await fetchJsonWithTimeout(
        String(url),
        { headers: getAuthHeaders() },
        getRemainingMs(deadlineAt, totalTimeoutMs),
      );

      if (resultResponse.ok) {
        return resultData;
      }

      if ((resultResponse.status === 404 || resultResponse.status === 422) && attempt < 6) {
        await sleep(1500 * attempt);
        continue;
      }

      break;
    }
  }

  if (statusData?.response) return statusData;
  return statusData;
}

function pickFirstVideoUrl(payload) {
  const isUsableVideoUrl = (url) => {
    const text = String(url || '').trim();
    if (!/^https?:\/\//i.test(text)) return false;
    const lower = text.toLowerCase();
    if (lower.includes('queue.fal.run') && lower.includes('/requests/')) return false;
    if (lower.includes('/status')) return false;
    return (
      lower.includes('.mp4')
      || lower.includes('.webm')
      || lower.includes('.mov')
      || lower.includes('/video')
      || lower.includes('video/')
      || lower.includes('fal.media/files/')
      || lower.includes('files.fal.media/')
      || lower.includes('fal.media/')
      || lower.includes('.cloudfront.net/')
      || lower.includes('storage.googleapis.com/')
    );
  };

  const candidates = [
    payload?.response?.video?.url,
    payload?.response?.video_url,
    payload?.response?.videos?.[0]?.url,
    payload?.response?.output?.video?.url,
    payload?.response?.output?.video_url,
    payload?.response?.output?.videos?.[0]?.url,
    payload?.video?.url,
    payload?.video_url,
    payload?.videos?.[0]?.url,
    payload?.output?.video?.url,
    payload?.output?.video_url,
    payload?.output?.videos?.[0]?.url,
    payload?.result?.video?.url,
    payload?.result?.video_url,
    payload?.response?.result?.video?.url,
    payload?.response?.result?.video_url,
    payload?.response?.output_url,
    payload?.output_url,
    payload?.url,
  ];

  const direct = candidates.find((item) => isUsableVideoUrl(item));
  if (direct) return String(direct).trim();

  // Some Fal models return data arrays with { url, type/mime_type } objects.
  const fromDataResponse = Array.isArray(payload?.response?.data)
    ? payload.response.data.find((entry) => isUsableVideoUrl(entry?.url))
    : null;
  if (fromDataResponse?.url) return String(fromDataResponse.url).trim();
  const fromDataRoot = Array.isArray(payload?.data)
    ? payload.data.find((entry) => isUsableVideoUrl(entry?.url))
    : null;
  if (fromDataRoot?.url) return String(fromDataRoot.url).trim();

  const visited = new Set();
  const queue = [payload];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);

    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }

    for (const [key, value] of Object.entries(current)) {
      const lowerKey = String(key || '').toLowerCase();
      if (typeof value === 'string') {
        const text = value.trim();
        const looksLikeUrl = /^https?:\/\//i.test(text);
        const looksLikeVideoPath =
          text.toLowerCase().includes('.mp4') ||
          text.toLowerCase().includes('.webm') ||
          text.toLowerCase().includes('.mov');
        const videoishKey =
          lowerKey.includes('video') ||
          lowerKey.includes('mp4') ||
          lowerKey.includes('playback') ||
          lowerKey.includes('url');
        if (looksLikeUrl && (looksLikeVideoPath || videoishKey) && isUsableVideoUrl(text)) {
          return text;
        }
      } else if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return '';
}

function pickFirstImageUrl(payload) {
  const isUsableImageUrl = (url) => {
    const text = String(url || '').trim();
    if (!/^https?:\/\//i.test(text)) return false;
    const lower = text.toLowerCase();
    if (lower.includes('queue.fal.run') && lower.includes('/requests/')) return false;
    if (lower.includes('/status')) return false;
    return (
      lower.includes('.png')
      || lower.includes('.jpg')
      || lower.includes('.jpeg')
      || lower.includes('.webp')
      || lower.includes('/image')
      || lower.includes('image/')
      || lower.includes('fal.media/files/')
      || lower.includes('files.fal.media/')
      || lower.includes('storage.googleapis.com/')
    );
  };

  const candidates = [
    payload?.response?.images?.[0]?.url,
    payload?.response?.image?.url,
    payload?.response?.image_url,
    payload?.response?.output?.images?.[0]?.url,
    payload?.response?.output?.image?.url,
    payload?.response?.output?.image_url,
    payload?.images?.[0]?.url,
    payload?.image?.url,
    payload?.image_url,
    payload?.output?.images?.[0]?.url,
    payload?.output?.image?.url,
    payload?.output?.image_url,
    payload?.result?.images?.[0]?.url,
    payload?.result?.image?.url,
    payload?.result?.image_url,
    payload?.url,
  ];

  const direct = candidates.find((item) => isUsableImageUrl(item));
  if (direct) return String(direct).trim();

  const fromDataResponse = Array.isArray(payload?.response?.data)
    ? payload.response.data.find((entry) => isUsableImageUrl(entry?.url))
    : null;
  if (fromDataResponse?.url) return String(fromDataResponse.url).trim();
  const fromDataRoot = Array.isArray(payload?.data)
    ? payload.data.find((entry) => isUsableImageUrl(entry?.url))
    : null;
  if (fromDataRoot?.url) return String(fromDataRoot.url).trim();

  // Last-resort recursive scan for any usable image URL shape.
  const visited = new Set();
  const queue = [payload];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current || typeof current !== 'object') continue;
    if (visited.has(current)) continue;
    visited.add(current);
    if (Array.isArray(current)) {
      current.forEach((item) => queue.push(item));
      continue;
    }
    for (const value of Object.values(current)) {
      if (typeof value === 'string') {
        if (isUsableImageUrl(value)) return value.trim();
      } else if (value && typeof value === 'object') {
        queue.push(value);
      }
    }
  }

  return '';
}

async function resolveFalVideoUrl({
  modelPath,
  statusData,
  prompt,
  imageUrl,
  duration,
  deadlineAt = 0,
  totalTimeoutMs = DEFAULT_FAL_HTTP_TIMEOUT_MS,
}) {
  let videoUrl = pickFirstVideoUrl(statusData);
  let resultPayload = await fetchResultPayload(statusData, deadlineAt, totalTimeoutMs);
  if (!videoUrl) videoUrl = pickFirstVideoUrl(resultPayload);

  // Some Fal queues report COMPLETED before media URL is fully propagated.
  if (!videoUrl) {
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const remaining = getRemainingMs(deadlineAt, totalTimeoutMs);
      if (remaining <= 1000) break;
      await sleep(Math.min(1200 * attempt, Math.max(200, remaining - 500)));
      resultPayload = await fetchResultPayload(statusData, deadlineAt, totalTimeoutMs);
      videoUrl = pickFirstVideoUrl(resultPayload);
      if (videoUrl) break;
    }
  }

  if (!videoUrl) {
    // Fallback: call fal.run endpoint directly and parse output payload.
    const { response: directResponse, data: directData } = await fetchJsonWithTimeout(`${FAL_DIRECT_BASE}/${modelPath}`, {
      method: 'POST',
      headers: getAuthHeaders(),
      body: JSON.stringify({
        prompt: String(prompt).trim(),
        image_url: String(imageUrl).trim(),
        aspect_ratio: 'auto',
        duration,
        resolution: '720p',
        generate_audio: false,
      }),
    }, getRemainingMs(deadlineAt, totalTimeoutMs));
    if (directResponse.ok) {
      videoUrl = pickFirstVideoUrl(directData);
    }
  }

  return videoUrl;
}

async function submitAndPollFalImageToVideo({ modelId, imageUrl, prompt, duration, timeoutMs, deadlineAt = 0 }) {
  const modelPath = encodeURI(modelId);
  const normalizedImageUrl = String(imageUrl).trim();
  const normalizedPrompt = String(prompt).trim();
  const payload = {
    image_url: normalizedImageUrl,
    prompt: normalizedPrompt,
    duration,
  };

  let submitResponse;
  let submitData;
  ({ response: submitResponse, data: submitData } = await fetchJsonWithTimeout(`${FAL_BASE}/${modelPath}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload),
  }, getRemainingMs(deadlineAt, timeoutMs)));

  if (!submitResponse.ok) {
    throw new Error(submitData?.error || submitData?.message || `Fal image-to-video submit failed (${submitResponse.status}).`);
  }

  const statusUrl = submitData?.status_url;
  if (!statusUrl) {
    throw new Error('Fal image-to-video response missing status_url.');
  }

  const startedAt = Date.now();
  while ((Date.now() - startedAt < timeoutMs) && (Date.now() < Number(deadlineAt || Number.MAX_SAFE_INTEGER))) {
    const { response: statusResponse, data: statusData } = await fetchJsonWithTimeout(
      statusUrl,
      { headers: getAuthHeaders() },
      getRemainingMs(deadlineAt, timeoutMs),
    );

    if (!statusResponse.ok) {
      throw new Error(statusData?.error || `Fal image-to-video status failed (${statusResponse.status}).`);
    }

    if (statusData?.status === 'COMPLETED') {
      const videoUrl = await resolveFalVideoUrl({
        modelPath,
        statusData,
        prompt,
        imageUrl,
        duration,
        deadlineAt,
        totalTimeoutMs: timeoutMs,
      });
      return {
        statusData,
        videoUrl: String(videoUrl || '').trim(),
        requestId: submitData?.request_id || '',
      };
    }

    if (statusData?.status === 'FAILED') {
      throw new Error(statusData?.error || 'Fal image-to-video generation failed.');
    }

    await sleep(1500);
  }

  throw new Error(`Fal image-to-video request timed out after ${timeoutMs}ms.`);
}

export async function generateImageWithFal({ prompt }) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error('Prompt is required for FAL image generation.');
  }

  const modelPath = encodeURI(config.falImageModel);
  const submitResponse = await fetch(`${FAL_BASE}/${modelPath}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({
      input: {
        prompt: String(prompt).trim(),
      },
    }),
  });

  const submitData = await submitResponse.json().catch(() => ({}));
  if (!submitResponse.ok) {
    throw new Error(submitData?.error || `Fal submit failed (${submitResponse.status}).`);
  }

  const statusUrl = submitData?.status_url;
  if (!statusUrl) {
    throw new Error('Fal response missing status_url.');
  }

  const timeoutMs = Number(config.falTimeoutMs || 120000);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const statusResponse = await fetch(statusUrl, { headers: getAuthHeaders() });
    const statusData = await statusResponse.json().catch(() => ({}));

    if (!statusResponse.ok) {
      throw new Error(statusData?.error || `Fal status failed (${statusResponse.status}).`);
    }

    if (statusData?.status === 'COMPLETED') {
      const imageUrl = pickFirstImageUrl(statusData);

      if (!imageUrl) {
        const sample = JSON.stringify(statusData || {}).slice(0, 1200);
        throw new Error(`Fal completed but image URL not found. Sample: ${sample}`);
      }

      return {
        imageUrl,
        requestId: submitData?.request_id || '',
        model: config.falImageModel,
      };
    }

    if (statusData?.status === 'FAILED') {
      throw new Error(statusData?.error || 'Fal image generation failed.');
    }

    await sleep(1500);
  }

  throw new Error(`Fal request timed out after ${timeoutMs}ms.`);
}

export async function generateImageToVideoWithFal({ imageUrl, prompt, durationSec = 0 }) {
  if (!imageUrl || !String(imageUrl).trim()) {
    throw new Error('imageUrl is required for FAL image-to-video generation.');
  }
  if (!prompt || !String(prompt).trim()) {
    throw new Error('Prompt is required for FAL image-to-video generation.');
  }
  const duration = toFalDurationString(durationSec);

  const timeoutMs = Number(config.falTimeoutMs || 120000);
  const deadlineAt = Date.now() + timeoutMs;
  const primaryModel = String(config.falMotionModel || 'fal-ai/veo3.1/lite/image-to-video').trim();
  const fallbackModels = [
    'fal-ai/veo3.1/lite/image-to-video',
    'fal-ai/ltx-video-v095/image-to-video',
  ].filter((m, idx, arr) => m && m !== primaryModel && arr.indexOf(m) === idx);

  const triedModels = [primaryModel, ...fallbackModels];
  let lastStatusSample = '';
  const globalStartedAt = Date.now();

  for (const modelId of triedModels) {
    const elapsed = Date.now() - globalStartedAt;
    if (elapsed >= timeoutMs) {
      throw new Error(`Fal image-to-video global timeout after ${timeoutMs}ms across models.`);
    }
    const remainingMs = Math.max(1000, timeoutMs - elapsed);
    try {
      const outcome = await submitAndPollFalImageToVideo({
        modelId,
        imageUrl,
        prompt,
        duration,
        timeoutMs: remainingMs,
        deadlineAt,
      });
      if (outcome.videoUrl) {
        return {
          videoUrl: outcome.videoUrl,
          requestId: outcome.requestId,
          model: modelId,
        };
      }
      lastStatusSample = JSON.stringify(outcome.statusData || {}).slice(0, 1200);
    } catch (error) {
      const message = String(error?.message || '');
      if (!message.includes('video URL not found')) {
        // For real submit/status failures, bubble immediately.
        throw error;
      }
      lastStatusSample = message.slice(0, 1200);
    }
  }

  throw new Error(`Fal image-to-video completed but video URL not found after trying models: ${triedModels.join(', ')}. Sample: ${lastStatusSample}`);
}
