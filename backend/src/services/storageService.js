import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { config } from '../config/config.js';

export async function uploadVoiceoverToBucket({ trustId, projectId, bytes }) {
  const bucket = String(config.supabaseVideoBucket || 'video-creation-assets').trim();
  const fileName = `voiceover-${Date.now()}.mp3`;
  const storagePath = `trusts/${trustId}/projects/${projectId}/voiceover/${fileName}`;

  const { error: uploadError } = await supabaseAdmin
    .storage
    .from(bucket)
    .upload(storagePath, bytes, {
      upsert: false,
      contentType: 'audio/mpeg',
      cacheControl: '3600',
    });

  if (uploadError) throw new Error(uploadError.message || 'Failed to upload voiceover.');

  const { data: publicData } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);
  const fileUrl = publicData?.publicUrl || '';

  return { bucket, storagePath, fileUrl };
}

export async function uploadSceneImageToBucket({ trustId, projectId, bytes, format = 'png', sceneNumber }) {
  const bucket = String(config.supabaseVideoBucket || 'video-creation-assets').trim();
  const cleanFormat = String(format || 'png').toLowerCase() === 'jpg' ? 'jpg' : 'png';
  const safeSceneNumber = Number.isFinite(Number(sceneNumber)) && Number(sceneNumber) > 0
    ? Math.floor(Number(sceneNumber))
    : null;
  const fileName = safeSceneNumber ? `scene-${safeSceneNumber}.${cleanFormat}` : `scene-${Date.now()}.${cleanFormat}`;
  const versionFolder = Date.now();
  const storagePath = safeSceneNumber
    ? `trusts/${trustId}/projects/${projectId}/scenes/scene-${safeSceneNumber}/${versionFolder}/${fileName}`
    : `trusts/${trustId}/projects/${projectId}/scenes/${versionFolder}/${fileName}`;
  const contentType = cleanFormat === 'jpg' ? 'image/jpeg' : 'image/png';

  const { error: uploadError } = await supabaseAdmin
    .storage
    .from(bucket)
    .upload(storagePath, bytes, {
      upsert: false,
      contentType,
      cacheControl: '3600',
    });

  if (uploadError) throw new Error(uploadError.message || 'Failed to upload scene image.');

  const { data: publicData } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);
  const fileUrl = publicData?.publicUrl || '';

  return { bucket, storagePath, fileUrl };
}

export async function uploadFinalVideoToBucket({ trustId, projectId, bytes }) {
  const bucket = String(config.supabaseVideoBucket || 'video-creation-assets').trim();
  const fileName = `final-${Date.now()}.mp4`;
  const storagePath = `trusts/${trustId}/projects/${projectId}/final/${fileName}`;

  const { error: uploadError } = await supabaseAdmin
    .storage
    .from(bucket)
    .upload(storagePath, bytes, {
      upsert: false,
      contentType: 'video/mp4',
      cacheControl: '3600',
    });

  if (uploadError) throw new Error(uploadError.message || 'Failed to upload final video.');

  const { data: publicData } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);
  const fileUrl = publicData?.publicUrl || '';
  return { bucket, storagePath, fileUrl };
}

export async function uploadSceneClipToBucket({ trustId, projectId, sceneNumber, bytes }) {
  const bucket = String(config.supabaseVideoBucket || 'video-creation-assets').trim();
  const safeSceneNumber = Number.isFinite(Number(sceneNumber)) && Number(sceneNumber) > 0
    ? Math.floor(Number(sceneNumber))
    : 1;
  const fileName = `scene-${safeSceneNumber}.mp4`;
  const storagePath = `trusts/${trustId}/projects/${projectId}/clips/${fileName}`;

  const { error: uploadError } = await supabaseAdmin
    .storage
    .from(bucket)
    .upload(storagePath, bytes, {
      upsert: true,
      contentType: 'video/mp4',
      cacheControl: '3600',
    });

  if (uploadError) throw new Error(uploadError.message || 'Failed to upload scene clip.');

  const { data: publicData } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);
  const fileUrl = publicData?.publicUrl || '';
  return { bucket, storagePath, fileUrl };
}

export async function uploadSceneMotionToBucket({ trustId, projectId, sceneNumber, jsonPayload }) {
  const bucket = String(config.supabaseVideoBucket || 'video-creation-assets').trim();
  const safeSceneNumber = Number.isFinite(Number(sceneNumber)) && Number(sceneNumber) > 0
    ? Math.floor(Number(sceneNumber))
    : 1;
  const fileName = `scene-${safeSceneNumber}.json`;
  const storagePath = `trusts/${trustId}/projects/${projectId}/motions/${fileName}`;
  const body = Buffer.from(JSON.stringify(jsonPayload || {}, null, 2), 'utf8');

  const { error: uploadError } = await supabaseAdmin
    .storage
    .from(bucket)
    .upload(storagePath, body, {
      upsert: true,
      contentType: 'application/json',
      cacheControl: '3600',
    });

  if (uploadError) throw new Error(uploadError.message || 'Failed to upload scene motion json.');

  const { data: publicData } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);
  const fileUrl = publicData?.publicUrl || '';
  return { bucket, storagePath, fileUrl };
}

export async function uploadProjectInputImageToBucket({
  trustId,
  projectId,
  bytes,
  contentType = 'image/png',
  role = 'reference',
  originalName = '',
  index = 0,
}) {
  const bucket = String(config.supabaseVideoBucket || 'video-creation-assets').trim();
  const safeRole = role === 'logo' ? 'logo' : 'reference';
  const normalizedType = String(contentType || '').toLowerCase();
  const ext = normalizedType.includes('jpeg') || normalizedType.includes('jpg') ? 'jpg' : 'png';
  const safeContentType = ext === 'jpg' ? 'image/jpeg' : 'image/png';
  const normalizedName = String(originalName || '')
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, '-')
    .slice(0, 80);
  const fileName = safeRole === 'logo'
    ? `logo-${Date.now()}.${ext}`
    : `ref-${index + 1}-${Date.now()}${normalizedName ? `-${normalizedName}` : ''}.${ext}`;
  const folder = safeRole === 'logo' ? 'inputs/logo' : 'inputs/reference';
  const storagePath = `trusts/${trustId}/projects/${projectId}/${folder}/${fileName}`;

  const { error: uploadError } = await supabaseAdmin
    .storage
    .from(bucket)
    .upload(storagePath, bytes, {
      upsert: safeRole === 'logo',
      contentType: safeContentType,
      cacheControl: '3600',
    });

  if (uploadError) throw new Error(uploadError.message || `Failed to upload ${safeRole} image.`);

  const { data: publicData } = supabaseAdmin.storage.from(bucket).getPublicUrl(storagePath);
  const fileUrl = publicData?.publicUrl || '';
  return { bucket, storagePath, fileUrl };
}
