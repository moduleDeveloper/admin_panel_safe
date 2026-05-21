import { openai } from '../lib/openai.js';

function wordBudgetByDurationSec(durationSec) {
  const sec = Math.max(5, Math.min(30, Number(durationSec || 30)));
  return Math.max(8, Math.round(sec * 2.2));
}

function trimToWordBudget(text, maxWords) {
  const words = String(text || '').trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return String(text || '').trim();

  const shortened = words.slice(0, maxWords).join(' ');
  // Try to end on natural punctuation if possible.
  const lastPunct = Math.max(shortened.lastIndexOf('.'), shortened.lastIndexOf('!'), shortened.lastIndexOf('?'), shortened.lastIndexOf('।'));
  if (lastPunct > Math.floor(shortened.length * 0.55)) {
    return shortened.slice(0, lastPunct + 1).trim();
  }
  return `${shortened.trim()}...`;
}

export async function generateNarrationScript({
  topic,
  promptStyle,
  customPrompt,
  durationSec,
  language,
  model,
  targetAudience,
  platform,
  cta,
  hasProductImages = false,
  hasLogo = false,
}) {
  const maxWords = wordBudgetByDurationSec(durationSec);
  const systemPrompt = [
    'You are an AI Video Script Generator for high-converting cinematic marketing videos.',
    'Return only the final narration script text with no headings and no markdown.',
    'Script should be natural for voice-over, emotionally engaging, and high-retention.',
    'Include a strong hook in first 3 seconds and a natural ending CTA.',
    'Strict language rule: If language is Hindi, output pure Hindi (Devanagari) only.',
    'If language is English, output only English.',
    'If language is Hinglish, use a natural mix of Hindi and English.',
    'If product images are provided, write as product-marketing narrative and include benefits/usage/value transformation naturally.',
    'If logo exists, keep brand-centric messaging concise and premium.',
    'Match pacing to short-form social platforms (Reels/Shorts/Ads).',
    `Hard limit: script must be at most ${maxWords} words.`,
    `Target duration is ${durationSec} seconds, keep delivery tight and meaningful.`,
  ].join(' ');

  const userPrompt = [
    `Main Idea / Topic: ${topic}`,
    `Tone/Style: ${promptStyle}`,
    `Target Duration: ${durationSec} seconds (hard max 30 seconds)`,
    `Language: ${language}`,
    `Target Audience: ${targetAudience || 'General'}`,
    `Platform: ${platform || 'Short-form social'}`,
    `CTA: ${cta || 'Create a soft marketing CTA naturally.'}`,
    `Product Images Provided: ${hasProductImages ? 'Yes' : 'No'}`,
    `Logo Provided: ${hasLogo ? 'Yes' : 'No'}`,
    customPrompt ? `Creator Guidance: ${customPrompt}` : 'Creator Guidance: Keep it clean and engaging.',
    'Output: Single narration script ready for TTS.',
  ].join('\n');

  const response = await openai.responses.create({
    model,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const scriptText = String(response.output_text || '').trim();
  if (!scriptText) {
    throw new Error('OpenAI returned an empty script.');
  }

  return trimToWordBudget(scriptText, maxWords);
}
