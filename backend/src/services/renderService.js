import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import ffmpegStatic from 'ffmpeg-static';
import ffprobeStatic from 'ffprobe-static';
import { config } from '../config/config.js';

function runCommand(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    let stdout = '';

    proc.stdout.on('data', (chunk) => { stdout += String(chunk || ''); });
    proc.stderr.on('data', (chunk) => { stderr += String(chunk || ''); });
    proc.on('error', (error) => {
      if (error?.code === 'ENOENT') {
        return reject(new Error(
          `Missing binary: "${bin}". Install FFmpeg and FFprobe, then set FFMPEG_PATH/FFPROBE_PATH in backend/.env.`,
        ));
      }
      return reject(error);
    });
    proc.on('close', (code) => {
      if (code === 0) return resolve({ stdout, stderr });
      return reject(new Error(`${bin} failed (${code}). ${stderr || stdout}`));
    });
  });
}

async function downloadToFile(url, filePath) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`Failed to download asset (${response.status}): ${url}`);
  const arrayBuffer = await response.arrayBuffer();
  await fs.writeFile(filePath, Buffer.from(arrayBuffer));
}

async function probeDurationSec(audioPath, ffprobeBin) {
  try {
    const args = [
      '-v', 'error',
      '-show_entries', 'format=duration',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      audioPath,
    ];
    const { stdout } = await runCommand(ffprobeBin, args);
    const duration = Number(String(stdout || '').trim());
    return Number.isFinite(duration) && duration > 0 ? duration : 0;
  } catch {
    return 0;
  }
}

function normalizeSceneDurationsSec({ sceneTiming, sceneCount, fallbackDurationSec }) {
  const count = Math.max(0, Number(sceneCount || 0));
  if (!count) return [];
  const entries = Array.isArray(sceneTiming) ? sceneTiming : [];
  const byScene = new Map();
  entries.forEach((entry, index) => {
    const sceneNo = Number(entry?.scene_number || index + 1);
    const start = Number(entry?.start_sec);
    const end = Number(entry?.end_sec);
    if (!Number.isFinite(sceneNo) || sceneNo < 1 || !Number.isFinite(start) || !Number.isFinite(end)) return;
    const dur = Math.max(0, end - start);
    byScene.set(sceneNo, dur);
  });

  const picked = Array.from({ length: count }, (_v, i) => byScene.get(i + 1) || 0);
  const validTotal = picked.reduce((sum, d) => sum + (d > 0 ? d : 0), 0);
  if (validTotal > 0) {
    return picked.map((d) => (d > 0 ? d : Math.max(1, validTotal / count)));
  }
  const total = Math.max(count, Number(fallbackDurationSec || count));
  const per = total / count;
  return Array.from({ length: count }, () => per);
}

function inferMotionTypeFromFields(scene = {}) {
  const allowed = new Set(['none', 'zoom-in', 'zoom-out', 'pan-left', 'pan-right', 'tilt', 'kenburns']);
  const explicit = String(scene?.css_motion_type || '').trim().toLowerCase();
  if (allowed.has(explicit)) return explicit;

  const prompt = String(scene?.motion_prompt || '').trim().toLowerCase();
  if (!prompt) return 'none';

  if (prompt.includes('zoom out') || prompt.includes('zoom-out') || prompt.includes('pull back') || prompt.includes('pullback')) {
    return 'zoom-out';
  }
  if (prompt.includes('zoom in') || prompt.includes('zoom-in') || prompt.includes('push in') || prompt.includes('push-in')) {
    return 'zoom-in';
  }
  if (prompt.includes('pan left') || prompt.includes('left pan') || prompt.includes('move left')) {
    return 'pan-left';
  }
  if (prompt.includes('pan right') || prompt.includes('right pan') || prompt.includes('move right')) {
    return 'pan-right';
  }
  if (prompt.includes('tilt')) {
    return 'tilt';
  }
  if (prompt.includes('ken burns') || prompt.includes('kenburns') || prompt.includes('parallax')) {
    return 'kenburns';
  }
  return 'none';
}

