const API_BASE = String(import.meta.env.VITE_VIDEO_BACKEND_URL || 'http://localhost:8080').replace(/\/$/, '');

async function postJson(path, payload) {
  const response = await fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const debugError = {
      path,
      status: response.status,
      statusText: response.statusText,
      response: data,
      payload,
    };
    // eslint-disable-next-line no-console
    console.error('[videoCreationService] API error', debugError);

    return {
      data: null,
      error: {
        message: data?.error || `Request failed (${response.status})`,
        debug: data?.debug || null,
      },
    };
  }

  return { data, error: null };
}

export async function generateVideoScript(payload) {
  return postJson('/api/video/generate-script', payload);
}

export async function createVideoProjectAndScript({
  trustId,
  userId,
  topic,
  promptStyle,
  customPrompt,
  duration,
  durationSec,
  language,
  scriptText,
  referenceImages,
  logoImage,
}) {
  return postJson('/api/video/save-script', {
    trust_id: trustId,
    user_id: userId,
    topic,
    prompt_style: promptStyle,
    custom_prompt: customPrompt,
    duration,
    duration_sec: durationSec,
    language,
    script_text: scriptText,
    reference_images: Array.isArray(referenceImages) ? referenceImages : [],
    logo_image: logoImage || null,
  });
}

export async function addScriptVersion({
  projectId,
  trustId,
  scriptText,
  topic,
  promptStyle,
  customPrompt,
  duration,
  durationSec,
  language,
  referenceImages,
  logoImage,
  rejectPreviousLatest = false,
}) {
  return postJson('/api/video/save-script', {
    project_id: projectId,
    trust_id: trustId,
    script_text: scriptText,
    topic,
    prompt_style: promptStyle,
    custom_prompt: customPrompt,
    duration,
    duration_sec: durationSec,
    language,
    reference_images: Array.isArray(referenceImages) ? referenceImages : undefined,
    logo_image: logoImage || undefined,
    reject_previous_latest: Boolean(rejectPreviousLatest),
  });
}

export async function markScriptApproved({ projectId, trustId }) {
  return postJson('/api/video/approve-script', {
    project_id: projectId,
    trust_id: trustId,
  });
}

export async function generateVoiceover({ projectId, trustId }) {
  return postJson('/api/video/generate-voiceover', {
    project_id: projectId,
    trust_id: trustId,
  });
}

export async function generateSceneVisual({
  projectId,
  trustId,
  sceneDescription,
  sceneNarration,
  sceneNumber,
  selectedProductRefs = [],
  useLogo = true,
  logoPosition = 'top-right',
  referencePosition = 'bottom-left',
}) {
  return postJson('/api/video/generate-scene-visual', {
    project_id: projectId,
    trust_id: trustId,
    scene_description: sceneDescription,
    scene_narration: sceneNarration || '',
    scene_number: sceneNumber,
    selected_product_refs: Array.isArray(selectedProductRefs) ? selectedProductRefs : [],
    use_logo: Boolean(useLogo),
    logo_position: String(logoPosition || 'top-right'),
    reference_position: String(referencePosition || 'bottom-left'),
  });
}

export async function approveSceneImage({
  projectId,
  trustId,
  sceneNumber,
}) {
  return postJson('/api/video/approve-scene-image', {
    project_id: projectId,
    trust_id: trustId,
    scene_number: sceneNumber,
  });
}

export async function approveSceneMotion({
  projectId,
  trustId,
  sceneNumber,
}) {
  return postJson('/api/video/approve-scene-motion', {
    project_id: projectId,
    trust_id: trustId,
    scene_number: sceneNumber,
  });
}

export async function generateScenePlan({
  projectId,
  trustId,
  targetScenes,
  voiceoverDurationSec,
  maxScenes,
  scriptOverride,
  hasProductImages,
  hasLogo,
  productImageRefs,
  logoRef,
}) {
  return postJson('/api/video/generate-scene-plan', {
    project_id: projectId,
    trust_id: trustId,
    target_scenes: targetScenes,
    voiceover_duration_sec: Number(voiceoverDurationSec || 0),
    max_scenes: Number(maxScenes || 0) || undefined,
    script_override: scriptOverride,
    has_product_images: Boolean(hasProductImages),
    has_logo: Boolean(hasLogo),
    product_image_refs: Array.isArray(productImageRefs) ? productImageRefs : [],
    logo_ref: logoRef || '',
  });
}

export async function saveScenePlan({
  projectId,
  trustId,
  scenePlan,
}) {
  return postJson('/api/video/save-scene-plan', {
    project_id: projectId,
    trust_id: trustId,
    scene_plan: Array.isArray(scenePlan) ? scenePlan : [],
  });
}

