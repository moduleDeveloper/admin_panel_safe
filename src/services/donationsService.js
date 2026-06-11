import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache';
import { getAllowedImageFormatsMessage, prepareImageFileForUpload } from '../utils/imageUpload';

const TABLE_NAME = 'Donations';
const DONATIONS_BUCKET = String(import.meta?.env?.VITE_DONATIONS_BUCKET || 'donations').trim() || 'donations';
const MAX_FETCH = 200;
const MONEY_RE = /^(?:0|[1-9]\d*)(?:\.\d{1,2})?$/;
const MAX_IMAGE_BYTES = 25 * 1024;
const TARGET_MIN_IMAGE_BYTES = 20 * 1024;

function normalizeAttachments(value) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function uniqueId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extensionFromFile(file) {
  const fromName = String(file?.name || '').split('.').pop()?.toLowerCase();
  if (fromName && fromName.length <= 8) return fromName;
  const mime = String(file?.type || '').toLowerCase();
  if (mime.includes('png')) return 'png';
  if (mime.includes('webp')) return 'webp';
  if (mime.includes('gif')) return 'gif';
  if (mime.includes('svg')) return 'svg';
  return 'jpg';
}

function sanitizeFileName(fileName = '') {
  const [base = 'image'] = String(fileName).split('.');
  const safe = base.replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 60);
  return safe || 'image';
}

function buildDonationAttachmentPath(trustId, file) {
  const ext = extensionFromFile(file);
  const safeTrustId = String(trustId || 'misc').replace(/[^a-zA-Z0-9_-]/g, '') || 'misc';
  const timestamp = Date.now();
  const unique = uniqueId();
  const safeName = sanitizeFileName(file?.name);
  return `donations/${safeTrustId}/${timestamp}_${safeName}_${unique}.${ext}`;
}

function normalizeRow(row = {}) {
  return {
    id: row.id,
    trust_id: row.trust_id || null,
    name: row.name || '',
    description: row.description || '',
    attachments: normalizeAttachments(row.attachments),
    amount: row.amount ?? null,
    amount_type: row.amount_type || '',
    status: row.status || 'active',
    type: row.type || '',
    created_at: row.created_at || null,
    updated_at: row.updated_at || null,
    raw: row,
  };
}

function toMoneyValue(rawAmount) {
  if (rawAmount === '' || rawAmount === null || rawAmount === undefined) return { value: null, error: null };
  const normalized = String(rawAmount).trim();
  if (!MONEY_RE.test(normalized)) {
    return { value: null, error: { message: 'Amount must be a valid number (example: 345000.54).' } };
  }
  return { value: Number(normalized), error: null };
}

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function decodeImageFile(file) {
  if (typeof createImageBitmap === 'function') {
    try {
      return await createImageBitmap(file);
    } catch {
      // Fallback below.
    }
  }
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Unable to process selected image.'));
    };
    image.src = objectUrl;
  });
}

