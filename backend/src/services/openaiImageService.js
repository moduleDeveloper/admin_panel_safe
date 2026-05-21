import { config } from '../config/config.js';
import { openai } from '../lib/openai.js';

function sizeToAspectRatio(sizeText) {
  const text = String(sizeText || '').trim().toLowerCase();
  const match = text.match(/^(\d+)\s*x\s*(\d+)$/);
  if (!match) return null;
  const w = Number(match[1]);
  const h = Number(match[2]);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return null;
  const gcd = (a, b) => (b === 0 ? a : gcd(b, a % b));
  const g = gcd(w, h);
  return `${Math.round(w / g)}:${Math.round(h / g)}`;
}

function normalizeUsage(usage) {
  const promptTokens = Number(usage?.prompt_tokens ?? usage?.input_tokens);
  const completionTokens = Number(usage?.completion_tokens ?? usage?.output_tokens);
  const totalTokens = Number(usage?.total_tokens);
  const inputTokens = Number.isFinite(promptTokens) ? promptTokens : null;
  const outputTokens = Number.isFinite(completionTokens) ? completionTokens : null;
  const total = Number.isFinite(totalTokens)
    ? totalTokens
    : ((Number.isFinite(inputTokens) ? inputTokens : 0) + (Number.isFinite(outputTokens) ? outputTokens : 0));
  return {
    input_tokens: inputTokens,
    output_tokens: outputTokens,
    total_tokens: Number.isFinite(total) ? total : null,
  };
}

function isMultimodalEnabled() {
  return String(process.env.OPENAI_IMAGE_MULTIMODAL_ENABLED || 'true').toLowerCase() !== 'false';
}

function isBlockedPrivateHost(hostname) {
  const host = String(hostname || '').trim().toLowerCase();
  if (!host) return true;
  if (host === 'localhost' || host === '0.0.0.0' || host === '127.0.0.1') return true;
  if (host.startsWith('169.254.')) return true;
  if (host.startsWith('10.')) return true;
  if (host.startsWith('192.168.')) return true;

  const match172 = host.match(/^172\.(\d{1,3})\./);
  if (match172) {
    const second = Number(match172[1]);
    if (Number.isFinite(second) && second >= 16 && second <= 31) return true;
  }

  return false;
}

function normalizeLogoPosition(value) {
  const clean = String(value || '').trim().toLowerCase();
  const allowed = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']);
  return allowed.has(clean) ? clean : 'top-right';
}

function normalizeReferencePosition(value) {
  const clean = String(value || '').trim().toLowerCase();
  const allowed = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center']);
  return allowed.has(clean) ? clean : 'bottom-left';
}

function resolvePlacementCoords({ baseWidth, baseHeight, overlayWidth, overlayHeight, position, padding = 20 }) {
  const map = {
    'top-left': { left: padding, top: padding },
    'top-right': { left: Math.max(padding, baseWidth - overlayWidth - padding), top: padding },
    'bottom-left': { left: padding, top: Math.max(padding, baseHeight - overlayHeight - padding) },
    'bottom-right': { left: Math.max(padding, baseWidth - overlayWidth - padding), top: Math.max(padding, baseHeight - overlayHeight - padding) },
    center: { left: Math.max(0, Math.round((baseWidth - overlayWidth) / 2)), top: Math.max(0, Math.round((baseHeight - overlayHeight) / 2)) },
  };
  return map[position] || map['bottom-left'];
}

