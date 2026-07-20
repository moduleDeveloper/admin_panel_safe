import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache';
import { getAllowedImageFormatsMessage, prepareImageFileForUpload } from '../utils/imageUpload';

const TABLE_NAME = 'trust_bank_details';
const QR_BUCKET = 'trust-qr';
const MAX_FETCH = 200;

function uniqueId() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function extensionFromFile(file) {
  const fromName = String(file?.name || '').split('.').pop()?.toLowerCase();
  if (fromName && fromName.length <= 5) return fromName;
  const mime = String(file?.type || '').toLowerCase();
  if (mime.includes('png')) return 'png';
  return 'jpg';
}

function buildQrPath(trustId, file) {
  const ext = extensionFromFile(file);
  const safeTrustId = String(trustId || 'misc').replace(/[^a-zA-Z0-9_-]/g, '') || 'misc';
  return `${safeTrustId}/${Date.now()}-${uniqueId()}.${ext}`;
}

function normalizeRow(row = {}) {
  return {
    id: row.id,
    trust_id: row.trust_id,
    name: row.name || '',
    mobile: row.mobile || '',
    email_id: row.email_id || '',
    qr: row.qr || '',
    beneficiary_name: row.beneficiary_name || '',
    account_no: row.account_no || '',
    bank_name: row.bank_name || '',
    branch: row.branch || '',
    ifsc_code: row.ifsc_code || '',
    swift_code: row.swift_code || '',
    upi_id: row.upi_id || '',
    size: row.size ?? null,
    created_at: row.created_at || null,
    raw: row,
  };
}

export async function fetchBankDetailsByTrust(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(
    `bank-details:list:${trustId}`,
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

export async function uploadBankQr(trustId, file) {
  if (!file) return { data: null, error: { message: 'No QR image provided.' } };

  const prepared = await prepareImageFileForUpload(file);
  if (prepared.error || !prepared.file) {
    return { data: null, error: { message: prepared.error?.message || getAllowedImageFormatsMessage() } };
  }
  const uploadFile = prepared.file;

  const path = buildQrPath(trustId, uploadFile);
  const { error: uploadError } = await supabase.storage.from(QR_BUCKET).upload(path, uploadFile, {
    cacheControl: '3600',
    upsert: false,
    contentType: uploadFile.type || undefined,
  });

  if (uploadError) {
    if (String(uploadError.message || '').toLowerCase().includes('bucket not found')) {
      return {
        data: null,
        error: { ...uploadError, message: `Storage bucket "${QR_BUCKET}" not found. Create it in Supabase Storage.` },
      };
    }
    return { data: null, error: uploadError };
  }

  const { data: publicData } = supabase.storage.from(QR_BUCKET).getPublicUrl(path);
  if (!publicData?.publicUrl) {
    return { data: null, error: { message: 'Uploaded QR but failed to generate public URL.' } };
  }

  return {
    data: {
      url: publicData.publicUrl,
      sizeKb: Math.round((uploadFile.size / 1024) * 100) / 100,
    },
    error: null,
  };
}

export async function createBankDetail(payload = {}) {
  if (!payload.trust_id) return { data: null, error: { message: 'No trust id provided.' } };
  if (!String(payload.name || '').trim()) return { data: null, error: { message: 'Name is required.' } };
  if (!String(payload.mobile || '').trim()) return { data: null, error: { message: 'Mobile is required.' } };

  const row = {
    trust_id: payload.trust_id,
    name: String(payload.name || '').trim(),
    mobile: String(payload.mobile || '').trim(),
    email_id: String(payload.email_id || '').trim() || null,
    qr: String(payload.qr || '').trim() || null,
    beneficiary_name: String(payload.beneficiary_name || '').trim() || null,
    account_no: String(payload.account_no || '').trim() || null,
    bank_name: String(payload.bank_name || '').trim() || null,
    branch: String(payload.branch || '').trim() || null,
    ifsc_code: String(payload.ifsc_code || '').trim() || null,
    swift_code: String(payload.swift_code || '').trim() || null,
    upi_id: String(payload.upi_id || '').trim() || null,
    size: payload.size ?? null,
  };

  const { data, error } = await supabase.from(TABLE_NAME).insert([row]).select('*').single();
  if (!error) invalidateCache('bank-details:');
  return { data: data ? normalizeRow(data) : null, error };
}

export async function updateBankDetail(recordId, updates = {}, trustId = null) {
  if (!recordId) return { data: null, error: { message: 'No record id provided.' } };

  const payload = {
    ...(updates.name !== undefined ? { name: String(updates.name || '').trim() } : {}),
    ...(updates.mobile !== undefined ? { mobile: String(updates.mobile || '').trim() } : {}),
    ...(updates.email_id !== undefined ? { email_id: String(updates.email_id || '').trim() || null } : {}),
    ...(updates.qr !== undefined ? { qr: String(updates.qr || '').trim() || null } : {}),
    ...(updates.beneficiary_name !== undefined
      ? { beneficiary_name: String(updates.beneficiary_name || '').trim() || null }
      : {}),
    ...(updates.account_no !== undefined ? { account_no: String(updates.account_no || '').trim() || null } : {}),
    ...(updates.bank_name !== undefined ? { bank_name: String(updates.bank_name || '').trim() || null } : {}),
    ...(updates.branch !== undefined ? { branch: String(updates.branch || '').trim() || null } : {}),
    ...(updates.ifsc_code !== undefined ? { ifsc_code: String(updates.ifsc_code || '').trim() || null } : {}),
    ...(updates.swift_code !== undefined ? { swift_code: String(updates.swift_code || '').trim() || null } : {}),
    ...(updates.upi_id !== undefined ? { upi_id: String(updates.upi_id || '').trim() || null } : {}),
    ...(updates.size !== undefined ? { size: updates.size } : {}),
  };

  let query = supabase.from(TABLE_NAME).update(payload).eq('id', recordId);
  if (trustId) query = query.eq('trust_id', trustId);

  const { data, error } = await query.select('*').single();
  if (!error) invalidateCache('bank-details:');
  return { data: data ? normalizeRow(data) : null, error };
}

export async function deleteBankDetail(recordId, trustId = null) {
  if (!recordId) return { error: { message: 'No record id provided.' } };

  let query = supabase.from(TABLE_NAME).delete().eq('id', recordId);
  if (trustId) query = query.eq('trust_id', trustId);

  const { error } = await query;
  if (!error) invalidateCache('bank-details:');
  return { error };
}
