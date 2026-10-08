import { config } from '../../config/config.js';
import { generateImageWithFal } from '../falService.js';
import { generateImageWithOpenAI } from '../openaiImageService.js';

export async function generateSceneImage({
  prompt,
  logoUrl = null,
  referenceImageUrls = null,
  useLogo = true,
  logoPosition = 'top-right',
  referencePosition = 'bottom-left',
}) {
  if (config.videoProvider === 'openai') {
    return generateImageWithOpenAI({
      prompt,
      logoUrl,
      referenceImageUrls,
      useLogo,
      logoPosition,
      referencePosition,
    });
  }

  if (config.videoProvider === 'fal') {
    return generateImageWithFal({ prompt });
  }

  throw new Error(`Unsupported VIDEO_PROVIDER: ${config.videoProvider}`);
}
