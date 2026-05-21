import dotenv from 'dotenv';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendEnvPath = path.resolve(__dirname, '../../.env');
const rootEnvPath = path.resolve(__dirname, '../../../.env');

if (fs.existsSync(backendEnvPath)) {
  dotenv.config({ path: backendEnvPath });
} else if (fs.existsSync(rootEnvPath)) {
  dotenv.config({ path: rootEnvPath });
} else {
  dotenv.config();
}

function required(key) {
  const value = process.env[key];
  const cleanValue = String(value || '').trim();
  if (!cleanValue) {
    throw new Error(`Missing required env: ${key}`);
  }

  // Guard against placeholder secrets like "sk" that cause confusing 401 errors later.
  if ((key === 'OPENAI_API_KEY' || key.endsWith('_API_KEY')) && cleanValue.length < 20) {
    throw new Error(`Invalid ${key}: looks like a placeholder. Please set the real secret key.`);
  }

  return cleanValue;
}

export const config = {
  port: Number(process.env.PORT || 8080),
  corsOrigins: String(process.env.CORS_ORIGIN || 'http://localhost:5173,https://test-admin-panel-eight.vercel.app')
    .split(',')
    .map((value) => String(value || '').trim())
    .filter(Boolean),
  supabaseUrl: required('SUPABASE_URL'),
  supabaseServiceRoleKey: required('SUPABASE_SERVICE_ROLE_KEY'),
  supabaseVideoBucket: String(process.env.SUPABASE_VIDEO_BUCKET || 'video-creation-assets'),
  scriptProvider: String(process.env.SCRIPT_PROVIDER || 'openai').trim().toLowerCase(),
  voiceProvider: String(process.env.VOICE_PROVIDER || 'elevenlabs').trim().toLowerCase(),
  videoProvider: String(process.env.VIDEO_PROVIDER || 'fal').trim().toLowerCase(),
  openaiApiKey: required('OPENAI_API_KEY'),
  openaiModel: String(process.env.OPENAI_MODEL || 'gpt-4.1-mini'),
  openaiImageModel: String(process.env.OPENAI_IMAGE_MODEL || 'gpt-image-1'),
  elevenlabsApiKey: String(process.env.ELEVENLABS_API_KEY || ''),
  elevenlabsVoiceId: String(process.env.ELEVENLABS_VOICE_ID || ''),
  elevenlabsModelId: String(process.env.ELEVENLABS_MODEL_ID || 'eleven_multilingual_v2'),
  falApiKey: String(process.env.FAL_API_KEY || '').trim(),
  falImageModel: String(process.env.FAL_IMAGE_MODEL || 'fal-ai/flux/schnell').trim(),
  falVoiceModel: String(process.env.FAL_VOICE_MODEL || 'fal-ai/elevenlabs/tts/multilingual-v2').trim(),
  falMotionModel: String(process.env.FAL_MOTION_MODEL || 'fal-ai/veo3.1/lite/image-to-video').trim(),
  falTimeoutMs: Number(process.env.FAL_TIMEOUT_MS || 120000),
  ffmpegPath: String(process.env.FFMPEG_PATH || 'ffmpeg').trim(),
  ffprobePath: String(process.env.FFPROBE_PATH || 'ffprobe').trim(),
};
