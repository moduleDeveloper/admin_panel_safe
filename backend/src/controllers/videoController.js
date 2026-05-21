import { config } from '../config/config.js';
import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import { generateNarrationScript } from '../services/scriptGenerationService.js';
import { generateScenePlanFromScript } from '../services/scenePlanService.js';
import { getPromptTemplate, renderPromptTemplate } from '../services/promptTemplateService.js';
import { generateSceneImage } from '../services/providers/videoProvider.js';
import { generateVoiceoverAudio } from '../services/providers/voiceProvider.js';
import { renderMixedScenesWithVoiceover } from '../services/renderService.js';
import { generateImageToVideoWithFal } from '../services/falService.js';
import {
  uploadFinalVideoToBucket,
  uploadProjectInputImageToBucket,
  uploadSceneClipToBucket,
  uploadSceneImageToBucket,
  uploadVoiceoverToBucket,
} from '../services/storageService.js';
import { badRequest, countWords, estimateDurationSec } from '../utils/helpers.js';

const ALLOWED_LANGUAGES = new Set(['Hindi', 'English', 'Hinglish']);
const ALLOWED_STYLES = new Set(['Energetic', 'Storytelling', 'News anchor', 'Casual']);
const MIN_DURATION_SEC = 5;
const MAX_DURATION_SEC = 30;

function resolveDurationSec(durationSecRaw, durationTextRaw) {
  const parsed = Number(durationSecRaw);
  if (Number.isFinite(parsed)) {
    if (parsed < MIN_DURATION_SEC || parsed > MAX_DURATION_SEC) return null;
    return Math.round(parsed);
  }
  const durationText = String(durationTextRaw || '').trim();
  const match = durationText.match(/^(\d+)\s*sec$/i);
  if (match) {
    const fromText = Number(match[1]);
    if (Number.isFinite(fromText) && fromText >= MIN_DURATION_SEC && fromText <= MAX_DURATION_SEC) {
      return Math.round(fromText);
    }
  }
  return null;
}

function debugPayload(error) {
  return {
    name: error?.name || null,
    message: error?.message || null,
    stack: error?.stack || null,
  };
}

function extractSceneNumberFromStoragePath(storagePath) {
  const match = String(storagePath || '').match(/scene-(\d+)\.(png|jpg|mp4)$/i);
  if (!match) return null;
  const sceneNo = Number(match[1]);
  if (!Number.isFinite(sceneNo) || sceneNo < 1) return null;
  return sceneNo;
}

function extractSceneNumberFromAsset(asset) {
  const fromMeta = Number(asset?.meta?.scene_number || 0);
  if (Number.isFinite(fromMeta) && fromMeta > 0) return Math.floor(fromMeta);
  return extractSceneNumberFromStoragePath(asset?.storage_path);
}

function normalizeAssetStatus(statusValue) {
  return String(statusValue || '').trim().toLowerCase();
}

function isMotionAssetType(typeValue) {
  const t = String(typeValue || '').trim().toLowerCase();
  return t === 'scene_clip' || t === 'scene_motion';
}

function pickLatestPreferredAsset(rows = []) {
  const list = Array.isArray(rows) ? rows : [];
  if (!list.length) return null;

  const byPreference = (status) => {
    const normalized = normalizeAssetStatus(status);
    if (normalized === 'pending') return 0;
    if (normalized === 'approved') return 1;
    return 2;
  };

  return [...list].sort((a, b) => {
    const prefDiff = byPreference(a?.status) - byPreference(b?.status);
    if (prefDiff !== 0) return prefDiff;
    const ta = new Date(a?.created_at || 0).getTime();
    const tb = new Date(b?.created_at || 0).getTime();
    return tb - ta;
  })[0] || null;
}

function isMissingStatusColumnError(error) {
  const message = String(error?.message || '').toLowerCase();
  return message.includes('status') && message.includes('video_assets');
}

async function updateSceneImageStatusByIds(assetIds, statusValue) {
  const cleanIds = Array.isArray(assetIds) ? assetIds.filter(Boolean) : [];
  if (!cleanIds.length) return true;
  const { error } = await supabaseAdmin
    .from('video_assets')
    .update({ status: statusValue })
    .in('id', cleanIds);
  if (!error) return true;
  if (isMissingStatusColumnError(error)) return false;
  throw new Error(error.message || 'Failed to update scene image status.');
}

async function updateVideoAssetStatusByIds(assetIds, statusValue) {
  const cleanIds = Array.isArray(assetIds) ? assetIds.filter(Boolean) : [];
  if (!cleanIds.length) return true;
  const { error } = await supabaseAdmin
    .from('video_assets')
    .update({ status: statusValue })
    .in('id', cleanIds);
  if (!error) return true;
  if (isMissingStatusColumnError(error)) return false;
  throw new Error(error.message || 'Failed to update asset status.');
}

function splitNarrationIntoChunks(scriptText, sceneCount) {
  const count = Math.max(1, Number(sceneCount || 1));
  const sentences = String(scriptText || '')
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!sentences.length) return Array.from({ length: count }).map((_v, index) => `Scene ${index + 1}`);
  const chunkSize = Math.max(1, Math.ceil(sentences.length / count));
  const chunks = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    chunks.push(sentences.slice(i, i + chunkSize).join(' '));
  }
  while (chunks.length < count) chunks.push(chunks[chunks.length - 1] || '');
  return chunks.slice(0, count);
}

function buildSceneTimings(sceneCount, totalDurationSec) {
  const count = Math.max(1, Number(sceneCount || 1));
  const total = Math.max(1, Math.round(Number(totalDurationSec || 30)));
  const base = Math.floor(total / count);
  let remainder = total % count;
  let cursor = 0;
  return Array.from({ length: count }).map((_v, index) => {
    const duration = base + (remainder > 0 ? 1 : 0);
    if (remainder > 0) remainder -= 1;
    const startSec = cursor;
    const endSec = startSec + duration;
    cursor = endSec;
    return {
      scene_number: index + 1,
      start_sec: startSec,
      end_sec: endSec,
      duration_sec: duration,
    };
  });
}

function isRenderableClipUrl(url) {
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
  );
}

function toFiniteNumberOrNull(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function safeJsonObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value;
}

function normalizeProjectStatusForDb(statusValue) {
  const raw = String(statusValue || '').trim().toLowerCase();
  if (!raw) return '';

  const directAllowed = new Set([
    'draft',
    'script_generated',
    'script_approved',
    'voiceover_ready',
    'scenes_in_progress',
    'scenes_approved',
    'processing',
    'completed',
    'failed',
  ]);
  if (directAllowed.has(raw)) return raw;

  // Backward/forward compatibility mapping for UI workflow statuses.
  if (raw === 'idea_draft') return 'draft';
  if (raw === 'voiceover_generated') return 'voiceover_ready';
  if (raw === 'scene_script_generated') return 'scenes_in_progress';
  if (raw === 'scene_script_approved') return 'scenes_in_progress';
  if (raw === 'image_generation_in_progress') return 'scenes_in_progress';
  if (raw === 'scene_images_approved') return 'scenes_approved';
  if (raw === 'image_generation_approved') return 'scenes_approved';
  if (raw === 'motion_generation_in_progress') return 'processing';
  if (raw === 'motion_generation_approved') return 'processing';
  if (raw === 'final_render_in_progress') return 'processing';
  if (raw === 'final_rendered') return 'completed';
  if (raw === 'final_ready') return 'completed';

  return raw;
}

function isUuidLike(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(value || '').trim());
}

async function fetchArrayBufferWithTimeout(url, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs || 30000)));
  try {
    const response = await fetch(String(url || '').trim(), { signal: controller.signal });
    const arrayBuffer = await response.arrayBuffer();
    return { response, arrayBuffer };
  } catch (error) {
    if (error?.name === 'AbortError') {
      throw new Error(`Clip download timed out after ${timeoutMs}ms.`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function runCommand(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';
    proc.stdout.on('data', (chunk) => { stdout += String(chunk || ''); });
    proc.stderr.on('data', (chunk) => { stderr += String(chunk || ''); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      return reject(new Error(`ffmpeg failed (${code}): ${stderr || stdout}`));
    });
  });
}

async function overlayLogoOnImageBytes({ imageBytes, logoBytes }) {
  const ffmpegBin = String((config.ffmpegPath && config.ffmpegPath !== 'ffmpeg')
    ? config.ffmpegPath
    : (ffmpegStatic || 'ffmpeg')).trim();
  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'scene-logo-overlay-'));
  const basePath = path.join(workDir, 'base.png');
  const logoPath = path.join(workDir, 'logo.png');
  const outPath = path.join(workDir, 'out.png');
  try {
    await fs.writeFile(basePath, imageBytes);
    await fs.writeFile(logoPath, logoBytes);
    await runCommand(ffmpegBin, [
      '-y',
      '-i', basePath,
      '-i', logoPath,
      '-filter_complex',
      "[1:v][0:v]scale2ref=w='min(iw*0.18,220)':h=-1[logo][base];[base][logo]overlay=W-w-24:H-h-24:format=auto",
      '-frames:v', '1',
      outPath,
    ]);
    return await fs.readFile(outPath);
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

async function probeRemoteFileSizeBytes(url) {
  const target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) return null;
  try {
    const headRes = await fetch(target, { method: 'HEAD' });
    if (headRes.ok) {
      const len = Number(headRes.headers.get('content-length') || 0);
      if (Number.isFinite(len) && len > 0) return len;
    }
  } catch {
    // no-op
  }
  try {
    const getRes = await fetch(target, { method: 'GET' });
    if (getRes.ok) {
      const len = Number(getRes.headers.get('content-length') || 0);
      if (Number.isFinite(len) && len > 0) return len;
      const arr = await getRes.arrayBuffer();
      const bytes = Number(arr?.byteLength || 0);
      return Number.isFinite(bytes) && bytes > 0 ? bytes : null;
    }
  } catch {
    // no-op
  }
  return null;
}

async function updateVideoAssetMeta({ assetId, patch = {} }) {
  if (!assetId) return;
  const payload = {};
  Object.entries(patch).forEach(([key, value]) => {
    if (value !== undefined) payload[key] = value;
  });
  if (!Object.keys(payload).length) return;
  const { error } = await supabaseAdmin
    .from('video_assets')
    .update(payload)
    .eq('id', assetId);
  if (error) {
    // eslint-disable-next-line no-console
    console.warn('[video_assets] metadata update skipped', { assetId, message: error.message || 'unknown' });
  }
}