async function generateImageTextOnly({ prompt }) {
  const requestedSize = '1024x1024';
  const response = await openai.images.generate({
    model: config.openaiImageModel,
    prompt: String(prompt).trim(),
    size: requestedSize,
  });

  const first = response?.data?.[0];
  if (!first) {
    throw new Error('OpenAI image generation returned no data.');
  }
  const usage = normalizeUsage(response?.usage);
  const aspectRatio = sizeToAspectRatio(requestedSize);
  const commonMeta = {
    provider: 'openai',
    response_created: response?.created || null,
    revised_prompt: first?.revised_prompt || null,
    requested_size: requestedSize,
  };

  if (first.b64_json) {
    return {
      imageBytes: Buffer.from(first.b64_json, 'base64'),
      format: 'png',
      providerAssetUrl: '',
      model: config.openaiImageModel,
      usage,
      aspect_ratio: aspectRatio,
      meta: {
        ...commonMeta,
        source: 'b64_json',
      },
    };
  }

  if (first.url) {
    const remote = await fetch(first.url);
    if (!remote.ok) throw new Error(`Failed to download OpenAI image (${remote.status}).`);
    const arrayBuffer = await remote.arrayBuffer();
    return {
      imageBytes: Buffer.from(arrayBuffer),
      format: 'png',
      providerAssetUrl: first.url,
      model: config.openaiImageModel,
      usage,
      aspect_ratio: aspectRatio,
      meta: {
        ...commonMeta,
        source: 'url',
        provider_asset_url: first.url,
      },
    };
  }

  throw new Error('OpenAI image output not recognized.');
}

async function fetchImageAsOpenAIFile(url, { timeoutMs = 10000 } = {}) {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return null;

  let parsed;
  try {
    parsed = new URL(cleanUrl);
  } catch {
    console.warn('[openaiImageService] skipping invalid image URL', { url: cleanUrl });
    return null;
  }

  if (!/^https?:$/i.test(parsed.protocol)) {
    console.warn('[openaiImageService] skipping non-http image URL', { url: cleanUrl });
    return null;
  }
  if (isBlockedPrivateHost(parsed.hostname)) {
    console.warn('[openaiImageService] blocked private host URL', { url: cleanUrl, hostname: parsed.hostname });
    return null;
  }

  try {
    const headController = new AbortController();
    const headTimeoutId = setTimeout(() => headController.abort(), timeoutMs);
    let contentType = '';
    try {
      const headResponse = await fetch(parsed.toString(), { method: 'HEAD', signal: headController.signal });
      if (headResponse.ok) {
        const headTypeRaw = String(headResponse.headers.get('content-type') || '').trim().toLowerCase();
        contentType = headTypeRaw.split(';')[0] || '';
      }
    } catch {
      // continue to GET; not all endpoints allow HEAD
    } finally {
      clearTimeout(headTimeoutId);
    }

    const getController = new AbortController();
    const getTimeoutId = setTimeout(() => getController.abort(), timeoutMs);
    const response = await fetch(parsed.toString(), { signal: getController.signal });
    clearTimeout(getTimeoutId);
    if (!response.ok) {
      console.warn('[openaiImageService] skipping image fetch non-200', { url: cleanUrl, status: response.status });
      return null;
    }

    if (!contentType) {
      const getTypeRaw = String(response.headers.get('content-type') || '').trim().toLowerCase();
      contentType = getTypeRaw.split(';')[0] || '';
    }
    if (!contentType.startsWith('image/')) {
      console.warn('[openaiImageService] skipping non-image content-type', { url: cleanUrl, contentType: contentType || null });
      return null;
    }

    const bodyStream = response.body;
    if (!bodyStream) return null;

    const ext = contentType.split('/')[1] || 'jpg';
    const { toFile } = await import('openai');
    const file = await toFile(bodyStream, `input.${ext}`, { type: contentType });
    return { file, mimeType: contentType };
  } catch (error) {
    const isAbort = error?.name === 'AbortError';
    console.warn('[openaiImageService] image fetch failed', {
      url: cleanUrl,
      reason: isAbort ? 'timeout' : (error?.message || 'unknown'),
    });
    return null;
  }
}

