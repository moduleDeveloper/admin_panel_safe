import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { generateImageWithOpenAI } from '../src/services/openaiImageService.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async function resolveLogoUrl() {
  return 'https://lqdmefugrhluzlfabmuy.supabase.co/storage/v1/object/public/video-creation-assets/trusts/7dfd3e03-7ff9-4543-9485-e169a4586738/projects/2931ee6a-4335-40b0-8ef2-2ec26cd4815e/inputs/logo/logo-1778753918281.jpg';
}

async function main() {
  const startedAt = Date.now();
  console.log('[testMultimodal] Starting multimodal OpenAI image test...');

  try {
    const result = await generateImageWithOpenAI({
      prompt: 'A beautiful Indian woman in a saree standing in a garden, cinematic, premium quality',
      logoUrl: 'https://lqdmefugrhluzlfabmuy.supabase.co/storage/v1/object/public/video-creation-assets/trusts/7dfd3e03-7ff9-4543-9485-e169a4586738/projects/2931ee6a-4335-40b0-8ef2-2ec26cd4815e/inputs/logo/logo-1778753918281.jpg',
      referenceImageUrls: [
        'https://lqdmefugrhluzlfabmuy.supabase.co/storage/v1/object/public/video-creation-assets/trusts/7dfd3e03-7ff9-4543-9485-e169a4586738/projects/2931ee6a-4335-40b0-8ef2-2ec26cd4815e/inputs/reference/ref-1-1778753917778-Screenshot-2026-05-14-123245.png.png',
      ],
      useLogo: true,
      logoPosition: 'bottom-right',
      referencePosition: 'bottom-left',
    });

    const outputPath = path.resolve(__dirname, 'test-output.png');

    if (Buffer.isBuffer(result?.imageBytes) && result.imageBytes.length > 0) {
      fs.writeFileSync(outputPath, result.imageBytes);
      console.log('[testMultimodal] SUCCESS: image generated and saved.');
      console.log('[testMultimodal] Output file:', outputPath);
      console.log('[testMultimodal] Output bytes:', result.imageBytes.length);
    } else {
      console.error('[testMultimodal] FAILED: No image bytes returned from generateImageWithOpenAI.');
    }

    console.log('[testMultimodal] Result summary:', {
      model: result?.model || null,
      format: result?.format || null,
      usage: result?.usage || null,
      aspect_ratio: result?.aspect_ratio || null,
      meta: result?.meta || null,
    });
  } catch (error) {
    console.error('[testMultimodal] FAILED with error:', error?.message || error);
    process.exitCode = 1;
  } finally {
    const latencyMs = Date.now() - startedAt;
    console.log('[testMultimodal] Completed in ms:', latencyMs);
  }
}

main();