async function buildProjectAssetUsage(projectId) {
  const { data: rows, error } = await supabaseAdmin
    .from('video_assets')
    .select('id, type, file_url, storage_path, provider, model, input_tokens, output_tokens, total_tokens, file_size_bytes, aspect_ratio, duration_sec, meta, status, created_at')
    .eq('project_id', projectId)
    .order('created_at', { ascending: true });
  if (error) throw new Error(error.message || 'Failed to load project asset usage.');
  const assets = Array.isArray(rows) ? rows : [];
  const usage = assets.reduce((acc, item) => {
    const input = Number(item?.input_tokens || 0);
    const output = Number(item?.output_tokens || 0);
    const total = Number(item?.total_tokens || (input + output) || 0);
    const size = Number(item?.file_size_bytes || 0);
    acc.total_input_tokens += Number.isFinite(input) ? input : 0;
    acc.total_output_tokens += Number.isFinite(output) ? output : 0;
    acc.total_tokens += Number.isFinite(total) ? total : 0;
    acc.total_file_size_bytes += Number.isFinite(size) ? size : 0;
    return acc;
  }, {
    total_input_tokens: 0,
    total_output_tokens: 0,
    total_tokens: 0,
    total_file_size_bytes: 0,
  });
  return { assets, usage };
}

async function upsertVideoSummary({
  videoAssetId,
  totalInputTokens = 0,
  totalOutputTokens = 0,
  finalVideoBytes = 0,
  aspectRatio = null,
}) {
  if (!videoAssetId) return null;
  const { data: existing, error: existingError } = await supabaseAdmin
    .from('videos')
    .select('id')
    .eq('video_asset_id', videoAssetId)
    .maybeSingle();
  if (existingError) {
    // eslint-disable-next-line no-console
    console.warn('[videos] lookup skipped', { message: existingError.message || 'unknown' });
    return null;
  }
  const payload = {
    video_asset_id: videoAssetId,
    total_input_tokens: Number(totalInputTokens || 0),
    total_output_tokens: Number(totalOutputTokens || 0),
    final_video_bytes: Number(finalVideoBytes || 0),
    aspect_ratio: aspectRatio || null,
    updated_at: new Date().toISOString(),
  };
  if (existing?.id) {
    const { data: updated, error: updateError } = await supabaseAdmin
      .from('videos')
      .update(payload)
      .eq('id', existing.id)
      .select('*')
      .maybeSingle();
    if (updateError) {
      // eslint-disable-next-line no-console
      console.warn('[videos] update skipped', { message: updateError.message || 'unknown' });
      return null;
    }
    return updated || null;
  }
  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('videos')
    .insert([payload])
    .select('*')
    .maybeSingle();
  if (insertError) {
    // eslint-disable-next-line no-console
    console.warn('[videos] insert skipped', { message: insertError.message || 'unknown' });
    return null;
  }
  return inserted || null;
}

function parseDataUrlImage(input) {
  const dataUrl = String(input?.dataUrl || '').trim();
  if (!dataUrl.startsWith('data:image/')) {
    // eslint-disable-next-line no-console
    console.warn('[video][inputs] skipped non-image dataUrl', { name: input?.name || null, type: input?.type || null });
    return null;
  }
  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/i);
  if (!match) {
    // eslint-disable-next-line no-console
    console.warn('[video][inputs] failed dataUrl regex', { name: input?.name || null, type: input?.type || null });
    return null;
  }
  const rawMime = String(match[1] || '').toLowerCase();
  const mimeType = rawMime === 'image/jpg' || rawMime === 'image/jfif' || rawMime === 'image/pjpeg'
    ? 'image/jpeg'
    : rawMime;
  const base64 = match[2];
  try {
    const bytes = Buffer.from(base64, 'base64');
    if (!bytes.length) {
      // eslint-disable-next-line no-console
      console.warn('[video][inputs] empty decoded bytes', { name: input?.name || null, mimeType });
      return null;
    }
    return { bytes, mimeType };
  } catch {
    // eslint-disable-next-line no-console
    console.warn('[video][inputs] base64 decode failed', { name: input?.name || null, mimeType });
    return null;
  }
}

async function uploadProjectInputAssets({
  trustId,
  projectId,
  referenceImages,
  logoImage,
}) {
  const refs = Array.isArray(referenceImages) ? referenceImages : [];
  // eslint-disable-next-line no-console
  console.log('[video][inputs] upload start', {
    projectId,
    trustId,
    referenceCount: refs.length,
    hasLogo: Boolean(logoImage?.dataUrl),
  });
  const uploadedRefs = [];

  for (let i = 0; i < refs.length; i += 1) {
    const raw = refs[i] || {};
    const parsed = parseDataUrlImage(raw);
    if (!parsed) {
      // eslint-disable-next-line no-console
      console.warn('[video][inputs] reference skipped after parse', { index: i, name: raw?.name || null, type: raw?.type || null });
      continue;
    }
    const uploaded = await uploadProjectInputImageToBucket({
      trustId,
      projectId,
      bytes: parsed.bytes,
      contentType: parsed.mimeType,
      role: 'reference',
      originalName: String(raw.name || ''),
      index: i,
    });
    uploadedRefs.push({
      name: String(raw.name || `reference-${i + 1}`),
      file_url: uploaded.fileUrl,
      storage_path: uploaded.storagePath,
      content_type: parsed.mimeType,
    });
    // eslint-disable-next-line no-console
    console.log('[video][inputs] reference uploaded', { index: i, name: raw?.name || null, storagePath: uploaded.storagePath });
  }

  let uploadedLogo = null;
  const parsedLogo = parseDataUrlImage(logoImage || {});
  if (parsedLogo) {
    const uploaded = await uploadProjectInputImageToBucket({
      trustId,
      projectId,
      bytes: parsedLogo.bytes,
      contentType: parsedLogo.mimeType,
      role: 'logo',
      originalName: String(logoImage?.name || ''),
    });
    uploadedLogo = {
      name: String(logoImage?.name || 'logo'),
      file_url: uploaded.fileUrl,
      storage_path: uploaded.storagePath,
      content_type: parsedLogo.mimeType,
    };
    // eslint-disable-next-line no-console
    console.log('[video][inputs] logo uploaded', { name: logoImage?.name || null, storagePath: uploaded.storagePath });
  } else if (logoImage) {
    // eslint-disable-next-line no-console
    console.warn('[video][inputs] logo present but parse failed', { name: logoImage?.name || null, type: logoImage?.type || null });
  }

  // eslint-disable-next-line no-console
  console.log('[video][inputs] upload done', {
    projectId,
    uploadedReferenceCount: uploadedRefs.length,
    logoUploaded: Boolean(uploadedLogo),
  });
  return { uploadedRefs, uploadedLogo };
}

async function upsertSceneClipAssetRow({
  projectId,
  sceneNumber,
  fileUrl,
  storagePath,
  provider,
  model,
  inputTokens,
  outputTokens,
  fileSizeBytes,
  aspectRatio,
  durationSec,
  meta,
}) {
  const { data: sameTypeRows, error: sameTypeError } = await supabaseAdmin
    .from('video_assets')
    .select('id, storage_path, meta, created_at')
    .eq('project_id', projectId)
    .in('type', ['scene_clip', 'scene_motion'])
    .order('created_at', { ascending: false });

  if (sameTypeError) throw new Error(sameTypeError.message || 'Failed to lookup scene clip asset.');

  const sceneNo = Number(sceneNumber || 0);
  const sameSceneRows = (Array.isArray(sameTypeRows) ? sameTypeRows : [])
    .filter((item) => extractSceneNumberFromAsset(item) === sceneNo);
  await updateVideoAssetStatusByIds(sameSceneRows.map((item) => item.id), 'rejected');

  const baseInsertPayload = {
    project_id: projectId,
    type: 'scene_clip',
    file_url: typeof fileUrl === 'string' ? fileUrl : '',
    storage_path: storagePath || '',
    provider: provider || null,
    model: model || null,
    input_tokens: toFiniteNumberOrNull(inputTokens),
    output_tokens: toFiniteNumberOrNull(outputTokens),
    file_size_bytes: toFiniteNumberOrNull(fileSizeBytes),
    aspect_ratio: aspectRatio || null,
    duration_sec: toFiniteNumberOrNull(durationSec),
    meta: safeJsonObject({
      ...safeJsonObject(meta),
      scene_number: sceneNo > 0 ? sceneNo : undefined,
    }),
  };

  let inserted = null;
  let insertError = null;
  ({ data: inserted, error: insertError } = await supabaseAdmin
    .from('video_assets')
    .insert([{ ...baseInsertPayload, status: 'pending' }])
    .select('*')
    .single());

  if (insertError && isMissingStatusColumnError(insertError)) {
    ({ data: inserted, error: insertError } = await supabaseAdmin
      .from('video_assets')
      .insert([baseInsertPayload])
      .select('*')
      .single());
  }

  if (insertError) throw new Error(insertError.message || 'Failed to insert scene clip asset.');
  return inserted;
}

export async function generateScriptHandler(req, res) {
  try {
    const { topic, prompt_style, custom_prompt, duration, duration_sec, language } = req.body || {};

    if (!topic || !String(topic).trim()) return badRequest(res, 'topic is required.');
    if (!ALLOWED_STYLES.has(prompt_style)) return badRequest(res, 'Invalid prompt_style.');
    if (!ALLOWED_LANGUAGES.has(language)) return badRequest(res, 'Invalid language.');
    const resolvedDurationSec = resolveDurationSec(duration_sec, duration);
    if (!resolvedDurationSec) return badRequest(res, `Invalid duration_sec. Allowed ${MIN_DURATION_SEC}-${MAX_DURATION_SEC}.`);

    const script_text = await generateNarrationScript({
      topic: String(topic).trim(),
      promptStyle: prompt_style,
      customPrompt: String(custom_prompt || '').trim(),
      durationSec: resolvedDurationSec,
      language,
      model: config.openaiModel,
    });

    const word_count = countWords(script_text);
    const estimated_duration = estimateDurationSec(word_count);

    return res.json({ script_text, word_count, estimated_duration });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to generate script.' });
  }
}

