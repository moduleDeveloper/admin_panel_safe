import { config } from '../../config/config.js';
import { generateVoiceoverMp3 } from '../elevenlabsService.js';
import { generateVoiceoverMp3WithFal } from '../falTtsService.js';

function estimateTokensFromText(text) {
  const clean = String(text || '').trim();
  if (!clean) return 0;
  return Math.max(1, Math.round(clean.length / 4));
}

function normalizeVoiceResult(raw, { text, provider, model }) {
  if (Buffer.isBuffer(raw)) {
    const estimated = estimateTokensFromText(text);
    return {
      audioBytes: raw,
      provider,
      model,
      inputTokens: estimated,
      outputTokens: 0,
      meta: {
        token_source: 'estimated_from_text_chars_div_4',
        estimated_input_tokens: estimated,
      },
    };
  }

  const audioBytes = raw?.audioBytes;
  if (!Buffer.isBuffer(audioBytes)) {
    throw new Error('Voice provider did not return audio bytes.');
  }

  const estimated = estimateTokensFromText(text);
  return {
    audioBytes,
    provider: raw?.provider || provider,
    model: raw?.model || model,
    inputTokens: Number.isFinite(Number(raw?.inputTokens)) ? Number(raw.inputTokens) : estimated,
    outputTokens: Number.isFinite(Number(raw?.outputTokens)) ? Number(raw.outputTokens) : 0,
    meta: {
      ...(raw?.meta && typeof raw.meta === 'object' ? raw.meta : {}),
      token_source: Number.isFinite(Number(raw?.inputTokens)) ? 'provider' : 'estimated_from_text_chars_div_4',
      estimated_input_tokens: estimated,
    },
  };
}

export async function generateVoiceoverAudio({ text }) {
  if (config.voiceProvider === 'elevenlabs') {
    const raw = await generateVoiceoverMp3({ text });
    return normalizeVoiceResult(raw, {
      text,
      provider: 'elevenlabs',
      model: config.elevenlabsModelId || 'eleven_multilingual_v2',
    });
  }

  if (config.voiceProvider === 'fal') {
    const raw = await generateVoiceoverMp3WithFal({ text });
    return normalizeVoiceResult(raw, {
      text,
      provider: 'fal',
      model: config.falVoiceModel || null,
    });
  }

  throw new Error(`Unsupported VOICE_PROVIDER: ${config.voiceProvider}`);
}
