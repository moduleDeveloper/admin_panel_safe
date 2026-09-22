import { Router } from 'express';
import {
  approveScriptHandler,
  approveSceneImageHandler,
  approveSceneMotionHandler,
  generateScenePlanHandler,
  generateSceneMotionHandler,
  generateSceneVisualHandler,
  generateScriptHandler,
  generateVoiceoverHandler,
  getProjectDetailsHandler,
  getProjectAssetsHandler,
  listFinalVideosHandler,
  listAssetLibraryHandler,
  deleteFinalVideoHandler,
  saveSceneMotionHandler,
  renderFinalVideoHandler,
  saveScenePlanHandler,
  downloadFinalVideoHandler,
  saveScriptHandler,
  updateProjectStatusHandler,
} from '../controllers/videoController.js';

const router = Router();

router.post('/generate-script', generateScriptHandler);
router.post('/save-script', saveScriptHandler);
router.post('/approve-script', approveScriptHandler);
router.post('/generate-voiceover', generateVoiceoverHandler);
router.post('/generate-scene-plan', generateScenePlanHandler);
router.post('/save-scene-plan', saveScenePlanHandler);
router.post('/generate-scene-visual', generateSceneVisualHandler);
router.post('/approve-scene-image', approveSceneImageHandler);
router.post('/approve-scene-motion', approveSceneMotionHandler);
router.post('/generate-scene-motion', generateSceneMotionHandler);
router.post('/save-scene-motion', saveSceneMotionHandler);
router.post('/update-project-status', updateProjectStatusHandler);
router.post('/render-final-video', renderFinalVideoHandler);
router.get('/project', getProjectDetailsHandler);
router.get('/project-assets', getProjectAssetsHandler);
router.get('/final-videos', listFinalVideosHandler);
router.get('/asset-library', listAssetLibraryHandler);
router.delete('/final-video/:assetId', deleteFinalVideoHandler);
router.get('/download-final-video', downloadFinalVideoHandler);

export default router;