export async function renderImagesWithVoiceover({
  imageUrls,
  voiceoverUrl,
  outputBasename,
  fallbackDurationSec = 30,
  sceneTiming = [],
  motionPlan = [],
}) {
  if (!Array.isArray(imageUrls) || imageUrls.length === 0) {
    throw new Error('At least one scene image is required for rendering.');
  }
  if (!voiceoverUrl) throw new Error('Voiceover URL is required for rendering.');

  const ffmpegBin = String(
    (config.ffmpegPath && config.ffmpegPath !== 'ffmpeg') ? config.ffmpegPath : (ffmpegStatic || 'ffmpeg'),
  ).trim();
  const ffprobeBin = String(
    (config.ffprobePath && config.ffprobePath !== 'ffprobe') ? config.ffprobePath : (ffprobeStatic?.path || 'ffprobe'),
  ).trim();

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-render-'));
  const imagePaths = [];
  const audioPath = path.join(workDir, 'voiceover.mp3');
  const outputPath = path.join(workDir, `${outputBasename || `final-${Date.now()}`}.mp4`);

  try {
    for (let i = 0; i < imageUrls.length; i += 1) {
      const imagePath = path.join(workDir, `scene-${i + 1}.png`);
      await downloadToFile(imageUrls[i], imagePath);
      imagePaths.push(imagePath);
    }
    await downloadToFile(voiceoverUrl, audioPath);

    let audioDurationSec = await probeDurationSec(audioPath, ffprobeBin);
    if (!audioDurationSec) audioDurationSec = Math.max(8, Number(fallbackDurationSec || 30));
    const sceneDurations = normalizeSceneDurationsSec({
      sceneTiming,
      sceneCount: imagePaths.length,
      fallbackDurationSec: audioDurationSec,
    });

    const args = ['-y'];
    for (let i = 0; i < imagePaths.length; i += 1) {
      args.push('-loop', '1', '-i', imagePaths[i]);
    }
    args.push('-i', audioPath);

    const fps = 30;
    const inferMotionType = (index) => {
      const scene = Array.isArray(motionPlan) ? (motionPlan[index] || {}) : {};
      return inferMotionTypeFromFields(scene);
    };

    const filterParts = imagePaths.map((_item, index) => {
      const durationSec = Math.max(0.8, Number(sceneDurations[index] || (audioDurationSec / imagePaths.length) || 1));
      const frames = Math.max(1, Math.round(durationSec * fps));
      const motionType = inferMotionType(index);
      if (motionType === 'none') {
        return (
          `[${index}:v]scale=1080:1920:force_original_aspect_ratio=decrease,` +
          'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,' +
          `fps=${fps},format=yuv420p,setsar=1[v${index}]`
        );
      }
      let zoomExpr = "if(lte(on,1),1.0,min(1.12,zoom+0.0015))";
      let xExpr = 'iw/2-(iw/zoom/2)';
      let yExpr = 'ih/2-(ih/zoom/2)';
      if (motionType === 'zoom-out') {
        zoomExpr = "if(lte(on,1),1.12,max(1.0,zoom-0.0015))";
      } else if (motionType === 'pan-left') {
        xExpr = 'max(0,(iw-iw/zoom) - on*1.5)';
      } else if (motionType === 'pan-right') {
        xExpr = 'min((iw-iw/zoom),on*1.5)';
      } else if (motionType === 'tilt') {
        yExpr = 'min((ih-ih/zoom),on*1.2)';
      }
      return (
        `[${index}:v]scale=1080:1920:force_original_aspect_ratio=increase,` +
        `crop=1080:1920,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=1080x1920:fps=${fps},` +
        'format=yuv420p,setsar=1[v' + index + ']'
      );
    });
    const concatInputs = imagePaths.map((_, index) => `[v${index}]`).join('');
    const filterComplex = `${filterParts.join(';')};${concatInputs}concat=n=${imagePaths.length}:v=1:a=0[v]`;

    args.push(
      '-filter_complex', filterComplex,
      '-map', '[v]',
      '-map', `${imagePaths.length}:a`,
      '-r', '30',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-shortest',
      outputPath,
    );

    await runCommand(ffmpegBin, args);
    const outputBytes = await fs.readFile(outputPath);

    return { outputBytes, durationSec: audioDurationSec, sceneCount: imagePaths.length };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

export async function renderClipsWithVoiceover({
  clipUrls,
  voiceoverUrl,
  outputBasename,
  fallbackDurationSec = 30,
  sceneTiming = [],
}) {
  if (!Array.isArray(clipUrls) || clipUrls.length === 0) {
    throw new Error('At least one scene clip is required for rendering.');
  }
  if (!voiceoverUrl) throw new Error('Voiceover URL is required for rendering.');

  const ffmpegBin = String(
    (config.ffmpegPath && config.ffmpegPath !== 'ffmpeg') ? config.ffmpegPath : (ffmpegStatic || 'ffmpeg'),
  ).trim();
  const ffprobeBin = String(
    (config.ffprobePath && config.ffprobePath !== 'ffprobe') ? config.ffprobePath : (ffprobeStatic?.path || 'ffprobe'),
  ).trim();

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-render-clips-'));
  const clipPaths = [];
  const audioPath = path.join(workDir, 'voiceover.mp3');
  const outputPath = path.join(workDir, `${outputBasename || `final-${Date.now()}`}.mp4`);

  try {
    for (let i = 0; i < clipUrls.length; i += 1) {
      const clipPath = path.join(workDir, `scene-${i + 1}.mp4`);
      await downloadToFile(clipUrls[i], clipPath);
      clipPaths.push(clipPath);
    }
    await downloadToFile(voiceoverUrl, audioPath);

    let audioDurationSec = await probeDurationSec(audioPath, ffprobeBin);
    if (!audioDurationSec) audioDurationSec = Math.max(8, Number(fallbackDurationSec || 30));
    const targetDurations = normalizeSceneDurationsSec({
      sceneTiming,
      sceneCount: clipPaths.length,
      fallbackDurationSec: audioDurationSec,
    });

    const args = ['-y'];
    clipPaths.forEach((clipPath) => {
      args.push('-i', clipPath);
    });
    args.push('-i', audioPath);

    const clipDurations = [];
    for (let i = 0; i < clipPaths.length; i += 1) {
      const clipDuration = await probeDurationSec(clipPaths[i], ffprobeBin);
      clipDurations.push(clipDuration > 0 ? clipDuration : targetDurations[i] || 1);
    }

    const filterParts = clipPaths.map((_item, index) => {
      const sourceDur = Math.max(0.05, Number(clipDurations[index] || 1));
      const targetDur = Math.max(0.05, Number(targetDurations[index] || 1));
      const speedFactor = Math.max(0.25, Math.min(4, targetDur / sourceDur));
      return (
        `[${index}:v]scale=1080:1920:force_original_aspect_ratio=decrease,` +
        'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,' +
        `fps=30,format=yuv420p,setsar=1,` +
        `setpts=${speedFactor.toFixed(6)}*PTS,trim=duration=${targetDur.toFixed(3)}[v${index}]`
      );
    });

    const concatInputs = clipPaths.map((_item, index) => `[v${index}]`).join('');
    const filterComplex = `${filterParts.join(';')};${concatInputs}concat=n=${clipPaths.length}:v=1:a=0[v]`;

    args.push(
      '-filter_complex', filterComplex,
      '-map', '[v]',
      '-map', `${clipPaths.length}:a`,
      '-r', '30',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-shortest',
      outputPath,
    );

    await runCommand(ffmpegBin, args);
    const outputBytes = await fs.readFile(outputPath);

    return { outputBytes, durationSec: audioDurationSec, sceneCount: clipPaths.length };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

export async function renderMixedScenesWithVoiceover({
  scenes,
  voiceoverUrl,
  outputBasename,
  fallbackDurationSec = 30,
  sceneTiming = [],
  motionPlan = [],
}) {
  const sceneList = Array.isArray(scenes) ? scenes : [];
  if (sceneList.length === 0) {
    throw new Error('At least one scene source is required for rendering.');
  }
  if (!voiceoverUrl) throw new Error('Voiceover URL is required for rendering.');

  const ffmpegBin = String(
    (config.ffmpegPath && config.ffmpegPath !== 'ffmpeg') ? config.ffmpegPath : (ffmpegStatic || 'ffmpeg'),
  ).trim();
  const ffprobeBin = String(
    (config.ffprobePath && config.ffprobePath !== 'ffprobe') ? config.ffprobePath : (ffprobeStatic?.path || 'ffprobe'),
  ).trim();

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), 'video-render-mixed-'));
  const sceneFiles = [];
  const audioPath = path.join(workDir, 'voiceover.mp3');
  const outputPath = path.join(workDir, `${outputBasename || `final-${Date.now()}`}.mp4`);

  try {
    for (let i = 0; i < sceneList.length; i += 1) {
      const source = sceneList[i] || {};
      const clipUrl = String(source?.clipUrl || '').trim();
      const imageUrl = String(source?.imageUrl || '').trim();
      if (clipUrl) {
        const clipPath = path.join(workDir, `scene-${i + 1}.mp4`);
        await downloadToFile(clipUrl, clipPath);
        sceneFiles.push({ kind: 'clip', path: clipPath });
      } else if (imageUrl) {
        const imagePath = path.join(workDir, `scene-${i + 1}.png`);
        await downloadToFile(imageUrl, imagePath);
        sceneFiles.push({ kind: 'image', path: imagePath });
      } else {
        throw new Error(`Scene ${i + 1} has no clipUrl or imageUrl.`);
      }
    }

    await downloadToFile(voiceoverUrl, audioPath);
    let audioDurationSec = await probeDurationSec(audioPath, ffprobeBin);
    if (!audioDurationSec) audioDurationSec = Math.max(8, Number(fallbackDurationSec || 30));
    const targetDurations = normalizeSceneDurationsSec({
      sceneTiming,
      sceneCount: sceneFiles.length,
      fallbackDurationSec: audioDurationSec,
    });

    const args = ['-y'];
    sceneFiles.forEach((item) => {
      if (item.kind === 'image') args.push('-loop', '1');
      args.push('-i', item.path);
    });
    args.push('-i', audioPath);

    const fps = 30;
    const inferMotionType = (index) => {
      const scene = Array.isArray(motionPlan) ? (motionPlan[index] || {}) : {};
      return inferMotionTypeFromFields(scene);
    };

    const clipDurations = [];
    for (let i = 0; i < sceneFiles.length; i += 1) {
      if (sceneFiles[i].kind !== 'clip') {
        clipDurations.push(0);
        continue;
      }
      const clipDuration = await probeDurationSec(sceneFiles[i].path, ffprobeBin);
      clipDurations.push(clipDuration > 0 ? clipDuration : targetDurations[i] || 1);
    }

    const filterParts = sceneFiles.map((item, index) => {
      const targetDur = Math.max(0.05, Number(targetDurations[index] || 1));
      if (item.kind === 'clip') {
        const sourceDur = Math.max(0.05, Number(clipDurations[index] || 1));
        const speedFactor = Math.max(0.25, Math.min(4, targetDur / sourceDur));
        return (
          `[${index}:v]scale=1080:1920:force_original_aspect_ratio=decrease,` +
          'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,' +
          `fps=${fps},format=yuv420p,setsar=1,` +
          `setpts=${speedFactor.toFixed(6)}*PTS,trim=duration=${targetDur.toFixed(3)}[v${index}]`
        );
      }

      const frames = Math.max(1, Math.round(targetDur * fps));
      const motionType = inferMotionType(index);
      if (motionType === 'none') {
        return (
          `[${index}:v]scale=1080:1920:force_original_aspect_ratio=decrease,` +
          'pad=1080:1920:(ow-iw)/2:(oh-ih)/2:black,' +
          `fps=${fps},format=yuv420p,setsar=1[v${index}]`
        );
      }

      let zoomExpr = "if(lte(on,1),1.0,min(1.12,zoom+0.0015))";
      let xExpr = 'iw/2-(iw/zoom/2)';
      let yExpr = 'ih/2-(ih/zoom/2)';
      if (motionType === 'zoom-out') {
        zoomExpr = "if(lte(on,1),1.12,max(1.0,zoom-0.0015))";
      } else if (motionType === 'pan-left') {
        xExpr = 'max(0,(iw-iw/zoom) - on*1.5)';
      } else if (motionType === 'pan-right') {
        xExpr = 'min((iw-iw/zoom),on*1.5)';
      } else if (motionType === 'tilt') {
        yExpr = 'min((ih-ih/zoom),on*1.2)';
      }
      return (
        `[${index}:v]scale=1080:1920:force_original_aspect_ratio=increase,` +
        `crop=1080:1920,zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=${frames}:s=1080x1920:fps=${fps},` +
        'format=yuv420p,setsar=1[v' + index + ']'
      );
    });

    const concatInputs = sceneFiles.map((_item, index) => `[v${index}]`).join('');
    const filterComplex = `${filterParts.join(';')};${concatInputs}concat=n=${sceneFiles.length}:v=1:a=0[v]`;

    args.push(
      '-filter_complex', filterComplex,
      '-map', '[v]',
      '-map', `${sceneFiles.length}:a`,
      '-r', '30',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'aac',
      '-shortest',
      outputPath,
    );

    await runCommand(ffmpegBin, args);
    const outputBytes = await fs.readFile(outputPath);
    return { outputBytes, durationSec: audioDurationSec, sceneCount: sceneFiles.length };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
