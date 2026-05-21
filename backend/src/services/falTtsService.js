import { config } from '../config/config.js';

const FAL_BASE = 'https://queue.fal.run';
const FAL_RUN_BASE = 'https://fal.run';

function toSafeErrorMessage(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload;
  if (payload.error && typeof payload.error === 'string') return payload.error;
  if (payload.detail && typeof payload.detail === 'string') return payload.detail;
  return `${fallback} | ${JSON.stringify(payload).slice(0, 900)}`;
}

function getHeaders() {
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

function extractAudioUrl(payload) {
  return (
    payload?.response?.audio?.url ||
    payload?.response?.audio?.file?.url ||
    payload?.response?.audio?.data?.url ||
    payload?.response?.audios?.[0]?.url ||
    payload?.response?.output?.audio?.url ||
    payload?.output?.audio?.url ||
    payload?.audio?.url ||
    payload?.audio?.file?.url ||
    payload?.audios?.[0]?.url ||
    payload?.response?.audio_url ||
    payload?.audio_url ||
    ''
  );
}

async function fetchResultPayload(statusData) {
  const responseUrl = statusData?.response_url;
  const statusUrl = statusData?.status_url;
  const requestUrl = statusUrl ? String(statusUrl).replace(/\/status(\?.*)?$/, '') : '';

  const candidateUrls = [responseUrl, requestUrl].filter(Boolean);
  if (candidateUrls.length === 0) return statusData;

  let lastErrorMessage = '';

  for (const url of candidateUrls) {
    // Fal may return 422 briefly even after COMPLETED; retry a few times.
    for (let attempt = 1; attempt <= 4; attempt += 1) {
      const resultResponse = await fetch(url, { headers: getHeaders() });
      const resultData = await resultResponse.json().catch(() => ({}));

      if (resultResponse.ok) {
        return resultData;
      }

      lastErrorMessage = resultData?.error || `Fal TTS result fetch failed (${resultResponse.status}).`;

      if ((resultResponse.status === 422 || resultResponse.status === 404) && attempt < 4) {
        await sleep(1200 * attempt);
        continue;
      }

      break;
    }
  }

  if (statusData?.response) return statusData;
  throw new Error(lastErrorMessage || 'Fal TTS result fetch failed.');
}

export async function generateVoiceoverMp3WithFal({ text }) {
  if (!text || !String(text).trim()) {
    throw new Error('Text is required for Fal TTS.');
  }

  const cleanText = String(text).trim();
  const modelPath = encodeURI(config.falVoiceModel);

  // Prefer direct run first: fewer network calls than queue polling.
  const directPayloads = [
    { text: cleanText },
    { input: { text: cleanText } },
  ];
  let lastDirectError = '';

  for (const payload of directPayloads) {
    const directResponse = await fetch(`${FAL_RUN_BASE}/${modelPath}`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(payload),
    });

    const directData = await directResponse.json().catch(() => ({}));
    if (directResponse.ok) {
      const directAudioUrl = extractAudioUrl(directData);
      if (directAudioUrl) {
        const audioResponse = await fetch(directAudioUrl, {
          headers: { Authorization: `Key ${config.falApiKey}` },
        });
        if (!audioResponse.ok) {
          throw new Error(`Failed to download Fal audio (${audioResponse.status}).`);
        }
        const audioArrayBuffer = await audioResponse.arrayBuffer();
        return {
          audioBytes: Buffer.from(audioArrayBuffer),
          provider: 'fal',
          model: config.falVoiceModel,
          inputTokens: null,
          outputTokens: null,
          meta: {
            mode: 'direct',
            audio_url: directAudioUrl,
            response_keys: Object.keys(directData || {}),
          },
        };
      }
    } else if (directResponse.status === 404 || directResponse.status === 405) {
      break;
    } else {
      lastDirectError = toSafeErrorMessage(
        directData,
        `Fal direct TTS failed (${directResponse.status}) for model "${config.falVoiceModel}"`,
      );
      // If this shape failed validation, try the next payload shape.
      continue;
    }
  }

  // Fallback: queue API.
  const submitResponse = await fetch(`${FAL_BASE}/${modelPath}`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      text: cleanText,
      input: {
        text: cleanText,
      },
    }),
  });

  const submitData = await submitResponse.json().catch(() => ({}));
  if (!submitResponse.ok) {
    throw new Error(toSafeErrorMessage(
      submitData,
      lastDirectError || `Fal TTS submit failed (${submitResponse.status}) for model "${config.falVoiceModel}"`,
    ));
  }

  const statusUrl = submitData?.status_url;
  if (!statusUrl) {
    throw new Error('Fal TTS response missing status_url.');
  }

  const timeoutMs = Number(config.falTimeoutMs || 120000);
  const startedAt = Date.now();

  while (Date.now() - startedAt < timeoutMs) {
    const statusResponse = await fetch(statusUrl, { headers: getHeaders() });
    const statusData = await statusResponse.json().catch(() => ({}));

    if (!statusResponse.ok) {
      throw new Error(toSafeErrorMessage(
        statusData,
        `Fal TTS status failed (${statusResponse.status})`,
      ));
    }

    if (statusData?.status === 'COMPLETED') {
      const resultPayload = await fetchResultPayload(statusData);
      const audioUrl = extractAudioUrl(resultPayload) || extractAudioUrl(statusData);
      if (!audioUrl) {
        const keys = Object.keys(resultPayload || {}).join(', ');
        throw new Error(`Fal TTS completed but audio URL not found. Result keys: ${keys || 'none'}`);
      }

      const audioResponse = await fetch(audioUrl, {
        headers: {
          Authorization: `Key ${config.falApiKey}`,
        },
      });

      if (!audioResponse.ok) {
        throw new Error(`Failed to download Fal audio (${audioResponse.status}).`);
      }

      const audioArrayBuffer = await audioResponse.arrayBuffer();
      return {
        audioBytes: Buffer.from(audioArrayBuffer),
        provider: 'fal',
        model: config.falVoiceModel,
        inputTokens: null,
        outputTokens: null,
        meta: {
          mode: 'queue',
          status: statusData?.status || null,
          request_id: statusData?.request_id || null,
          response_url: statusData?.response_url || null,
          response_keys: Object.keys(resultPayload || {}),
        },
      };
    }

    if (statusData?.status === 'FAILED') {
      throw new Error(statusData?.error || 'Fal TTS failed.');
    }

    await sleep(1500);
  }

  throw new Error(`Fal TTS timed out after ${timeoutMs}ms.`);
}
