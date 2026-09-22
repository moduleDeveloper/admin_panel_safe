import { openai } from '../lib/openai.js';
import { getPromptTemplate, renderPromptTemplate } from './promptTemplateService.js';

const SCENE_WINDOW_SEC = 8;
const MIN_SCENE_SEC = 1;
const MAX_REFERENCE_PROMPT_ITEMS = 5;

function parseJsonLenient(rawText) {
  const text = String(rawText || '').trim();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

function splitNarrationIntoChunks(scriptText, sceneCount) {
  const sentences = String(scriptText || '')
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!sentences.length) return [];

  const chunkSize = Math.max(1, Math.ceil(sentences.length / sceneCount));
  const chunks = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    chunks.push(sentences.slice(i, i + chunkSize).join(' '));
  }
  return chunks.slice(0, sceneCount);
}

function buildSceneTimings(sceneCount, totalDurationSec) {
  const safeCount = Math.max(1, Number(sceneCount || 1));
  const safeTotal = Math.max(MIN_SCENE_SEC, Number(totalDurationSec || safeCount * SCENE_WINDOW_SEC));
  const roundedTotal = Math.max(safeCount * MIN_SCENE_SEC, Math.round(safeTotal));
  const base = Math.floor(roundedTotal / safeCount);
  let remainder = roundedTotal % safeCount;
  let cursor = 0;

  return Array.from({ length: safeCount }).map((_item, index) => {
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

function normalizeScenes({ scenes, scriptText, sceneCount, totalDurationSec }) {
  const safeCount = Math.max(1, Number(sceneCount || 1));
  const safeTotal = Math.max(MIN_SCENE_SEC, Number(totalDurationSec || safeCount * SCENE_WINDOW_SEC));
  const fallbackChunks = splitNarrationIntoChunks(scriptText, safeCount);
  const timings = buildSceneTimings(safeCount, safeTotal);

  return Array.from({ length: safeCount }).map((_item, index) => {
    const source = scenes[index] || {};
    const timing = timings[index];
    const narration = String(source.narration || fallbackChunks[index] || '').trim();
    const visualDescription = String(source.visual_description || source.visual || narration).trim();
    const imagePrompt = String(source.image_prompt || source.visual_prompt || source.visualPrompt || narration).trim();
    const motionPrompt = String(source.motion_prompt || `Subtle cinematic movement on: ${narration}`).trim();
    const cameraDirection = String(source.camera_direction || 'Cinematic mid shot with gentle push-in').trim();
    const transition = String(source.transition || 'Smooth cut').trim();
    const logoPlacement = String(source.logo_placement || 'Not specified').trim();

    return {
      scene_number: index + 1,
      start_sec: timing.start_sec,
      end_sec: timing.end_sec,
      duration_sec: timing.duration_sec,
      narration,
      visual_description: visualDescription,
      visual_prompt: imagePrompt,
      image_prompt: imagePrompt,
      motion_prompt: motionPrompt,
      camera_direction: cameraDirection,
      transition,
      logo_placement: logoPlacement,
    };
  });
}

function fallbackPlan({ scriptText, sceneCount, totalDurationSec }) {
  const sentences = String(scriptText || '')
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
  if (!sentences.length) return [];

  const count = Math.max(1, Number(sceneCount || 1));
  const chunkSize = Math.max(1, Math.ceil(sentences.length / count));
  const chunks = [];
  for (let i = 0; i < sentences.length; i += chunkSize) {
    chunks.push(sentences.slice(i, i + chunkSize).join(' '));
  }
  const duration = Math.max(MIN_SCENE_SEC, Number(totalDurationSec || count * SCENE_WINDOW_SEC));
  const timings = buildSceneTimings(count, duration);
  return chunks.map((narration, index) => ({
    scene_number: index + 1,
    start_sec: timings[index]?.start_sec ?? 0,
    end_sec: timings[index]?.end_sec ?? duration,
    duration_sec: timings[index]?.duration_sec ?? duration,
    narration,
    visual_description: narration,
    visual_prompt: `Create a cinematic scene for: ${narration}`,
    image_prompt: `Create a cinematic scene for: ${narration}`,
    motion_prompt: `Cinematic parallax movement and soft push-in on: ${narration}`,
    camera_direction: 'Cinematic medium shot, controlled depth of field',
    transition: 'Smooth cinematic cut',
    logo_placement: 'Bottom Right',
  }));
}

function normalizeReferenceList(items) {
  const list = Array.isArray(items) ? items : [];
  return list
    .map((entry) => {
      if (!entry) return '';
      if (typeof entry === 'string') return entry.trim();
      const name = String(entry?.name || '').trim();
      const url = String(entry?.file_url || entry?.url || '').trim();
      const path = String(entry?.storage_path || '').trim();
      return name || url || path;
    })
    .filter(Boolean)
    .slice(0, MAX_REFERENCE_PROMPT_ITEMS);
}

export async function generateScenePlanFromScript({
  scriptText,
  estimatedDuration,
  targetScenes,
  language,
  model,
  hasProductImages = false,
  hasLogo = false,
  productImageRefs = [],
  logoRef = '',
}) {
  const hasEstimatedDuration = Number.isFinite(Number(estimatedDuration)) && Number(estimatedDuration) > 0;
  const normalizedDuration = hasEstimatedDuration
    ? Math.max(MIN_SCENE_SEC, Number(estimatedDuration))
    : Math.max(MIN_SCENE_SEC, Number(targetScenes || 1) * SCENE_WINDOW_SEC);
  const computedSceneCount = hasEstimatedDuration
    ? Math.max(1, Math.ceil(normalizedDuration / SCENE_WINDOW_SEC))
    : Math.max(1, Number(targetScenes || 1));

  const normalizedRefs = normalizeReferenceList(productImageRefs);
  const productImageRefsText = normalizedRefs.length ? normalizedRefs.join(' | ') : 'None';
  const logoRefText = String(logoRef || '').trim() || 'None';
  const brandContext = [
    `Brand context -> Has logo: ${hasLogo ? 'Yes' : 'No'}`,
    `Brand context -> Logo ref: ${logoRefText}`,
    `Brand context -> Has product references: ${hasProductImages ? 'Yes' : 'No'}`,
    `Brand context -> Product references: ${productImageRefsText}`,
    'Brand context rule: keep references as style and identity anchors; do not conflict with narration subject.',
  ].join('\n');

  const defaultSystemTemplate = [
    'You are an AI cinematic scene planner for short marketing videos.',
    'Return strict JSON only.',
    'Generate scene-by-scene script, image prompts, motion prompts, camera direction, and transitions.',
    'Each scene must include scene_number, start_sec, end_sec, duration_sec, narration, visual_description, image_prompt, motion_prompt, camera_direction, transition, logo_placement.',
    'Use exactly {{computedSceneCount}} scenes.',
    'Each scene duration must be <= {{sceneWindowSec}} seconds.',
    'Distribute timeline based on total voiceover duration ({{normalizedDuration}}s).',
    'Every scene must be at least {{minSceneSec}} second.',
    'Keep scene continuity and avoid repetitive visuals.',
    'Reference context:',
    '{{brandContext}}',
  ].join(' ');

  const systemTemplate = await getPromptTemplate({
    pageNames: ['Scene Script', 'create_video_step4'],
    promptType: 'script',
    fallbackPrompt: defaultSystemTemplate,
  });
  const systemPrompt = renderPromptTemplate(systemTemplate, {
    computedSceneCount,
    sceneWindowSec: SCENE_WINDOW_SEC,
    normalizedDuration,
    minSceneSec: MIN_SCENE_SEC,
    hasLogo: hasLogo ? 'Yes' : 'No',
    hasProductImages: hasProductImages ? 'Yes' : 'No',
    logoRef: logoRefText,
    productImageRefs: productImageRefsText,
    brandContext,
  });

  const userPrompt = [
    `Estimated total duration (seconds): ${normalizedDuration}`,
    `Target scene count: ${computedSceneCount}`,
    `Scene window seconds: ${SCENE_WINDOW_SEC}`,
    `Language: ${language}`,
    `Has product images: ${hasProductImages ? 'Yes' : 'No'}`,
    `Has logo: ${hasLogo ? 'Yes' : 'No'}`,
    `Product image refs: ${productImageRefsText}`,
    `Logo ref: ${logoRefText}`,
    'Script:',
    String(scriptText || '').trim(),
    'Return JSON in shape: {"video_overview":{...},"scenes":[...]}',
    'Keep narration in the same language as requested.',
    'Image prompts should be cinematic, detailed, lighting-aware, and AI-image-generator friendly.',
    'Motion prompts should include camera movement + subject movement + pacing.',
    'If product images exist, use product placement only when it does not conflict with narration subject and scene intent.',
    'If logo exists, include logo placement in relevant scenes and avoid blocking key subject or CTA.',
    'When logo exists, return explicit logo_placement in each scene.',
    'When references exist, maintain style continuity and product identity across scenes.',
  ].join('\n');

  try {
    const response = await openai.responses.create({
      model,
      input: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });
    const text = String(response.output_text || '').trim();
    const parsed = parseJsonLenient(text);
    const scenes = Array.isArray(parsed?.scenes) ? parsed.scenes : [];
    if (!scenes.length) {
      return fallbackPlan({
        scriptText,
        sceneCount: computedSceneCount,
        totalDurationSec: normalizedDuration,
      });
    }
    return normalizeScenes({
      scenes,
      scriptText,
      sceneCount: computedSceneCount,
      totalDurationSec: normalizedDuration,
    });
  } catch {
    return fallbackPlan({
      scriptText,
      sceneCount: computedSceneCount,
      totalDurationSec: normalizedDuration,
    });
  }
}
