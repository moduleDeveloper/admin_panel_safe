import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import PageHeader from '../components/PageHeader';
import ShareToSocialModal from '../components/ShareToSocialModal';
import './CreateVideoPage.css';
import {
  approveSceneMotion,
  approveSceneImage,
  addScriptVersion,
  createVideoProjectAndScript,
  deleteFinalVideo,
  fetchAssetLibrary,
  fetchFinalVideos,
  fetchProjectAssets,
  fetchVideoProject,
  generateSceneMotion,
  generateScenePlan,
  generateSceneVisual,
  generateVideoScript,
  generateVoiceover,
  markScriptApproved,
  renderFinalVideo,
  saveScenePlan,
  saveSceneMotion,
  updateProjectStatus,
} from '../services/videoCreationService';

const PROMPT_STYLES = ['Energetic', 'Storytelling', 'News anchor', 'Casual'];
const LANGUAGES = ['Hindi', 'English', 'Hinglish'];
const DURATION_OPTIONS_SEC = [5, 10, 15, 20, 25, 30];
const CREATION_MODES = [
  {
    id: 'image_only',
    label: 'Images',
    badge: 'Images',
    icon: '🖼️',
    desc: 'Generate AI-powered visuals for each scene',
    color: '#7C3AED',
    tint: '#f3f0ff',
  },
  {
    id: 'reel_video',
    label: 'Reel Video',
    badge: 'Full Video',
    icon: '🎬',
    desc: 'Full-length reel with motion & voiceover',
    color: '#0EA5E9',
    tint: '#f0f9ff',
  },
  {
    id: 'story_clip',
    label: 'Story Clip',
    badge: 'Short Clip',
    icon: '📱',
    desc: 'Quick 2–3 scene vertical short',
    color: '#10B981',
    tint: '#f0fdf4',
  },
];
const MODE_MAX_STEP = {
  image_only: 5,
  story_clip: 7,
  reel_video: 7,
};
const LOGO_POSITION_OPTIONS = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'center', label: 'Center' },
];
const REFERENCE_POSITION_OPTIONS = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
  { value: 'center', label: 'Center' },
];
const STORAGE_KEY = 'create_video_form_state_v1';
const YOUR_VIDEOS_CACHE_KEY = 'your_videos_cache_v1';
const ASSET_LIBRARY_CACHE_PREFIX = 'asset_library_cache_v1:';
const PAGE_SIZE = 5;
const MAX_STORED_DATAURL_LENGTH = 3000000;
const STEP_LABELS = {
  1: ' Idea',
  2: 'Script Review',
  3: 'Voiceover',
  4: 'Scene Script',
  5: 'Image Generation',
  6: 'Motion Generation',
  7: 'Final Render',
};

function mapProjectStatusToStep(statusValue) {
  const s = String(statusValue || '').trim().toLowerCase();
  if (!s) return null;
  if (s === 'final_rendered' || s === 'final_ready') return 7;
  if (s === 'final_render_in_progress') return 7;
  if (s === 'motion_generation_approved' || s === 'motion_generation_in_progress') return 6;
  if (s === 'scene_images_approved' || s === 'image_generation_approved' || s === 'image_generation_in_progress') return 5;
  if (s === 'scene_script_approved' || s === 'scene_script_generated') return 4;
  if (s === 'voiceover_ready' || s === 'voiceover_generated') return 3;
  if (s === 'script_approved' || s === 'script_generated') return 2;
  if (s === 'idea_draft') return 1;
  return null;
}

function deriveDraftStatus({
  currentStep,
  scenePlanApproved,
  allScenesApproved,
  motionReady,
  finalVideoUrl,
}) {
  if (finalVideoUrl) return 'final_rendered';
  if (currentStep >= 7) return 'final_render_in_progress';
  if (currentStep >= 6) return motionReady ? 'motion_generation_approved' : 'motion_generation_in_progress';
  if (currentStep >= 5) return allScenesApproved ? 'image_generation_approved' : 'image_generation_in_progress';
  if (currentStep >= 4) return scenePlanApproved ? 'scene_script_approved' : 'scene_script_generated';
  if (currentStep >= 3) return 'voiceover_ready';
  if (currentStep >= 2) return 'script_generated';
  return 'idea_draft';
}

function countWords(text) {
  return String(text || '').trim().split(/\s+/).filter(Boolean).length;
}

function estimateDurationSec(wordCount) {
  const wordsPerSecond = 2.2;
  return Math.min(30, Math.max(8, Math.round(wordCount / wordsPerSecond)));
}

function formatTimeSec(value) {
  const total = Math.max(0, Math.floor(Number(value || 0)));
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function sceneTargetCountByDurationSec(durationSec) {
  const sec = Number(durationSec || 30);
  return Math.max(1, Math.ceil(sec / 8));
}

function parseSceneNumberFromStoragePath(storagePath) {
  const path = String(storagePath || '');
  const match = path.match(/\/scene-(\d+)\.(png|jpg)$/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function normalizeAssetStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function isMotionAssetType(typeValue) {
  const t = String(typeValue || '').trim().toLowerCase();
  return t === 'scene_clip' || t === 'scene_motion';
}

function withCacheBust(url, key) {
  const raw = String(url || '').trim();
  if (!raw) return '';
  const token = String(key || Date.now());
  return raw.includes('?') ? `${raw}&v=${encodeURIComponent(token)}` : `${raw}?v=${encodeURIComponent(token)}`;
}

function parseSceneNumberFromMotionStoragePath(storagePath) {
  const path = String(storagePath || '');
  const match = path.match(/scene-(\d+)\.mp4$/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n) || n < 1) return null;
  return n;
}

function buildSceneDescriptionsFromScript(scriptText, durationSec) {
  const targetCount = sceneTargetCountByDurationSec(durationSec);
  const sentences = String(scriptText || '')
    .split(/(?<=[.!?])\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  if (!sentences.length) return [];

  const sceneDescriptions = [];
  const chunkSize = Math.max(1, Math.ceil(sentences.length / targetCount));
  for (let i = 0; i < sentences.length; i += chunkSize) {
    sceneDescriptions.push(sentences.slice(i, i + chunkSize).join(' '));
  }

  return sceneDescriptions.slice(0, targetCount);
}

function loadSavedState() {
  try {
    const sessionRaw = window.sessionStorage.getItem(STORAGE_KEY);
    if (sessionRaw) {
      const sessionParsed = JSON.parse(sessionRaw);
      if (sessionParsed && typeof sessionParsed === 'object') return sessionParsed;
    }
    const localRaw = window.localStorage.getItem(STORAGE_KEY);
    if (!localRaw) return null;
    const localParsed = JSON.parse(localRaw);
    if (!localParsed || typeof localParsed !== 'object') return null;
    return localParsed;
  } catch {
    return null;
  }
}

function resolveMotionPreviewClass(motionPrompt) {
  const prompt = String(motionPrompt || '').toLowerCase();
  if (prompt.includes('pan left')) return 'cvp-motion-anim-pan-left';
  if (prompt.includes('pan right')) return 'cvp-motion-anim-pan-right';
  if (prompt.includes('tilt')) return 'cvp-motion-anim-tilt';
  if (prompt.includes('zoom out')) return 'cvp-motion-anim-zoom-out';
  if (prompt.includes('zoom') || prompt.includes('push') || prompt.includes('dolly')) return 'cvp-motion-anim-zoom-in';
  return 'cvp-motion-anim-kenburns';
}

function prettyPercent(value) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(value || 0))));
  return `${pct}%`;
}

function LoaderCard({ label, progress, busyText = '' }) {
  return (
    <div className="cvp-loader-card" role="status" aria-live="polite">
      <div className="cvp-loader-head">
        <div className="cvp-loader-ring" />
        <div className="cvp-loader-copy">
          <strong>{label}</strong>
          <span>{busyText || 'Please wait...'}</span>
        </div>
        <div className="cvp-loader-pct">{prettyPercent(progress)}</div>
      </div>
      <div className="cvp-loader-track">
        <div className="cvp-loader-fill" style={{ width: prettyPercent(progress) }} />
      </div>
    </div>
  );
}

function normalizeLatestByProject(items = []) {
  const rows = Array.isArray(items) ? items : [];
  const byProject = new Map();
  rows.forEach((item) => {
    const projectId = String(item?.project_id || '').trim();
    const key = projectId || String(item?.id || '');
    if (!key) return;
    const existing = byProject.get(key);
    if (!existing) {
      byProject.set(key, item);
      return;
    }
    const existingTs = Number(new Date(existing?.created_at || 0).getTime() || 0);
    const incomingTs = Number(new Date(item?.created_at || 0).getTime() || 0);
    if (incomingTs >= existingTs) byProject.set(key, item);
  });
  return Array.from(byProject.values())
    .sort((a, b) => Number(new Date(b?.created_at || 0).getTime() || 0) - Number(new Date(a?.created_at || 0).getTime() || 0));
}

function toPersistableImageItem(item) {
  if (!item || typeof item !== 'object') return null;
  const name = String(item?.name || '').trim();
  const type = String(item?.type || 'image/*').trim() || 'image/*';
  const rawDataUrl = String(item?.dataUrl || '').trim();
  const keepDataUrl = rawDataUrl.startsWith('http')
    || rawDataUrl.startsWith('https')
    || rawDataUrl.startsWith('data:image/') && rawDataUrl.length <= MAX_STORED_DATAURL_LENGTH;
  return {
    name: name || 'image',
    type,
    dataUrl: keepDataUrl ? rawDataUrl : '',
  };
}