export async function saveScriptHandler(req, res) {
  try {
    const {
      project_id,
      trust_id,
      user_id,
      topic,
      prompt_style,
      custom_prompt,
      duration,
      duration_sec,
      language,
      script_text,
      reference_images,
      logo_image,
      reject_previous_latest,
    } = req.body || {};
    // eslint-disable-next-line no-console
    console.log('[video][save-script] request received', {
      project_id: project_id || null,
      trust_id: trust_id || null,
      reference_count: Array.isArray(reference_images) ? reference_images.length : 0,
      has_logo: Boolean(logo_image?.dataUrl),
    });

    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');
    if (!script_text || !String(script_text).trim()) return badRequest(res, 'script_text is required.');

    const cleanTrustId = String(trust_id).trim();
    const cleanScript = String(script_text).trim();

    if (!project_id) {
      if (!topic || !String(topic).trim()) return badRequest(res, 'topic is required.');
      if (!ALLOWED_STYLES.has(prompt_style)) return badRequest(res, 'Invalid prompt_style.');
      if (!ALLOWED_LANGUAGES.has(language)) return badRequest(res, 'Invalid language.');
      const resolvedDurationSec = resolveDurationSec(duration_sec, duration);
      if (!resolvedDurationSec) return badRequest(res, `Invalid duration_sec. Allowed ${MIN_DURATION_SEC}-${MAX_DURATION_SEC}.`);

      const { data: project, error: projectError } = await supabaseAdmin
        .from('video_projects')
        .insert([{
          trust_id: cleanTrustId,
          user_id: user_id ? String(user_id) : null,
          title: String(topic).trim().slice(0, 120),
          topic: String(topic).trim(),
          duration: `${resolvedDurationSec} sec`,
          language,
          prompt_style,
          custom_prompt: custom_prompt ? String(custom_prompt).trim() : null,
          status: 'script_generated',
        }])
        .select('*')
        .single();

      if (projectError) return res.status(500).json({ error: projectError.message });

      const { uploadedRefs, uploadedLogo } = await uploadProjectInputAssets({
        trustId: cleanTrustId,
        projectId: project.id,
        referenceImages: reference_images,
        logoImage: logo_image,
      });

      const { data: projectWithInputs, error: inputUpdateError } = await supabaseAdmin
        .from('video_projects')
        .update({
          logo_url: uploadedLogo?.file_url || null,
          logo_storage_path: uploadedLogo?.storage_path || null,
          reference_images: uploadedRefs,
        })
        .eq('id', project.id)
        .select('*')
        .single();
      if (inputUpdateError) return res.status(500).json({ error: inputUpdateError.message });

      const word_count = countWords(cleanScript);
      const estimated_duration = estimateDurationSec(word_count);

      const { data: script, error: scriptError } = await supabaseAdmin
        .from('video_scripts')
        .insert([{
          project_id: project.id,
          script_text: cleanScript,
          word_count,
          estimated_duration,
          version: 1,
          Status: 'pending',
        }])
        .select('*')
        .single();

      if (scriptError) return res.status(500).json({ error: scriptError.message });
      return res.json({ project: projectWithInputs, script });
    }

    const { data: project, error: findError } = await supabaseAdmin
      .from('video_projects')
      .select('id, trust_id')
      .eq('id', project_id)
      .eq('trust_id', cleanTrustId)
      .single();

    if (findError || !project) {
      return res.status(404).json({ error: 'Project not found for this trust.' });
    }

    const shouldUpdateInputs = Array.isArray(reference_images) || (logo_image && typeof logo_image === 'object');
    const shouldUpdateProjectMeta = Boolean(
      String(topic || '').trim()
      || String(prompt_style || '').trim()
      || String(custom_prompt || '').trim()
      || String(duration || '').trim()
      || Number.isFinite(Number(duration_sec))
      || String(language || '').trim(),
    );

    if (shouldUpdateProjectMeta) {
      const updateMeta = {};
      const cleanTopic = String(topic || '').trim();
      if (cleanTopic) {
        updateMeta.topic = cleanTopic;
        updateMeta.title = cleanTopic.slice(0, 120);
      }
      const cleanPromptStyle = String(prompt_style || '').trim();
      if (cleanPromptStyle) {
        if (!ALLOWED_STYLES.has(cleanPromptStyle)) return badRequest(res, 'Invalid prompt_style.');
        updateMeta.prompt_style = cleanPromptStyle;
      }
      const cleanLanguage = String(language || '').trim();
      if (cleanLanguage) {
        if (!ALLOWED_LANGUAGES.has(cleanLanguage)) return badRequest(res, 'Invalid language.');
        updateMeta.language = cleanLanguage;
      }
      if (custom_prompt !== undefined) {
        updateMeta.custom_prompt = String(custom_prompt || '').trim() || null;
      }
      if (duration !== undefined || duration_sec !== undefined) {
        const resolvedDurationSec = resolveDurationSec(duration_sec, duration);
        if (!resolvedDurationSec) return badRequest(res, `Invalid duration_sec. Allowed ${MIN_DURATION_SEC}-${MAX_DURATION_SEC}.`);
        updateMeta.duration = `${resolvedDurationSec} sec`;
      }

      if (Object.keys(updateMeta).length > 0) {
        const { error: projectUpdateError } = await supabaseAdmin
          .from('video_projects')
          .update(updateMeta)
          .eq('id', String(project_id).trim())
          .eq('trust_id', cleanTrustId);
        if (projectUpdateError) return res.status(500).json({ error: projectUpdateError.message });
      }
    }

    if (shouldUpdateInputs) {
      const { uploadedRefs, uploadedLogo } = await uploadProjectInputAssets({
        trustId: cleanTrustId,
        projectId: String(project_id).trim(),
        referenceImages: reference_images,
        logoImage: logo_image,
      });
      const updatePayload = {
        reference_images: uploadedRefs,
      };
      if (uploadedLogo) {
        updatePayload.logo_url = uploadedLogo.file_url;
        updatePayload.logo_storage_path = uploadedLogo.storage_path;
      }
      const { error: inputUpdateError } = await supabaseAdmin
        .from('video_projects')
        .update(updatePayload)
        .eq('id', String(project_id).trim())
        .eq('trust_id', cleanTrustId);
      if (inputUpdateError) return res.status(500).json({ error: inputUpdateError.message });
    }

    const { data: latest, error: latestError } = await supabaseAdmin
      .from('video_scripts')
      .select('id, version, Status')
      .eq('project_id', project_id)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestError) return res.status(500).json({ error: latestError.message });

    let rejectedPrevious = false;
    if (Boolean(reject_previous_latest) && latest?.id) {
      const { error: rejectError } = await supabaseAdmin
        .from('video_scripts')
        .update({ Status: 'rejected' })
        .eq('id', latest.id)
        .eq('project_id', project_id);
      if (rejectError) return res.status(500).json({ error: rejectError.message || 'Failed to reject previous script.' });
      rejectedPrevious = true;
    }

    const version = Number(latest?.version || 0) + 1;
    const word_count = countWords(cleanScript);
    const estimated_duration = estimateDurationSec(word_count);

    const { data: script, error: scriptError } = await supabaseAdmin
      .from('video_scripts')
      .insert([{
        project_id,
        script_text: cleanScript,
        word_count,
        estimated_duration,
        version,
        Status: 'pending',
      }])
      .select('*')
      .single();

    if (scriptError) {
      if (rejectedPrevious && latest?.id) {
        await supabaseAdmin
          .from('video_scripts')
          .update({ Status: latest?.Status || null })
          .eq('id', latest.id)
          .eq('project_id', project_id);
      }
      return res.status(500).json({ error: scriptError.message });
    }

    return res.json({ project_id, script });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[video][save-script] failed', {
      message: error?.message || 'unknown',
      stack: error?.stack || null,
    });
    return res.status(500).json({ error: error.message || 'Failed to save script.' });
  }
}

export async function approveScriptHandler(req, res) {
  try {
    const { project_id, trust_id } = req.body || {};

    if (!project_id || !String(project_id).trim()) return badRequest(res, 'project_id is required.');
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');

    const cleanProjectId = String(project_id).trim();
    const cleanTrustId = String(trust_id).trim();

    const { data: latestScript, error: latestScriptError } = await supabaseAdmin
      .from('video_scripts')
      .select('id, version, script_text')
      .eq('project_id', cleanProjectId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestScriptError) return res.status(500).json({ error: latestScriptError.message });
    if (!latestScript?.id || !String(latestScript?.script_text || '').trim()) {
      return res.status(400).json({ error: 'No latest script found to approve.' });
    }

    const { data, error } = await supabaseAdmin
      .from('video_projects')
      .update({ status: 'script_approved' })
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId)
      .select('*')
      .single();

    if (error) return res.status(500).json({ error: error.message });

    const { error: statusError } = await supabaseAdmin
      .from('video_scripts')
      .update({ Status: 'approved' })
      .eq('id', latestScript.id)
      .eq('project_id', cleanProjectId);
    if (statusError) return res.status(500).json({ error: statusError.message || 'Failed to approve latest script.' });

    return res.json({ project: data });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to approve script.' });
  }
}

