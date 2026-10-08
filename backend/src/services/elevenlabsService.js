import { config } from '../config/config.js';

const BASE_URL = 'https://api.elevenlabs.io/v1';

export async function generateVoiceoverMp3({ text }) {
  const apiKey = String(config.elevenlabsApiKey || '').trim();
  const voiceId = String(config.elevenlabsVoiceId || '').trim();
  const modelId = String(config.elevenlabsModelId || 'eleven_multilingual_v2').trim();

  if (!apiKey) throw new Error('Missing ELEVENLABS_API_KEY in backend env.');
  if (!voiceId) throw new Error('Missing ELEVENLABS_VOICE_ID in backend env.');

  const response = await fetch(`${BASE_URL}/text-to-speech/${voiceId}`, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'audio/mpeg',
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      voice_settings: {
        stability: 0.45,
        similarity_boost: 0.75,
      },
    }),
  });

  if (!response.ok) {
    const message = await response.text().catch(() => 'ElevenLabs request failed.');
    throw new Error(`ElevenLabs error: ${message}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}
