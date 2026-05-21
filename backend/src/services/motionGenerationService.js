import { openai } from '../lib/openai.js';
import { getPromptTemplate } from './promptTemplateService.js';

export async function generateMotionPromptForScene({
  model,
  language,
  sceneNumber,
  narration,
  visualDescription,
  imagePrompt,
  currentMotionPrompt,
  regenerate = false,
}) {
  const defaultSystemPrompt = [
    'You are an AI cinematic motion director.',
    'Generate only one motion prompt line for a single scene.',
    'Keep it practical for image-to-video animation.',
    'Include camera movement, subject movement, pacing, and transition feel.',
    'Do not include markdown or numbering.',
    'Keep output concise, premium, and non-repetitive.',
  ].join(' ');
  const systemPrompt = await getPromptTemplate({
    pageNames: ['Motion Generation', 'create_video_step6'],
    promptType: 'motion',
    fallbackPrompt: defaultSystemPrompt,
  });

  const userPrompt = [
    `Language: ${language}`,
    `Scene Number: ${sceneNumber}`,
    `Narration: ${String(narration || '').trim()}`,
    `Visual Description: ${String(visualDescription || '').trim()}`,
    `Image Prompt: ${String(imagePrompt || '').trim()}`,
    `Current Motion Prompt: ${String(currentMotionPrompt || '').trim() || 'None'}`,
    regenerate ? 'Task: Regenerate a stronger alternative motion prompt for this scene.' : 'Task: Generate motion prompt for this scene.',
  ].join('\n');

  const response = await openai.responses.create({
    model,
    input: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const motionPrompt = String(response.output_text || '').trim();
  if (!motionPrompt) throw new Error('OpenAI returned empty motion prompt.');
  return motionPrompt;
}
