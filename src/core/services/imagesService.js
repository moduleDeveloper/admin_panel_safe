import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache';

const IMAGES_TABLE = 'Images';

function normalizeImageRow(row = {}) {
  const linkedPhoto = row.gallery_photo || null;
  const previewUrl = linkedPhoto?.public_url || linkedPhoto?.storage_path || null;
  const approvedValue = String(row.Approved || '').trim().toLowerCase();
  const rawPostStatus = String(row.postStatus || '').trim();
  const normalizedPostStatus = approvedValue === 'posted' ? 'posted' : (rawPostStatus || null);
  return {
    id: row.id || '',
    galleryPhotoId: row.gallery_photo_id || null,
    previewUrl,
    title: row.Title || '',
    hashtags: row.Hashtags || '',
    description: row.Description || '',
    aspectRatio: row.aspectRatio || '',
    intent: row.Intent || '',
    approved: row.Approved || '',
    createdBy: row.created_by || null,
    createdAt: row.created_at || null,
    updatedAt: row.updated_at || null,
    postTime: row.postTime || null,
    postType: row.postType || null,
    postStatus: normalizedPostStatus,
    blotatoSubmissionId: row.blotatoSubmissionId || null,
    publicUrl: row.publicUrl || null,
    errorMessage: row.errorMessage || null,
    platforms: row.platforms || null,
    raw: row,
  };
}

const IMAGES_SELECT = `
  id, gallery_photo_id, Title, Hashtags, Description, aspectRatio, Intent,
  Approved, created_by, created_at, updated_at, postTime, postType,
  postStatus, blotatoSubmissionId, publicUrl, errorMessage, platforms,
  gallery_photo:gallery_photos(public_url, storage_path)
`.trim();

const IMAGES_SELECT_NO_PHOTO = `
  id, gallery_photo_id, Title, Hashtags, Description, aspectRatio, Intent,
  Approved, created_by, created_at, updated_at, postTime, postType,
  postStatus, blotatoSubmissionId, publicUrl, errorMessage, platforms
`.trim();

export async function fetchImages({ limit = 30 } = {}) {
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(100, Number(limit))) : 30;
  const cacheKey = `images:list:${safeLimit}`;

  return cachedQuery(cacheKey, async () => {
    const { data, error } = await supabase
      .from(IMAGES_TABLE)
      .select(IMAGES_SELECT)
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    return {
      data: (data || []).map(normalizeImageRow),
      error,
    };
  }, 15000);
}

export async function fetchPendingImagesByTrust(trustId, { limit = 100 } = {}) {
  if (!trustId) return { data: [], error: null };
  const safeLimit = Number.isFinite(Number(limit)) ? Math.max(1, Math.min(500, Number(limit))) : 100;
  const cacheKey = `images:pending:${trustId}:${safeLimit}`;

  return cachedQuery(cacheKey, async () => {
    const { data: folders, error: foldersError } = await supabase
      .from('gallery_folders')
      .select('id')
      .eq('trust_id', trustId);
    if (foldersError) return { data: [], error: foldersError };

    const folderIds = (folders || []).map((row) => row.id).filter(Boolean);
    if (!folderIds.length) return { data: [], error: null };

    const { data: photos, error: photosError } = await supabase
      .from('gallery_photos')
      .select('id')
      .in('folder_id', folderIds);
    if (photosError) return { data: [], error: photosError };

    const photoIds = (photos || []).map((row) => row.id).filter(Boolean);
    if (!photoIds.length) return { data: [], error: null };

    const { data, error } = await supabase
      .from(IMAGES_TABLE)
      .select(IMAGES_SELECT)
      .in('gallery_photo_id', photoIds)
      .in('Approved', ['pending', 'Pending'])
      .order('created_at', { ascending: false })
      .limit(safeLimit);

    return {
      data: (data || []).map(normalizeImageRow),
      error,
    };
  }, 10000);
}

export async function fetchImagesCount() {
  return cachedQuery('images:count', async () => {
    const { count, error } = await supabase
      .from(IMAGES_TABLE)
      .select('id', { count: 'exact', head: true });

    return { count: count || 0, error };
  }, 15000);
}

export async function createImage(payload) {
  const { data, error } = await supabase
    .from(IMAGES_TABLE)
    .insert([payload])
    .select(IMAGES_SELECT_NO_PHOTO)
    .single();

  if (!error) invalidateCache('images:');
  return { data: data ? normalizeImageRow(data) : null, error };
}

export async function updateImage(id, updates) {
  if (!id) return { data: null, error: { message: 'Image id is required.' } };

  const { data, error } = await supabase
    .from(IMAGES_TABLE)
    .update(updates)
    .eq('id', id)
    .select(IMAGES_SELECT_NO_PHOTO)
    .single();

  if (!error) invalidateCache('images:');
  return { data: data ? normalizeImageRow(data) : null, error };
}

export async function updateImageApproval(id, approvedValue) {
  if (!id) return { data: null, error: { message: 'Image id is required.' } };
  if (!approvedValue) return { data: null, error: { message: 'Approved value is required.' } };

  const { data, error } = await supabase
    .from(IMAGES_TABLE)
    .update({ Approved: approvedValue })
    .eq('id', id)
    .select(IMAGES_SELECT)
    .single();

  if (!error) invalidateCache('images:');
  return { data: data ? normalizeImageRow(data) : null, error };
}