export async function generateVoiceoverHandler(req, res) {
  try {
    const { project_id, trust_id } = req.body || {};

    if (!project_id || !String(project_id).trim()) return badRequest(res, 'project_id is required.');
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');

    const cleanProjectId = String(project_id).trim();
    const cleanTrustId = String(trust_id).trim();

    const { data: project, error: projectError } = await supabaseAdmin
      .from('video_projects')
      .select('id, trust_id, status')
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId)
      .single();

    if (projectError || !project) return res.status(404).json({ error: 'Project not found for this trust.' });

    const { data: scriptRow, error: scriptError } = await supabaseAdmin
      .from('video_scripts')
      .select('script_text, version, Status')
      .eq('project_id', cleanProjectId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (scriptError) return res.status(500).json({ error: scriptError.message });
    if (!scriptRow?.script_text) return res.status(400).json({ error: 'No script found for this project.' });
    if (String(scriptRow?.Status || '').trim().toLowerCase() !== 'approved') {
      return res.status(400).json({ error: 'Latest script is not approved. Please approve script before generating voiceover.' });
    }

    const voiceResult = await generateVoiceoverAudio({ text: scriptRow.script_text });
    const mp3Bytes = voiceResult.audioBytes;
    const { fileUrl, storagePath } = await uploadVoiceoverToBucket({
      trustId: cleanTrustId,
      projectId: cleanProjectId,
      bytes: mp3Bytes,
    });

    await supabaseAdmin
      .from('video_assets')
      .update({ status: 'rejected' })
      .eq('project_id', cleanProjectId)
      .eq('type', 'voiceover')
      .eq('status', 'approved');

    const { data: asset, error: assetError } = await supabaseAdmin
      .from('video_assets')
      .insert([{
        project_id: cleanProjectId,
        type: 'voiceover',
        file_url: fileUrl,
        storage_path: storagePath,
        status: 'approved',
        provider: voiceResult.provider || config.voiceProvider || 'fal',
        model: voiceResult.model || config.falVoiceModel || null,
        input_tokens: toFiniteNumberOrNull(voiceResult.inputTokens),
        output_tokens: toFiniteNumberOrNull(voiceResult.outputTokens),
        file_size_bytes: Number(mp3Bytes?.length || 0),
        aspect_ratio: null,
        duration_sec: null,
        meta: safeJsonObject(voiceResult.meta),
      }])
      .select('*')
      .single();

    if (assetError) return res.status(500).json({ error: assetError.message });

    const { data: updatedProject, error: updateError } = await supabaseAdmin
      .from('video_projects')
      .update({ status: 'voiceover_ready' })
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId)
      .select('*')
      .single();

    if (updateError) return res.status(500).json({ error: updateError.message });

    return res.json({
      project: updatedProject,
      voiceover: {
        asset_id: asset.id,
        file_url: asset.file_url,
        storage_path: asset.storage_path,
      },
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[generateVoiceoverHandler] error:', error);
    return res.status(500).json({
      error: error.message || 'Failed to generate voiceover.',
      debug: debugPayload(error),
    });
  }
}

export async function generateSceneVisualHandler(req, res) {
  try {
    const {
      project_id,
      trust_id,
      scene_description,
      scene_narration,
      scene_number,
      selected_product_refs,
      use_logo,
      logo_position,
      reference_position,
    } = req.body || {};

    if (!project_id || !String(project_id).trim()) return badRequest(res, 'project_id is required.');
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');
    if (!scene_description || !String(scene_description).trim()) return badRequest(res, 'scene_description is required.');

    const cleanProjectId = String(project_id).trim();
    const cleanTrustId = String(trust_id).trim();
    const cleanSceneDescription = String(scene_description).trim();
    const cleanSceneNarration = String(scene_narration || '').trim();
    const sceneNo = Number(scene_number || 0);
    if (!Number.isFinite(sceneNo) || sceneNo < 1) return badRequest(res, 'scene_number is required.');

    const { data: project, error: projectError } = await supabaseAdmin
      .from('video_projects')
      .select('id, trust_id, language, logo_url, reference_images')
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId)
      .single();

    if (projectError || !project) return res.status(404).json({ error: 'Project not found for this trust.' });

    const projectReferences = Array.isArray(project?.reference_images) ? project.reference_images : [];
    const selectedRefsSet = new Set(
      (Array.isArray(selected_product_refs) ? selected_product_refs : [])
        .map((entry) => String(entry || '').trim())
        .filter(Boolean),
    );
    const normalizedRefs = projectReferences
      .map((entry, index) => {
        if (!entry) return null;
        if (typeof entry === 'string') {
          const text = entry.trim();
          return text ? { name: `reference-${index + 1}`, value: text } : null;
        }
        const name = String(entry?.name || `reference-${index + 1}`).trim();
        const value = String(entry?.file_url || entry?.url || entry?.storage_path || '').trim();
        if (!value) return null;
        return { name, value };
      })
      .filter(Boolean)
      .filter((entry) => selectedRefsSet.has(entry.name))
      .slice(0, 5)
      .map((entry) => entry.value);
    const productImageRefsText = normalizedRefs.length ? normalizedRefs.join(' | ') : 'None';
    const shouldUseLogo = use_logo !== false;
    const normalizedLogoPosition = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'])
      .has(String(logo_position || '').trim().toLowerCase())
      ? String(logo_position || '').trim().toLowerCase()
      : 'top-right';
    const normalizedReferencePosition = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right', 'center'])
      .has(String(reference_position || '').trim().toLowerCase())
      ? String(reference_position || '').trim().toLowerCase()
      : 'bottom-left';
    const logoRefText = shouldUseLogo ? (String(project?.logo_url || '').trim() || 'None') : 'None';
    const brandContext = [
      `Brand context -> Has logo: ${logoRefText === 'None' ? 'No' : 'Yes'}`,
      `Brand context -> Logo ref: ${logoRefText}`,
      `Brand context -> Has product references: ${normalizedRefs.length ? 'Yes' : 'No'}`,
      `Brand context -> Product references: ${productImageRefsText}`,
      'Brand context rule: keep references as style and identity anchors; do not conflict with narration subject.',
    ].join('\n');

    const defaultSceneImageTemplate = [
      'Create exactly one cinematic frame for this scene.',
      'Narration is the primary source of truth for subject and action.',
      'Scene Narration (must be respected): {{sceneNarration}}',
      'Visual Direction (style/composition guide): {{sceneDescription}}',
      'Reference context:',
      '{{brandContext}}',
      'Do not introduce unrelated hero objects.',
      'Keep composition coherent with narration and preserve cultural context.',
      'No text, no watermark.',
    ].join('\n');
    const sceneImageTemplate = await getPromptTemplate({
      pageNames: ['Scene Approval', 'create_video_step5'],
      promptType: 'scene_image',
      fallbackPrompt: defaultSceneImageTemplate,
    });
    const prompt = renderPromptTemplate(sceneImageTemplate, {
      sceneNarration: cleanSceneNarration || 'Not provided',
      sceneDescription: cleanSceneDescription,
      hasLogo: logoRefText === 'None' ? 'No' : 'Yes',
      hasProductImages: normalizedRefs.length ? 'Yes' : 'No',
      logoRef: logoRefText,
      productImageRefs: productImageRefsText,
      brandContext,
    });
    const resolvedLogoUrl = logoRefText !== 'None' ? logoRefText : null;
    const resolvedReferenceImageUrls = normalizedRefs.slice(0, 2);
    const hasSelectedReferences = resolvedReferenceImageUrls.length > 0;
    const visual = await generateSceneImage({
      prompt,
      logoUrl: resolvedLogoUrl,
      referenceImageUrls: hasSelectedReferences ? resolvedReferenceImageUrls : [],
      useLogo: shouldUseLogo,
      logoPosition: normalizedLogoPosition,
      referencePosition: hasSelectedReferences ? normalizedReferencePosition : null,
    });
    let fileUrl = visual.imageUrl || '';
    let storagePath = `provider://${config.videoProvider}`;
    let finalImageBytes = Buffer.isBuffer(visual.imageBytes) ? visual.imageBytes : null;

    if (finalImageBytes) {
      const uploaded = await uploadSceneImageToBucket({
        trustId: cleanTrustId,
        projectId: cleanProjectId,
        bytes: finalImageBytes,
        format: visual.format || 'png',
        sceneNumber: sceneNo,
      });
      fileUrl = uploaded.fileUrl;
      storagePath = uploaded.storagePath;
    }

    const { data: sceneAssetsForProject, error: sceneAssetsError } = await supabaseAdmin
      .from('video_assets')
      .select('id, storage_path, meta')
      .eq('project_id', cleanProjectId)
      .eq('type', 'scene_image')
      .order('created_at', { ascending: false });
    if (sceneAssetsError) return res.status(500).json({ error: sceneAssetsError.message || 'Failed to load previous scene images.' });

    const previousSameSceneIds = (Array.isArray(sceneAssetsForProject) ? sceneAssetsForProject : [])
      .filter((item) => extractSceneNumberFromAsset(item) === sceneNo)
      .map((item) => item.id)
      .filter(Boolean);
    await updateSceneImageStatusByIds(previousSameSceneIds, 'rejected');

    const baseInsertPayload = {
      project_id: cleanProjectId,
      type: 'scene_image',
      file_url: fileUrl,
      storage_path: storagePath,
      provider: config.videoProvider || null,
      model: visual.model || null,
      input_tokens: toFiniteNumberOrNull(visual?.usage?.input_tokens),
      output_tokens: toFiniteNumberOrNull(visual?.usage?.output_tokens),
      file_size_bytes: toFiniteNumberOrNull(finalImageBytes?.length || visual?.imageBytes?.length),
      aspect_ratio: String(visual?.aspect_ratio || '').trim() || null,
      duration_sec: null,
      meta: safeJsonObject({
        ...(visual?.meta || {}),
        scene_number: sceneNo,
        logo_overlay_applied: Boolean(visual?.meta?.logo_overlaid),
        logo_position_used: String(visual?.meta?.logo_position_used || normalizedLogoPosition),
        reference_position_used: hasSelectedReferences
          ? String(visual?.meta?.reference_position_used || normalizedReferencePosition)
          : null,
        logo_ref: shouldUseLogo ? logoRefText : null,
      }),
    };

    let asset = null;
    let assetError = null;
    ({ data: asset, error: assetError } = await supabaseAdmin
      .from('video_assets')
      .insert([{ ...baseInsertPayload, status: 'pending' }])
      .select('*')
      .single());

    if (assetError && isMissingStatusColumnError(assetError)) {
      ({ data: asset, error: assetError } = await supabaseAdmin
        .from('video_assets')
        .insert([baseInsertPayload])
        .select('*')
        .single());
    }

    if (assetError) return res.status(500).json({ error: assetError.message });

    return res.json({
      provider: config.videoProvider,
      model: visual.model,
      asset,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to generate scene visual.' });
  }
}

export async function approveSceneImageHandler(req, res) {
  try {
    const { project_id, trust_id, scene_number } = req.body || {};
    if (!project_id || !String(project_id).trim()) return badRequest(res, 'project_id is required.');
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');
    const sceneNo = Number(scene_number || 0);
    if (!Number.isFinite(sceneNo) || sceneNo < 1) return badRequest(res, 'scene_number is required.');

    const cleanProjectId = String(project_id).trim();
    const cleanTrustId = String(trust_id).trim();

    const { data: project, error: projectError } = await supabaseAdmin
      .from('video_projects')
      .select('id, trust_id, scene_plan_json')
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId)
      .single();
    if (projectError || !project) return res.status(404).json({ error: 'Project not found for this trust.' });

    const { data: sceneAssets, error: sceneAssetsError } = await supabaseAdmin
      .from('video_assets')
      .select('id, storage_path, meta, created_at')
      .eq('project_id', cleanProjectId)
      .eq('type', 'scene_image')
      .order('created_at', { ascending: false });
    if (sceneAssetsError) return res.status(500).json({ error: sceneAssetsError.message || 'Failed to load scene images.' });

    const sameScene = (Array.isArray(sceneAssets) ? sceneAssets : [])
      .filter((item) => extractSceneNumberFromAsset(item) === sceneNo);
    if (!sameScene.length) return res.status(404).json({ error: `No generated scene image found for scene ${sceneNo}.` });

    const latestAssetId = sameScene[0]?.id;
    const olderIds = sameScene.slice(1).map((item) => item.id).filter(Boolean);

    await updateSceneImageStatusByIds(olderIds, 'rejected');
    const supportsStatus = await updateSceneImageStatusByIds([latestAssetId], 'approved');

    return res.json({
      success: true,
      scene_number: sceneNo,
      asset_id: latestAssetId,
      status: supportsStatus ? 'approved' : 'approved_locally_no_db_status_column',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to approve scene image.' });
  }
}

export async function approveSceneMotionHandler(req, res) {
  try {
    const { project_id, trust_id, scene_number } = req.body || {};
    if (!project_id || !String(project_id).trim()) return badRequest(res, 'project_id is required.');
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');
    const sceneNo = Number(scene_number || 0);
    if (!Number.isFinite(sceneNo) || sceneNo < 1) return badRequest(res, 'scene_number is required.');

    const cleanProjectId = String(project_id).trim();
    const cleanTrustId = String(trust_id).trim();

    const { data: project, error: projectError } = await supabaseAdmin
      .from('video_projects')
      .select('id, trust_id')
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId)
      .single();
    if (projectError || !project) return res.status(404).json({ error: 'Project not found for this trust.' });

    const { data: clipAssets, error: clipAssetsError } = await supabaseAdmin
      .from('video_assets')
      .select('id, file_url, storage_path, meta, created_at, status')
      .eq('project_id', cleanProjectId)
      .in('type', ['scene_clip', 'scene_motion'])
      .order('created_at', { ascending: false });
    if (clipAssetsError) return res.status(500).json({ error: clipAssetsError.message || 'Failed to load scene motion clips.' });

    const sameSceneClips = (Array.isArray(clipAssets) ? clipAssets : [])
      .filter((item) => extractSceneNumberFromAsset(item) === sceneNo);

    const sameScene = sameSceneClips;
    const approvedType = 'scene_clip';
    if (!sameScene.length) return res.status(404).json({ error: `No generated motion found for scene ${sceneNo}.` });

    const preferred = pickLatestPreferredAsset(sameScene);
    const latestAssetId = preferred?.id;
    const olderIds = sameScene
      .filter((item) => item?.id && item.id !== latestAssetId)
      .map((item) => item.id);
    await updateVideoAssetStatusByIds(olderIds, 'rejected');
    const supportsStatus = await updateVideoAssetStatusByIds([latestAssetId], 'approved');

    return res.json({
      success: true,
      scene_number: sceneNo,
      asset_id: latestAssetId,
      asset_type: approvedType,
      status: supportsStatus ? 'approved' : 'approved_locally_no_db_status_column',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to approve scene motion.' });
  }
}

export async function generateSceneMotionHandler(req, res) {
  try {
    const {
      project_id,
      trust_id,
      scene_number,
      narration,
      visual_description,
      image_prompt,
      scene_image_url,
      current_motion_prompt,
      scene_duration_sec,
      regenerate,
    } = req.body || {};

    if (!project_id || !String(project_id).trim()) return badRequest(res, 'project_id is required.');
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');
    const sceneNo = Number(scene_number || 0);
    if (!Number.isFinite(sceneNo) || sceneNo < 1) return badRequest(res, 'scene_number is required.');

    const cleanProjectId = String(project_id).trim();
    const cleanTrustId = String(trust_id).trim();
    const motionTimeoutMs = Math.max(1000, Number(config.falTimeoutMs || 120000));
    const motionStartedAt = Date.now();

    // eslint-disable-next-line no-console
    console.log('[video][motion] start', {
      projectId: cleanProjectId,
      trustId: cleanTrustId,
      sceneNo,
      timeoutMs: motionTimeoutMs,
      regenerate: Boolean(regenerate),
    });

    const { data: project, error: projectError } = await supabaseAdmin
      .from('video_projects')
      .select('id, trust_id, language')
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId)
      .single();
    if (projectError || !project) return res.status(404).json({ error: 'Project not found for this trust.' });

    if (Boolean(regenerate)) {
      const { data: existingClips, error: existingClipsError } = await supabaseAdmin
        .from('video_assets')
        .select('id, storage_path, meta')
        .eq('project_id', cleanProjectId)
        .in('type', ['scene_clip', 'scene_motion']);
      if (existingClipsError) return res.status(500).json({ error: existingClipsError.message || 'Failed to load existing motion clips.' });
      const sameSceneClipIds = (Array.isArray(existingClips) ? existingClips : [])
        .filter((item) => extractSceneNumberFromAsset(item) === sceneNo)
        .map((item) => item.id)
        .filter(Boolean);
      await updateVideoAssetStatusByIds(sameSceneClipIds, 'rejected');
    }

    const currentMotionPrompt = String(current_motion_prompt || '').trim();
    const motionPrompt = currentMotionPrompt || String(
      String(visual_description || '').trim()
      || String(image_prompt || '').trim()
      || String(narration || '').trim()
      || 'Cinematic push-in, slight parallax, smooth transition.',
    ).trim();

    let motionVideo = null;
    let motionVideoStatus = 'not_attempted';
    let motionVideoError = '';
    let motionVideoWarning = '';
    const requestedSceneDurationSec = Number(scene_duration_sec || 0);
    const sceneImageUrl = String(scene_image_url || '').trim();
    if (sceneImageUrl) {
      try {
        // eslint-disable-next-line no-console
        console.log('[video][motion] fal-generate start', { sceneNo });
        const generated = await generateImageToVideoWithFal({
          imageUrl: sceneImageUrl,
          prompt: motionPrompt,
          durationSec: Number.isFinite(requestedSceneDurationSec) ? requestedSceneDurationSec : 0,
        });
        // eslint-disable-next-line no-console
        console.log('[video][motion] fal-generate completed', {
          sceneNo,
          model: generated?.model || null,
          requestId: generated?.requestId || null,
          elapsedMs: Date.now() - motionStartedAt,
        });
        if (!isRenderableClipUrl(generated.videoUrl)) {
          throw new Error(`Fal returned non-renderable clip URL: ${String(generated.videoUrl || '').slice(0, 300)}`);
        }
        const remainingMs = Math.max(1000, motionTimeoutMs - (Date.now() - motionStartedAt));
        // eslint-disable-next-line no-console
        console.log('[video][motion] clip-download start', { sceneNo, remainingMs });
        const { response: clipFetch, arrayBuffer: clipArrayBuffer } = await fetchArrayBufferWithTimeout(
          generated.videoUrl,
          remainingMs,
        );
        if (!clipFetch.ok) {
          throw new Error(`Failed to download generated motion clip (${clipFetch.status}).`);
        }
        const clipBytes = Buffer.from(clipArrayBuffer);
        const uploadedClip = await uploadSceneClipToBucket({
          trustId: cleanTrustId,
          projectId: cleanProjectId,
          sceneNumber: sceneNo,
          bytes: clipBytes,
        });
        motionVideo = {
          provider: 'fal',
          model: generated.model,
          request_id: generated.requestId,
          video_url: uploadedClip.fileUrl,
          storage_path: uploadedClip.storagePath,
          usage: generated?.usage || null,
          aspect_ratio: String(generated?.aspect_ratio || '').trim() || null,
          duration_sec: toFiniteNumberOrNull(generated?.duration_sec),
          file_size_bytes: clipBytes.length,
        };
        motionVideoStatus = 'generated';
        // eslint-disable-next-line no-console
        console.log('[video][motion] clip-upload completed', {
          sceneNo,
          storagePath: uploadedClip.storagePath,
          bytes: clipBytes.length,
          elapsedMs: Date.now() - motionStartedAt,
        });
      } catch (motionVideoErr) {
        const message = String(motionVideoErr?.message || 'Fal image-to-video failed.');
        const isNoUrlCase = message.includes('video URL not found');
        motionVideoStatus = isNoUrlCase ? 'no_url_from_provider' : 'failed';
        motionVideoError = isNoUrlCase ? '' : message;
        motionVideoWarning = isNoUrlCase
          ? 'Provider completed request but did not return a usable clip URL. You can continue with CSS fallback or regenerate.'
          : '';
        // eslint-disable-next-line no-console
        console.warn('[video][motion] fal image-to-video failed, returning prompt only', {
          sceneNo,
          message: motionVideoErr?.message || 'unknown',
          elapsedMs: Date.now() - motionStartedAt,
        });
      }
    } else {
      motionVideoStatus = 'missing_scene_image_url';
    }

    const clipAsset = await upsertSceneClipAssetRow({
      projectId: cleanProjectId,
      sceneNumber: sceneNo,
      fileUrl: motionVideo?.video_url || '',
      storagePath: motionVideo?.storage_path || null,
      provider: motionVideo?.provider || 'fal',
      model: motionVideo?.model || config.falMotionModel || null,
      inputTokens: toFiniteNumberOrNull(motionVideo?.usage?.input_tokens),
      outputTokens: toFiniteNumberOrNull(motionVideo?.usage?.output_tokens),
      fileSizeBytes: toFiniteNumberOrNull(motionVideo?.file_size_bytes),
      aspectRatio: String(motionVideo?.aspect_ratio || '').trim() || null,
      durationSec: toFiniteNumberOrNull(motionVideo?.duration_sec),
      meta: safeJsonObject({
        motion_prompt: motionPrompt,
        narration: String(narration || '').trim(),
        visual_description: String(visual_description || '').trim(),
        image_prompt: String(image_prompt || '').trim(),
        scene_number: sceneNo,
        motion_video_status: motionVideoStatus,
        motion_video_warning: motionVideoWarning || undefined,
        motion_video_error: motionVideoError || undefined,
      }),
    });

    // eslint-disable-next-line no-console
    console.log('[video][motion] asset-upsert completed', {
      sceneNo,
      assetId: clipAsset?.id || null,
      status: motionVideoStatus,
      elapsedMs: Date.now() - motionStartedAt,
    });

    return res.json({
      scene_number: sceneNo,
      motion_prompt: motionPrompt,
      asset: clipAsset,
      motion_video: motionVideo,
      motion_video_status: motionVideoStatus,
      motion_video_error: motionVideoError || null,
      motion_video_warning: motionVideoWarning || null,
    });
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error('[video][motion] handler failed', debugPayload(error));
    return res.status(500).json({ error: error.message || 'Failed to generate scene motion.' });
  }
}

export async function saveSceneMotionHandler(req, res) {
  try {
    const {
      project_id,
      trust_id,
      scene_number,
      motion_prompt,
      narration,
      visual_description,
      image_prompt,
    } = req.body || {};

    if (!project_id || !String(project_id).trim()) return badRequest(res, 'project_id is required.');
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');
    const sceneNo = Number(scene_number || 0);
    if (!Number.isFinite(sceneNo) || sceneNo < 1) return badRequest(res, 'scene_number is required.');
    if (!String(motion_prompt || '').trim()) return badRequest(res, 'motion_prompt is required.');

    const cleanProjectId = String(project_id).trim();
    const cleanTrustId = String(trust_id).trim();

    const { data: project, error: projectError } = await supabaseAdmin
      .from('video_projects')
      .select('id, trust_id')
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId)
      .single();
    if (projectError || !project) return res.status(404).json({ error: 'Project not found for this trust.' });

    const { data: existingRows, error: existingRowsError } = await supabaseAdmin
      .from('video_assets')
      .select('*')
      .eq('project_id', cleanProjectId)
      .in('type', ['scene_clip', 'scene_motion'])
      .order('created_at', { ascending: false });
    if (existingRowsError) return res.status(500).json({ error: existingRowsError.message || 'Failed to load scene clips.' });
    const sameSceneRows = (Array.isArray(existingRows) ? existingRows : [])
      .filter((item) => extractSceneNumberFromAsset(item) === sceneNo);

    const mergedMeta = {
      motion_prompt: String(motion_prompt || '').trim(),
      narration: String(narration || '').trim(),
      visual_description: String(visual_description || '').trim(),
      image_prompt: String(image_prompt || '').trim(),
      saved_at: new Date().toISOString(),
      scene_number: sceneNo,
    };

    let asset = sameSceneRows[0] || null;
    if (asset?.id) {
      const nextMeta = safeJsonObject({
        ...safeJsonObject(asset?.meta),
        ...mergedMeta,
      });
      const { data: updatedRow, error: updateError } = await supabaseAdmin
        .from('video_assets')
        .update({ meta: nextMeta })
        .eq('id', asset.id)
        .select('*')
        .single();
      if (updateError) return res.status(500).json({ error: updateError.message || 'Failed to update scene clip metadata.' });
      asset = updatedRow || asset;
    } else {
      let inserted = null;
      let insertError = null;
      ({ data: inserted, error: insertError } = await supabaseAdmin
        .from('video_assets')
        .insert([{
          project_id: cleanProjectId,
          type: 'scene_clip',
          file_url: '',
          storage_path: '',
          provider: config.videoProvider || 'fal',
          model: config.falMotionModel || null,
          input_tokens: 0,
          output_tokens: 0,
          file_size_bytes: 0,
          aspect_ratio: null,
          duration_sec: null,
          meta: mergedMeta,
          status: 'pending',
        }])
        .select('*')
        .single());
      if (insertError && isMissingStatusColumnError(insertError)) {
        ({ data: inserted, error: insertError } = await supabaseAdmin
          .from('video_assets')
          .insert([{
            project_id: cleanProjectId,
            type: 'scene_clip',
            file_url: '',
            storage_path: '',
            provider: config.videoProvider || 'fal',
            model: config.falMotionModel || null,
            input_tokens: 0,
            output_tokens: 0,
            file_size_bytes: 0,
            aspect_ratio: null,
            duration_sec: null,
            meta: mergedMeta,
          }])
          .select('*')
          .single());
      }
      if (insertError) return res.status(500).json({ error: insertError.message || 'Failed to create scene clip row.' });
      asset = inserted;
    }

    return res.json({ scene_number: sceneNo, motion_prompt: String(motion_prompt || '').trim(), asset });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to save scene motion.' });
  }
}

export async function generateScenePlanHandler(req, res) {
  try {
    const {
      project_id,
      trust_id,
      target_scenes,
      voiceover_duration_sec,
      script_override,
      has_product_images,
      has_logo,
      product_image_refs,
      logo_ref,
    } = req.body || {};
    if (!project_id || !String(project_id).trim()) return badRequest(res, 'project_id is required.');
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');

    const cleanProjectId = String(project_id).trim();
    const cleanTrustId = String(trust_id).trim();

    const { data: project, error: projectError } = await supabaseAdmin
      .from('video_projects')
      .select('id, trust_id, language')
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId)
      .single();
    if (projectError || !project) return res.status(404).json({ error: 'Project not found for this trust.' });

    const { data: latestScript, error: scriptError } = await supabaseAdmin
      .from('video_scripts')
      .select('script_text, estimated_duration')
      .eq('project_id', cleanProjectId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (scriptError) return res.status(500).json({ error: scriptError.message });
    if (!latestScript?.script_text && !String(script_override || '').trim()) {
      return res.status(400).json({ error: 'No script found for this project.' });
    }

    const overrideText = String(script_override || '').trim();
    const sourceScriptText = overrideText || String(latestScript.script_text || '').trim();
    const requestedVoiceoverDurationSec = Number(voiceover_duration_sec || 0);
    const hasVoiceoverDuration = Number.isFinite(requestedVoiceoverDurationSec) && requestedVoiceoverDurationSec > 0;
    const estimatedDurationSec = hasVoiceoverDuration
      ? requestedVoiceoverDurationSec
      : (overrideText
        ? estimateDurationSec(countWords(overrideText))
        : Number(latestScript.estimated_duration || 30));

    const requestedTargetScenes = Number(target_scenes || 0);
    const fallbackTargetScenes = Number.isFinite(requestedTargetScenes) ? Math.max(1, Math.floor(requestedTargetScenes)) : 1;
    const effectiveTargetScenes = hasVoiceoverDuration
      ? Math.max(1, Math.ceil(estimatedDurationSec / 8))
      : Math.max(Math.ceil(estimatedDurationSec / 8), fallbackTargetScenes);
    const projectReferences = Array.isArray(project?.reference_images) ? project.reference_images : [];
    const effectiveHasLogo = Boolean(has_logo) || Boolean(String(project?.logo_url || '').trim());
    const effectiveHasProductImages = Boolean(has_product_images) || projectReferences.length > 0;
    const effectiveProductRefs = Array.isArray(product_image_refs) && product_image_refs.length
      ? product_image_refs
      : projectReferences;
    const effectiveLogoRef = String(logo_ref || '').trim() || String(project?.logo_url || '').trim();

    const scenes = await generateScenePlanFromScript({
      scriptText: sourceScriptText,
      estimatedDuration: estimatedDurationSec,
      targetScenes: effectiveTargetScenes,
      language: String(project.language || 'Hindi'),
      model: config.openaiModel,
      hasProductImages: effectiveHasProductImages,
      hasLogo: effectiveHasLogo,
      productImageRefs: effectiveProductRefs,
      logoRef: effectiveLogoRef,
    });

    await supabaseAdmin
      .from('video_projects')
      .update({
        scene_plan_json: Array.isArray(scenes) ? scenes : [],
        status: 'scene_script_generated',
      })
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId);

    return res.json({ scenes });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to generate scene plan.' });
  }
}

export async function saveScenePlanHandler(req, res) {
  try {
    const { project_id, trust_id, scene_plan } = req.body || {};
    if (!project_id || !String(project_id).trim()) return badRequest(res, 'project_id is required.');
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');
    if (!Array.isArray(scene_plan)) return badRequest(res, 'scene_plan must be an array.');

    const cleanProjectId = String(project_id).trim();
    const cleanTrustId = String(trust_id).trim();

    const { data: project, error: projectError } = await supabaseAdmin
      .from('video_projects')
      .select('id, trust_id')
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId)
      .single();
    if (projectError || !project) return res.status(404).json({ error: 'Project not found for this trust.' });

    const { error: updateError } = await supabaseAdmin
      .from('video_projects')
      .update({
        scene_plan_json: scene_plan,
        status: 'scene_script_approved',
      })
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId);
    if (updateError) return res.status(500).json({ error: updateError.message || 'Failed to save scene plan.' });

    return res.json({ success: true });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to save scene plan.' });
  }
}

