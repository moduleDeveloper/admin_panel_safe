import { supabase } from '../../../core/lib/supabase';
import { cachedQuery, invalidateCache } from '../../../core/services/requestCache';
import { getAllowedImageFormatsMessage, prepareImageFileForUpload } from '../../../core/utils/imageUpload';

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
    razorpay_id: row.razorpay_id || '',
    vendor_share: row.vendor_share ?? null,
    size: row.size ?? null,
    created_at: row.created_at || null,
    raw: row,
  };
}

// Every database read/write goes through the admin-panel RPC:
//   manage_adminPanel_by_trustdetails(p_trust_id, p_action, p_payload)
// Bank actions (as provided by the RPC): bank_read | bank_create | bank_update
const ADMIN_PANEL_RPC = 'manage_adminPanel_by_trustdetails';

const BANK_ERROR_MESSAGES = {
  TRUST_ID_REQUIRED: 'No trust id provided.',
  TRUST_NOT_FOUND: 'Trust not found.',
  INVALID_ACTION: 'This action is not supported by the server.',
  BANK_NAME_REQUIRED: 'Name is required.',
  BANK_MOBILE_REQUIRED: 'Mobile is required.',
  BANK_ID_REQUIRED: 'No record id provided.',
  BANK_TRUST_ID_NOT_EDITABLE: 'Trust of a bank record cannot be changed.',
  BANK_DETAILS_NOT_FOUND_IN_TRUST: 'Bank details not found for this trust. Reload and try again.',
  INVALID_INPUT_FORMAT: 'Some values are in an invalid format.',
  DUPLICATE_VALUE: 'These bank details already exist.',
};

async function callBankRpc(trustId, action, payload = {}) {
  const { data, error } = await supabase.rpc(ADMIN_PANEL_RPC, {
    p_trust_id: trustId,
    p_action: action,
    p_payload: payload,
  });

  if (error) return { data: null, error };
  if (!data?.success) {
    const code = data?.error;
    const message = BANK_ERROR_MESSAGES[code]
      || data?.message
      || (data?.detail ? `Server error: ${data.detail}` : 'Something went wrong. Please try again.');
    return { data: null, error: { code, message } };
  }
  return { data: data.data ?? null, error: null };
}

const trimOrEmpty = (value) => String(value ?? '').trim();

// Text fields the RPC accepts; '' clears a column on update.
const BANK_TEXT_FIELDS = [
  'name', 'mobile', 'email_id', 'qr', 'beneficiary_name', 'account_no',
  'bank_name', 'branch', 'ifsc_code', 'swift_code', 'upi_id', 'razorpay_id',
];
// tei_share is a generated column in the DB, so it is never sent.
const BANK_NUMBER_FIELDS = ['size', 'vendor_share'];

function toRpcPayload(source = {}) {
  const payload = {};
  BANK_TEXT_FIELDS.forEach((key) => {
    if (source[key] !== undefined) payload[key] = trimOrEmpty(source[key]);
  });
  BANK_NUMBER_FIELDS.forEach((key) => {
    if (source[key] !== undefined) payload[key] = source[key] ?? '';
  });
  return payload;
}

export async function fetchBankDetailsByTrust(trustId) {
  if (!trustId) return { data: [], error: null };

  return cachedQuery(
    `bank-details:list:${trustId}`,
    async () => {
      const { data, error } = await callBankRpc(trustId, 'bank_read');
      // RPC returns oldest first; the page lists newest first.
      const rows = Array.isArray(data) ? [...data].reverse().slice(0, MAX_FETCH) : [];
      return { data: rows.map(normalizeRow), error };
    },
    12000
  );
}

// QR image files go to Supabase Storage (an RPC cannot upload files); only the
// resulting URL is saved to the database, through bank_create / bank_update.
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
  if (!trimOrEmpty(payload.name)) return { data: null, error: { message: 'Name is required.' } };
  if (!trimOrEmpty(payload.mobile)) return { data: null, error: { message: 'Mobile is required.' } };

  const { data, error } = await callBankRpc(payload.trust_id, 'bank_create', toRpcPayload(payload));
  if (!error) invalidateCache('bank-details:');
  return { data: data ? normalizeRow(data) : null, error };
}

export async function updateBankDetail(recordId, updates = {}, trustId = null) {
  if (!recordId) return { data: null, error: { message: 'No record id provided.' } };
  const scopeTrustId = trustId || updates.trust_id;
  if (!scopeTrustId) return { data: null, error: { message: 'No trust id provided.' } };

  // trust_id must not be sent: the RPC rejects it on update.
  const { data, error } = await callBankRpc(scopeTrustId, 'bank_update', { ...toRpcPayload(updates), id: recordId });
  if (!error) invalidateCache('bank-details:');
  return { data: data ? normalizeRow(data) : null, error };
}