function isLikelyImageUrl(value) {
  const url = String(value || '').trim().toLowerCase();
  if (!url) return false;
  if (url.startsWith('data:image/')) return true;
  return /\.(png|jpg|jpeg|webp|gif|bmp|svg)(\?|#|$)/i.test(url);
}

function normalizeCollectionItemsByType(type, items = []) {
  const normalizedType = String(type || '').toLowerCase();
  const rows = Array.isArray(items) ? items : [];
  if (normalizedType === 'posts') {
    return rows.filter((item) => {
      const fileUrl = String(item?.file_url || '').trim();
      const previewUrl = String(item?.preview_image_url || '').trim();
      const storagePath = String(item?.storage_path || '').toLowerCase();
      return (
        isLikelyImageUrl(fileUrl)
        || isLikelyImageUrl(previewUrl)
        || /\.(png|jpg|jpeg|webp|gif|bmp|svg)$/.test(storagePath)
      );
    });
  }
  if (normalizedType === 'stories') {
    return rows.filter((item) => String(item?.file_url || '').trim());
  }
  if (normalizedType === 'audio') {
    return rows.filter((item) => String(item?.file_url || '').trim());
  }
  return rows;
}

function normalizeReferenceImageListForState(raw) {
  const list = Array.isArray(raw) ? raw : [];
  return list
    .map((entry, index) => {
      if (!entry) return null;
      if (typeof entry === 'string') {
        const value = String(entry || '').trim();
        if (!value) return null;
        return {
          name: `reference-${index + 1}`,
          dataUrl: value,
          type: 'image/*',
        };
      }
      const name = String(entry?.name || `reference-${index + 1}`).trim();
      const dataUrl = String(entry?.file_url || entry?.url || entry?.storage_path || entry?.dataUrl || '').trim();
      if (!dataUrl) return null;
      return {
        name: name || `reference-${index + 1}`,
        dataUrl,
        type: String(entry?.type || 'image/*'),
      };
    })
    .filter(Boolean);
}

export default function CreateVideoPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const saved = useMemo(() => loadSavedState(), []);
  const { userName = saved?.userName || 'Admin', trust = saved?.trust || null, superuserId = saved?.superuserId || null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || saved?.currentSidebarNavKey || 'company-details';

  const [topic, setTopic] = useState(saved?.topic || '');
  const [promptStyle, setPromptStyle] = useState(saved?.promptStyle || 'Energetic');
  const [customPrompt, setCustomPrompt] = useState(saved?.customPrompt || '');
  const [duration, setDuration] = useState(saved?.duration || `${Number(saved?.durationSec || 30)} sec`);
  const [durationSec, setDurationSec] = useState(Number(saved?.durationSec || 30));
  const [language, setLanguage] = useState(saved?.language || 'Hindi');
  const [creationMode, setCreationMode] = useState(saved?.creationMode || 'reel_video');
  const [showModeWelcome, setShowModeWelcome] = useState(Boolean(saved?.showModeWelcome ?? true));
  const [manualWelcomeOverride, setManualWelcomeOverride] = useState(false);
  const [referenceImages, setReferenceImages] = useState(Array.isArray(saved?.referenceImages) ? saved.referenceImages : []);
  const [logoImage, setLogoImage] = useState(saved?.logoImage || null);

  const [scriptText, setScriptText] = useState(saved?.scriptText || '');
  const [scriptVersion, setScriptVersion] = useState(Number(saved?.scriptVersion || 0));
  const [scriptStatus, setScriptStatus] = useState(String(saved?.scriptStatus || '').trim().toLowerCase() || 'pending');
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApproved, setIsApproved] = useState(Boolean(saved?.isApproved));
  const [currentStep, setCurrentStep] = useState(Math.min(7, Math.max(1, Number(saved?.currentStep || 1))));
  const [projectId, setProjectId] = useState(saved?.projectId || '');
  const [projectMessage, setProjectMessage] = useState('');
  const [error, setError] = useState('');
  const [isVoiceoverGenerating, setIsVoiceoverGenerating] = useState(false);
  const [voiceProgress, setVoiceProgress] = useState(0);
  const [voiceoverUrl, setVoiceoverUrl] = useState(saved?.voiceoverUrl || '');
  const [voiceoverDurationSec, setVoiceoverDurationSec] = useState(Number(saved?.voiceoverDurationSec || 0));
  const [sceneDescription, setSceneDescription] = useState(saved?.sceneDescription || '');
  const [imageOnlyPrompt, setImageOnlyPrompt] = useState(saved?.imageOnlyPrompt || '');
  const [imageOnlyUrl, setImageOnlyUrl] = useState(saved?.imageOnlyUrl || '');
  const [isImageOnlyGenerating, setIsImageOnlyGenerating] = useState(false);
  const [scenePlan, setScenePlan] = useState(Array.isArray(saved?.scenePlan) ? saved.scenePlan : []);
  const [scenePlanApproved, setScenePlanApproved] = useState(Boolean(saved?.scenePlanApproved));
  const [isScenePlanGenerating, setIsScenePlanGenerating] = useState(false);
  const [sceneImageUrl, setSceneImageUrl] = useState(saved?.sceneImageUrl || '');
  const [isSceneGenerating, setIsSceneGenerating] = useState(false);
  const [isApprovingSceneImage, setIsApprovingSceneImage] = useState(false);
  const [sceneProgress, setSceneProgress] = useState(0);
  const [sceneQueue, setSceneQueue] = useState(Array.isArray(saved?.sceneQueue) ? saved.sceneQueue : []);
  const [currentSceneIndex, setCurrentSceneIndex] = useState(Number(saved?.currentSceneIndex || 0));
  const [approvedScenes, setApprovedScenes] = useState(Array.isArray(saved?.approvedScenes) ? saved.approvedScenes : []);
  const [sceneImageUrls, setSceneImageUrls] = useState(Array.isArray(saved?.sceneImageUrls) ? saved.sceneImageUrls : []);
  const [approvedSceneImages, setApprovedSceneImages] = useState(Array.isArray(saved?.approvedSceneImages) ? saved.approvedSceneImages : []);
  const [previewSceneIndex, setPreviewSceneIndex] = useState(0);
  const previewAudioDurationSec = Number(voiceoverDurationSec || 0);
  const [isRenderingFinal, setIsRenderingFinal] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [isDownloadingFinal, setIsDownloadingFinal] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [finalVideoUrl, setFinalVideoUrl] = useState(saved?.finalVideoUrl || '');
  const [lockFinalVideoHydration, setLockFinalVideoHydration] = useState(false);
  const [showFinalSuccessPopup, setShowFinalSuccessPopup] = useState(false);
  const [showYourVideos, setShowYourVideos] = useState(false);
  const [showAssetLibrary, setShowAssetLibrary] = useState(false);
  const [assetLibraryType, setAssetLibraryType] = useState('posts');
  const [assetLibraryItems, setAssetLibraryItems] = useState([]);
  const [fullAssetLibraryItems, setFullAssetLibraryItems] = useState([]);
  const [isLoadingAssetLibrary, setIsLoadingAssetLibrary] = useState(false);
  const [assetLibraryPage, setAssetLibraryPage] = useState(1);
  const [assetLibraryHasMore, setAssetLibraryHasMore] = useState(false);
  const [isLoadingYourVideos, setIsLoadingYourVideos] = useState(false);
  const [yourVideos, setYourVideos] = useState(Array.isArray(saved?.yourVideos) ? saved.yourVideos : []);
  const [fullYourVideos, setFullYourVideos] = useState(Array.isArray(saved?.fullYourVideos) ? saved.fullYourVideos : []);
  const [yourVideosLoaded, setYourVideosLoaded] = useState(Boolean(saved?.yourVideosLoaded));
  const [yourVideosPage, setYourVideosPage] = useState(Math.max(1, Number(saved?.yourVideosPage || 1)));
  const [yourVideosHasMore, setYourVideosHasMore] = useState(Boolean(saved?.yourVideosHasMore));
  const [deletingVideoIds, setDeletingVideoIds] = useState({});
  const [editingVideoProjectId, setEditingVideoProjectId] = useState('');
  const [isEditMode, setIsEditMode] = useState(Boolean(saved?.isEditMode));
  const [hasAutoResumedEdit, setHasAutoResumedEdit] = useState(Boolean(saved?.hasAutoResumedEdit));
  const [deleteConfirmVideo, setDeleteConfirmVideo] = useState(null);
  const [deletePopupMessage, setDeletePopupMessage] = useState('');
  const [selectedPreviewVideo, setSelectedPreviewVideo] = useState(null);
  const [shareModalState, setShareModalState] = useState({
    open: false,
    mediaUrl: '',
    mediaType: 'video',
    mediaAssetId: '',
    projectTitle: '',
  });
  const [isMotionGenerating, setIsMotionGenerating] = useState(false);
  const [motionProgress, setMotionProgress] = useState(0);
  const [motionReady, setMotionReady] = useState(Boolean(saved?.motionReady));
  const [currentMotionIndex, setCurrentMotionIndex] = useState(Number(saved?.currentMotionIndex || 0));
  const [motionVideoUrls, setMotionVideoUrls] = useState(Array.isArray(saved?.motionVideoUrls) ? saved.motionVideoUrls : []);
  const [motionVideoStatuses, setMotionVideoStatuses] = useState(Array.isArray(saved?.motionVideoStatuses) ? saved.motionVideoStatuses : []);
  const [motionVideoErrors, setMotionVideoErrors] = useState(Array.isArray(saved?.motionVideoErrors) ? saved.motionVideoErrors : []);
  const [motionVideoLoadErrors, setMotionVideoLoadErrors] = useState(Array.isArray(saved?.motionVideoLoadErrors) ? saved.motionVideoLoadErrors : []);
  const [isMotionPreviewPlaying, setIsMotionPreviewPlaying] = useState(false);
  const [isMotionSaving, setIsMotionSaving] = useState(false);
  const [assetUsageSummary, setAssetUsageSummary] = useState(saved?.assetUsageSummary || null);
  const [assetUsageRows, setAssetUsageRows] = useState(Array.isArray(saved?.assetUsageRows) ? saved.assetUsageRows : []);
  const progressTimersRef = useRef({});
  const motionPreviewVideoRef = useRef(null);
  const motionPreviewAudioRef = useRef(null);
  const motionPreviewImageTimerRef = useRef(null);
  const projectRehydrateTriedRef = useRef('');
  const draftStatusSyncRef = useRef('');
  const voiceoverAutoRequestedRef = useRef('');

  const startSmoothProgress = (key, setter) => {
    if (progressTimersRef.current[key]) window.clearInterval(progressTimersRef.current[key]);
    setter(3);
    progressTimersRef.current[key] = window.setInterval(() => {
      setter((prev) => {
        const next = prev + (prev < 70 ? 7 : prev < 90 ? 3 : 1);
        return Math.min(95, next);
      });
    }, 350);
  };

  const finishSmoothProgress = (key, setter) => {
    if (progressTimersRef.current[key]) {
      window.clearInterval(progressTimersRef.current[key]);
      delete progressTimersRef.current[key];
    }
    setter(100);
    window.setTimeout(() => setter(0), 500);
  };

  const activeMode = useMemo(
    () => CREATION_MODES.find((item) => item.id === creationMode) || CREATION_MODES[1],
    [creationMode],
  );
  const modeMaxStep = MODE_MAX_STEP[creationMode] || 7;
  const visibleSteps = useMemo(
    () => [1, 2, 3, 4, 5, 6, 7].filter((step) => step <= modeMaxStep),
    [modeMaxStep],
  );
  const visibleStepIndex = Math.max(1, visibleSteps.indexOf(currentStep) + 1);
  const durationOptions = creationMode === 'story_clip' ? [5, 10] : DURATION_OPTIONS_SEC;
  const isModeLocked = currentStep > 1;
  const isVideoFlowGenerating = creationMode !== 'image_only' && (
    isGenerating
    || isVoiceoverGenerating
    || isScenePlanGenerating
    || isSceneGenerating
    || isMotionGenerating
    || isMotionSaving
    || isRenderingFinal
  );
  const videoFlowLoaderLabel = isRenderingFinal
    ? 'Rendering final video'
    : isMotionSaving
      ? 'Saving motion'
      : isMotionGenerating
        ? 'Generating motion'
        : isSceneGenerating
          ? 'Generating scene image'
          : isScenePlanGenerating
            ? 'Generating scene script'
            : isVoiceoverGenerating
              ? 'Generating voiceover'
              : 'Processing';
  const videoFlowLoaderProgress = isRenderingFinal
    ? renderProgress
    : (isMotionSaving || isMotionGenerating)
      ? motionProgress
      : (isSceneGenerating || isScenePlanGenerating)
        ? sceneProgress
        : isVoiceoverGenerating
          ? voiceProgress
          : 18;
  const collectionView = useMemo(() => {
    const params = new URLSearchParams(location.search || '');
    const value = String(params.get('collection') || '').trim().toLowerCase();
    return ['videos', 'posts', 'stories', 'audio'].includes(value) ? value : '';
  }, [location.search]);
  const wordCount = useMemo(() => countWords(scriptText), [scriptText]);
  const estimatedDuration = useMemo(() => estimateDurationSec(wordCount), [wordCount]);
  const totalScenes = sceneQueue.length;
  const currentSceneNumber = Math.min(totalScenes, currentSceneIndex + 1);
  const currentSceneNarration = String(scenePlan[currentSceneIndex]?.narration || '').trim();
  const allScenesApproved = totalScenes > 0 && approvedScenes.length === totalScenes;

  useEffect(() => {
    if (collectionView) return;
    if (isEditMode || hasAutoResumedEdit) return;
    if (!showModeWelcome) return;
    if (manualWelcomeOverride) return;
    const hasInProgressDraft = Boolean(
      String(projectId || '').trim()
      || String(scriptText || '').trim()
      || String(voiceoverUrl || '').trim()
      || String(finalVideoUrl || '').trim()
      || scenePlan.length > 0
      || sceneQueue.length > 0
      || sceneImageUrls.some((url) => String(url || '').trim())
      || motionVideoUrls.some((url) => String(url || '').trim())
      || currentStep > 1,
    );
    if (hasInProgressDraft) {
      setShowModeWelcome(false);
      return;
    }
    setShowModeWelcome(true);
    setCurrentStep(1);
  }, [
    collectionView,
    isEditMode,
    hasAutoResumedEdit,
    showModeWelcome,
    manualWelcomeOverride,
    projectId,
    scriptText,
    voiceoverUrl,
    finalVideoUrl,
    scenePlan.length,
    sceneQueue.length,
    sceneImageUrls,
    motionVideoUrls,
    currentStep,
  ]);
  const motionScenes = useMemo(() => {
    const sceneCount = Math.max(
      scenePlan.length,
      approvedSceneImages.length,
      sceneImageUrls.length,
      motionVideoUrls.length,
      motionVideoStatuses.length,
      motionVideoErrors.length,
    );
    return Array.from({ length: sceneCount }).map((_, index) => {
      const scene = scenePlan[index] || {};
      return {
        sceneNo: Number(scene.scene_number || index + 1),
        motionPrompt: String(scene.motion_prompt || '').trim() || 'Cinematic push-in, slight parallax, smooth transition.',
        imageUrl: approvedSceneImages[index] || sceneImageUrls[index] || '',
        motionVideoUrl: motionVideoUrls[index] || '',
        motionVideoStatus: motionVideoStatuses[index] || '',
        motionVideoError: motionVideoErrors[index] || '',
        motionVideoLoadError: Boolean(motionVideoLoadErrors[index]),
        narration: String(scene.narration || '').trim(),
        visualDescription: String(scene.visual_description || scene.narration || '').trim(),
        imagePrompt: String(scene.image_prompt || scene.visual_prompt || scene.narration || '').trim(),
      };
    });
  }, [scenePlan, approvedSceneImages, sceneImageUrls, motionVideoUrls, motionVideoStatuses, motionVideoErrors, motionVideoLoadErrors]);
  const activeMotionScene = motionScenes[currentMotionIndex] || null;
  useEffect(() => {
    if (motionScenes.length === 0) return;
    if (currentMotionIndex >= motionScenes.length) {
      setCurrentMotionIndex(motionScenes.length - 1);
    }
  }, [currentMotionIndex, motionScenes.length]);
  const activeMotionTiming = useMemo(() => {
    const scene = scenePlan[currentMotionIndex] || {};
    const rawStartSec = Number(scene.start_sec || 0);
    const rawEndSec = Number(scene.end_sec || 0);
    const hasStoredTiming = Number.isFinite(rawStartSec) && Number.isFinite(rawEndSec) && rawEndSec > rawStartSec;
    if (hasStoredTiming) {
      return { startSec: rawStartSec, endSec: rawEndSec, durationSec: Math.max(0, rawEndSec - rawStartSec) };
    }
    const totalAudioSec = Number(previewAudioDurationSec || estimatedDuration || 0);
    const totalSceneCount = Math.max(1, motionScenes.length || scenePlan.length || 1);
    const chunk = totalAudioSec > 0 ? totalAudioSec / totalSceneCount : 0;
    const startSec = Math.max(0, Math.round(currentMotionIndex * chunk));
    const endSec = Math.max(startSec, Math.round((currentMotionIndex + 1) * chunk));
    return { startSec, endSec, durationSec: Math.max(0, endSec - startSec) };
  }, [scenePlan, currentMotionIndex, previewAudioDurationSec, estimatedDuration, motionScenes.length]);
  const activeMotionPreviewClass = useMemo(
    () => resolveMotionPreviewClass(activeMotionScene?.motionPrompt || ''),
    [activeMotionScene?.motionPrompt],
  );
  const motionSummary = useMemo(() => (
    scenePlan
      .map((scene, index) => ({
        sceneNo: scene.scene_number || index + 1,
        prompt: String(scene.motion_prompt || '').trim(),
      }))
      .filter((item) => item.prompt)
  ), [scenePlan]);
  useEffect(() => {
    if (!durationOptions.includes(durationSec)) {
      const next = durationOptions[0];
      setDurationSec(next);
      setDuration(`${next} sec`);
    }
  }, [durationSec, durationOptions]);
  useEffect(() => {
    if (currentStep > modeMaxStep) {
      setCurrentStep(modeMaxStep);
    }
  }, [currentStep, modeMaxStep]);
  useEffect(() => {
    if (currentStep !== 6) return undefined;
    if (!voiceoverUrl) return undefined;

    const videoEl = motionPreviewVideoRef.current;
    const audioEl = motionPreviewAudioRef.current;
    if (!audioEl) return undefined;

    const start = Number(activeMotionTiming.startSec || 0);
    const duration = Number(activeMotionTiming.durationSec || 0);
    if (duration <= 0) return undefined;

    if (!activeMotionScene?.motionVideoUrl || !videoEl) {
      audioEl.pause();
      audioEl.currentTime = start;
      setIsMotionPreviewPlaying(false);
      return () => {
        if (motionPreviewImageTimerRef.current) {
          window.clearTimeout(motionPreviewImageTimerRef.current);
          motionPreviewImageTimerRef.current = null;
        }
        audioEl.pause();
        setIsMotionPreviewPlaying(false);
      };
    }

    const syncAudioToVideo = () => {
      const mapped = start + Math.max(0, Math.min(duration, Number(videoEl.currentTime || 0)));
      audioEl.currentTime = mapped;
    };

    const handlePlay = () => {
      syncAudioToVideo();
      setIsMotionPreviewPlaying(true);
      audioEl.play().catch(() => {});
    };
    const handlePause = () => {
      audioEl.pause();
      setIsMotionPreviewPlaying(false);
    };
    const handleSeeking = () => {
      syncAudioToVideo();
    };
    const handleTimeUpdate = () => {
      const t = Number(videoEl.currentTime || 0);
      if (t >= duration) {
        videoEl.pause();
        audioEl.pause();
      }
    };
    const handleEnded = () => {
      audioEl.pause();
      setIsMotionPreviewPlaying(false);
    };

    videoEl.addEventListener('play', handlePlay);
    videoEl.addEventListener('pause', handlePause);
    videoEl.addEventListener('seeking', handleSeeking);
    videoEl.addEventListener('timeupdate', handleTimeUpdate);
    videoEl.addEventListener('ended', handleEnded);

    audioEl.currentTime = start;

    return () => {
      videoEl.removeEventListener('play', handlePlay);
      videoEl.removeEventListener('pause', handlePause);
      videoEl.removeEventListener('seeking', handleSeeking);
      videoEl.removeEventListener('timeupdate', handleTimeUpdate);
      videoEl.removeEventListener('ended', handleEnded);
      audioEl.pause();
      setIsMotionPreviewPlaying(false);
    };
  }, [currentStep, voiceoverUrl, activeMotionScene?.motionVideoUrl, activeMotionTiming.startSec, activeMotionTiming.durationSec]);

  useEffect(() => {
    if (currentStep !== 6) return;

    // Stop all playback when scene changes
    const audioEl = motionPreviewAudioRef.current;
    const videoEl = motionPreviewVideoRef.current;

    if (audioEl) {
      audioEl.pause();
      audioEl.currentTime = Number(activeMotionTiming.startSec || 0);
    }
    if (videoEl) {
      videoEl.pause();
      videoEl.currentTime = 0;
    }
    if (motionPreviewImageTimerRef.current) {
      window.clearTimeout(motionPreviewImageTimerRef.current);
      motionPreviewImageTimerRef.current = null;
    }
    setIsMotionPreviewPlaying(false);

    return () => {
      if (audioEl) audioEl.pause();
      if (videoEl) videoEl.pause();
      if (motionPreviewImageTimerRef.current) {
        window.clearTimeout(motionPreviewImageTimerRef.current);
        motionPreviewImageTimerRef.current = null;
      }
      setIsMotionPreviewPlaying(false);
    };
  }, [currentStep, currentMotionIndex, voiceoverUrl, activeMotionTiming.startSec]);

  const handleToggleMotionPreview = async () => {
    const videoEl = motionPreviewVideoRef.current;
    const audioEl = motionPreviewAudioRef.current;
    const hasVideoPreview = Boolean(activeMotionScene?.motionVideoUrl && videoEl);
    if (!hasVideoPreview) {
      if (!audioEl || !voiceoverUrl) return;
      const start = Number(activeMotionTiming.startSec || 0);
      const duration = Number(activeMotionTiming.durationSec || 0);
      if (duration <= 0) return;
      if (isMotionPreviewPlaying) {
        audioEl.pause();
        if (motionPreviewImageTimerRef.current) {
          window.clearTimeout(motionPreviewImageTimerRef.current);
          motionPreviewImageTimerRef.current = null;
        }
        setIsMotionPreviewPlaying(false);
        return;
      }
      audioEl.currentTime = start;
      try {
        await audioEl.play();
        setIsMotionPreviewPlaying(true);
        if (motionPreviewImageTimerRef.current) window.clearTimeout(motionPreviewImageTimerRef.current);
        motionPreviewImageTimerRef.current = window.setTimeout(() => {
          audioEl.pause();
          setIsMotionPreviewPlaying(false);
          motionPreviewImageTimerRef.current = null;
        }, Math.max(300, Math.round(duration * 1000)));
      } catch {
        setIsMotionPreviewPlaying(false);
      }
      return;
    }
    if (videoEl.paused) {
      try {
        await videoEl.play();
      } catch {
        // ignore play interruption
      }
      return;
    }
    videoEl.pause();
  };

  const targetScenes = creationMode === 'story_clip'
    ? 1
    : sceneTargetCountByDurationSec(Math.max(durationSec, estimatedDuration));
  const approvedImageUrls = useMemo(() => {
    const fromLocked = approvedSceneImages.filter(Boolean);
    if (fromLocked.length > 0) return fromLocked;
    return sceneImageUrls.filter((url, index) => approvedScenes.includes(index + 1) && url);
  }, [approvedSceneImages, sceneImageUrls, approvedScenes]);
  const sceneTimeline = useMemo(() => {
    if (approvedImageUrls.length === 0) return [];
    const total = Number(previewAudioDurationSec || estimatedDuration || 0);
    if (!total || total <= 0) return approvedImageUrls.map((_url, index) => ({
      scene: index + 1,
      startSec: 0,
      endSec: 0,
      label: `${formatTimeSec(0)} - ${formatTimeSec(0)}`,
    }));

    const chunk = total / approvedImageUrls.length;
    return approvedImageUrls.map((_url, index) => {
      const startSec = Math.round(index * chunk);
      const endSec = Math.round((index + 1) * chunk);
      return {
        scene: index + 1,
        startSec,
        endSec,
        label: `${formatTimeSec(startSec)} - ${formatTimeSec(endSec)}`,
      };
    });
  }, [approvedImageUrls, previewAudioDurationSec, estimatedDuration]);
  const apiBase = useMemo(() => {
    const base = String(import.meta.env.VITE_VIDEO_BACKEND_URL || 'http://localhost:8080')
      .trim()
      .replace(/\/+$/, '');
    return base.replace(/\/api$/i, '');
  }, []);
  const finalVideoDownloadUrl = useMemo(() => {
    if (!projectId || !trust?.id) return '';
    const url = new URL(`${apiBase}/api/video/download-final-video`);
    url.searchParams.set('project_id', projectId);
    url.searchParams.set('trust_id', trust.id);
    return url.toString();
  }, [apiBase, projectId, trust?.id]);

  useEffect(() => {
    const cleanProjectId = String(projectId || '').trim();
    const cleanTrustId = String(trust?.id || '').trim();
    if (!cleanProjectId || !cleanTrustId) return;
    if (projectRehydrateTriedRef.current === cleanProjectId) return;
    if (scriptText && referenceImages.length > 0 && logoImage?.dataUrl) {
      projectRehydrateTriedRef.current = cleanProjectId;
      return;
    }

    let cancelled = false;
    const hydrateFromDb = async () => {
      projectRehydrateTriedRef.current = cleanProjectId;
      const { data, error: fetchError } = await fetchVideoProject({
        projectId: cleanProjectId,
        trustId: cleanTrustId,
      });
      if (cancelled || fetchError) return;
      const project = data?.project || null;
      const latestScript = data?.latest_script || null;
      if (!project) return;

      const stepFromProjectStatus = mapProjectStatusToStep(project?.status);
      if (Number.isFinite(stepFromProjectStatus) && stepFromProjectStatus > 0) {
        setCurrentStep((prev) => {
          const safePrev = Number(prev || 1);
          return stepFromProjectStatus > safePrev ? stepFromProjectStatus : safePrev;
        });
        setShowModeWelcome(false);
      }

      if (!scriptText) {
        const dbScriptText = String(latestScript?.script_text || '').trim();
        if (dbScriptText) {
          setScriptText(dbScriptText);
          setScriptVersion(Number(latestScript?.version || 1));
          setScriptStatus(String(latestScript?.Status || '').trim().toLowerCase() || 'pending');
        }
      }

      if (referenceImages.length === 0) {
        const refs = normalizeReferenceImageListForState(project.reference_images);
        if (refs.length > 0) setReferenceImages(refs);
      }

      if (!logoImage?.dataUrl) {
        const logoUrl = String(project?.logo_url || '').trim();
        if (logoUrl) setLogoImage({ name: 'project-logo', dataUrl: logoUrl, type: 'image/*' });
      }
    };

    hydrateFromDb();
    return () => {
      cancelled = true;
    };
  }, [projectId, trust?.id, scriptText, referenceImages.length, logoImage?.dataUrl]);

  useEffect(() => {
    const cleanProjectId = String(projectId || '').trim();
    const cleanTrustId = String(trust?.id || '').trim();
    if (!cleanProjectId || !cleanTrustId) return;
    if (showModeWelcome || collectionView) return;

    const nextStatus = deriveDraftStatus({
      currentStep,
      scenePlanApproved,
      allScenesApproved,
      motionReady,
      finalVideoUrl,
    });
    if (!nextStatus) return;

    const syncKey = `${cleanProjectId}:${nextStatus}`;
    if (draftStatusSyncRef.current === syncKey) return;
    draftStatusSyncRef.current = syncKey;

    updateProjectStatus({
      projectId: cleanProjectId,
      trustId: cleanTrustId,
      status: nextStatus,
    }).then(({ error: statusError }) => {
      if (statusError) {
        draftStatusSyncRef.current = '';
      }
    }).catch(() => {
      draftStatusSyncRef.current = '';
    });
  }, [
    projectId,
    trust?.id,
    showModeWelcome,
    collectionView,
    currentStep,
    scenePlanApproved,
    allScenesApproved,
    motionReady,
    finalVideoUrl,
  ]);

  const writeYourVideosCache = (allVideos) => {
    try {
      window.localStorage.setItem(
        YOUR_VIDEOS_CACHE_KEY,
        JSON.stringify({
          trustId: trust?.id || '',
          fullVideos: Array.isArray(allVideos) ? allVideos : [],
          updatedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // ignore cache write errors
    }
  };

  const readYourVideosCache = () => {
    try {
      const raw = window.localStorage.getItem(YOUR_VIDEOS_CACHE_KEY) || window.sessionStorage.getItem(YOUR_VIDEOS_CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.trustId !== trust?.id) return null;
      if (!Array.isArray(parsed?.fullVideos)) return null;
      console.log('[your-videos][cache-hit]', {
        trustId: trust?.id || null,
        fullVideos: parsed.fullVideos.length,
        withPreview: parsed.fullVideos.filter((item) => String(item?.preview_image_url || '').trim()).length,
      });
      return parsed.fullVideos;
    } catch {
      return null;
    }
  };

  const getAssetLibraryCacheKey = (type) => `${ASSET_LIBRARY_CACHE_PREFIX}${String(type || '').trim().toLowerCase()}`;

  const readAssetLibraryCache = (type) => {
    try {
      const raw = window.localStorage.getItem(getAssetLibraryCacheKey(type)) || window.sessionStorage.getItem(getAssetLibraryCacheKey(type));
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.trustId !== trust?.id) return null;
      if (!Array.isArray(parsed?.items)) return null;
      return Array.isArray(parsed.items) ? parsed.items : [];
    } catch {
      return null;
    }
  };

  const writeAssetLibraryCache = (type, items) => {
    try {
      window.localStorage.setItem(
        getAssetLibraryCacheKey(type),
        JSON.stringify({
          trustId: trust?.id || '',
          items: Array.isArray(items) ? items : [],
          updatedAt: new Date().toISOString(),
        }),
      );
    } catch {
      // ignore
    }
  };

  useEffect(() => {
    return () => {
      Object.values(progressTimersRef.current).forEach((timerId) => window.clearInterval(timerId));
      progressTimersRef.current = {};
    };
  }, []);

  useEffect(() => {
    if (currentStep !== 5) return;
    if (sceneQueue.length > 0) return;
    if (scenePlan.length > 0) {
      const prompts = scenePlan.map((item) => String(item.visual_prompt || item.narration || '').trim()).filter(Boolean);
      if (!prompts.length) return;
      setSceneQueue(prompts);
      setCurrentSceneIndex(0);
      setSceneDescription(prompts[0]);
      setSceneImageUrl('');
      setApprovedScenes([]);
      setSceneImageUrls(new Array(prompts.length).fill(''));
      setApprovedSceneImages([]);
      return;
    }
    if (!scriptText.trim()) return;

    const autoScenes = buildSceneDescriptionsFromScript(scriptText, durationSec);
    if (!autoScenes.length) return;

    setSceneQueue(autoScenes);
    setCurrentSceneIndex(0);
    setSceneDescription(autoScenes[0]);
    setSceneImageUrl('');
    setApprovedScenes([]);
    setSceneImageUrls(new Array(autoScenes.length).fill(''));
    setApprovedSceneImages([]);
  }, [currentStep, sceneQueue.length, scriptText, durationSec, scenePlan]);

  useEffect(() => {
    if (!projectId || !trust?.id) return;

    let cancelled = false;
    const hydrateAssets = async () => {
      const { data, error: assetError } = await fetchProjectAssets({
        projectId,
        trustId: trust.id,
      });
      if (cancelled || assetError) return;

      const assets = Array.isArray(data?.assets) ? data.assets : [];
      setAssetUsageSummary(data?.usage || null);
      setAssetUsageRows(assets);
      const sceneAssets = assets.filter((item) => item?.type === 'scene_image' && item?.file_url);
      const motionClipAssets = assets.filter((item) => isMotionAssetType(item?.type));
      const voiceAssets = assets.filter((item) => item?.type === 'voiceover' && item?.file_url);

      if (voiceAssets.length > 0 && !voiceoverUrl) {
        setVoiceoverUrl(voiceAssets[voiceAssets.length - 1].file_url);
      }
      const finalAssets = assets.filter((item) => item?.type === 'final_video' && item?.file_url);
      if (!lockFinalVideoHydration && finalAssets.length > 0) {
        setFinalVideoUrl(finalAssets[finalAssets.length - 1].file_url);
      }

      if (sceneAssets.length > 0) {
        const byScene = new Map();
        const approvedByScene = new Set();
        sceneAssets.forEach((item) => {
          const sceneNo = parseSceneNumberFromStoragePath(item?.storage_path);
          if (sceneNo) {
            byScene.set(sceneNo, withCacheBust(item.file_url, item?.created_at || item?.id || Date.now()));
            if (normalizeAssetStatus(item?.status) === 'approved') {
              approvedByScene.add(sceneNo);
            }
          }
        });

        let urls = [];
        if (byScene.size > 0) {
          const length = Math.max(sceneQueue.length || 0, ...Array.from(byScene.keys()));
          urls = Array.from({ length }, (_v, index) => byScene.get(index + 1) || '');
        } else {
          urls = sceneAssets.map((item) => withCacheBust(item.file_url, item?.created_at || item?.id || Date.now()));
        }

        setSceneImageUrls(urls);
        setApprovedSceneImages(urls);
        const approvedSceneList = approvedByScene.size > 0
          ? Array.from(approvedByScene).sort((a, b) => a - b)
          : [];
        setApprovedScenes(approvedSceneList);
        if (scenePlan.length === 0) {
          setScenePlan(urls.map((url, index) => ({
            scene_number: index + 1,
            narration: '',
            image_prompt: `Scene ${index + 1}`,
            visual_prompt: `Scene ${index + 1}`,
            motion_prompt: '',
            use_logo: true,
            logo_position: 'top-right',
            reference_position: 'bottom-left',
            preview_url: url,
          })));
        }
        if (urls.length > 0) {
          setScenePlanApproved(true);
        }

        if (sceneQueue.length === 0) {
          setSceneQueue(urls.map((_item, index) => `Scene ${index + 1}`));
        }

        if (currentSceneIndex >= urls.length) {
          setCurrentSceneIndex(urls.length - 1);
        }
        if (!sceneImageUrl) {
          setSceneImageUrl(urls[Math.min(currentSceneIndex, urls.length - 1)] || '');
        }
      }

      if (motionClipAssets.length > 0) {
        const byScene = new Map();
        const statusByScene = new Map();
        motionClipAssets.forEach((item) => {
          const sceneNo = parseSceneNumberFromMotionStoragePath(item?.storage_path) || Number(item?.meta?.scene_number || 0);
          if (sceneNo) {
            if (item?.file_url) {
              byScene.set(sceneNo, withCacheBust(item.file_url, item?.created_at || item?.id || Date.now()));
            }
            statusByScene.set(sceneNo, normalizeAssetStatus(item?.status) || 'pending');
          }
        });
        if (byScene.size > 0) {
          const length = Math.max(sceneQueue.length || 0, ...Array.from(byScene.keys()));
          const urls = Array.from({ length }, (_v, index) => byScene.get(index + 1) || '');
          const statuses = Array.from({ length }, (_v, index) => statusByScene.get(index + 1) || (urls[index] ? 'pending' : ''));
          setMotionVideoUrls(urls);
          setMotionVideoStatuses(statuses);
          setMotionVideoErrors(new Array(urls.length).fill(''));
          setMotionReady(urls.some(Boolean));
        } else {
          const urls = motionClipAssets.map((item) => (item?.file_url
            ? withCacheBust(item.file_url, item?.created_at || item?.id || Date.now())
            : ''));
          const statuses = motionClipAssets.map((item, index) => normalizeAssetStatus(item?.status) || (urls[index] ? 'pending' : ''));
          setMotionVideoUrls(urls);
          setMotionVideoStatuses(statuses);
          setMotionVideoErrors(new Array(urls.length).fill(''));
          setMotionReady(urls.some(Boolean));
        }
      }

      if (isEditMode && !hasAutoResumedEdit) {
        const hasFinal = finalAssets.length > 0;
        const hasMotion = motionClipAssets.length > 0;
        const hasScenes = sceneAssets.length > 0;
        const hasVoice = voiceAssets.length > 0;
        let resumeStepFromAssets = 2;
        if (hasFinal) resumeStepFromAssets = 7;
        else if (hasMotion) resumeStepFromAssets = 6;
        else if (hasScenes) resumeStepFromAssets = 5;
        else if (hasVoice) resumeStepFromAssets = 4;
        const resumeStepFromStatus = mapProjectStatusToStep(project?.status) || 2;
        setCurrentStep(Math.max(resumeStepFromAssets, resumeStepFromStatus));
        setHasAutoResumedEdit(true);
      }
    };

    hydrateAssets();
    return () => {
      cancelled = true;
    };
  }, [projectId, trust?.id, currentStep, sceneQueue.length, currentSceneIndex, sceneImageUrl, voiceoverUrl, lockFinalVideoHydration, scenePlan.length, isEditMode, hasAutoResumedEdit]);

  const handleGenerateScript = async ({ rejectPreviousLatest = false } = {}) => {
    if (!topic.trim()) return;
    if (!trust?.id) {
      setError('Trust context is missing. Please open this page from dashboard.');
      return;
    }

    setIsGenerating(true);
    setIsApproved(false);
    setError('');
    setProjectMessage('');

    const { data, error: generateError } = await generateVideoScript({
      topic: topic.trim(),
      prompt_style: promptStyle,
      custom_prompt: customPrompt.trim(),
      duration,
      duration_sec: durationSec,
      language,
    });

    if (generateError) {
      setError(generateError.message || 'Unable to generate script.');
      setIsGenerating(false);
      return;
    }

    const generatedScript = String(data?.script_text || '').trim();
    setScriptText(generatedScript);

    let saveData = null;
    let saveError = null;
    if (!projectId) {
      const result = await createVideoProjectAndScript({
        trustId: trust.id,
        userId: superuserId || userName || null,
        topic: topic.trim(),
        promptStyle,
        customPrompt,
        duration,
        durationSec,
        language,
        scriptText: generatedScript,
        referenceImages,
        logoImage,
      });
      saveData = result.data;
      saveError = result.error;
      if (!saveError) {
        setProjectId(saveData?.project?.id || '');
        setScriptVersion(Number(saveData?.script?.version || 1));
        setScriptStatus(String(saveData?.script?.Status || 'pending').trim().toLowerCase() || 'pending');
      }
    } else {
      const result = await addScriptVersion({
        projectId,
        trustId: trust.id,
        scriptText: generatedScript,
        topic: topic.trim(),
        promptStyle,
        customPrompt,
        duration,
        durationSec,
        language,
        referenceImages,
        logoImage,
        rejectPreviousLatest,
      });
      saveData = result.data;
      saveError = result.error;
      if (saveError) {
        const isProjectMissing = String(saveError?.message || '').toLowerCase().includes('project not found');
        if (isProjectMissing) {
          const createResult = await createVideoProjectAndScript({
            trustId: trust.id,
            userId: superuserId || userName || null,
            topic: topic.trim(),
            promptStyle,
            customPrompt,
            duration,
            durationSec,
            language,
            scriptText: generatedScript,
            referenceImages,
            logoImage,
          });
          saveData = createResult.data;
          saveError = createResult.error;
          if (!saveError) {
            setProjectId(saveData?.project?.id || '');
            setScriptVersion(Number(saveData?.script?.version || 1));
            setScriptStatus(String(saveData?.script?.Status || 'pending').trim().toLowerCase() || 'pending');
          }
        }
      } else {
        setScriptVersion(Number(saveData?.script?.version || saveData?.version || 1));
        setScriptStatus(String(saveData?.script?.Status || 'pending').trim().toLowerCase() || 'pending');
      }
    }

    if (saveError) {
      setError(saveError.message || 'Script generated, but project save failed.');
      setIsGenerating(false);
      return;
    }
    setIsApproved(false);
    setVoiceoverUrl('');
    setVoiceoverDurationSec(0);
    setScenePlan([]);
    setScenePlanApproved(false);
    setSceneQueue([]);
    setSceneImageUrl('');
    setSceneImageUrls([]);
    setApprovedScenes([]);
    setApprovedSceneImages([]);
    setMotionReady(false);
    setCurrentMotionIndex(0);
    setMotionVideoUrls([]);
    setMotionVideoStatuses([]);
    setMotionVideoErrors([]);
    setMotionVideoLoadErrors([]);

    setProjectMessage('Script generated and project saved successfully.');
    setIsGenerating(false);
    setCurrentStep(2);
  };

  const handleSaveAndContinue = async () => {
    if (!trust?.id || !scriptText.trim()) return;

    setIsGenerating(true);
    setError('');
    setProjectMessage('');

    if (!projectId) {
      const { data, error: createError } = await createVideoProjectAndScript({
        trustId: trust.id,
        userId: superuserId || userName || null,
        topic,
        promptStyle,
        customPrompt,
        duration,
        durationSec,
        language,
        scriptText,
        referenceImages,
        logoImage,
      });

      if (createError) {
        setError(createError.message || 'Unable to save project and script.');
        setIsGenerating(false);
        return { ok: false };
      }

      setProjectId(data.project.id);
      setScriptVersion(data.script.version);
      setScriptStatus(String(data?.script?.Status || 'pending').trim().toLowerCase() || 'pending');
      setProjectMessage('Script saved to database successfully.');
      setIsGenerating(false);
      return { ok: true, projectId: data.project.id };
    }

    const { data, error: versionError } = await addScriptVersion({
      projectId,
      trustId: trust.id,
      scriptText,
      topic: topic.trim(),
      promptStyle,
      customPrompt,
      duration,
      durationSec,
      language,
      referenceImages,
      logoImage,
    });

    if (versionError) {
      const isProjectMissing = String(versionError?.message || '').toLowerCase().includes('project not found');
      if (!isProjectMissing) {
        setError(versionError.message || 'Unable to save script version.');
        setIsGenerating(false);
        return { ok: false };
      }

      const { data: recreateData, error: recreateError } = await createVideoProjectAndScript({
        trustId: trust.id,
        userId: superuserId || userName || null,
        topic,
        promptStyle,
        customPrompt,
        duration,
        durationSec,
        language,
        scriptText,
        referenceImages,
        logoImage,
      });

      if (recreateError) {
        setError(recreateError.message || 'Unable to create project after stale project id.');
        setIsGenerating(false);
        return { ok: false };
      }

      setProjectId(recreateData.project.id);
      setScriptVersion(recreateData.script.version);
      setScriptStatus(String(recreateData?.script?.Status || 'pending').trim().toLowerCase() || 'pending');
      setProjectMessage('Previous project missing. New project created and script saved.');
      setIsGenerating(false);
      return { ok: true, projectId: recreateData.project.id };
    }

    setScriptVersion(Number(data?.script?.version || data?.version || 1));
    setScriptStatus(String(data?.script?.Status || 'pending').trim().toLowerCase() || 'pending');
    setProjectMessage('New script version saved successfully.');
    setIsGenerating(false);
    return { ok: true, projectId };
  };

  const handleRegenerate = async () => {
    if (!topic.trim()) return;
    setVoiceoverUrl('');
    setVoiceoverDurationSec(0);
    setScenePlan([]);
    setScenePlanApproved(false);
    await handleGenerateScript({ rejectPreviousLatest: true });
  };

  const handleReferenceImagesUpload = async (event) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const imageFiles = files.filter((file) => file.type.startsWith('image/'));
    const converted = await Promise.all(imageFiles.map((file) => new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: String(reader.result || ''),
      });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    })));

    const validImages = converted.filter(Boolean);
    if (!validImages.length) return;

    setReferenceImages((prev) => [...prev, ...validImages]);
    event.target.value = '';
  };

  const handleRemoveReferenceImage = (indexToRemove) => {
    setReferenceImages((prev) => prev.filter((_item, index) => index !== indexToRemove));
  };

  const handleLogoUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith('image/')) return;
    const converted = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve({
        name: file.name,
        size: file.size,
        type: file.type,
        dataUrl: String(reader.result || ''),
      });
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!converted) return;
    setLogoImage(converted);
    event.target.value = '';
  };

  const handleApprove = async () => {
    if (!trust?.id) {
      setError('Trust context missing. Please open this page from dashboard.');
      return;
    }
    if (!scriptText.trim()) {
      setError('Script is empty. Please generate or write script first.');
      return;
    }
    // eslint-disable-next-line no-console
    console.log('[cvp][approve] payload summary', {
      referenceCount: referenceImages.length,
      hasLogo: Boolean(logoImage?.dataUrl),
      referenceTypes: referenceImages.map((item) => item?.type || null),
      logoType: logoImage?.type || null,
    });

    const saveResult = await handleSaveAndContinue();
    if (!saveResult?.ok) return;

    const targetProjectId = saveResult.projectId || projectId;
    if (!targetProjectId) {
      setError('Project save failed. Please try again.');
      return;
    }

    const { error: approveError } = await markScriptApproved({
      projectId: targetProjectId,
      trustId: trust.id,
    });

    if (approveError) {
      setError(approveError.message || 'Unable to approve script.');
      return;
    }

    setIsApproved(true);
    setScriptStatus('approved');
    setVoiceoverUrl('');
    setVoiceoverDurationSec(0);
    setScenePlan([]);
    setScenePlanApproved(false);
    setSceneQueue([]);
    setSceneImageUrl('');
    setSceneImageUrls([]);
    setApprovedScenes([]);
    setApprovedSceneImages([]);
    setMotionReady(false);
    setCurrentMotionIndex(0);
    setMotionVideoUrls([]);
    setMotionVideoStatuses([]);
    setMotionVideoErrors([]);
    setMotionVideoLoadErrors([]);
    setProjectMessage('Script approved successfully.');
    setCurrentStep(3);
  };

  const handleGenerateVoiceover = async () => {
    if (!projectId || !trust?.id) {
      setError('Project context missing. Please save and approve script first.');
      return;
    }

    setIsVoiceoverGenerating(true);
    startSmoothProgress('voice', setVoiceProgress);
    setError('');
    setProjectMessage('');

    const { data, error: voiceError } = await generateVoiceover({
      projectId,
      trustId: trust.id,
    });

    if (voiceError) {
      setError(voiceError.message || 'Unable to generate voiceover.');
      setIsVoiceoverGenerating(false);
      finishSmoothProgress('voice', setVoiceProgress);
      return;
    }

    setVoiceoverUrl(data?.voiceover?.file_url || '');
    setProjectMessage('Voiceover generated and saved successfully.');
    setIsVoiceoverGenerating(false);
    finishSmoothProgress('voice', setVoiceProgress);
  };

  useEffect(() => {
    if (currentStep !== 3) return;
    if (!projectId || !trust?.id) return;
    if (voiceoverUrl) return;
    if (isVoiceoverGenerating) return;
    const autoKey = `${projectId}:${trust.id}:${currentStep}`;
    if (voiceoverAutoRequestedRef.current === autoKey) return;
    voiceoverAutoRequestedRef.current = autoKey;
    handleGenerateVoiceover();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, projectId, trust?.id, voiceoverUrl, isVoiceoverGenerating, isEditMode]);

  useEffect(() => {
    if (currentStep !== 3 || voiceoverUrl) {
      voiceoverAutoRequestedRef.current = '';
    }
  }, [currentStep, voiceoverUrl]);

  const goBack = () => {
    setCurrentStep((prev) => {
      const idx = visibleSteps.indexOf(prev);
      if (idx <= 0) return visibleSteps[0] || 1;
      return visibleSteps[idx - 1];
    });
  };

  const goNext = () => {
    setCurrentStep((prev) => {
      const idx = visibleSteps.indexOf(prev);
      if (idx < 0) return visibleSteps[0] || 1;
      return visibleSteps[Math.min(visibleSteps.length - 1, idx + 1)];
    });
  };

  const handleVoiceoverNext = async () => {
    if (!voiceoverUrl) return;
    if (scenePlan.length === 0) {
      const ok = await handleGenerateScenePlan();
      if (!ok) return;
    }
    goNext();
  };

  const handleGenerateScenePlan = async () => {
    if (!projectId || !trust?.id) {
      setError('Project context missing. Please save and approve script first.');
      return false;
    }
    setIsScenePlanGenerating(true);
    setError('');
    setProjectMessage('');
    const editedSceneScript = scenePlan
      .map((item) => String(item?.narration || '').trim())
      .filter(Boolean)
      .join(' ');
    const sourceScriptOverride = editedSceneScript || scriptText;

    const { data, error: planError } = await generateScenePlan({
      projectId,
      trustId: trust.id,
      targetScenes,
      voiceoverDurationSec,
      maxScenes: creationMode === 'story_clip' ? 1 : undefined,
      scriptOverride: sourceScriptOverride,
      hasProductImages: referenceImages.length > 0,
      hasLogo: Boolean(logoImage),
      productImageRefs: referenceImages.map((item) => String(item?.name || '').trim()).filter(Boolean),
      logoRef: String(logoImage?.name || '').trim(),
    });
    if (planError) {
      setError(planError.message || 'Unable to generate scene plan.');
      setIsScenePlanGenerating(false);
      return false;
    }

    const scenes = Array.isArray(data?.scenes) ? data.scenes : [];
    setScenePlan(scenes);
    setScenePlanApproved(false);
    setProjectMessage('Scene script with timestamps generated. Review and approve.');
    setIsScenePlanGenerating(false);
    return true;
  };

  const handleSceneNarrationChange = (index, value) => {
    setScenePlanApproved(false);
    setScenePlan((prev) => prev.map((item, itemIndex) => (
      itemIndex === index ? { ...item, narration: value } : item
    )));
  };

  const handleScenePlanFieldChange = (index, field, value) => {
    setScenePlanApproved(false);
    setScenePlan((prev) => prev.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    )));
  };

  const handleToggleSceneReference = (sceneIndex, refName) => {
    const cleanRef = String(refName || '').trim();
    if (!cleanRef) return;
    setScenePlan((prev) => prev.map((item, itemIndex) => {
      if (itemIndex !== sceneIndex) return item;
      const existing = Array.isArray(item.selected_product_refs) ? item.selected_product_refs : [];
      const hasRef = existing.includes(cleanRef);
      const nextRefs = hasRef ? existing.filter((entry) => entry !== cleanRef) : [...existing, cleanRef];
      return { ...item, selected_product_refs: nextRefs };
    }));
  };

  const handleSceneUseLogo = (sceneIndex, enabled) => {
    setScenePlan((prev) => prev.map((item, itemIndex) => (
      itemIndex === sceneIndex ? { ...item, use_logo: Boolean(enabled) } : item
    )));
  };

  const handleSceneLogoPosition = (sceneIndex, value) => {
    const safe = String(value || 'top-right').trim().toLowerCase();
    setScenePlan((prev) => prev.map((item, itemIndex) => (
      itemIndex === sceneIndex ? { ...item, logo_position: safe || 'top-right' } : item
    )));
  };

  const handleSceneReferencePosition = (sceneIndex, value) => {
    const safe = String(value || 'bottom-left').trim().toLowerCase();
    setScenePlan((prev) => prev.map((item, itemIndex) => (
      itemIndex === sceneIndex ? { ...item, reference_position: safe || 'bottom-left' } : item
    )));
  };

  const handleMotionPromptChange = (index, value) => {
    setScenePlan((prev) => prev.map((item, itemIndex) => (
      itemIndex === index ? { ...item, motion_prompt: value } : item
    )));
    setMotionReady(false);
  };

  const handleApproveScenePlan = async () => {
    const prompts = scenePlan
      .map((item) => String(item.image_prompt || item.visual_prompt || item.narration || '').trim())
      .filter(Boolean);
    if (!prompts.length) {
      setError('Please generate scene script first.');
      return;
    }
    const nextScenePlan = scenePlan.map((scene) => ({
      ...scene,
      selected_product_refs: Array.isArray(scene?.selected_product_refs)
        ? scene.selected_product_refs
        : [],
      use_logo: scene?.use_logo !== false,
      logo_position: String(scene?.logo_position || 'top-right').trim().toLowerCase() || 'top-right',
      reference_position: String(scene?.reference_position || 'bottom-left').trim().toLowerCase() || 'bottom-left',
    }));
    setScenePlan(nextScenePlan);
    if (projectId && trust?.id) {
      const { error: savePlanError } = await saveScenePlan({
        projectId,
        trustId: trust.id,
        scenePlan: nextScenePlan,
      });
      if (savePlanError) {
        setError(savePlanError.message || 'Unable to save scene script.');
        return;
      }
    }
    setScenePlanApproved(true);
    setSceneQueue(prompts);
    setCurrentSceneIndex(0);
    setSceneDescription(prompts[0]);
    setSceneImageUrl('');
    setApprovedScenes([]);
    setSceneImageUrls(new Array(prompts.length).fill(''));
    setApprovedSceneImages([]);
    setMotionReady(false);
    setCurrentMotionIndex(0);
    setMotionVideoUrls([]);
    setMotionVideoStatuses([]);
    setMotionVideoErrors([]);
    setMotionVideoLoadErrors([]);
    setProjectMessage('Scene script approved. Continue to scene image generation.');
    setCurrentStep(5);
  };

  const handleGenerateScene = async () => {
    if (!projectId || !trust?.id) {
      setError('Project context missing. Please complete previous steps first.');
      return;
    }
    const activeSceneDescription = sceneQueue[currentSceneIndex] || sceneDescription;
    const activeSceneNarration = String(scenePlan[currentSceneIndex]?.narration || '').trim();
    if (!activeSceneDescription.trim()) {
      setError('Please add scene description first.');
      return;
    }

    setIsSceneGenerating(true);
    startSmoothProgress('scene', setSceneProgress);
    setError('');
    setProjectMessage('');

    const { data, error: sceneError } = await generateSceneVisual({
      projectId,
      trustId: trust.id,
      sceneDescription: activeSceneDescription.trim(),
      sceneNarration: activeSceneNarration,
      sceneNumber: currentSceneIndex + 1,
      selectedProductRefs: Array.isArray(scenePlan[currentSceneIndex]?.selected_product_refs)
        ? scenePlan[currentSceneIndex].selected_product_refs
        : [],
      useLogo: scenePlan[currentSceneIndex]?.use_logo !== false,
      logoPosition: String(scenePlan[currentSceneIndex]?.logo_position || 'top-right').trim().toLowerCase() || 'top-right',
      referencePosition: String(scenePlan[currentSceneIndex]?.reference_position || 'bottom-left').trim().toLowerCase() || 'bottom-left',
    });

    if (sceneError) {
      setError(sceneError.message || 'Unable to generate scene image.');
      setIsSceneGenerating(false);
      finishSmoothProgress('scene', setSceneProgress);
      return;
    }

    const freshSceneUrl = withCacheBust(data?.asset?.file_url || '', data?.asset?.created_at || Date.now());
    setSceneImageUrl(freshSceneUrl);
    setSceneImageUrls((prev) => {
      const next = prev.length ? [...prev] : new Array(sceneQueue.length).fill('');
      next[currentSceneIndex] = freshSceneUrl;
      return next;
    });
    setProjectMessage('Scene image generated successfully.');
    setIsSceneGenerating(false);
    finishSmoothProgress('scene', setSceneProgress);
  };

  const handleApproveSceneAndNext = async () => {
    const currentImageUrl = sceneImageUrls[currentSceneIndex] || sceneImageUrl;
    if (!currentImageUrl) {
      setError('Generate scene image first, then approve.');
      return;
    }

    const sceneNo = currentSceneIndex + 1;
    if (!projectId || !trust?.id) {
      setError('Project context missing. Please reload and try again.');
      return;
    }
    setIsApprovingSceneImage(true);
    const { error: approveError } = await approveSceneImage({
      projectId,
      trustId: trust.id,
      sceneNumber: sceneNo,
    });
    setIsApprovingSceneImage(false);
    if (approveError) {
      setError(approveError.message || 'Unable to approve scene image.');
      return;
    }

    if (!approvedScenes.includes(sceneNo)) {
      setApprovedScenes((prev) => [...prev, sceneNo]);
    }
    setSceneImageUrls((prev) => {
      const next = prev.length ? [...prev] : new Array(sceneQueue.length).fill('');
      next[currentSceneIndex] = currentImageUrl;
      return next;
    });
    setApprovedSceneImages((prev) => {
      const next = prev.length ? [...prev] : new Array(sceneQueue.length).fill('');
      next[currentSceneIndex] = currentImageUrl;
      return next;
    });
    setMotionReady(false);

    const nextIndex = currentSceneIndex + 1;
    if (nextIndex < sceneQueue.length) {
      setCurrentSceneIndex(nextIndex);
      setSceneDescription(sceneQueue[nextIndex] || '');
      setSceneImageUrl(sceneImageUrls[nextIndex] || '');
      setProjectMessage(`Scene ${sceneNo} approved. Now generate Scene ${nextIndex + 1}.`);
      return;
    }

    setProjectMessage('All scenes approved successfully. You can continue to Step 5.');
  };

  const openShareModal = ({ mediaUrl, mediaType, mediaAssetId, projectTitle }) => {
    const cleanUrl = String(mediaUrl || '').trim();
    if (!cleanUrl) return;
    setShareModalState({
      open: true,
      mediaUrl: cleanUrl,
      mediaType: mediaType === 'image' ? 'image' : 'video',
      mediaAssetId: String(mediaAssetId || '').trim(),
      projectTitle: String(projectTitle || '').trim(),
    });
  };

  const handleSceneNextAction = async () => {
    const sceneNo = currentSceneIndex + 1;
    const alreadyApproved = approvedScenes.includes(sceneNo);
    if (!alreadyApproved) {
      await handleApproveSceneAndNext();
      return;
    }
    if (!projectId || !trust?.id) {
      setError('Project context missing. Please reload and try again.');
      return;
    }
    setIsApprovingSceneImage(true);
    const { error: approveError } = await approveSceneImage({
      projectId,
      trustId: trust.id,
      sceneNumber: sceneNo,
    });
    setIsApprovingSceneImage(false);
    if (approveError) {
      setError(approveError.message || 'Unable to approve scene image.');
      return;
    }
    goNext();
  };

  const handleGenerateCurrentMotion = async ({ regenerate = false } = {}) => {
    if (!projectId || !trust?.id) {
      setError('Project context missing. Please complete previous steps first.');
      return;
    }
    if (!activeMotionScene) {
      setError('No active scene found for motion generation.');
      return;
    }

    setError('');
    setProjectMessage('');
    setIsMotionGenerating(true);
    startSmoothProgress('motion', setMotionProgress);

    const { data, error: motionError } = await generateSceneMotion({
      projectId,
      trustId: trust.id,
      sceneNumber: activeMotionScene.sceneNo,
      narration: activeMotionScene.narration,
      visualDescription: activeMotionScene.visualDescription,
      imagePrompt: activeMotionScene.imagePrompt,
      sceneImageUrl: activeMotionScene.imageUrl,
      currentMotionPrompt: activeMotionScene.motionPrompt,
      sceneDurationSec: activeMotionTiming.durationSec,
      regenerate,
    });

    if (motionError) {
      setError(motionError.message || 'Unable to generate motion prompt.');
      setIsMotionGenerating(false);
      finishSmoothProgress('motion', setMotionProgress);
      return;
    }

    const newPrompt = String(data?.motion_prompt || '').trim();
    if (newPrompt) {
      handleScenePlanFieldChange(currentMotionIndex, 'motion_prompt', newPrompt);
    }
    const clipUrl = String(data?.motion_video?.video_url || '').trim();
    const clipStatus = String(data?.motion_video_status || '').trim();
    const clipError = String(data?.motion_video_error || '').trim();
    const clipWarning = String(data?.motion_video_warning || '').trim();
    if (clipUrl) {
      setMotionVideoUrls((prev) => {
        const next = prev.length ? [...prev] : new Array(motionScenes.length).fill('');
        next[currentMotionIndex] = clipUrl;
        return next;
      });
      setMotionVideoLoadErrors((prev) => {
        const next = prev.length ? [...prev] : new Array(motionScenes.length).fill(false);
        next[currentMotionIndex] = false;
        return next;
      });
    }
    setMotionVideoStatuses((prev) => {
      const next = prev.length ? [...prev] : new Array(motionScenes.length).fill('');
      const normalizedClipStatus = String(clipStatus || '').trim().toLowerCase();
      next[currentMotionIndex] = normalizedClipStatus === 'generated'
        ? 'pending'
        : (clipStatus || (clipUrl ? 'pending' : ''));
      return next;
    });
    setMotionVideoErrors((prev) => {
      const next = prev.length ? [...prev] : new Array(motionScenes.length).fill('');
      next[currentMotionIndex] = clipError || '';
      return next;
    });

    setIsMotionGenerating(false);
    finishSmoothProgress('motion', setMotionProgress);
    if (clipStatus === 'generated' || clipUrl) {
      setProjectMessage(`Motion clip generated for Scene ${activeMotionScene.sceneNo}.`);
    } else if (clipWarning) {
      setProjectMessage(`Scene ${activeMotionScene.sceneNo}: ${clipWarning}`);
    } else {
      setProjectMessage(`Motion prompt generated for Scene ${activeMotionScene.sceneNo}, but clip not generated (${clipStatus || 'unknown'}).`);
    }
  };

  const handleSaveCurrentMotion = async () => {
    if (!projectId || !trust?.id || !activeMotionScene) return false;
    setIsMotionSaving(true);
    const { error: saveError } = await saveSceneMotion({
      projectId,
      trustId: trust.id,
      sceneNumber: activeMotionScene.sceneNo,
      motionPrompt: activeMotionScene.motionPrompt,
      narration: activeMotionScene.narration,
      visualDescription: activeMotionScene.visualDescription,
      imagePrompt: activeMotionScene.imagePrompt,
    });
    setIsMotionSaving(false);
    if (saveError) {
      setError(saveError.message || 'Unable to save motion prompt.');
      return false;
    }
    return true;
  };

  const handleNextMotionScene = async () => {
    const ok = await handleSaveCurrentMotion();
    if (!ok) return false;

    const currentClipUrl = String(motionVideoUrls[currentMotionIndex] || '').trim();
    const currentClipStatus = String(motionVideoStatuses[currentMotionIndex] || '').trim().toLowerCase();
    const hasValidClip = currentClipUrl && currentClipStatus !== 'failed';

    if (hasValidClip) {
      const { error: approveError } = await approveSceneMotion({
        projectId,
        trustId: trust.id,
        sceneNumber: activeMotionScene.sceneNo,
      });
      if (approveError) {
        setError(approveError.message || 'Unable to approve scene motion clip.');
        return false;
      }
      setMotionVideoStatuses((prev) => {
        const next = prev.length ? [...prev] : new Array(motionScenes.length).fill('');
        next[currentMotionIndex] = 'approved';
        return next;
      });
    } else {
      // No motion generated or failed — treat as skipped (CSS zoom will be used)
      setMotionVideoStatuses((prev) => {
        const next = prev.length ? [...prev] : new Array(motionScenes.length).fill('');
        next[currentMotionIndex] = 'skipped';
        return next;
      });
    }

    if (currentMotionIndex < motionScenes.length - 1) {
      const nextIndex = currentMotionIndex + 1;
      setCurrentMotionIndex(nextIndex);
      setProjectMessage(`Scene ${activeMotionScene.sceneNo} motion saved. Continue Scene ${motionScenes[nextIndex].sceneNo}.`);
      return false;
    }
    setMotionReady(true);
    setProjectMessage('All scene motions saved successfully. Continue to final render.');
    return true;
  };

  const handleRenderFinalVideo = async () => {
    if (!projectId || !trust?.id) {
      setError('Project context missing.');
      return;
    }
    setFinalVideoUrl('');
    setIsRenderingFinal(true);
    startSmoothProgress('render', setRenderProgress);
    setError('');
    setProjectMessage('');

    const { data, error: renderError } = await renderFinalVideo({
      projectId,
      trustId: trust.id,
      expectedSceneCount: Math.min(5, Math.max(motionScenes.length || 0, approvedImageUrls.length || 0)),
      sceneTiming: scenePlan.map((scene, index) => ({
        scene_number: Number(scene.scene_number || index + 1),
        start_sec: Number(scene.start_sec || 0),
        end_sec: Number(scene.end_sec || 0),
      })),
    });

    if (renderError) {
      setError(renderError.message || 'Unable to render final video.');
      setIsRenderingFinal(false);
      finishSmoothProgress('render', setRenderProgress);
      return;
    }

    const url = data?.final_video?.file_url || '';
    setFinalVideoUrl(url);
    setLockFinalVideoHydration(false);
    setProjectMessage('Final video rendered successfully. You can download now.');
    setShowFinalSuccessPopup(Boolean(url));
    if (url) {
      const freshItem = {
        id: data?.final_video?.id || `local-${Date.now()}`,
        project_id: projectId,
        file_url: url,
        created_at: new Date().toISOString(),
        metrics: data?.video_summary || null,
        file_size_bytes: Number(data?.video_summary?.final_video_bytes || 0),
        aspect_ratio: String(data?.video_summary?.aspect_ratio || ''),
      };
      setFullYourVideos((prev) => {
        const nextFull = [freshItem, ...prev.filter((item) => item.file_url !== url)];
        const currentPage = Math.max(1, Number(yourVideosPage || 1));
        setYourVideos(nextFull.slice(0, currentPage * PAGE_SIZE));
        setYourVideosHasMore(nextFull.length > currentPage * PAGE_SIZE);
        writeYourVideosCache(nextFull);
        return nextFull;
      });
      setYourVideosLoaded(true);
    }
    setIsRenderingFinal(false);
    finishSmoothProgress('render', setRenderProgress);
  };

  const handleContinueToFinal = async ({ skipReadyCheck = false } = {}) => {
    if (!skipReadyCheck && !motionReady) return;
    setLockFinalVideoHydration(true);
    setFinalVideoUrl('');
    setCurrentStep(7);
    await handleRenderFinalVideo();
  };

  const handleAdvanceMotionFlow = async () => {
    const isLastScene = currentMotionIndex >= motionScenes.length - 1;
    const finished = await handleNextMotionScene();
    if (isLastScene && finished) {
      if (creationMode === 'story_clip') {
        setProjectMessage('Story clip motions completed. Rendering final clip...');
        await handleContinueToFinal({ skipReadyCheck: true });
        return;
      }
      await handleContinueToFinal({ skipReadyCheck: true });
    }
  };

  const handleDownloadApprovedImages = async () => {
    if (!approvedImageUrls.length) {
      setError('No approved images found to download.');
      return;
    }
    setError('');
    setProjectMessage('');
    setIsRenderingFinal(true);
    setRenderProgress(5);
    try {
      const zipModule = await import('jszip');
      const JSZip = zipModule.default;
      const zip = new JSZip();
      for (let i = 0; i < approvedImageUrls.length; i += 1) {
        const url = approvedImageUrls[i];
        const response = await fetch(url);
        if (!response.ok) throw new Error(`Image fetch failed (${response.status})`);
        const blob = await response.blob();
        const ext = (blob.type || '').includes('png') ? 'png' : 'jpg';
        zip.file(`scene-${i + 1}.${ext}`, blob);
        setRenderProgress(Math.min(95, Math.round(((i + 1) / approvedImageUrls.length) * 100)));
      }
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const link = document.createElement('a');
      const href = URL.createObjectURL(zipBlob);
      link.href = href;
      link.download = `approved-scenes-${projectId || 'project'}.zip`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      setRenderProgress(100);
      setProjectMessage('Approved images downloaded successfully.');
    } catch (downloadErr) {
      setError(downloadErr.message || 'Unable to download images zip.');
    } finally {
      window.setTimeout(() => {
        setIsRenderingFinal(false);
        setRenderProgress(0);
      }, 400);
    }
  };

  const handleDownloadFinalVideo = async () => {
    if (!finalVideoDownloadUrl) return;
    setIsDownloadingFinal(true);
    setDownloadProgress(0);
    try {
      const response = await fetch(finalVideoDownloadUrl);
      if (!response.ok) throw new Error(`Download failed (${response.status})`);
      const total = Number(response.headers.get('content-length') || 0);
      const reader = response.body?.getReader();
      if (!reader) throw new Error('Download stream unavailable.');
      const chunks = [];
      let received = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.length;
        if (total > 0) setDownloadProgress(Math.min(99, Math.round((received / total) * 100)));
      }
      const blob = new Blob(chunks, { type: 'video/mp4' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = objectUrl;
      link.download = `final-video-${projectId || 'project'}.mp4`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
      setDownloadProgress(100);
      window.setTimeout(() => setDownloadProgress(0), 500);
    } catch (downloadError) {
      setError(downloadError.message || 'Unable to download final video.');
      setDownloadProgress(0);
    } finally {
      setIsDownloadingFinal(false);
    }
  };

  const handleCreateNewImage = () => {
    if (isImageOnlyGenerating) return;
    setImageOnlyPrompt('');
    setImageOnlyUrl('');
    setReferenceImages([]);
    setLogoImage(null);
    setProjectId('');
    setError('');
    setProjectMessage('');
    setSceneProgress(0);
  };

  const resetVideoComposerState = () => {
    setProjectId('');
    setScriptText('');
    setScriptVersion(0);
    setScriptStatus('pending');
    setIsApproved(false);
    setScriptStatus('pending');
    setVoiceoverUrl('');
    setVoiceoverDurationSec(0);
    setScenePlan([]);
    setScenePlanApproved(false);
    setSceneQueue([]);
    setCurrentSceneIndex(0);
    setSceneDescription('');
    setSceneImageUrl('');
    setSceneImageUrls([]);
    setApprovedScenes([]);
    setApprovedSceneImages([]);
    setMotionReady(false);
    setCurrentMotionIndex(0);
    setMotionVideoUrls([]);
    setMotionVideoStatuses([]);
    setMotionVideoErrors([]);
    setMotionVideoLoadErrors([]);
    setFinalVideoUrl('');
    setAssetUsageSummary(null);
    setAssetUsageRows([]);
    setReferenceImages([]);
    setLogoImage(null);
    setProjectMessage('');
    setError('');
    setManualWelcomeOverride(false);
  };

  const handleCreateNewVideo = () => {
    resetVideoComposerState();
    setCollectionView('');
    setCreationMode('reel_video');
    setShowModeWelcome(false);
    setCurrentStep(1);
    setIsEditMode(false);
    setHasAutoResumedEdit(false);
    setEditingVideoProjectId('');
  };

  const handleOpenYourVideos = async ({ openModal = true } = {}) => {
    if (!trust?.id) return;
    if (openModal) setShowYourVideos(true);
    const hasPreviewInMemory = (fullYourVideos.length ? fullYourVideos : yourVideos)
      .some((item) => String(item?.preview_image_url || '').trim());
    if (yourVideosLoaded && fullYourVideos.length > 0 && hasPreviewInMemory) return;

    const cachedFullVideos = readYourVideosCache();
    const cacheHasPreview = Array.isArray(cachedFullVideos)
      && cachedFullVideos.some((item) => String(item?.preview_image_url || '').trim());
    if (Array.isArray(cachedFullVideos) && cacheHasPreview) {
      const initialPage = 1;
      const visible = cachedFullVideos.slice(0, PAGE_SIZE);
      setFullYourVideos(cachedFullVideos);
      setYourVideos(visible);
      setYourVideosPage(initialPage);
      setYourVideosHasMore(cachedFullVideos.length > PAGE_SIZE);
      setYourVideosLoaded(true);
      console.log('[your-videos][open] using cache', {
        visible: visible.length,
        full: cachedFullVideos.length,
        withPreviewVisible: visible.filter((item) => String(item?.preview_image_url || '').trim()).length,
      });
      return;
    }

    setIsLoadingYourVideos(true);
    try {
      const { data, error: fetchError } = await fetchFinalVideos({ trustId: trust.id });
      if (fetchError) {
        setError(fetchError.message || 'Unable to fetch final videos.');
        return;
      }
      const fullVideos = Array.isArray(data?.videos) ? data.videos : [];
      console.log('[your-videos][open] api response', {
        fullVideos: fullVideos.length,
        withPreview: fullVideos.filter((item) => String(item?.preview_image_url || '').trim()).length,
        sample: fullVideos.slice(0, 3).map((item) => ({
          id: item?.id || null,
          project_id: item?.project_id || null,
          preview_image_url: item?.preview_image_url || null,
        })),
      });
      const initialPage = 1;
      const visible = fullVideos.slice(0, PAGE_SIZE);
      setFullYourVideos(fullVideos);
      setYourVideos(visible);
      setYourVideosPage(initialPage);
      setYourVideosHasMore(fullVideos.length > PAGE_SIZE);
      setYourVideosLoaded(true);
      writeYourVideosCache(fullVideos);
      if (!fullVideos.some((item) => String(item?.preview_image_url || '').trim())) {
        console.warn('[your-videos][open] no preview_image_url returned from API for current page data');
      }
    } finally {
      setIsLoadingYourVideos(false);
    }
  };

  const handleLoadMoreYourVideos = () => {
    const source = fullYourVideos.length ? fullYourVideos : (readYourVideosCache() || []);
    const nextPage = Math.max(1, Number(yourVideosPage || 1)) + 1;
    const nextVisible = source.slice(0, nextPage * PAGE_SIZE);
    setFullYourVideos(source);
    setYourVideos(nextVisible);
    setYourVideosPage(nextPage);
    setYourVideosHasMore(nextVisible.length < source.length);
  };

  const handleOpenAssetLibrary = async (type, { openModal = true } = {}) => {
    if (!trust?.id) return;
    const normalized = String(type || 'posts').toLowerCase();
    setAssetLibraryType(normalized);
    if (openModal) setShowAssetLibrary(true);

    const cached = readAssetLibraryCache(normalized);
    const filteredCached = normalizeCollectionItemsByType(normalized, cached || []);
    const normalizedCached = normalized === 'stories'
      ? filteredCached
      : normalizeLatestByProject(filteredCached);
    if (normalizedCached.length > 0) {
      const visible = normalizedCached.slice(0, PAGE_SIZE);
      setFullAssetLibraryItems(normalizedCached);
      setAssetLibraryItems(visible);
      setAssetLibraryPage(1);
      setAssetLibraryHasMore(normalizedCached.length > PAGE_SIZE);
    }

    setIsLoadingAssetLibrary(true);
    try {
      const { data, error: fetchError } = await fetchAssetLibrary({ trustId: trust.id, type: normalized });
      if (fetchError) {
        setError(fetchError.message || 'Unable to fetch asset library.');
        return;
      }
      const raw = Array.isArray(data?.items) ? data.items : [];
      const filtered = normalizeCollectionItemsByType(normalized, raw);
      const full = normalized === 'stories' ? filtered : normalizeLatestByProject(filtered);
      const visible = full.slice(0, PAGE_SIZE);
      setFullAssetLibraryItems(full);
      setAssetLibraryItems(visible);
      setAssetLibraryPage(1);
      setAssetLibraryHasMore(full.length > PAGE_SIZE);
      writeAssetLibraryCache(normalized, full);
    } finally {
      setIsLoadingAssetLibrary(false);
    }
  };

  const handleLoadMoreAssetLibrary = () => {
    const source = fullAssetLibraryItems.length
      ? fullAssetLibraryItems
      : normalizeCollectionItemsByType(assetLibraryType, readAssetLibraryCache(assetLibraryType) || []);
    const nextPage = Math.max(1, Number(assetLibraryPage || 1)) + 1;
    const nextVisible = source.slice(0, nextPage * PAGE_SIZE);
    setFullAssetLibraryItems(source);
    setAssetLibraryItems(nextVisible);
    setAssetLibraryPage(nextPage);
    setAssetLibraryHasMore(nextVisible.length < source.length);
  };

  const handleDownloadImageOnly = async () => {
    if (!imageOnlyUrl) return;
    const response = await fetch(imageOnlyUrl);
    if (!response.ok) {
      setError(`Unable to download image (${response.status}).`);
      return;
    }
    const blob = await response.blob();
    const ext = (blob.type || '').includes('png') ? 'png' : 'jpg';
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = `generated-image-${projectId || 'project'}.${ext}`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(href);
  };

  const handleGenerateImageOnly = async () => {
    const prompt = String(imageOnlyPrompt || '').trim();
    if (!prompt) {
      setError('Please enter prompt first.');
      return;
    }
    if (!trust?.id) {
      setError('Trust context missing.');
      return;
    }
    setIsImageOnlyGenerating(true);
    setError('');
    setProjectMessage('');
    startSmoothProgress('scene', setSceneProgress);
    try {
      let workingProjectId = String(projectId || '').trim();
      if (!workingProjectId) {
        const created = await createVideoProjectAndScript({
          trustId: trust.id,
          userId: superuserId || userName || null,
          topic: prompt,
          promptStyle,
          customPrompt,
          duration: `${durationSec} sec`,
          durationSec,
          language,
          scriptText: prompt,
          referenceImages,
          logoImage,
        });
        if (created.error) throw new Error(created.error.message || 'Unable to create project.');
        workingProjectId = String(created?.data?.project?.id || '').trim();
        if (!workingProjectId) throw new Error('Project id missing after create.');
        setProjectId(workingProjectId);
      }

      const selectedProductRefs = referenceImages.map((item) => String(item?.name || '').trim()).filter(Boolean);
      const generated = await generateSceneVisual({
        projectId: workingProjectId,
        trustId: trust.id,
        sceneDescription: prompt,
        sceneNarration: prompt,
        sceneNumber: 1,
        selectedProductRefs,
        useLogo: Boolean(logoImage),
        logoPosition: 'top-right',
        referencePosition: 'bottom-left',
      });
      if (generated.error) throw new Error(generated.error.message || 'Unable to generate image.');
      const url = String(
        generated?.data?.asset?.file_url
        || generated?.data?.scene_image?.file_url
        || '',
      ).trim();
      if (!url) throw new Error('Generated image URL missing.');
      setImageOnlyUrl(withCacheBust(url, Date.now()));
      const freshAsset = generated?.data?.asset || null;
      if (freshAsset?.file_url) {
        const nextPosts = normalizeLatestByProject([freshAsset, ...fullAssetLibraryItems]);
        writeAssetLibraryCache('posts', nextPosts);
        if (collectionView === 'posts') {
          setFullAssetLibraryItems(nextPosts);
          setAssetLibraryItems(nextPosts.slice(0, Math.max(1, Number(assetLibraryPage || 1)) * PAGE_SIZE));
          setAssetLibraryHasMore(nextPosts.length > Math.max(1, Number(assetLibraryPage || 1)) * PAGE_SIZE);
        }
      }
      setProjectMessage('Image generated and saved successfully.');
    } catch (generateErr) {
      setError(generateErr.message || 'Unable to generate image.');
    } finally {
      setIsImageOnlyGenerating(false);
      finishSmoothProgress('scene', setSceneProgress);
    }
  };

  useEffect(() => {
    if (!collectionView || !trust?.id) return;
    if (collectionView === 'videos') {
      handleOpenYourVideos({ openModal: false });
      return;
    }
    handleOpenAssetLibrary(collectionView, { openModal: false });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collectionView, trust?.id]);

  const handleDeleteYourVideo = (videoItem) => {
    const cleanAssetId = String(videoItem?.id || '').trim();
    if (!cleanAssetId) {
      setDeletePopupMessage('Invalid video id.');
      return;
    }
    setDeleteConfirmVideo(videoItem);
  };

  const normalizeReferenceImageList = (raw) => {
    const list = Array.isArray(raw) ? raw : [];
    return list
      .map((entry, index) => {
        if (!entry) return null;
        if (typeof entry === 'string') {
          const value = String(entry || '').trim();
          if (!value) return null;
          return {
            name: `reference-${index + 1}`,
            dataUrl: value,
            type: 'image/*',
          };
        }
        const name = String(entry?.name || `reference-${index + 1}`).trim();
        const dataUrl = String(entry?.file_url || entry?.url || entry?.storage_path || '').trim();
        if (!dataUrl) return null;
        return {
          name: name || `reference-${index + 1}`,
          dataUrl,
          type: String(entry?.type || 'image/*'),
        };
      })
      .filter(Boolean);
  };

  const handleEditYourVideo = async (videoItem) => {
    const targetProjectId = String(videoItem?.project_id || '').trim();
    if (!targetProjectId || !trust?.id) {
      setDeletePopupMessage('Unable to open edit mode for this video.');
      return;
    }
    if (editingVideoProjectId) return;

    setEditingVideoProjectId(targetProjectId);
    setIsEditMode(true);
    setHasAutoResumedEdit(false);
    setError('');
    setProjectMessage('');
    let loaded = false;
    try {
      const { data, error: fetchError } = await fetchVideoProject({
        projectId: targetProjectId,
        trustId: trust.id,
      });
      if (fetchError) {
        setDeletePopupMessage(fetchError.message || 'Unable to load project for editing.');
        return;
      }

      const project = data?.project || null;
      const latestScript = data?.latest_script || null;
      if (!project) {
        setDeletePopupMessage('Project not found for editing.');
        return;
      }

      const resolvedDurationSec = Number(String(project.duration || '').match(/(\d+)/)?.[1] || 30);
      const script = String(latestScript?.script_text || '').trim();
      const refs = normalizeReferenceImageList(project.reference_images);
      const logoUrl = String(project.logo_url || '').trim();
      const storedScenePlan = Array.isArray(project?.scene_plan_json) ? project.scene_plan_json : [];

      setProjectId(String(project.id || targetProjectId));
      setTopic(String(project.topic || '').trim());
      setPromptStyle(String(project.prompt_style || 'Energetic').trim() || 'Energetic');
      setCustomPrompt(String(project.custom_prompt || '').trim());
      setDuration(`${resolvedDurationSec} sec`);
      setDurationSec(resolvedDurationSec);
      setLanguage(String(project.language || 'Hindi').trim() || 'Hindi');
      setReferenceImages(refs);
      setLogoImage(logoUrl ? { name: 'project-logo', dataUrl: logoUrl, type: 'image/*' } : null);
      setScriptText(script);
      setScriptVersion(Number(latestScript?.version || 1));
      setScriptStatus(String(latestScript?.Status || '').trim().toLowerCase() || 'pending');
      setIsApproved(String(project.status || '').toLowerCase() === 'script_approved' || String(project.status || '').toLowerCase() === 'voiceover_ready');
      setShowModeWelcome(false);
      setVoiceoverUrl('');
      setVoiceoverDurationSec(0);

      const initialScenePlan = storedScenePlan;
      const initialSceneQueue = initialScenePlan
        .map((item) => String(item?.image_prompt || item?.visual_prompt || item?.narration || '').trim())
        .filter(Boolean);
      setScenePlan(initialScenePlan);
      setScenePlanApproved(initialScenePlan.length > 0);
      setSceneQueue(initialSceneQueue);
      setCurrentSceneIndex(0);
      setSceneDescription(initialSceneQueue[0] || '');
      setSceneImageUrl('');
      setSceneImageUrls([]);
      setApprovedSceneImages([]);
      setApprovedScenes([]);
      setMotionReady(false);
      setMotionVideoUrls([]);
      setMotionVideoStatuses([]);
      setMotionVideoErrors([]);
      setMotionVideoLoadErrors([]);
      setFinalVideoUrl('');
      setLockFinalVideoHydration(false);
      setCurrentStep(2);
      navigate('/video/create', {
        replace: true,
        state: { userName, trust, superuserId, sidebarNavKey: currentSidebarNavKey },
      });

      const { data: assetData, error: assetError } = await fetchProjectAssets({
        projectId: String(project.id || targetProjectId),
        trustId: trust.id,
      });
      if (!assetError && assetData) {
        const assets = Array.isArray(assetData?.assets) ? assetData.assets : [];
        const sceneAssets = assets.filter((item) => item?.type === 'scene_image' && item?.file_url);
        const motionClipAssets = assets.filter((item) => isMotionAssetType(item?.type));
        const voiceAssets = assets.filter((item) => item?.type === 'voiceover' && item?.file_url);
        const finalAssets = assets.filter((item) => item?.type === 'final_video' && item?.file_url);

        if (voiceAssets.length > 0) {
          setVoiceoverUrl(voiceAssets[voiceAssets.length - 1].file_url);
        }
        if (finalAssets.length > 0) {
          setFinalVideoUrl(finalAssets[finalAssets.length - 1].file_url);
        }

        if (sceneAssets.length > 0) {
          const byScene = new Map();
          const approvedByScene = new Set();
          sceneAssets.forEach((item) => {
            const sceneNo = parseSceneNumberFromStoragePath(item?.storage_path);
            if (sceneNo) {
              byScene.set(sceneNo, withCacheBust(item.file_url, item?.created_at || item?.id || Date.now()));
              if (normalizeAssetStatus(item?.status) === 'approved') {
                approvedByScene.add(sceneNo);
              }
            }
          });
          const urls = byScene.size > 0
            ? Array.from({ length: Math.max(...Array.from(byScene.keys())) }, (_v, index) => byScene.get(index + 1) || '')
            : sceneAssets.map((item) => withCacheBust(item.file_url, item?.created_at || item?.id || Date.now()));

          setSceneImageUrls(urls);
          setApprovedSceneImages(urls);
          const approvedSceneList = approvedByScene.size > 0
            ? Array.from(approvedByScene).sort((a, b) => a - b)
            : [];
          setApprovedScenes(approvedSceneList);
          setSceneQueue(urls.map((_item, index) => `Scene ${index + 1}`));
          setSceneDescription(urls.length > 0 ? `Scene 1` : '');
          setSceneImageUrl(urls[0] || '');
          if (storedScenePlan.length === 0) {
            setScenePlan(urls.map((url, index) => ({
              scene_number: index + 1,
              narration: '',
              image_prompt: `Scene ${index + 1}`,
              visual_prompt: `Scene ${index + 1}`,
              motion_prompt: '',
              use_logo: true,
              logo_position: 'top-right',
              reference_position: 'bottom-left',
              preview_url: url,
            })));
            setScenePlanApproved(urls.length > 0);
          }
        }

        if (motionClipAssets.length > 0) {
          const byScene = new Map();
          const statusByScene = new Map();
          motionClipAssets.forEach((item) => {
            const sceneNo = parseSceneNumberFromMotionStoragePath(item?.storage_path) || Number(item?.meta?.scene_number || 0);
            if (!sceneNo) return;
            if (item?.file_url) {
              byScene.set(sceneNo, withCacheBust(item.file_url, item?.created_at || item?.id || Date.now()));
            }
            statusByScene.set(sceneNo, normalizeAssetStatus(item?.status) || 'pending');
          });
          const urls = byScene.size > 0
            ? Array.from({ length: Math.max(...Array.from(byScene.keys())) }, (_v, index) => byScene.get(index + 1) || '')
            : motionClipAssets.map((item) => (item?.file_url
              ? withCacheBust(item.file_url, item?.created_at || item?.id || Date.now())
              : ''));
          const statuses = urls.map((_url, index) => statusByScene.get(index + 1) || (urls[index] ? 'pending' : ''));
          setMotionVideoUrls(urls);
          setMotionVideoStatuses(statuses);
          setMotionVideoErrors(new Array(urls.length).fill(''));
          setMotionReady(urls.some(Boolean));
        }

        const hasFinal = finalAssets.length > 0;
        const hasMotion = motionClipAssets.length > 0;
        const hasScenes = sceneAssets.length > 0;
        const hasVoice = voiceAssets.length > 0;
        if (hasFinal) setCurrentStep(7);
        else if (hasMotion) setCurrentStep(6);
        else if (hasScenes) setCurrentStep(5);
        else if (hasVoice) setCurrentStep(4);
        else setCurrentStep(2);
        setHasAutoResumedEdit(true);
      }

      setShowYourVideos(false);
      setSelectedPreviewVideo(null);
      setProjectMessage('Project loaded in edit mode. Update script/settings and continue.');
      loaded = true;
    } finally {
      if (!loaded) {
        setIsEditMode(false);
        setHasAutoResumedEdit(false);
      }
      setEditingVideoProjectId('');
    }
  };

  const handleConfirmDeleteVideo = async () => {
    const cleanAssetId = String(deleteConfirmVideo?.id || '').trim();
    if (!cleanAssetId) {
      setDeleteConfirmVideo(null);
      setDeletePopupMessage('Invalid video id.');
      return;
    }
    if (deletingVideoIds[cleanAssetId]) return;

    const previousFull = [...fullYourVideos];
    const previousPage = Math.max(1, Number(yourVideosPage || 1));
    const optimisticFull = previousFull.filter((item) => String(item?.id || '') !== cleanAssetId);
    const optimisticVisible = optimisticFull.slice(0, previousPage * PAGE_SIZE);

    setDeletingVideoIds((prev) => ({ ...prev, [cleanAssetId]: true }));
    setFullYourVideos(optimisticFull);
    setYourVideos(optimisticVisible);
    setYourVideosHasMore(optimisticVisible.length < optimisticFull.length);
    writeYourVideosCache(optimisticFull);

    const { error: deleteError } = await deleteFinalVideo(cleanAssetId);
    if (deleteError) {
      const rollbackVisible = previousFull.slice(0, previousPage * PAGE_SIZE);
      setFullYourVideos(previousFull);
      setYourVideos(rollbackVisible);
      setYourVideosPage(previousPage);
      setYourVideosHasMore(rollbackVisible.length < previousFull.length);
      writeYourVideosCache(previousFull);
      setDeletePopupMessage(deleteError.message || 'Unable to delete video.');
      setDeletingVideoIds((prev) => {
        const next = { ...prev };
        delete next[cleanAssetId];
        return next;
      });
      setDeleteConfirmVideo(null);
      return;
    }

    // Auto-fill visible list after delete from remaining source using current page window.
    const currentPage = Math.max(1, Number(previousPage || 1));
    const refreshedVisible = optimisticFull.slice(0, currentPage * PAGE_SIZE);
    setYourVideos(refreshedVisible);
    setYourVideosPage(currentPage);
    setYourVideosHasMore(refreshedVisible.length < optimisticFull.length);
    writeYourVideosCache(optimisticFull);
    setDeletePopupMessage('Video deleted successfully.');
    setDeletingVideoIds((prev) => {
      const next = { ...prev };
      delete next[cleanAssetId];
      return next;
    });
    setDeleteConfirmVideo(null);
  };

  useEffect(() => {
    const safeReferenceImages = (Array.isArray(referenceImages) ? referenceImages : [])
      .map((item) => toPersistableImageItem(item))
      .filter(Boolean);
    const safeLogoImage = toPersistableImageItem(logoImage);
    const snapshot = {
      userName,
      trust,
      superuserId,
      currentSidebarNavKey,
      topic,
      promptStyle,
      customPrompt,
      creationMode,
      showModeWelcome,
      duration,
      durationSec,
      language,
      referenceImages: safeReferenceImages,
      logoImage: safeLogoImage,
      scriptText,
      scriptVersion,
      scriptStatus,
      isApproved,
      currentStep,
      projectId,
      voiceoverUrl,
      voiceoverDurationSec,
      sceneDescription,
      imageOnlyPrompt,
      imageOnlyUrl,
      scenePlan,
      scenePlanApproved,
      sceneImageUrl,
      sceneQueue,
      currentSceneIndex,
      approvedScenes,
      sceneImageUrls,
      approvedSceneImages,
      finalVideoUrl,
      motionReady,
      currentMotionIndex,
      motionVideoUrls,
      motionVideoStatuses,
      motionVideoErrors,
      motionVideoLoadErrors,
      assetUsageSummary,
      assetUsageRows,
      yourVideos,
      fullYourVideos,
      yourVideosLoaded,
      yourVideosPage,
      yourVideosHasMore,
      isEditMode,
      hasAutoResumedEdit,
    };

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
    } catch {
      // Ignore storage failures silently.
    }

    try {
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
        ...snapshot,
        referenceImages,
        logoImage,
      }));
    } catch {
      // Ignore storage failures silently.
    }
  }, [
    userName,
    trust,
    superuserId,
    currentSidebarNavKey,
    topic,
    promptStyle,
    customPrompt,
    creationMode,
    showModeWelcome,
    duration,
    durationSec,
    language,
    referenceImages,
    logoImage,
    scriptText,
    scriptVersion,
    scriptStatus,
    isApproved,
    currentStep,
    projectId,
    voiceoverUrl,
    voiceoverDurationSec,
    sceneDescription,
    imageOnlyPrompt,
    imageOnlyUrl,
    scenePlan,
    scenePlanApproved,
    sceneImageUrl,
    sceneQueue,
    currentSceneIndex,
    approvedScenes,
    sceneImageUrls,
    approvedSceneImages,
    finalVideoUrl,
    motionReady,
    currentMotionIndex,
    motionVideoUrls,
    motionVideoStatuses,
    motionVideoErrors,
    motionVideoLoadErrors,
    assetUsageSummary,
    assetUsageRows,
    yourVideos,
    fullYourVideos,
    yourVideosLoaded,
    yourVideosPage,
    yourVideosHasMore,
    isEditMode,
    hasAutoResumedEdit,
  ]);

  return (
    <div className="cvp-root">
      <Sidebar
        trustName={trust?.name || 'Trust'}
        onDashboard={() => navigate('/dashboard', { state: { userName, trust, superuserId, sidebarNavKey: 'dashboard' } })}
        onLogout={() => navigate('/login')}
      />

      <main className="cvp-main">
        <PageHeader
          title={creationMode === 'image_only' && !showModeWelcome && !collectionView ? 'Generate Image' : 'Create Video'}
          subtitle={
            collectionView
              ? 'Browse your collections'
              : (showModeWelcome
                ? 'Craft images, reels, and stories from one studio'
                : creationMode === 'image_only'
                  ? 'Create image from prompt and save instantly'
                  : `Guided creation flow • Stage ${visibleStepIndex}`)
          }
          onBack={() => {
            if (collectionView) {
              navigate('/video/create', {
                state: { userName, trust, superuserId, sidebarNavKey: currentSidebarNavKey },
              });
              return;
            }
            if (!showModeWelcome && currentStep > 1) {
              setCurrentStep((prev) => {
                const currentIndex = visibleSteps.indexOf(prev);
                if (currentIndex <= 0) return prev;
                return visibleSteps[currentIndex - 1];
              });
              return;
            }
            if (!showModeWelcome && currentStep === 1) {
              setManualWelcomeOverride(true);
              setShowModeWelcome(true);
              setIsEditMode(false);
              return;
            }
            navigate('/dashboard', {
              state: { userName, trust, superuserId, sidebarNavKey: currentSidebarNavKey },
            });
          }}
          right={!collectionView && !showModeWelcome ? (
            <button
              type="button"
              className="cvp-header-your-videos-btn"
              onClick={handleCreateNewVideo}
            >
              Create New Video
            </button>
          ) : null}
        />

        <section className="cvp-content" style={{ '--mode-accent': activeMode.color }}>
          {error && <div className="cvp-banner cvp-error">{error}</div>}
          {projectMessage && (
            <div className="cvp-status-popup" role="status" aria-live="polite">
              <div className="cvp-status-popup-text">{projectMessage}</div>
              <button
                type="button"
                className="cvp-status-popup-close"
                onClick={() => setProjectMessage('')}
                aria-label="Close message"
              >
                x
              </button>
            </div>
          )}

          {collectionView ? (
            <article className="cvp-card">
              <div className="cvp-step-head">
                <span className="cvp-step-num">#</span>
                <div>
                  <h3>
                    {collectionView === 'videos' ? 'My Videos' : `${collectionView.charAt(0).toUpperCase()}${collectionView.slice(1)} Collections`}
                  </h3>
                  <p>Dedicated collection page view</p>
                </div>
              </div>
              {collectionView === 'videos' ? (
                isLoadingYourVideos ? (
                  <div className="cvp-empty">Loading videos...</div>
                ) : yourVideos.length === 0 ? (
                  <div className="cvp-empty">No final videos found yet.</div>
                ) : (
                  <div className="cvp-video-grid">
                    {yourVideos.map((item, index) => (
                      <div className="cvp-video-card" key={`${item.id || 'video-page'}-${index}`}>
                        {String(item?.file_url || '').trim() ? (
                          <video
                            className="cvp-video-card-player"
                            src={item.file_url}
                            poster={String(item?.preview_image_url || '').trim() || undefined}
                            controls
                            preload="metadata"
                          />
                        ) : item?.preview_image_url ? (
                          <img className="cvp-video-card-player" src={item.preview_image_url} alt={`Preview ${index + 1}`} />
                        ) : (
                          <div className="cvp-video-card-player" />
                        )}
	                        <div className="cvp-video-card-meta">
	                          <span>Project: {String(item?.project_id || '').slice(0, 8)}...</span>
	                          <span>{item?.created_at ? new Date(item.created_at).toLocaleString() : ''}</span>
	                          <div className="cvp-video-card-actions">
	                            <button
	                              type="button"
	                              className="cvp-secondary-btn"
	                              onClick={() => openShareModal({
	                                mediaUrl: item?.file_url || '',
	                                mediaType: 'video',
	                                mediaAssetId: item?.id || '',
	                                projectTitle: String(item?.project_id || '').slice(0, 8),
	                              })}
	                            >
	                              Share
	                            </button>
	                            <button
	                              type="button"
	                              className="cvp-secondary-btn"
	                              onClick={() => handleEditYourVideo(item)}
	                              disabled={Boolean(editingVideoProjectId && editingVideoProjectId === String(item?.project_id || ''))}
	                            >
	                              {Boolean(editingVideoProjectId && editingVideoProjectId === String(item?.project_id || '')) ? 'Opening...' : 'Edit'}
	                            </button>
	                            <button
	                              type="button"
	                              className="cvp-secondary-btn"
	                              onClick={() => handleDeleteYourVideo(item)}
	                            >
	                              Delete
	                            </button>
	                          </div>
	                        </div>
	                      </div>
	                    ))}
	                  </div>
                )
              ) : (
                isLoadingAssetLibrary ? (
                  <div className="cvp-empty">Loading assets...</div>
                ) : assetLibraryItems.length === 0 ? (
                  <div className="cvp-empty">No assets found.</div>
                ) : (
                  <div className={collectionView === 'audio' ? 'cvp-audio-grid' : 'cvp-video-grid'}>
                    {assetLibraryItems.map((item, index) => (
                      collectionView === 'audio' && String(item?.file_url || '').trim() ? (
                          <div className="cvp-audio-card" key={`${item.id || 'asset-page'}-${index}`}>
                            <div className="cvp-audio-card-visual">
                              <div className="cvp-audio-icon">🎵</div>
                              <div className="cvp-audio-waves">
                                <span /><span /><span /><span /><span /><span /><span />
                              </div>
                            </div>
                            <div className="cvp-audio-card-body">
                              <div className="cvp-audio-card-title">Voiceover #{index + 1}</div>
                              <audio controls preload="metadata" src={item.file_url} className="cvp-audio-player" />
                              <div className="cvp-audio-card-meta">
                                <span>🗂 {String(item?.project_id || '').slice(0, 10)}…</span>
                                <span>🕒 {item?.created_at ? new Date(item.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : ''}</span>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="cvp-video-card" key={`${item.id || 'asset-page'}-${index}`}>
                            {collectionView === 'stories' && String(item?.file_url || '').trim() ? (
                              <video
                                className="cvp-video-card-player"
                                src={item.file_url}
                                poster={String(item?.preview_image_url || '').trim() || undefined}
                                controls
                                preload="metadata"
                              />
                            ) : item?.preview_image_url || item?.file_url ? (
                              <img className="cvp-video-card-player" src={item.preview_image_url || item.file_url} alt={`Asset ${index + 1}`} />
                            ) : (
                              <div className="cvp-video-card-player" />
                            )}
	                            <div className="cvp-video-card-meta">
	                              <span>Project: {String(item?.project_id || '').slice(0, 8)}...</span>
	                              <span>{item?.created_at ? new Date(item.created_at).toLocaleString() : ''}</span>
	                              {(collectionView === 'posts' || collectionView === 'stories') && (
	                                <div className="cvp-video-card-actions">
	                                  <button
	                                    type="button"
	                                    className="cvp-secondary-btn"
	                                    onClick={() => openShareModal({
	                                      mediaUrl: item?.file_url || '',
	                                      mediaType: collectionView === 'posts' ? 'image' : 'video',
	                                      mediaAssetId: item?.id || '',
	                                      projectTitle: String(item?.project_id || '').slice(0, 8),
	                                    })}
	                                  >
	                                    Share
	                                  </button>
	                                </div>
	                              )}
	                            </div>
	                          </div>
	                        )
                    ))}
                  </div>
                )
              )}
            </article>
          ) : (creationMode === 'image_only' && !showModeWelcome) ? (
            <article className="cvp-card">
              <div className="cvp-step-head">
                <span className="cvp-step-num">1</span>
                <div>
                  <h3>Generate Image</h3>
                  <p>Enter a prompt and create image instantly</p>
                </div>
                <button
                  type="button"
                  className="cvp-secondary-btn"
                  onClick={handleCreateNewImage}
                  disabled={isImageOnlyGenerating}
                  style={{ marginLeft: 'auto' }}
                >
                  Create New Image
                </button>
              </div>
              <label className="cvp-field">
                <span>Image prompt</span>
                <textarea
                  rows={4}
                  value={imageOnlyPrompt}
                  onChange={(event) => setImageOnlyPrompt(event.target.value)}
                  placeholder="Describe the exact visual you want to generate..."
                />
              </label>
              <label className="cvp-field">
                <span>Reference images and logo (optional)</span>
                <div className="cvp-upload-row">
                  <label className="cvp-upload-btn">
                    Add Reference Images
                    <input
                      type="file"
                      accept="image/*"
                      multiple
                      onChange={handleReferenceImagesUpload}
                    />
                  </label>
                  <label className="cvp-upload-btn cvp-upload-btn-logo">
                    Add Logo
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleLogoUpload}
                    />
                  </label>
                </div>
                {logoImage?.dataUrl && (
                  <div className="cvp-logo-preview">
                    <img src={logoImage.dataUrl} alt={logoImage.name || 'logo'} />
                    <div className="cvp-logo-meta">
                      <span title={logoImage.name}>{logoImage.name}</span>
                      <button type="button" onClick={() => setLogoImage(null)}>Remove</button>
                    </div>
                  </div>
                )}
                {referenceImages.length > 0 && (
                  <div className="cvp-reference-grid">
                    {referenceImages.map((image, index) => (
                      <div className="cvp-reference-item" key={`${image.name || 'ref'}-${index}`}>
                        <img src={image.dataUrl} alt={image.name || `reference-${index + 1}`} />
                        <div className="cvp-reference-meta">
                          <span title={image.name}>{image.name}</span>
                          <button type="button" onClick={() => handleRemoveReferenceImage(index)}>Remove</button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </label>
              <div className="cvp-action-row">
                <button type="button" className="cvp-primary-btn" onClick={handleGenerateImageOnly} disabled={isImageOnlyGenerating || !imageOnlyPrompt.trim()}>
                  {isImageOnlyGenerating ? 'Generating...' : 'Generate Image'}
                </button>
                <button type="button" className="cvp-secondary-btn" onClick={handleDownloadImageOnly} disabled={!imageOnlyUrl}>
                  Download Image
                </button>
              </div>
              {imageOnlyUrl ? (
                <div className="cvp-motion-preview-wrap">
                  <div className="cvp-motion-preview-stage">
                    <img src={imageOnlyUrl} alt="Generated visual" />
                  </div>
                </div>
              ) : null}
            </article>
          ) : showModeWelcome ? (
            <article className="cvp-card cvp-welcome-card">
              <div className="cvp-welcome-hero">
                <div className="cvp-welcome-title">Create Studio</div>
                <p className="cvp-welcome-sub">What would you like to create today?</p>
              </div>

              <div className="cvp-mode-grid cvp-mode-grid-welcome">
                {CREATION_MODES.map((mode) => (
                  <button
                    key={`welcome-${mode.id}`}
                    type="button"
                    className="cvp-mode-card-hero"
                    style={{ '--mode-color': mode.color, '--mode-tint': mode.tint }}
                    onClick={() => {
                      setIsEditMode(false);
                      setHasAutoResumedEdit(false);
                      setEditingVideoProjectId('');
                      if (mode.id !== 'image_only') {
                        resetVideoComposerState();
                      }
                      setCreationMode(mode.id);
                      setManualWelcomeOverride(false);
                      setShowModeWelcome(false);
                      setCurrentStep(1);
                    }}
                  >
                    <div className="cvp-mode-hero-icon" style={{ background: `${mode.color}18`, color: mode.color }}>
                      {mode.icon}
                    </div>
                    <div className="cvp-mode-hero-copy">
                      <div className="cvp-mode-hero-badge" style={{ background: `${mode.color}15`, color: mode.color }}>
                        {mode.badge}
                      </div>
                      <strong className="cvp-mode-hero-label">{mode.label}</strong>
                      <span className="cvp-mode-hero-desc">{mode.desc}</span>
                    </div>
                    <div className="cvp-mode-hero-arrow" style={{ color: mode.color }}>→</div>
                  </button>
                ))}
              </div>

              <div className="cvp-welcome-actions-block">
                <div className="cvp-welcome-actions-title">
                  <span className="cvp-collections-dot" />
                  Your Collections
                </div>
                <div className="cvp-welcome-actions">
                <button
                  type="button"
                  className="cvp-welcome-action-card"
                  onClick={() => navigate('/video/create?collection=videos', {
                    state: { userName, trust, superuserId, sidebarNavKey: currentSidebarNavKey },
                  })}
                >
                    <div className="cvp-welcome-action-icon" style={{ background: '#eef2ff', color: '#4f46e5' }}>🎞️</div>
                    <div className="cvp-welcome-action-copy">
                      <strong>My Videos</strong>
                      <span>View & edit your creations</span>
                    </div>
                  </button>
                <button
                  type="button"
                  className="cvp-welcome-action-card"
                  onClick={() => navigate('/video/create?collection=posts', {
                    state: { userName, trust, superuserId, sidebarNavKey: currentSidebarNavKey },
                  })}
                >
                    <div className="cvp-welcome-action-icon" style={{ background: '#fff7ed', color: '#ea580c' }}>📰</div>
                    <div className="cvp-welcome-action-copy">
                      <strong>Post Assets</strong>
                      <span>Browse & manage posts</span>
                    </div>
                  </button>
                <button
                  type="button"
                  className="cvp-welcome-action-card"
                  onClick={() => navigate('/video/create?collection=stories', {
                    state: { userName, trust, superuserId, sidebarNavKey: currentSidebarNavKey },
                  })}
                >
                    <div className="cvp-welcome-action-icon" style={{ background: '#fdf4ff', color: '#a21caf' }}>📲</div>
                    <div className="cvp-welcome-action-copy">
                      <strong>Story Assets</strong>
                      <span>Ready-to-use story visuals</span>
                    </div>
                  </button>
                <button
                  type="button"
                  className="cvp-welcome-action-card"
                  onClick={() => navigate('/video/create?collection=audio', {
                    state: { userName, trust, superuserId, sidebarNavKey: currentSidebarNavKey },
                  })}
                >
                    <div className="cvp-welcome-action-icon" style={{ background: '#f0fdf4', color: '#16a34a' }}>🎧</div>
                    <div className="cvp-welcome-action-copy">
                      <strong>Audio Library</strong>
                      <span>Voice & sound assets</span>
                    </div>
                  </button>
                </div>
              </div>
            </article>
          ) : (
            <>
              <div className="cvp-stepper">
                {visibleSteps.map((step) => (
                  <button
                    key={step}
                    type="button"
                    className={`cvp-step-chip ${currentStep === step ? 'active' : ''}`}
                    onClick={() => setCurrentStep(step)}
                  >
                    {STEP_LABELS[step]}
                  </button>
                ))}
              </div>

          {currentStep === 1 && (
            <article className="cvp-card">
              <div className="cvp-step-head">
                <span className="cvp-step-num">1</span>
                <div>
                  <h3>Idea</h3>
                  <p>Describe your idea</p>
                </div>
              </div>              <label className="cvp-field">
                <span>Topic / idea</span>
                <input
                  type="text"
                  value={topic}
                  onChange={(event) => setTopic(event.target.value)}
                  placeholder="India's fastest growing startup ecosystem"
                />
              </label>

              <div className="cvp-field">
                <span>Prompt style</span>
                <div className="cvp-pill-row">
                  {PROMPT_STYLES.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={`cvp-pill ${promptStyle === item ? 'active' : ''}`}
                      onClick={() => setPromptStyle(item)}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </div>

              <label className="cvp-field">
                <span>Custom prompt (optional)</span>
                <textarea
                  rows={3}
                  value={customPrompt}
                  onChange={(event) => setCustomPrompt(event.target.value)}
                  placeholder="Use fast cuts, make the opening line punchy, and end with a CTA..."
                />
              </label>

              <div className="cvp-field">
                <span>Reference images (optional)</span>
                <div className="cvp-upload-columns">
                  <div className="cvp-upload-col">
                    <label className="cvp-upload-btn cvp-upload-btn-logo">
                      Upload Logo
                      <input
                        type="file"
                        accept="image/*"
                        onChange={handleLogoUpload}
                        hidden
                      />
                    </label>
                    {logoImage?.dataUrl && (
                      <div className="cvp-logo-preview">
                        <img src={logoImage.dataUrl} alt={logoImage.name || 'logo'} />
                        <div className="cvp-reference-meta">
                          <span title={logoImage.name}>{logoImage.name}</span>
                          <button type="button" className="cvp-link-btn" onClick={() => setLogoImage(null)}>
                            Remove
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="cvp-upload-col">
                    <label className="cvp-upload-btn">
                      Upload Images
                      <input
                        type="file"
                        accept="image/*"
                        multiple
                        onChange={handleReferenceImagesUpload}
                        hidden
                      />
                    </label>
                    {referenceImages.length > 0 && (
                      <div className="cvp-reference-grid">
                        {referenceImages.map((image, index) => (
                          <div key={`${image.name}-${index}`} className="cvp-reference-card">
                            <img src={image.dataUrl} alt={image.name || `reference-${index + 1}`} />
                            <div className="cvp-reference-meta">
                              <span title={image.name}>{image.name}</span>
                              <button
                                type="button"
                                className="cvp-link-btn"
                                onClick={() => handleRemoveReferenceImage(index)}
                              >
                                Remove
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              <div className="cvp-split">
                <div className="cvp-field">
                  <span>Duration</span>
                  <div className="cvp-pill-row">
                    {durationOptions.map((sec) => (
                      <button
                        key={sec}
                        type="button"
                        className={`cvp-pill ${durationSec === sec ? 'active' : ''}`}
                        onClick={() => {
                          setDurationSec(sec);
                          setDuration(`${sec} sec`);
                        }}
                      >
                        {sec} sec
                      </button>
                    ))}
                  </div>
                </div>

                <div className="cvp-field">
                  <span>Language</span>
                  <div className="cvp-pill-row">
                    {LANGUAGES.map((item) => (
                      <button
                        key={item}
                        type="button"
                        className={`cvp-pill ${language === item ? 'active' : ''}`}
                        onClick={() => setLanguage(item)}
                      >
                        {item}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="cvp-action-row">
                <button
                  type="button"
                  className="cvp-primary-btn"
                  disabled={!topic.trim() || isGenerating}
                  onClick={handleGenerateScript}
                >
                  {isGenerating ? 'Generating...' : 'Generate Script and Next'}
                </button>
              </div>
            </article>
          )}

          {currentStep === 2 && (
            <article className={`cvp-card ${!scriptText ? 'is-muted' : ''}`}>
              <div className="cvp-step-head">
                <span className="cvp-step-num">2</span>
                <div>
                  <h3>Script Review & Edit</h3>
                  <p>You can edit the script before approval</p>
                </div>
                {scriptVersion > 0 && <span className="cvp-badge">v{scriptVersion}</span>}
              </div>

              {!scriptText ? (
                <div className="cvp-empty">Complete Step 1 to generate the script.</div>
              ) : (
                <>
                  <label className="cvp-field">
                    <span>Generated script</span>
                    <textarea
                      rows={8}
                      value={scriptText}
                      onChange={(event) => setScriptText(event.target.value)}
                    />
                  </label>

                  <div className="cvp-meta-row">
                    <span>{wordCount} words</span>
                    <span>~{estimatedDuration} sec estimated</span>
                    <span className={scriptStatus === 'approved' ? 'ok' : ''}>
                      {scriptStatus === 'approved'
                        ? 'Script approved'
                        : scriptStatus === 'rejected'
                          ? 'Script rejected'
                          : 'Approval pending'}
                    </span>
                  </div>

                  <div className="cvp-action-row">
                    <button type="button" className="cvp-primary-btn" onClick={handleApprove} disabled={isGenerating}>
                      {isGenerating ? 'Saving and Approving...' : 'Approve Script and Continue'}
                    </button>
                    <button type="button" className="cvp-secondary-btn" onClick={handleRegenerate}>
                      Regenerate
                    </button>
                    <button type="button" className="cvp-secondary-btn" onClick={goBack}>
                      Back
                    </button>
                  </div>
                </>
              )}
            </article>
          )}

          {currentStep === 3 && (
            <article className="cvp-card">
              <div className="cvp-step-head">
                <span className="cvp-step-num">3</span>
                <div>
                  <h3>Voiceover Generation</h3>
                  <p>Generate voiceover from the approved script</p>
                </div>
              </div>

              {voiceoverUrl ? (
                <div className="cvp-voice-preview">
                  <audio
                    controls
                    src={voiceoverUrl}
                    preload="metadata"
                    onLoadedMetadata={(event) => {
                      const duration = Number(event.currentTarget.duration || 0);
                      setVoiceoverDurationSec(Number.isFinite(duration) ? duration : 0);
                    }}
                  />
                  <div className="cvp-meta-row">
                    <span>Total voiceover: {formatTimeSec(voiceoverDurationSec)}</span>
                  </div>
                </div>
              ) : (
                <div className="cvp-empty">No voiceover generated yet.</div>
              )}

              <div className="cvp-action-row">
                <button
                  type="button"
                  className="cvp-primary-btn"
                  onClick={handleVoiceoverNext}
                  disabled={!voiceoverUrl || isScenePlanGenerating}
                >
                  {isScenePlanGenerating ? 'Generating Scene Script...' : 'Next'}
                </button>
                <button type="button" className="cvp-secondary-btn" onClick={goBack}>Back</button>
              </div>
              {isVoiceoverGenerating && (
                <LoaderCard label="Generating Voiceover" progress={voiceProgress} />
              )}
            </article>
          )}

          {currentStep === 4 && (
            <article className="cvp-card">
              <div className="cvp-step-head">
                <span className="cvp-step-num">4</span>
                <div>
                  <h3>Scene Script & Timestamps</h3>
                  <p>Break voiceover into scene-wise script with timestamps</p>
                </div>
              </div>
              <div className="cvp-meta-row" style={{ marginBottom: 10 }}>
                <span>Total Scenes Generated: {scenePlan.length || 0}</span>
              </div>

              {scenePlan.length > 0 ? (
                <div className="cvp-time-map">
                  {scenePlan.map((scene, index) => (
                    <div key={`plan-${index}`} className="cvp-time-row">
                      <span>Scene {scene.scene_number || index + 1} ({formatTimeSec(scene.start_sec)} - {formatTimeSec(scene.end_sec)})</span>
                      <textarea
                        rows={3}
                        value={scene.narration || ''}
                        onChange={(event) => handleSceneNarrationChange(index, event.target.value)}
                      />
                      <label className="cvp-mini-label">Image Prompt</label>
                      <textarea
                        rows={3}
                        value={scene.image_prompt || scene.visual_prompt || ''}
                        onChange={(event) => handleScenePlanFieldChange(index, 'image_prompt', event.target.value)}
                      />
                      <label className="cvp-mini-label">Motion Prompt</label>
                      <textarea
                        rows={3}
                        value={scene.motion_prompt || ''}
                        onChange={(event) => handleScenePlanFieldChange(index, 'motion_prompt', event.target.value)}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                <div className="cvp-empty">No scene script generated yet.</div>
              )}

              <div className="cvp-action-row">
                <button type="button" className="cvp-primary-btn" onClick={handleApproveScenePlan} disabled={scenePlan.length === 0}>
                  Approve Script and Continue
                </button>
                <button type="button" className="cvp-secondary-btn" onClick={goBack}>Back</button>
              </div>
            </article>
          )}

          {currentStep === 5 && (
            <article className="cvp-card">
              <div className="cvp-step-head">
                <span className="cvp-step-num">5</span>
                <div>
                  <h3>Image Generation (Scene by Scene)</h3>
                  <p>One-by-one scene flow: generate, approve, then next scene</p>
                </div>
              </div>

              <div className="cvp-meta-row">
                <span>Scene {currentSceneNumber || 0} of {totalScenes || 0}</span>
                <span>{approvedScenes.length} approved</span>
                <span className={allScenesApproved ? 'ok' : ''}>
                  {allScenesApproved ? 'All scenes approved' : 'Approval in progress'}
                </span>
              </div>

              {sceneImageUrls.filter(Boolean).length > 0 && (
                <div className="cvp-all-scenes">
                  <div className="cvp-all-scenes-head">All Generated Scenes ({sceneImageUrls.filter(Boolean).length})</div>
                  <div className="cvp-thumb-row">
                    {sceneImageUrls.map((url, index) => (
                      url ? (
                        <button
                          key={`${url}-${index}`}
                          type="button"
                          className={`cvp-thumb-btn ${currentSceneIndex === index ? 'active' : ''}`}
                          onClick={() => {
                            setCurrentSceneIndex(index);
                            setSceneDescription(sceneQueue[index] || sceneDescription);
                            setSceneImageUrl(url);
                          }}
                        >
                          <img src={url} alt={`Generated scene ${index + 1}`} />
                          <span>Scene {index + 1}</span>
                        </button>
                      ) : null
                    ))}
                  </div>
                </div>
              )}

              <label className="cvp-field">
                <span>Scene description</span>
                <textarea
                  rows={4}
                  value={sceneDescription}
                  onChange={(event) => {
                    const value = event.target.value;
                    setSceneDescription(value);
                    setSceneQueue((prev) => prev.map((item, index) => (index === currentSceneIndex ? value : item)));
                  }}
                  placeholder="A confident school girl robot teaching kids in a bright classroom, cinematic composition."
                />
              </label>

              <label className="cvp-field">
                <span>Scene audio script (view only)</span>
                <textarea
                  rows={3}
                  value={currentSceneNarration || 'No scene audio script available.'}
                  readOnly
                />
              </label>

              {referenceImages.length > 0 && (
                <div className="cvp-field">
                  <span>Use Reference Images In This Scene</span>
                  <div className="cvp-scene-ref-grid">
                    {referenceImages.map((image, index) => {
                      const refName = String(image?.name || `reference-${index + 1}`).trim();
                      const selectedRefs = Array.isArray(scenePlan[currentSceneIndex]?.selected_product_refs)
                        ? scenePlan[currentSceneIndex].selected_product_refs
                        : [];
                      const checked = selectedRefs.includes(refName);
                      return (
                        <label
                          key={`scene-ref-${index}`}
                          className={`cvp-scene-ref-card ${checked ? 'selected' : ''}`}
                        >
                          <div className="cvp-scene-ref-head">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => handleToggleSceneReference(currentSceneIndex, refName)}
                            />
                            <span className="cvp-scene-ref-name" title={refName}>{refName}</span>
                          </div>
                          {image?.dataUrl ? (
                            <img
                              src={image.dataUrl}
                              alt={refName}
                              className="cvp-scene-ref-thumb"
                            />
                          ) : (
                            <div className="cvp-scene-ref-thumb cvp-scene-ref-thumb-empty">No preview</div>
                          )}
                        </label>
                      );
                    })}
                  </div>
                  <label className="cvp-field">
                    <span>Reference Product Position</span>
                    <select
                      value={String(scenePlan[currentSceneIndex]?.reference_position || 'bottom-left').trim().toLowerCase() || 'bottom-left'}
                      onChange={(event) => handleSceneReferencePosition(currentSceneIndex, event.target.value)}
                    >
                      {REFERENCE_POSITION_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>{option.label}</option>
                      ))}
                    </select>
                  </label>
                </div>
              )}

              {logoImage?.name && (
                <div className="cvp-field">
                  <span>Logo Control For This Scene</span>
                  <div className="cvp-scene-logo-wrap">
                    <label className={`cvp-scene-logo-card ${scenePlan[currentSceneIndex]?.use_logo !== false ? 'selected' : ''}`}>
                      <div className="cvp-scene-ref-head">
                        <input
                          type="checkbox"
                          checked={scenePlan[currentSceneIndex]?.use_logo !== false}
                          onChange={(event) => handleSceneUseLogo(currentSceneIndex, event.target.checked)}
                        />
                        <span className="cvp-scene-ref-name" title={logoImage.name}>Use Logo In This Scene</span>
                      </div>
                      <div className="cvp-scene-logo-name" title={logoImage.name}>{logoImage.name}</div>
                      {logoImage?.dataUrl ? (
                        <img
                          src={logoImage.dataUrl}
                          alt={logoImage.name || 'Logo'}
                          className="cvp-scene-ref-thumb cvp-scene-logo-thumb"
                        />
                      ) : (
                        <div className="cvp-scene-ref-thumb cvp-scene-ref-thumb-empty">No preview</div>
                      )}
                    </label>
                  </div>
                  {scenePlan[currentSceneIndex]?.use_logo !== false && (
                    <label className="cvp-field">
                      <span>Logo Position</span>
                      <select
                        value={String(scenePlan[currentSceneIndex]?.logo_position || 'top-right').trim().toLowerCase() || 'top-right'}
                        onChange={(event) => handleSceneLogoPosition(currentSceneIndex, event.target.value)}
                      >
                        {LOGO_POSITION_OPTIONS.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  )}
                </div>
              )}

              {sceneImageUrl ? (
                <div className="cvp-scene-preview">
                  <img src={sceneImageUrl} alt="Generated scene" />
                </div>
              ) : (
                <div className="cvp-empty">No scene image generated yet.</div>
              )}

              <div className="cvp-action-row" style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 12 }}>
                <div style={{ justifySelf: 'start' }}>
                  <button type="button" className="cvp-secondary-btn" onClick={goBack}>Back to Scene Script</button>
                </div>
                <div style={{ justifySelf: 'center' }}>
                  <button type="button" className="cvp-primary-btn" onClick={handleGenerateScene} disabled={isSceneGenerating}>
                    {isSceneGenerating
                      ? 'Generating Scene Image...'
                      : (sceneImageUrls[currentSceneIndex] || sceneImageUrl)
                        ? 'Regenerate Scene Image'
                        : 'Generate Scene Image'}
                  </button>
                </div>
                <div style={{ justifySelf: 'end' }}>
                  {creationMode === 'image_only' ? (
                    <button type="button" className="cvp-primary-btn" onClick={handleDownloadApprovedImages} disabled={!allScenesApproved || isRenderingFinal}>
                      Download Images
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="cvp-primary-btn"
                      onClick={handleSceneNextAction}
                      disabled={isApprovingSceneImage || (!allScenesApproved && !sceneImageUrl)}
                    >
                      {isApprovingSceneImage ? 'Approving...' : 'Next'}
                    </button>
                  )}
                </div>
              </div>
              {isSceneGenerating && (
                <LoaderCard label="Generating Scene Image" progress={sceneProgress} />
              )}
            </article>
          )}

          {currentStep === 6 && creationMode !== 'image_only' && (
            <article className="cvp-card">
              <div className="cvp-step-head">
                <span className="cvp-step-num">6</span>
                <div>
                  <h3>Motion Generation</h3>
                  <p>Generate and save motion scene-by-scene</p>
                </div>
              </div>

              {activeMotionScene ? (
                <div className="cvp-time-map">
	                  <div className="cvp-thumb-row" style={{ marginBottom: 10 }}>
	                    {motionScenes.map((scene, index) => (
	                      <button
	                        key={`motion-scene-${scene.sceneNo}-${index}`}
	                        type="button"
	                        className={`cvp-thumb-btn ${currentMotionIndex === index ? 'active' : ''}`}
	                        onClick={() => setCurrentMotionIndex(index)}
	                        style={{ minWidth: 110 }}
	                      >
                          {scene.imageUrl ? <img src={scene.imageUrl} alt={`Scene ${scene.sceneNo}`} /> : null}
	                        <span>Scene {scene.sceneNo}</span>
	                      </button>
	                    ))}
	                  </div>
                  <div className="cvp-meta-row">
                    <span>Scene {activeMotionScene.sceneNo} of {motionScenes.length}</span>
                    <span className={motionReady ? 'ok' : ''}>{motionReady ? 'All motions saved' : 'In progress'}</span>
                    <span className={activeMotionScene.motionVideoStatus === 'generated' ? 'ok' : ''}>
                      Clip: {activeMotionScene.motionVideoStatus || 'not generated'}
                    </span>
                  </div>
	                  <div className="cvp-time-row">
	                    <span>Scene {activeMotionScene.sceneNo}</span>
	                    {activeMotionScene.imageUrl ? <img className="cvp-motion-thumb" src={activeMotionScene.imageUrl} alt={`Scene ${activeMotionScene.sceneNo}`} /> : null}
	                    <textarea
                      rows={4}
                      value={activeMotionScene.motionPrompt}
                      onChange={(event) => handleMotionPromptChange(currentMotionIndex, event.target.value)}
                    />
                  </div>
	                  {activeMotionScene.motionVideoUrl && !activeMotionScene.motionVideoLoadError ? (
	                    <div className="cvp-motion-preview-wrap">
	                      <div className="cvp-motion-preview-stage cvp-motion-video-stage">
	                        <video
	                          ref={motionPreviewVideoRef}
	                          playsInline
	                          preload="metadata"
	                          src={activeMotionScene.motionVideoUrl}
	                          className="cvp-motion-video"
                            onClick={handleToggleMotionPreview}
	                          onError={() => {
	                            setMotionVideoLoadErrors((prev) => {
	                              const next = prev.length ? [...prev] : new Array(motionScenes.length).fill(false);
	                              next[currentMotionIndex] = true;
	                              return next;
	                            });
	                          }}
	                        />
                          <button
                            type="button"
                            className="cvp-motion-overlay-btn"
                            onClick={(event) => {
                              event.stopPropagation();
                              handleToggleMotionPreview();
                            }}
                            aria-label={isMotionPreviewPlaying ? 'Pause motion preview' : 'Play motion preview'}
                          >
                            {isMotionPreviewPlaying ? '||' : 'Play'}
                          </button>
		                      </div>
		                    </div>
		                  ) : activeMotionScene.imageUrl ? (
                    <div className="cvp-motion-preview-wrap">
                      <div className={`cvp-motion-preview-stage ${activeMotionPreviewClass}`}>
                        <img src={activeMotionScene.imageUrl} alt={`Scene ${activeMotionScene.sceneNo} motion preview`} />
                        <button
                          type="button"
                          className="cvp-motion-overlay-btn"
                          onClick={handleToggleMotionPreview}
                          aria-label={isMotionPreviewPlaying ? 'Pause preview' : 'Play preview'}
                        >
                          {isMotionPreviewPlaying ? '||' : 'Play'}
                        </button>
                      </div>
                    </div>
	                  ) : null}
                    {voiceoverUrl ? (
                      <audio ref={motionPreviewAudioRef} src={voiceoverUrl} preload="metadata" style={{ display: 'none' }} />
                    ) : null}
                  {activeMotionScene.motionVideoError ? (
                    <div className="cvp-empty">Motion clip error: {activeMotionScene.motionVideoError}</div>
                  ) : null}
                  {activeMotionScene.motionVideoLoadError ? (
                    <div className="cvp-empty">Video preview load failed. Showing image preview instead.</div>
                  ) : null}
                </div>
              ) : (
                <div className="cvp-empty">No approved scenes available for motion generation.</div>
              )}

	              <div className="cvp-action-row cvp-action-row-motion">
	                <button type="button" className="cvp-secondary-btn" onClick={goBack}>Back</button>
                <button
                  type="button"
                  className="cvp-primary-btn"
                  onClick={() => {
                    const hasGeneratedMotion = Boolean(activeMotionScene?.motionVideoUrl)
                      || String(activeMotionScene?.motionVideoStatus || '').toLowerCase() === 'generated';
                    handleGenerateCurrentMotion({ regenerate: hasGeneratedMotion });
                  }}
                  disabled={isMotionGenerating || !activeMotionScene}
                >
                  {isMotionGenerating
                    ? 'Generating Motion...'
                    : (Boolean(activeMotionScene?.motionVideoUrl)
                      || String(activeMotionScene?.motionVideoStatus || '').toLowerCase() === 'generated')
                      ? 'Regenerate Motion'
                      : 'Generate Motion'}
                </button>
	                <button
	                  type="button"
	                  className="cvp-primary-btn"
	                  onClick={handleAdvanceMotionFlow}
	                  disabled={
	                    isMotionSaving
	                    || !activeMotionScene
	                    || isRenderingFinal
	                  }
	                >
                  {isRenderingFinal
                    ? 'Preparing Final Preview...'
                    : currentMotionIndex < motionScenes.length - 1
                      ? 'Next'
                      : creationMode === 'story_clip' ? 'Done' : 'Finish & Continue'}
                </button>
              </div>
              {(isMotionGenerating || isMotionSaving) && (
                <LoaderCard
                  label={isMotionSaving ? 'Saving Motion' : 'Generating Motion'}
                  progress={motionProgress}
                  busyText={isMotionSaving ? 'Saving scene motion...' : 'Creating motion clip...'}
                />
              )}
            </article>
          )}

          {currentStep === 7 && creationMode === 'reel_video' && (
            <article className="cvp-card">
              <div className="cvp-step-head">
                <span className="cvp-step-num">7</span>
                <div>
                  <h3>Final Video Player</h3>
                  <p>Render and play final synced video output</p>
                </div>
              </div>

              {finalVideoUrl ? (
                <div className="cvp-media-player">
                  <video
                    controls
                    preload="metadata"
                    className="cvp-final-video"
                    src={finalVideoUrl}
                  />
                  <div className="cvp-meta-row">
                    <span className="ok">Final video ready</span>
                    <span>Audio/video are rendered together in one file</span>
                  </div>
                </div>
              ) : isRenderingFinal ? (
                <div className="cvp-empty">Generating final preview from motion clips...</div>
              ) : approvedImageUrls.length > 0 ? (
                <div className="cvp-merge-preview">
                  <div className="cvp-meta-row">
                    <span>Total approved images: {approvedImageUrls.length}</span>
                    <span>Voiceover: {formatTimeSec(voiceoverDurationSec || previewAudioDurationSec)}</span>
                    <span>Preview below is pre-render only</span>
                  </div>
                  <div className="cvp-thumb-row">
                    {approvedImageUrls.map((url, index) => (
                      <button
                        key={`${url}-${index}`}
                        type="button"
                        className={`cvp-thumb-btn ${previewSceneIndex === index ? 'active' : ''}`}
                        onClick={() => setPreviewSceneIndex(index)}
                      >
                        <img src={url} alt={`Scene thumbnail ${index + 1}`} />
                        <span>Scene {index + 1}</span>
                        <span className="cvp-thumb-time">{sceneTimeline[index]?.label || '--:-- - --:--'}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="cvp-empty">No approved scene images found. Complete Step 5 first.</div>
              )}

              <div className="cvp-action-row">
                {finalVideoUrl && (
                  <button type="button" className="cvp-primary-btn cvp-download-link" onClick={handleDownloadFinalVideo} disabled={isDownloadingFinal}>
                    Download Final Video
                  </button>
                )}
                <button type="button" className="cvp-secondary-btn" onClick={goBack}>Back</button>
              </div>
              {(isRenderingFinal || isDownloadingFinal) && (
                <LoaderCard
                  label={isDownloadingFinal ? 'Downloading Final Video' : 'Rendering Final Video'}
                  progress={isDownloadingFinal ? downloadProgress : renderProgress}
                />
              )}
            </article>
          )}
            </>
          )}
        </section>

        {isImageOnlyGenerating && (
          <div className="cvp-center-loader-overlay" role="status" aria-live="polite" aria-busy="true">
            <div className="cvp-center-loader-card">
              <div className="cvp-center-loader-orb" />
              <h4>Generating your image</h4>
              <p>AI is creating visual with your prompt and references</p>
              <div className="cvp-center-loader-pct">{prettyPercent(sceneProgress)}</div>
              <div className="cvp-center-loader-track">
                <div className="cvp-center-loader-fill" style={{ width: prettyPercent(sceneProgress) }} />
              </div>
            </div>
          </div>
        )}
        {isVideoFlowGenerating && (
          <div className="cvp-center-loader-overlay cvp-center-loader-overlay--transparent" role="status" aria-live="polite" aria-busy="true">
            <div className="cvp-center-loader-card">
              <div className="cvp-center-loader-orb" />
              <h4>{videoFlowLoaderLabel}</h4>
              <p>Please wait while your content is being processed</p>
              <div className="cvp-center-loader-pct">{prettyPercent(videoFlowLoaderProgress)}</div>
              <div className="cvp-center-loader-track">
                <div className="cvp-center-loader-fill" style={{ width: prettyPercent(videoFlowLoaderProgress) }} />
              </div>
            </div>
          </div>
        )}

        {showFinalSuccessPopup && (
          <div className="cvp-modal-overlay" onClick={() => setShowFinalSuccessPopup(false)}>
            <div className="cvp-modal" onClick={(event) => event.stopPropagation()}>
              <h3>You have successfully created a video</h3>
              <p>Download now.</p>
              <div className="cvp-action-row">
                <button
                  type="button"
                  className="cvp-primary-btn"
                  onClick={async () => {
                    await handleDownloadFinalVideo();
                    setShowFinalSuccessPopup(false);
                  }}
                  disabled={!finalVideoUrl || isDownloadingFinal}
                >
                  {isDownloadingFinal ? 'Downloading...' : 'Download Now'}
                </button>
                <button type="button" className="cvp-secondary-btn" onClick={() => setShowFinalSuccessPopup(false)}>
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

        {showYourVideos && (
          <div className="cvp-modal-overlay" onClick={() => {
            setShowYourVideos(false);
            setSelectedPreviewVideo(null);
          }}>
            <div className="cvp-modal cvp-modal-wide" onClick={(event) => event.stopPropagation()}>
              <div className="cvp-modal-head">
                <h3>Your Videos</h3>
                <button
                  type="button"
                  className="cvp-modal-close-icon"
                  aria-label="Close Your Videos"
                  onClick={() => {
                    setShowYourVideos(false);
                    setSelectedPreviewVideo(null);
                  }}
                >
                  x
                </button>
              </div>
              {isLoadingYourVideos ? (
                <div className="cvp-empty">Loading videos...</div>
              ) : yourVideos.length === 0 ? (
                <div className="cvp-empty">No final videos found yet.</div>
              ) : (
                <div className="cvp-video-grid">
                  {yourVideos.map((item, index) => (
                    <div className="cvp-video-card" key={`${item.id || 'video'}-${index}`} style={{ position: 'relative' }}>
                      {item?.preview_image_url ? (
                        <button
                          type="button"
                          className="cvp-video-card-player"
                          onClick={() => {
                            console.log('[your-videos][preview-click]', {
                              id: item?.id || null,
                              project_id: item?.project_id || null,
                              preview_image_url: item?.preview_image_url || null,
                            });
                            setSelectedPreviewVideo(item);
                          }}
                          style={{
                            border: 'none',
                            padding: 0,
                            cursor: 'pointer',
                            background: '#111827',
                            position: 'relative',
                            overflow: 'hidden',
                          }}
                        >
                          <img
                            src={item.preview_image_url}
                            alt={`Preview for project ${String(item.project_id || '').slice(0, 8)}`}
                            onError={() => {
                              console.error('[your-videos][preview-image-error]', {
                                id: item?.id || null,
                                project_id: item?.project_id || null,
                                preview_image_url: item?.preview_image_url || null,
                              });
                            }}
                            style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              inset: 0,
                              background: 'linear-gradient(to top, rgba(0,0,0,0.58), rgba(0,0,0,0.06) 45%, rgba(0,0,0,0.08))',
                              pointerEvents: 'none',
                            }}
                          />
                          <div
                            style={{
                              position: 'absolute',
                              top: '50%',
                              left: '50%',
                              transform: 'translate(-50%, -50%)',
                              width: 52,
                              height: 52,
                              borderRadius: '50%',
                              background: 'rgba(255,255,255,0.9)',
                              color: '#111827',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontSize: 20,
                              fontWeight: 700,
                              boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
                              pointerEvents: 'none',
                            }}
                          >
                            ▶
                          </div>
                          <div
                            style={{
                              position: 'absolute',
                              left: 10,
                              right: 10,
                              bottom: 10,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              color: '#fff',
                              fontSize: 12,
                              fontWeight: 600,
                              pointerEvents: 'none',
                            }}
                          >
                            <span>Tap to Preview</span>
                            <span
                              style={{
                                background: 'rgba(17,24,39,0.78)',
                                padding: '4px 8px',
                                borderRadius: 999,
                                border: '1px solid rgba(255,255,255,0.25)',
                              }}
                            >
                              {Number(item?.duration_sec || 0) > 0 ? `${Number(item.duration_sec).toFixed(1)}s` : 'Video'}
                            </span>
                          </div>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="cvp-video-card-player"
                          onClick={() => setSelectedPreviewVideo(item)}
                          style={{
                            border: 'none',
                            background: '#111827',
                            color: '#fff',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Click to load preview
                        </button>
                      )}
                      <div className="cvp-video-card-meta">
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span>Project: {String(item.project_id || '').slice(0, 8)}...</span>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <button
                              type="button"
                              aria-label="Share video"
                              onClick={() => openShareModal({
                                mediaUrl: item?.file_url || '',
                                mediaType: 'video',
                                mediaAssetId: item?.id || '',
                                projectTitle: String(item?.project_id || '').slice(0, 8),
                              })}
                              title="Share"
                              style={{
                                border: '1px solid #bfdbfe',
                                background: '#fff',
                                color: '#2563eb',
                                borderRadius: '999px',
                                minWidth: 70,
                                height: 28,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0 12px',
                              }}
                            >
                              Share
                            </button>
                            <button
                              type="button"
                              aria-label="Edit video project"
                              onClick={() => handleEditYourVideo(item)}
                              disabled={Boolean(editingVideoProjectId && editingVideoProjectId === String(item?.project_id || ''))}
                              title="Edit video"
                              style={{
                                border: '1px solid #bfdbfe',
                                background: '#fff',
                                color: '#1d4ed8',
                                borderRadius: '999px',
                                minWidth: 70,
                                height: 28,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0 12px',
                              }}
                            >
                              {editingVideoProjectId && editingVideoProjectId === String(item?.project_id || '') ? 'Opening' : 'Edit'}
                            </button>
                            <button
                              type="button"
                              className="cvp-delete-video-btn"
                              aria-label="Delete video"
                              onClick={() => handleDeleteYourVideo(item)}
                              disabled={Boolean(deletingVideoIds[String(item?.id || '')])}
                              title="Delete video"
                              style={{
                                border: '1px solid #fecaca',
                                background: '#fff',
                                color: '#dc2626',
                                borderRadius: '999px',
                                minWidth: 70,
                                height: 28,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0 12px',
                              }}
                            >
                              {deletingVideoIds[String(item?.id || '')] ? 'Deleting' : 'Delete'}
                            </button>
                          </div>
                        </div>
                        <span>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</span>
                        {item.metrics ? (
                          <>
                            <span>Tokens: {Number(item.metrics.total_tokens || 0)}</span>
                            <span>Size: {Number(item.metrics.final_video_bytes || item.file_size_bytes || 0)} bytes</span>
                            <span>Ratio: {String(item.metrics.aspect_ratio || item.aspect_ratio || 'N/A')}</span>
                          </>
                        ) : null}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!isLoadingYourVideos && yourVideosHasMore && (
                <div className="cvp-action-row" style={{ marginTop: 12 }}>
                  <button type="button" className="cvp-primary-btn" onClick={handleLoadMoreYourVideos}>
                    Load More
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        {showAssetLibrary && (
          <div className="cvp-modal-overlay" onClick={() => setShowAssetLibrary(false)}>
            <div className="cvp-modal cvp-modal-wide" onClick={(event) => event.stopPropagation()}>
              <div className="cvp-modal-head">
                <h3>{assetLibraryType === 'posts' ? 'Posts' : assetLibraryType === 'stories' ? 'Stories' : 'Audio'}</h3>
                <button
                  type="button"
                  className="cvp-modal-close-icon"
                  aria-label="Close Asset Library"
                  onClick={() => setShowAssetLibrary(false)}
                >
                  X
                </button>
              </div>
              {isLoadingAssetLibrary ? (
                <div className="cvp-empty">Loading...</div>
              ) : assetLibraryItems.length === 0 ? (
                <div className="cvp-empty">No items found.</div>
              ) : (
                <div className="cvp-video-grid">
                  {assetLibraryItems.map((item, index) => (
                    <div className="cvp-video-card" key={`${item.id || 'asset'}-${index}`}>
                      {assetLibraryType === 'audio' ? (
                        <audio controls preload="none" style={{ width: '100%' }} src={item.file_url} />
                      ) : assetLibraryType === 'stories' ? (
                        item?.preview_image_url ? (
                          <button
                            type="button"
                            className="cvp-video-card-player"
                            onClick={() => setSelectedPreviewVideo(item)}
                            style={{
                              border: 'none',
                              padding: 0,
                              cursor: 'pointer',
                              background: '#111827',
                              position: 'relative',
                              overflow: 'hidden',
                            }}
                          >
                            <img
                              src={item.preview_image_url}
                              alt={`Story preview ${index + 1}`}
                              style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                inset: 0,
                                background: 'linear-gradient(to top, rgba(0,0,0,0.58), rgba(0,0,0,0.06) 45%, rgba(0,0,0,0.08))',
                                pointerEvents: 'none',
                              }}
                            />
                            <div
                              style={{
                                position: 'absolute',
                                top: '50%',
                                left: '50%',
                                transform: 'translate(-50%, -50%)',
                                width: 52,
                                height: 52,
                                borderRadius: '50%',
                                background: 'rgba(255,255,255,0.9)',
                                color: '#111827',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 20,
                                fontWeight: 700,
                                pointerEvents: 'none',
                              }}
                            >
                              ▶
                            </div>
                            <div
                              style={{
                                position: 'absolute',
                                left: 10,
                                right: 10,
                                bottom: 10,
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                color: '#fff',
                                fontSize: 12,
                                fontWeight: 600,
                                pointerEvents: 'none',
                              }}
                            >
                              <span>Tap to Preview</span>
                              <span style={{ background: 'rgba(17,24,39,0.78)', padding: '4px 8px', borderRadius: 999 }}>
                                {Number(item?.duration_sec || 0) > 0 ? `${Number(item.duration_sec).toFixed(1)}s` : 'Story'}
                              </span>
                            </div>
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="cvp-video-card-player"
                            onClick={() => setSelectedPreviewVideo(item)}
                            style={{
                              border: 'none',
                              background: '#111827',
                              color: '#fff',
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Click to load story
                          </button>
                        )
                      ) : (
                        <img
                          src={item.file_url}
                          alt={`Post ${index + 1}`}
                          style={{ width: '100%', height: 220, objectFit: 'cover', borderRadius: 12 }}
                        />
                      )}
                      <div className="cvp-video-card-meta">
                        <span>Project: {String(item.project_id || '').slice(0, 8)}...</span>
                        <span>{item.created_at ? new Date(item.created_at).toLocaleString() : ''}</span>
                        <span>Size: {Number(item.file_size_bytes || 0)} bytes</span>
                        {(assetLibraryType === 'posts' || assetLibraryType === 'stories') && (
                          <div style={{ marginTop: 6 }}>
                            <button
                              type="button"
                              onClick={() => openShareModal({
                                mediaUrl: item?.file_url || '',
                                mediaType: assetLibraryType === 'posts' ? 'image' : 'video',
                                mediaAssetId: item?.id || '',
                                projectTitle: String(item?.project_id || '').slice(0, 8),
                              })}
                              style={{
                                border: '1px solid #bfdbfe',
                                background: '#fff',
                                color: '#2563eb',
                                borderRadius: '999px',
                                minWidth: 86,
                                height: 30,
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                padding: '0 14px',
                              }}
                            >
                              Share
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {!isLoadingAssetLibrary && assetLibraryHasMore && (
                <div className="cvp-action-row" style={{ marginTop: 12 }}>
                  <button type="button" className="cvp-primary-btn" onClick={handleLoadMoreAssetLibrary}>
                    Load More
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
        <ShareToSocialModal
          isOpen={Boolean(shareModalState.open)}
          onClose={() => setShareModalState((prev) => ({ ...prev, open: false }))}
          mediaUrl={shareModalState.mediaUrl}
          mediaType={shareModalState.mediaType}
          mediaAssetId={shareModalState.mediaAssetId}
          trustId={trust?.id || ''}
          projectTitle={shareModalState.projectTitle}
        />
        {selectedPreviewVideo?.file_url && (
          <div className="cvp-modal-overlay" onClick={() => setSelectedPreviewVideo(null)}>
            <div className="cvp-modal" onClick={(event) => event.stopPropagation()}>
              <div className="cvp-modal-head">
                <h3>Video Preview</h3>
                <button
                  type="button"
                  className="cvp-modal-close-icon"
                  aria-label="Close Video Preview"
                  onClick={() => setSelectedPreviewVideo(null)}
                >
                  X
                </button>
              </div>
              <video
                controls
                autoPlay
                preload="metadata"
                className="cvp-final-video"
                src={selectedPreviewVideo.file_url}
              />
              <div className="cvp-meta-row">
                <span>Project: {String(selectedPreviewVideo.project_id || '').slice(0, 8)}...</span>
                <span>{selectedPreviewVideo.created_at ? new Date(selectedPreviewVideo.created_at).toLocaleString() : ''}</span>
              </div>
            </div>
          </div>
        )}
        {deleteConfirmVideo && (
          <div className="cvp-modal-overlay" onClick={() => setDeleteConfirmVideo(null)}>
            <div className="cvp-modal" onClick={(event) => event.stopPropagation()}>
              <div className="cvp-modal-head">
                <h3>Delete Video</h3>
                <button
                  type="button"
                  className="cvp-modal-close-icon"
                  aria-label="Close Delete Confirmation"
                  onClick={() => setDeleteConfirmVideo(null)}
                >
                  X
                </button>
              </div>
              <p style={{ marginTop: 0, color: '#475569' }}>
                Are you sure you want to delete this video? This action cannot be undone.
              </p>
              <div className="cvp-action-row" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="cvp-secondary-btn" onClick={() => setDeleteConfirmVideo(null)}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="cvp-primary-btn"
                  onClick={handleConfirmDeleteVideo}
                  disabled={Boolean(deletingVideoIds[String(deleteConfirmVideo?.id || '')])}
                  style={{ background: '#dc2626', borderColor: '#dc2626' }}
                >
                  {deletingVideoIds[String(deleteConfirmVideo?.id || '')] ? 'Deleting...' : 'Delete Video'}
                </button>
              </div>
            </div>
          </div>
        )}
        {deletePopupMessage && (
          <div className="cvp-modal-overlay" onClick={() => setDeletePopupMessage('')}>
            <div className="cvp-modal" onClick={(event) => event.stopPropagation()}>
              <div className="cvp-modal-head">
                <h3>Video Update</h3>
                <button
                  type="button"
                  className="cvp-modal-close-icon"
                  aria-label="Close Message"
                  onClick={() => setDeletePopupMessage('')}
                >
                  X
                </button>
              </div>
              <p style={{ marginTop: 0, color: '#334155' }}>{deletePopupMessage}</p>
              <div className="cvp-action-row" style={{ justifyContent: 'flex-end' }}>
                <button type="button" className="cvp-primary-btn" onClick={() => setDeletePopupMessage('')}>
                  OK
                </button>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