async function fetchImageBytes(url, { timeoutMs = 10000 } = {}) {
  const cleanUrl = String(url || '').trim();
  if (!cleanUrl) return null;

  let parsed;
  try {
    parsed = new URL(cleanUrl);
  } catch {
    console.warn('[openaiImageService] logo overlay skipped invalid URL', { url: cleanUrl });
    return null;
  }

  if (!/^https?:$/i.test(parsed.protocol)) return null;
  if (isBlockedPrivateHost(parsed.hostname)) return null;

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(parsed.toString(), { signal: controller.signal });
    clearTimeout(timeoutId);
    if (!response.ok) return null;
    const contentType = String(response.headers.get('content-type') || '').trim().toLowerCase().split(';')[0];
    if (!contentType.startsWith('image/')) return null;
    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

async function overlayLogoWithSharp({ sceneBytes, logoBytes, logoPosition = 'top-right' }) {
  const sharpModule = await import('sharp');
  const sharp = sharpModule.default;

  const base = sharp(sceneBytes);
  const baseMeta = await base.metadata();
  const baseWidth = Number(baseMeta.width || 0);
  const baseHeight = Number(baseMeta.height || 0);
  if (!baseWidth || !baseHeight) return sceneBytes;

  const targetLogoWidth = Math.max(32, Math.round(baseWidth * 0.2));
  const padding = 20;
  const preparedLogo = await sharp(logoBytes)
    .flatten({ background: '#ffffff' })
    .resize({ width: targetLogoWidth, withoutEnlargement: true, fit: 'inside' })
    .png()
    .toBuffer();
  const logoMeta = await sharp(preparedLogo).metadata();
  const logoWidth = Number(logoMeta.width || targetLogoWidth);
  const logoHeight = Number(logoMeta.height || targetLogoWidth);

  const cleanPosition = normalizeLogoPosition(logoPosition);
  const coords = resolvePlacementCoords({
    baseWidth,
    baseHeight,
    overlayWidth: logoWidth,
    overlayHeight: logoHeight,
    position: cleanPosition,
    padding,
  });

  return base
    .composite([{ input: preparedLogo, top: coords.top, left: coords.left }])
    .png()
    .toBuffer();
}

async function createProductMask({ width, height, productArea }) {
  const sharpModule = await import('sharp');
  const sharp = sharpModule.default;
  const rect = await sharp({
    create: {
      width: productArea.width,
      height: productArea.height,
      channels: 4,
      background: { r: 255, g: 255, b: 255, alpha: 255 },
    },
  }).png().toBuffer();

  return sharp({
    create: {
      width,
      height,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 255 },
    },
  })
    .composite([{
      input: rect,
      left: productArea.x,
      top: productArea.y,
    }])
    .png()
    .toBuffer();
}

async function placeProductWithSharpFallback({ sceneBytes, productBytes, referencePosition = 'bottom-left' }) {
  const sharpModule = await import('sharp');
  const sharp = sharpModule.default;
  const base = sharp(sceneBytes);
  const baseMeta = await base.metadata();
  const baseWidth = Number(baseMeta.width || 0);
  const baseHeight = Number(baseMeta.height || 0);
  if (!baseWidth || !baseHeight) return sceneBytes;

  const targetWidth = Math.max(40, Math.round(baseWidth * 0.25));
  const preparedProduct = await sharp(productBytes)
    .resize({ width: targetWidth, withoutEnlargement: true, fit: 'inside' })
    .png()
    .toBuffer();
  const productMeta = await sharp(preparedProduct).metadata();
  const productWidth = Number(productMeta.width || targetWidth);
  const productHeight = Number(productMeta.height || targetWidth);
  const coords = resolvePlacementCoords({
    baseWidth,
    baseHeight,
    overlayWidth: productWidth,
    overlayHeight: productHeight,
    position: normalizeReferencePosition(referencePosition),
    padding: 20,
  });

  const shadowBuffer = await sharp({
    create: {
      width: productWidth,
      height: productHeight,
      channels: 4,
      background: { r: 0, g: 0, b: 0, alpha: 80 },
    },
  }).blur(10).png().toBuffer();

  return base
    .composite([
      { input: shadowBuffer, left: coords.left + 6, top: coords.top + 8, blend: 'multiply' },
      { input: preparedProduct, left: coords.left, top: coords.top, blend: 'over', opacity: 0.92 },
    ])
    .png()
    .toBuffer();
}