async function compressImageToJpegRange(file, { minBytes = TARGET_MIN_IMAGE_BYTES, maxBytes = MAX_IMAGE_BYTES } = {}) {
  if (!file) return { file: null, warning: '', error: { message: 'No image file provided.' } };
  if (Number(file.size || 0) <= maxBytes) return { file, warning: '', error: null };

  try {
    const image = await decodeImageFile(file);
    const width = Math.max(1, image.naturalWidth || image.width || 1);
    const height = Math.max(1, image.naturalHeight || image.height || 1);
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Unable to process selected image.');
    context.drawImage(image, 0, 0, width, height);

    let bestBlob = null;
    let bestDistance = Number.POSITIVE_INFINITY;
    const targetMid = (minBytes + maxBytes) / 2;
    const tryQualityRange = async (sourceCanvas) => {
      let low = 0.01;
      let high = 0.95;
      let attempts = 0;
      const MAX_ATTEMPTS = 12;

      while (attempts < MAX_ATTEMPTS && high - low > 0.005) {
        const quality = Number((((low + high) / 2)).toFixed(3));
        const blob = await canvasToBlob(sourceCanvas, 'image/jpeg', quality);
        attempts += 1;
        if (!blob) continue;

        if (blob.size <= maxBytes && blob.size >= minBytes) {
          return blob;
        }

        if (blob.size <= maxBytes) {
          const distance = Math.abs(blob.size - targetMid);
          if (distance < bestDistance) {
            bestDistance = distance;
            bestBlob = blob;
          }
          low = quality;
        } else {
          high = quality;
        }
      }

      const finalBlob = await canvasToBlob(sourceCanvas, 'image/jpeg', 0.01);
      if (finalBlob && finalBlob.size <= maxBytes) {
        const distance = Math.abs(finalBlob.size - targetMid);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestBlob = finalBlob;
        }
        return finalBlob;
      }

      return null;
    };

    let currentCanvas = canvas;
    let currentWidth = width;
    let currentHeight = height;
    let finalBlob = await tryQualityRange(currentCanvas);

    if (!finalBlob || finalBlob.size > maxBytes) {
      const resizeSteps = [0.9, 0.8, 0.7, 0.6, 0.5, 0.4];
      for (const scale of resizeSteps) {
        currentWidth = Math.max(64, Math.round(width * scale));
        currentHeight = Math.max(64, Math.round(height * scale));
        canvas.width = currentWidth;
        canvas.height = currentHeight;
        context.clearRect(0, 0, currentWidth, currentHeight);
        context.drawImage(image, 0, 0, currentWidth, currentHeight);
        currentCanvas = canvas;
        finalBlob = await tryQualityRange(currentCanvas);
        if (finalBlob && finalBlob.size <= maxBytes) break;
      }
    }

    if (typeof image?.close === 'function') image.close();
    const resolvedBlob = finalBlob && finalBlob.size <= maxBytes ? finalBlob : bestBlob;
    if (!resolvedBlob || resolvedBlob.size > maxBytes) {
      return {
        file: null,
        warning: '',
        error: { message: `Image could not be compressed to ${Math.floor(maxBytes / 1024)}KB.` },
      };
    }

    const compressedFile = new File([resolvedBlob], `${sanitizeFileName(file?.name)}.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
    return {
      file: compressedFile,
      warning: `"${file?.name || 'image'}" auto-compressed to ${Math.max(1, Math.round(resolvedBlob.size / 1024))}KB (target 20-25KB).`,
      error: null,
    };
  } catch (error) {
    return { file: null, warning: '', error: { message: error?.message || 'Unable to process selected image.' } };
  }
}

async function uploadSingleDonationAttachment(file, { trustId = null } = {}) {
  if (!file) return { data: null, error: { message: 'No attachment file provided.' } };
  const prepared = await prepareImageFileForUpload(file);
  if (prepared.error || !prepared.file) {
    return { data: null, error: { message: prepared.error?.message || getAllowedImageFormatsMessage() } };
  }
  const compressed = await compressImageToJpegRange(prepared.file, {
    minBytes: TARGET_MIN_IMAGE_BYTES,
    maxBytes: MAX_IMAGE_BYTES,
  });
  if (compressed.error || !compressed.file) {
    return {
      data: null,
      error: {
        message:
          compressed.error?.message ||
          `Image could not be compressed to ${Math.floor(MAX_IMAGE_BYTES / 1024)}KB. Please try a smaller image.`,
      },
    };
  }
  const uploadFile = compressed.file;

  const path = buildDonationAttachmentPath(trustId, uploadFile);
  const { error: uploadError } = await supabase
    .storage
    .from(DONATIONS_BUCKET)
    .upload(path, uploadFile, {
      cacheControl: '3600',
      upsert: false,
      contentType: uploadFile.type || undefined,
    });

  if (uploadError) {
    if (String(uploadError.message || '').toLowerCase().includes('bucket not found')) {
      return {
        data: null,
        error: {
          ...uploadError,
          message: `Storage bucket "${DONATIONS_BUCKET}" not found. Create this bucket in Supabase Storage or set VITE_DONATIONS_BUCKET.`,
        },
      };
    }
    return { data: null, error: uploadError };
  }

  const { data: publicData } = supabase.storage.from(DONATIONS_BUCKET).getPublicUrl(path);
  return {
    data: {
      path,
      publicUrl: String(publicData?.publicUrl || '').trim(),
      warning: [prepared.warning, compressed.warning].filter(Boolean).join(' ').trim(),
    },
    error: null,
  };
}

export async function uploadDonationAttachments(files = [], { trustId = null } = {}) {
  const selectedFiles = Array.from(files || []).filter(Boolean);
  if (!selectedFiles.length) return { data: [], error: null };

  const uploadResults = await Promise.all(
    selectedFiles.map(async (file) => {
      const { data, error } = await uploadSingleDonationAttachment(file, { trustId });
      return { file, data, error };
    })
  );

  const firstError = uploadResults.find((result) => result.error)?.error || null;
  if (firstError) return { data: [], error: firstError };

  return {
    data: uploadResults.map((result) => String(result.data?.publicUrl || '').trim()).filter(Boolean),
    warnings: uploadResults.map((result) => String(result.data?.warning || '').trim()).filter(Boolean),
    error: null,
  };
}

export async function fetchDonationsByTrust(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(
    `donations:list:${trustId}`,
    async () => {
      const { data, error } = await supabase
        .from(TABLE_NAME)
        .select('*')
        .eq('trust_id', trustId)
        .order('created_at', { ascending: false })
        .range(0, MAX_FETCH - 1);

      return { data: (data || []).map(normalizeRow), error };
    },
    12000
  );
}

export async function createDonation(payload = {}) {
  const name = String(payload.name || '').trim();
  if (!name) return { data: null, error: { message: 'Donation name is required.' } };

  const row = {
    trust_id: payload.trust_id || null,
    name,
    description: String(payload.description || '').trim() || null,
    attachments: normalizeAttachments(payload.attachments),
    amount: null,
    amount_type: String(payload.amount_type || '').trim() || null,
    status: String(payload.status || 'active').trim() || 'active',
    type: String(payload.type || '').trim() || null,
  };

  const { value: parsedAmount, error: amountError } = toMoneyValue(payload.amount);
  if (amountError) return { data: null, error: amountError };
  row.amount = parsedAmount;

  const { data, error } = await supabase.from(TABLE_NAME).insert([row]).select('*').single();
  if (!error) invalidateCache('donations:');
  return { data: data ? normalizeRow(data) : null, error };
}

export async function updateDonation(donationId, updates = {}, trustId = null) {
  if (!donationId) return { data: null, error: { message: 'No donation id provided.' } };

  const payload = {
    ...(updates.name !== undefined ? { name: String(updates.name || '').trim() } : {}),
    ...(updates.description !== undefined
      ? { description: String(updates.description || '').trim() || null }
      : {}),
    ...(updates.attachments !== undefined ? { attachments: normalizeAttachments(updates.attachments) } : {}),
    ...(updates.amount !== undefined ? { amount: null } : {}),
    ...(updates.amount_type !== undefined
      ? { amount_type: String(updates.amount_type || '').trim() || null }
      : {}),
    ...(updates.status !== undefined ? { status: String(updates.status || '').trim() || 'active' } : {}),
    ...(updates.type !== undefined ? { type: String(updates.type || '').trim() || null } : {}),
    updated_at: new Date().toISOString(),
  };

  if (updates.amount !== undefined) {
    const { value: parsedAmount, error: amountError } = toMoneyValue(updates.amount);
    if (amountError) return { data: null, error: amountError };
    payload.amount = parsedAmount;
  }

  let query = supabase.from(TABLE_NAME).update(payload).eq('id', donationId);
  if (trustId) query = query.eq('trust_id', trustId);

  const { data, error } = await query.select('*').single();
  if (!error) invalidateCache('donations:');
  return { data: data ? normalizeRow(data) : null, error };
}

export async function deleteDonation(donationId, trustId = null) {
  if (!donationId) return { error: { message: 'No donation id provided.' } };

  let query = supabase.from(TABLE_NAME).delete().eq('id', donationId);
  if (trustId) query = query.eq('trust_id', trustId);

  const { error } = await query;
  if (!error) invalidateCache('donations:');
  return { error };
}