export async function updateProjectStatusHandler(req, res) {
  try {
    const { project_id, trust_id, status } = req.body || {};
    if (!project_id || !String(project_id).trim()) return badRequest(res, 'project_id is required.');
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');
    const nextStatusRaw = String(status || '').trim();
    if (!nextStatusRaw) return badRequest(res, 'status is required.');
    const nextStatus = normalizeProjectStatusForDb(nextStatusRaw);

    const cleanProjectId = String(project_id).trim();
    const cleanTrustId = String(trust_id).trim();
    if (!isUuidLike(cleanProjectId)) {
      return res.status(400).json({ error: `Invalid project_id format: ${cleanProjectId}` });
    }

    const allowedDbStatuses = new Set([
      'draft',
      'script_generated',
      'script_approved',
      'voiceover_ready',
      'scenes_in_progress',
      'scenes_approved',
      'processing',
      'completed',
      'failed',
    ]);
    if (!allowedDbStatuses.has(nextStatus)) {
      return res.status(400).json({
        error: `Unsupported project status "${nextStatusRaw}" (mapped: "${nextStatus}").`,
      });
    }

    // eslint-disable-next-line no-console
    console.log('[video][project-status] update requested', {
      projectId: cleanProjectId,
      trustId: cleanTrustId,
      requestedStatus: nextStatusRaw,
      dbStatus: nextStatus,
    });

    const { data: project, error: projectError } = await supabaseAdmin
      .from('video_projects')
      .select('id, trust_id, status')
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId)
      .maybeSingle();
    if (projectError) return res.status(500).json({ error: projectError.message || 'Failed to load project.' });
    if (!project) return res.status(404).json({ error: 'Project not found for this trust.' });

    if (String(project.status || '').trim().toLowerCase() === String(nextStatus || '').toLowerCase()) {
      return res.json({ success: true, project_id: cleanProjectId, status: nextStatus });
    }

    const { error: updateError } = await supabaseAdmin
      .from('video_projects')
      .update({ status: nextStatus })
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId);
    if (updateError) {
      // eslint-disable-next-line no-console
      console.error('[video][project-status] update failed', {
        projectId: cleanProjectId,
        trustId: cleanTrustId,
        requestedStatus: nextStatusRaw,
        dbStatus: nextStatus,
        message: updateError.message || 'unknown',
      });
      return res.status(500).json({ error: updateError.message || 'Failed to update project status.' });
    }

    return res.json({ success: true, project_id: cleanProjectId, status: nextStatus });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update project status.' });
  }
}