export async function generateImageWithOpenAI({
  prompt,
  logoUrl = null,
  referenceImageUrls = null,
  useLogo = true,
  logoPosition = 'top-right',
  referencePosition = 'bottom-left',
}) {
  if (!prompt || !String(prompt).trim()) {
    throw new Error('Prompt is required for OpenAI image generation.');
  }

  const cleanLogoUrl = String(logoUrl || '').trim();
  const cleanRefs = Array.isArray(referenceImageUrls)
    ? referenceImageUrls.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 2)
    : [];
  const orderedCandidates = [
    ...(cleanLogoUrl ? [{ kind: 'logo', url: cleanLogoUrl }] : []),
    ...cleanRefs.map((url) => ({ kind: 'ref', url })),
  ];

  const multimodalEnabled = isMultimodalEnabled();
  const shouldAttemptMultimodal = multimodalEnabled && orderedCandidates.length > 0;

  if (!shouldAttemptMultimodal) {
    return generateImageTextOnly({ prompt });
  }

  const startedAt = Date.now();
  const attempted = orderedCandidates.length;
  let fetched = 0;
  let skipped = 0;
  let fallbackUsed = false;
  let logoOverlaid = false;
  const logoPositionUsed = normalizeLogoPosition(logoPosition);
  const referencePositionUsed = normalizeReferencePosition(referencePosition);
  let productInpainted = false;
  let productInpaintFailedReason = null;
  let productFallbackUsed = 'none';

  try {
    const resolvedInputs = [];
    for (const item of orderedCandidates) {
      try {
        const resolved = await fetchImageAsOpenAIFile(item.url);
        if (resolved?.file) {
          resolvedInputs.push(resolved);
          fetched += 1;
        } else {
          skipped += 1;
        }
      } catch {
        skipped += 1;
      }
    }

    if (resolvedInputs.length === 0) {
      fallbackUsed = true;
      return await generateImageTextOnly({ prompt });
    }

    console.log('[openaiImageService] Using multimodal input with X images', resolvedInputs.length);

    const multimodalPrompt = [
      String(prompt).trim(),
      'The reference panel shows: leftmost image is the brand logo, remaining images are visual style references.',
      'Match their color palette, mood, lighting, and cultural aesthetic in the generated scene.',
    ].join('\n\n');

    const imageFiles = resolvedInputs.map((item) => item.file).filter(Boolean);
    const response = await openai.images.edit({
      model: config.openaiImageModel,
      image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
      prompt: multimodalPrompt,
      n: 1,
      size: '1024x1024',
    });
    console.log('[openaiImageService] Raw OpenAI response:', JSON.stringify(response, null, 2));

    const imageBase64 = String(response?.data?.[0]?.b64_json || '').trim();
    if (!imageBase64) {
      throw new Error('No image in OpenAI response');
    }
    let finalImageBytes = Buffer.from(imageBase64, 'base64');

    const productRefUrl = cleanRefs[0] || '';
    if (productRefUrl) {
      try {
        const sceneFile = await (await import('openai')).toFile(finalImageBytes, 'scene.png', { type: 'image/png' });
        const productRef = await fetchImageAsOpenAIFile(productRefUrl);
        if (productRef?.file) {
          const sharpModule = await import('sharp');
          const sharp = sharpModule.default;
          const sceneMeta = await sharp(finalImageBytes).metadata();
          const sceneWidth = Number(sceneMeta.width || 1024);
          const sceneHeight = Number(sceneMeta.height || 1024);
          const areaSize = Math.max(120, Math.round(sceneWidth * 0.27));
          const areaCoords = resolvePlacementCoords({
            baseWidth: sceneWidth,
            baseHeight: sceneHeight,
            overlayWidth: areaSize,
            overlayHeight: areaSize,
            position: referencePositionUsed,
            padding: 20,
          });
          const maskBuffer = await createProductMask({
            width: sceneWidth,
            height: sceneHeight,
            productArea: {
              x: areaCoords.left,
              y: areaCoords.top,
              width: areaSize,
              height: areaSize,
            },
          });
          const maskFile = await (await import('openai')).toFile(maskBuffer, 'mask.png', { type: 'image/png' });

          const inpaintResponse = await openai.images.edit({
            model: config.openaiImageModel,
            image: [sceneFile, productRef.file],
            mask: maskFile,
            prompt: 'Place this product naturally in the scene. Keep product geometry, branding, and colors as close as possible to reference. Place it naturally with matching lighting.',
            n: 1,
            size: '1024x1024',
          });
          const inpaintB64 = String(inpaintResponse?.data?.[0]?.b64_json || '').trim();
          if (inpaintB64) {
            finalImageBytes = Buffer.from(inpaintB64, 'base64');
            productInpainted = true;
            productFallbackUsed = 'inpaint';
          } else {
            throw new Error('Inpaint response missing image output');
          }
        }
      } catch (inpaintError) {
        productInpaintFailedReason = String(inpaintError?.message || 'inpaint_failed');
        try {
          const productBytes = await fetchImageBytes(productRefUrl);
          if (productBytes) {
            finalImageBytes = await placeProductWithSharpFallback({
              sceneBytes: finalImageBytes,
              productBytes,
              referencePosition: referencePositionUsed,
            });
            productFallbackUsed = 'direct_paste';
          }
        } catch (pasteError) {
          if (!productInpaintFailedReason) {
            productInpaintFailedReason = String(pasteError?.message || 'direct_paste_failed');
          }
        }
      }
    }

    if (Boolean(useLogo) && cleanLogoUrl) {
      try {
        const logoBytes = await fetchImageBytes(cleanLogoUrl);
        if (logoBytes) {
          finalImageBytes = await overlayLogoWithSharp({
            sceneBytes: finalImageBytes,
            logoBytes,
            logoPosition: logoPositionUsed,
          });
          logoOverlaid = true;
        }
      } catch (overlayError) {
        console.warn('[openaiImageService] logo overlay skipped', { message: overlayError?.message || 'unknown' });
      }
    }

    return {
      imageBytes: finalImageBytes,
      format: 'png',
      providerAssetUrl: '',
      model: config.openaiImageModel,
      usage: normalizeUsage(response?.usage),
      aspect_ratio: null,
      meta: {
        provider: 'openai',
        source: 'images_edit_multimodal_base64',
        multimodal: true,
        logo_overlaid: logoOverlaid,
        logo_position_used: logoPositionUsed,
        product_inpainted: productInpainted,
        product_inpaint_failed_reason: productInpaintFailedReason,
        product_fallback_used: productFallbackUsed,
        reference_position_used: referencePositionUsed,
      },
    };
  } catch (error) {
    console.error('[openaiImageService] Multimodal failed, reason:', error?.message || error);
    console.error('[openaiImageService] Stack:', error?.stack || null);
    fallbackUsed = true;
    try {
      return await generateImageTextOnly({ prompt });
    } catch (fallbackError) {
      throw fallbackError;
    }
  } finally {
    const latencyMs = Date.now() - startedAt;
    console.log('[openaiImageService] multimodal metrics', {
      attempted,
      fetched,
      skipped,
      fallback_used: fallbackUsed,
      latency_ms: latencyMs,
      logo_overlaid: logoOverlaid,
      logo_position_used: logoPositionUsed,
      product_inpainted: productInpainted,
      product_inpaint_failed_reason: productInpaintFailedReason,
      product_fallback_used: productFallbackUsed,
      reference_position_used: referencePositionUsed,
    });
  }
}