export async function fetchProjectAssets({ projectId, trustId }) {
  const url = new URL(`${API_BASE}/api/video/project-assets`);
  url.searchParams.set('project_id', projectId);
  url.searchParams.set('trust_id', trustId);

  const response = await fetch(url.toString(), { method: 'GET' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { data: null, error: { message: data?.error || `Request failed (${response.status})` } };
  }

  return { data, error: null };
}

export async function fetchVideoProject({ projectId, trustId }) {
  const url = new URL(`${API_BASE}/api/video/project`);
  url.searchParams.set('project_id', projectId);
  url.searchParams.set('trust_id', trustId);

  const response = await fetch(url.toString(), { method: 'GET' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { data: null, error: { message: data?.error || `Request failed (${response.status})` } };
  }
  return { data, error: null };
}

export async function fetchFinalVideos({ trustId }) {
  const url = new URL(`${API_BASE}/api/video/final-videos`);
  url.searchParams.set('trust_id', trustId);

  const response = await fetch(url.toString(), { method: 'GET' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { data: null, error: { message: data?.error || `Request failed (${response.status})` } };
  }
  return { data, error: null };
}

export async function deleteFinalVideo(assetId) {
  const cleanAssetId = String(assetId || '').trim();
  const response = await fetch(`${API_BASE}/api/video/final-video/${encodeURIComponent(cleanAssetId)}`, {
    method: 'DELETE',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { data: null, error: { message: data?.error || `Request failed (${response.status})` } };
  }
  return { data, error: null };
}

export async function fetchAssetLibrary({ trustId, type }) {
  const url = new URL(`${API_BASE}/api/video/asset-library`);
  url.searchParams.set('trust_id', trustId);
  url.searchParams.set('type', type);

  const response = await fetch(url.toString(), { method: 'GET' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { data: null, error: { message: data?.error || `Request failed (${response.status})` } };
  }
  return { data, error: null };
}

export async function renderFinalVideo({
  projectId,
  trustId,
  expectedSceneCount,
  sceneTiming = [],
}) {
  return postJson('/api/video/render-final-video', {
    project_id: projectId,
    trust_id: trustId,
    expected_scene_count: Number(expectedSceneCount || 0),
    scene_timing: Array.isArray(sceneTiming) ? sceneTiming : [],
  });
}

export async function generateSceneMotion({
  projectId,
  trustId,
  sceneNumber,
  narration,
  visualDescription,
  imagePrompt,
  sceneImageUrl,
  currentMotionPrompt,
  sceneDurationSec,
  regenerate,
}) {
  return postJson('/api/video/generate-scene-motion', {
    project_id: projectId,
    trust_id: trustId,
    scene_number: sceneNumber,
    narration,
    visual_description: visualDescription,
    image_prompt: imagePrompt,
    scene_image_url: sceneImageUrl || '',
    current_motion_prompt: currentMotionPrompt,
    scene_duration_sec: Number(sceneDurationSec || 0),
    regenerate: Boolean(regenerate),
  });
}

export async function saveSceneMotion({
  projectId,
  trustId,
  sceneNumber,
  motionPrompt,
  narration,
  visualDescription,
  imagePrompt,
}) {
  return postJson('/api/video/save-scene-motion', {
    project_id: projectId,
    trust_id: trustId,
    scene_number: sceneNumber,
    motion_prompt: motionPrompt,
    narration,
    visual_description: visualDescription,
    image_prompt: imagePrompt,
  });
}

export async function updateProjectStatus({
  projectId,
  trustId,
  status,
}) {
  return postJson('/api/video/update-project-status', {
    project_id: projectId,
    trust_id: trustId,
    status,
  });
}

export async function fetchSocialAccounts({ trustId }) {
  const cleanTrustId = String(trustId || '').trim();
  const response = await fetch(`${API_BASE}/api/social/accounts/${encodeURIComponent(cleanTrustId)}`, { method: 'GET' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { data: null, error: { message: data?.error || `Request failed (${response.status})` } };
  }
  return { data, error: null };
}

export async function postToSocial({
  trustId,
  mediaUrl,
  mediaType,
  caption,
  platforms = [],
  postType = 'post',
  mediaAssetId = '',
}) {
  return postJson('/api/social/post', {
    trustId,
    mediaUrl,
    mediaType,
    caption,
    platforms: Array.isArray(platforms) ? platforms : [],
    postType,
    mediaAssetId: String(mediaAssetId || '').trim(),
  });
}