export async function getProjectAssetsHandler(req, res) {
  try {
    const { project_id, trust_id } = req.query || {};

    if (!project_id || !String(project_id).trim()) return badRequest(res, 'project_id is required.');
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');

    const cleanProjectId = String(project_id).trim();
    const cleanTrustId = String(trust_id).trim();

    const { data: project, error: projectError } = await supabaseAdmin
      .from('video_projects')
      .select('id, trust_id')
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId)
      .single();

    if (projectError || !project) return res.status(404).json({ error: 'Project not found for this trust.' });

    const { assets, usage } = await buildProjectAssetUsage(cleanProjectId);
    return res.json({ assets, usage });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch project assets.' });
  }
}

export async function getProjectDetailsHandler(req, res) {
  try {
    const { project_id, trust_id } = req.query || {};
    if (!project_id || !String(project_id).trim()) return badRequest(res, 'project_id is required.');
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');

    const cleanProjectId = String(project_id).trim();
    const cleanTrustId = String(trust_id).trim();

    const { data: project, error: projectError } = await supabaseAdmin
      .from('video_projects')
      .select('id, trust_id, topic, duration, language, prompt_style, custom_prompt, status, logo_url, reference_images, scene_plan_json, created_at, updated_at')
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId)
      .single();
    if (projectError || !project) return res.status(404).json({ error: 'Project not found for this trust.' });

    const { data: latestScript, error: scriptError } = await supabaseAdmin
      .from('video_scripts')
      .select('id, script_text, word_count, estimated_duration, version, created_at, Status')
      .eq('project_id', cleanProjectId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (scriptError) return res.status(500).json({ error: scriptError.message || 'Failed to load latest script.' });

    let resolvedProject = project;
    const existingPlan = Array.isArray(project?.scene_plan_json) ? project.scene_plan_json : [];

    if (existingPlan.length === 0) {
      const { assets } = await buildProjectAssetUsage(cleanProjectId);
      const sceneAssets = (assets || []).filter((item) => item?.type === 'scene_image' && item?.file_url);
      const clipAssets = (assets || []).filter((item) => item?.type === 'scene_clip' && item?.file_url);
      const voiceAssets = (assets || []).filter((item) => item?.type === 'voiceover' && item?.file_url);

      const sceneNos = new Set();
      sceneAssets.forEach((item) => {
        const no = extractSceneNumberFromStoragePath(item?.storage_path);
        if (no) sceneNos.add(no);
      });
      clipAssets.forEach((item) => {
        const no = extractSceneNumberFromStoragePath(item?.storage_path);
        if (no) sceneNos.add(no);
      });

      const sceneCount = Math.max(1, sceneNos.size || sceneAssets.length || clipAssets.length || 1);
      const scriptText = String(latestScript?.script_text || '').trim();
      const estimated = Number(latestScript?.estimated_duration || estimateDurationSec(countWords(scriptText || '')) || 30);
      const chunks = splitNarrationIntoChunks(scriptText, sceneCount);
      const timings = buildSceneTimings(sceneCount, estimated);

      const backfilledPlan = timings.map((timing, index) => ({
        scene_number: index + 1,
        start_sec: timing.start_sec,
        end_sec: timing.end_sec,
        duration_sec: timing.duration_sec,
        narration: chunks[index] || '',
        visual_description: chunks[index] || '',
        visual_prompt: chunks[index] || `Scene ${index + 1}`,
        image_prompt: chunks[index] || `Scene ${index + 1}`,
        motion_prompt: '',
        camera_direction: '',
        transition: '',
        logo_placement: '',
      }));

      await supabaseAdmin
        .from('video_projects')
        .update({ scene_plan_json: backfilledPlan })
        .eq('id', cleanProjectId)
        .eq('trust_id', cleanTrustId);

      resolvedProject = {
        ...project,
        scene_plan_json: backfilledPlan,
      };
    }

    return res.json({
      project: resolvedProject,
      latest_script: latestScript || null,
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch project details.' });
  }
}

export async function listFinalVideosHandler(req, res) {
  try {
    const { trust_id } = req.query || {};
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');
    const cleanTrustId = String(trust_id).trim();

    const { data: projects, error: projectsError } = await supabaseAdmin
      .from('video_projects')
      .select('id')
      .eq('trust_id', cleanTrustId);
    if (projectsError) return res.status(500).json({ error: projectsError.message });

    const projectIds = (projects || []).map((item) => item.id).filter(Boolean);
    // eslint-disable-next-line no-console
    console.log('[your-videos] projects resolved', { trustId: cleanTrustId, projectCount: projectIds.length });
    if (!projectIds.length) return res.json({ videos: [] });

    const { data: assets, error: assetsError } = await supabaseAdmin
      .from('video_assets')
      .select('id, project_id, file_url, storage_path, created_at, file_size_bytes, aspect_ratio')
      .in('project_id', projectIds)
      .eq('type', 'final_video')
      .not('file_url', 'is', null)
      .order('created_at', { ascending: false });
    if (assetsError) return res.status(500).json({ error: assetsError.message });
    // eslint-disable-next-line no-console
    console.log('[your-videos] final videos loaded', { count: Array.isArray(assets) ? assets.length : 0 });

    const finalAssetIds = (assets || []).map((item) => item.id).filter(Boolean);
    const finalProjectIds = (assets || []).map((item) => item.project_id).filter(Boolean);
    let videosByAssetId = new Map();
    if (finalAssetIds.length > 0) {
      const { data: videosRows, error: videosError } = await supabaseAdmin
        .from('videos')
        .select('id, video_asset_id, total_input_tokens, total_output_tokens, total_tokens, final_video_bytes, aspect_ratio, created_at, updated_at')
        .in('video_asset_id', finalAssetIds);
      if (!videosError && Array.isArray(videosRows)) {
        videosByAssetId = new Map(videosRows.map((row) => [row.video_asset_id, row]));
      }
      // eslint-disable-next-line no-console
      console.log('[your-videos] metrics rows loaded', {
        requestedAssets: finalAssetIds.length,
        metricsRows: videosByAssetId.size,
        metricsError: videosError?.message || null,
      });
    }

    let previewByProjectId = new Map();
    if (finalProjectIds.length > 0) {
      const { data: sceneRows, error: sceneError } = await supabaseAdmin
        .from('video_assets')
        .select('project_id, file_url, created_at')
        .in('project_id', finalProjectIds)
        .eq('type', 'scene_image')
        .not('file_url', 'is', null)
        .order('created_at', { ascending: false });
      if (!sceneError && Array.isArray(sceneRows)) {
        sceneRows.forEach((row) => {
          const projectId = row?.project_id;
          if (!projectId) return;
          if (!previewByProjectId.has(projectId)) {
            previewByProjectId.set(projectId, row.file_url);
          }
        });
      }
      // eslint-disable-next-line no-console
      console.log('[your-videos] preview scene rows', {
        projectCount: finalProjectIds.length,
        sceneRows: Array.isArray(sceneRows) ? sceneRows.length : 0,
        previewMapped: previewByProjectId.size,
        sceneError: sceneError?.message || null,
      });
    }

    const merged = (assets || []).map((asset) => {
      const metrics = videosByAssetId.get(asset.id) || null;
      return {
        ...asset,
        metrics,
        preview_image_url: previewByProjectId.get(asset.project_id) || '',
      };
    });
    // eslint-disable-next-line no-console
    console.log('[your-videos] response payload ready', {
      totalVideos: merged.length,
      withPreview: merged.filter((item) => String(item.preview_image_url || '').trim()).length,
      sample: merged.slice(0, 3).map((item) => ({
        id: item.id,
        project_id: item.project_id,
        has_preview: Boolean(String(item.preview_image_url || '').trim()),
      })),
    });

    return res.json({ videos: merged });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to list final videos.' });
  }
}

export async function deleteFinalVideoHandler(req, res) {
  try {
    const { assetId } = req.params || {};
    const cleanAssetId = String(assetId || '').trim();
    if (!cleanAssetId) return badRequest(res, 'assetId is required.');

    // TODO: enforce trust-level ownership validation before deletion (e.g. with trust_id + auth context).
    const { data: existingAsset, error: assetLookupError } = await supabaseAdmin
      .from('video_assets')
      .select('id, type')
      .eq('id', cleanAssetId)
      .maybeSingle();

    if (assetLookupError) return res.status(500).json({ error: assetLookupError.message || 'Failed to lookup final video asset.' });
    if (!existingAsset || existingAsset.type !== 'final_video') {
      return res.status(404).json({ error: 'Final video asset not found.' });
    }

    const { error: videosDeleteError } = await supabaseAdmin
      .from('videos')
      .delete()
      .eq('video_asset_id', cleanAssetId);
    if (videosDeleteError) return res.status(500).json({ error: videosDeleteError.message || 'Failed to delete video summary.' });

    const { error: assetsDeleteError } = await supabaseAdmin
      .from('video_assets')
      .delete()
      .eq('id', cleanAssetId)
      .eq('type', 'final_video');
    if (assetsDeleteError) return res.status(500).json({ error: assetsDeleteError.message || 'Failed to delete final video asset.' });

    return res.json({ success: true, deletedAssetId: cleanAssetId });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to delete final video.' });
  }
}

export async function listAssetLibraryHandler(req, res) {
  try {
    const { trust_id, type } = req.query || {};
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');
    const cleanTrustId = String(trust_id).trim();
    const normalizedType = String(type || '').trim().toLowerCase();
    const allowed = new Set(['posts', 'stories', 'audio']);
    if (!allowed.has(normalizedType)) return badRequest(res, 'type must be one of posts, stories, audio.');

    const dbType = normalizedType === 'posts'
      ? 'scene_image'
      : normalizedType === 'stories'
        ? 'scene_clip'
        : 'voiceover';

    const { data: projects, error: projectsError } = await supabaseAdmin
      .from('video_projects')
      .select('id')
      .eq('trust_id', cleanTrustId);
    if (projectsError) return res.status(500).json({ error: projectsError.message });

    const projectIds = (projects || []).map((item) => item.id).filter(Boolean);
    if (!projectIds.length) return res.json({ items: [] });

    let query = supabaseAdmin
      .from('video_assets')
      .select('id, project_id, type, file_url, storage_path, created_at, file_size_bytes, duration_sec, aspect_ratio')
      .in('project_id', projectIds)
      .not('file_url', 'is', null)
      .order('created_at', { ascending: false });

    if (normalizedType === 'stories') {
      query = query.in('type', ['scene_clip', 'scene_motion', 'final_video']);
    } else {
      query = query.eq('type', dbType);
    }

    const { data: items, error: itemsError } = await query;
    if (itemsError) return res.status(500).json({ error: itemsError.message });

    let payload = Array.isArray(items) ? items : [];

    if (normalizedType === 'stories' && payload.length > 0) {
      const projectIdsForStories = payload.map((item) => item.project_id).filter(Boolean);
      const { data: sceneRows, error: sceneError } = await supabaseAdmin
        .from('video_assets')
        .select('project_id, file_url, created_at')
        .in('project_id', projectIdsForStories)
        .eq('type', 'scene_image')
        .not('file_url', 'is', null)
        .order('created_at', { ascending: false });

      const previewByProject = new Map();
      if (!sceneError && Array.isArray(sceneRows)) {
        sceneRows.forEach((row) => {
          if (!row?.project_id) return;
          if (!previewByProject.has(row.project_id)) previewByProject.set(row.project_id, row.file_url);
        });
      }

      payload = payload.map((item) => ({
        ...item,
        preview_image_url: previewByProject.get(item.project_id) || '',
      }));
    }

    return res.json({ items: payload });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch asset library.' });
  }
}

export async function renderFinalVideoHandler(req, res) {
  try {
    const { project_id, trust_id, expected_scene_count, scene_timing } = req.body || {};

    if (!project_id || !String(project_id).trim()) return badRequest(res, 'project_id is required.');
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');

    const cleanProjectId = String(project_id).trim();
    const cleanTrustId = String(trust_id).trim();

    const { data: project, error: projectError } = await supabaseAdmin
      .from('video_projects')
      .select('id, trust_id, scene_plan_json')
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId)
      .single();
    if (projectError || !project) return res.status(404).json({ error: 'Project not found for this trust.' });

    const { data: assets, error: assetError } = await supabaseAdmin
      .from('video_assets')
      .select('id, type, file_url, storage_path, created_at')
      .eq('project_id', cleanProjectId)
      .order('created_at', { ascending: true });
    if (assetError) return res.status(500).json({ error: assetError.message });

    const sceneClipAssets = (assets || [])
      .filter((item) => isMotionAssetType(item?.type));
    const sceneImageAssets = (assets || [])
      .filter((item) => item.type === 'scene_image' && item.file_url);

    const imagesBySceneNumber = new Map();
    sceneImageAssets.forEach((item) => {
      const sceneNo = extractSceneNumberFromStoragePath(item.storage_path);
      if (sceneNo) imagesBySceneNumber.set(sceneNo, item.file_url);
    });
    const normalizedSceneUrls = imagesBySceneNumber.size > 0
      ? Array.from(imagesBySceneNumber.entries())
        .sort((a, b) => a[0] - b[0])
        .map((entry) => entry[1])
      : sceneImageAssets.map((item) => item.file_url);
    if (normalizedSceneUrls.length === 0) return res.status(400).json({ error: 'No scene images found for this project.' });

    const clipUrlsByScene = new Map();
    sceneClipAssets.forEach((item) => {
      const sceneNo = extractSceneNumberFromStoragePath(item.storage_path) || Number(item?.meta?.scene_number || 0);
      const clipUrl = String(item?.file_url || '').trim();
      if (sceneNo > 0 && clipUrl && isRenderableClipUrl(clipUrl)) {
        clipUrlsByScene.set(sceneNo, clipUrl);
      }
    });
    const requestedSceneCount = Number(expected_scene_count || 0);
    const maxImageSceneNo = imagesBySceneNumber.size > 0
      ? Math.max(...Array.from(imagesBySceneNumber.keys()))
      : normalizedSceneUrls.length;
    const maxClipSceneNo = clipUrlsByScene.size > 0
      ? Math.max(...Array.from(clipUrlsByScene.keys()))
      : 0;
    const availableSceneCount = Math.max(maxImageSceneNo, maxClipSceneNo, 0);
    const expectedSceneCount = Number.isFinite(requestedSceneCount) && requestedSceneCount > 0
      ? Math.max(1, Math.floor(requestedSceneCount))
      : availableSceneCount;

    const latestVoiceover = [...(assets || [])]
      .reverse()
      .find((item) => item.type === 'voiceover' && item.file_url);
    if (!latestVoiceover) return res.status(400).json({ error: 'No voiceover found for this project.' });

    const { data: latestScript } = await supabaseAdmin
      .from('video_scripts')
      .select('estimated_duration')
      .eq('project_id', cleanProjectId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    const resolvedSceneTiming = Array.isArray(scene_timing) && scene_timing.length > 0
      ? scene_timing
      : (Array.isArray(project?.scene_plan_json) ? project.scene_plan_json : []);
    const sceneUrlsByScene = new Map();
    normalizedSceneUrls.forEach((url, index) => {
      sceneUrlsByScene.set(index + 1, url);
    });
    imagesBySceneNumber.forEach((url, sceneNo) => {
      sceneUrlsByScene.set(sceneNo, url);
    });

    const renderScenes = Array.from({ length: expectedSceneCount }, (_v, index) => {
      const sceneNo = index + 1;
      return {
        clipUrl: clipUrlsByScene.get(sceneNo) || '',
        imageUrl: sceneUrlsByScene.get(sceneNo) || '',
      };
    });
    const usableScenes = renderScenes.filter((item) => item.clipUrl || item.imageUrl);
    if (!usableScenes.length) {
      return res.status(400).json({ error: 'No renderable scene sources found for this project.' });
    }

    const rendered = await renderMixedScenesWithVoiceover({
      scenes: usableScenes,
      voiceoverUrl: latestVoiceover.file_url,
      outputBasename: `project-${cleanProjectId}`,
      fallbackDurationSec: Number(latestScript?.estimated_duration || 30),
      sceneTiming: resolvedSceneTiming,
      motionPlan: Array.isArray(project?.scene_plan_json) ? project.scene_plan_json : [],
    });
    const clipSceneCount = usableScenes.filter((item) => item.clipUrl).length;
    const cssSceneCount = usableScenes.length - clipSceneCount;

    const uploaded = await uploadFinalVideoToBucket({
      trustId: cleanTrustId,
      projectId: cleanProjectId,
      bytes: rendered.outputBytes,
    });

    const { data: olderFinalAssets } = await supabaseAdmin
      .from('video_assets')
      .select('id')
      .eq('project_id', cleanProjectId)
      .eq('type', 'final_video');
    const olderFinalIds = (Array.isArray(olderFinalAssets) ? olderFinalAssets : []).map((item) => item.id).filter(Boolean);
    await updateVideoAssetStatusByIds(olderFinalIds, 'rejected');

    const finalAssetPayload = {
      project_id: cleanProjectId,
      type: 'final_video',
      file_url: uploaded.fileUrl,
      storage_path: uploaded.storagePath,
      provider: config.videoProvider || 'ffmpeg',
      model: 'ffmpeg-compose',
      input_tokens: 0,
      output_tokens: 0,
      file_size_bytes: Number(rendered?.outputBytes?.length || 0),
      aspect_ratio: '9:16',
      duration_sec: toFiniteNumberOrNull(rendered?.durationSec),
      meta: {
        scene_count: Number(rendered?.sceneCount || 0),
        source: 'renderMixedScenesWithVoiceover',
        motion_source: 'mixed_scene_clip_css',
        clip_scene_count: clipSceneCount,
        css_scene_count: cssSceneCount,
        missing_scene_clips: Math.max(0, expectedSceneCount - clipSceneCount),
      },
    };

    let finalAsset = null;
    let finalAssetError = null;
    ({ data: finalAsset, error: finalAssetError } = await supabaseAdmin
      .from('video_assets')
      .insert([{ ...finalAssetPayload, status: 'approved' }])
      .select('*')
      .single());

    if (finalAssetError && isMissingStatusColumnError(finalAssetError)) {
      ({ data: finalAsset, error: finalAssetError } = await supabaseAdmin
        .from('video_assets')
        .insert([finalAssetPayload])
        .select('*')
        .single());
    }
    if (finalAssetError) return res.status(500).json({ error: finalAssetError.message });

    const { usage } = await buildProjectAssetUsage(cleanProjectId);
    const videoSummary = await upsertVideoSummary({
      videoAssetId: finalAsset.id,
      totalInputTokens: usage.total_input_tokens,
      totalOutputTokens: usage.total_output_tokens,
      finalVideoBytes: Number(rendered?.outputBytes?.length || 0),
      aspectRatio: '9:16',
    });

    return res.json({
      final_video: finalAsset,
      video_summary: videoSummary,
      usage,
      stats: {
        scene_count: rendered.sceneCount,
        duration_sec: rendered.durationSec,
      },
    });
  } catch (error) {
    try {
      const cleanProjectId = String(req?.body?.project_id || '').trim();
      if (cleanProjectId) {
        const { data: pendingFinalAssets } = await supabaseAdmin
          .from('video_assets')
          .select('id')
          .eq('project_id', cleanProjectId)
          .eq('type', 'final_video')
          .eq('status', 'pending');
        const pendingIds = (Array.isArray(pendingFinalAssets) ? pendingFinalAssets : []).map((item) => item.id).filter(Boolean);
        await updateVideoAssetStatusByIds(pendingIds, 'rejected');
      }
    } catch {
      // no-op
    }
    return res.status(500).json({ error: error.message || 'Failed to render final video.' });
  }
}

export async function downloadFinalVideoHandler(req, res) {
  try {
    const { project_id, trust_id } = req.query || {};
    if (!project_id || !String(project_id).trim()) return badRequest(res, 'project_id is required.');
    if (!trust_id || !String(trust_id).trim()) return badRequest(res, 'trust_id is required.');

    const cleanProjectId = String(project_id).trim();
    const cleanTrustId = String(trust_id).trim();

    const { data: project, error: projectError } = await supabaseAdmin
      .from('video_projects')
      .select('id, trust_id')
      .eq('id', cleanProjectId)
      .eq('trust_id', cleanTrustId)
      .single();
    if (projectError || !project) return res.status(404).json({ error: 'Project not found for this trust.' });

    const { data: finalAsset, error: finalError } = await supabaseAdmin
      .from('video_assets')
      .select('id, file_url, storage_path, created_at')
      .eq('project_id', cleanProjectId)
      .eq('type', 'final_video')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (finalError) return res.status(500).json({ error: finalError.message });
    if (!finalAsset?.file_url) return res.status(404).json({ error: 'Final video not found.' });

    const response = await fetch(finalAsset.file_url);
    if (!response.ok) return res.status(502).json({ error: `Unable to fetch final video (${response.status}).` });

    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const filename = `final-video-${cleanProjectId}.mp4`;

    res.setHeader('Content-Type', 'video/mp4');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(buffer.length));
    return res.status(200).send(buffer);
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to download final video.' });
  }
}
