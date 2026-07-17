import { supabase } from '../lib/supabase';

function normalizeApiBase(rawBase) {
  const base = String(rawBase || 'http://localhost:8080').trim().replace(/\/+$/, '');
  return base.replace(/\/api$/i, '');
}

const API_BASE = normalizeApiBase(import.meta.env.VITE_VIDEO_BACKEND_URL);
const CACHE_TTL_MS = 60_000;
const cache = new Map();

export function invalidateLeadCache() {
  cache.clear();
}

function buildCacheKey(trustId, params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    const cleanValue = String(value || '').trim();
    if (cleanValue) search.set(key, cleanValue);
  });
  const suffix = search.toString();
  return suffix ? `${trustId}|${suffix}` : trustId;
}

async function fetchLeadsRequest({ trustId, trustName = '', params = {}, force = false }) {
  const cleanTrustId = String(trustId || '').trim();
  if (!cleanTrustId) return { data: null, error: { message: 'trustId is required.' } };

  const cacheKey = buildCacheKey(cleanTrustId, params);
  const cached = cache.get(cacheKey);
  if (!force && cached && Date.now() < cached.expiresAt) {
    return { data: cached.value, error: null };
  }

  const url = new URL(`${API_BASE}/api/leads/${encodeURIComponent(cleanTrustId)}`);
  const cleanTrustName = String(trustName || '').trim();
  if (cleanTrustName) {
    url.searchParams.set('trustName', cleanTrustName);
  }
  Object.entries(params).forEach(([key, value]) => {
    const cleanValue = String(value || '').trim();
    if (cleanValue) url.searchParams.set(key, cleanValue);
  });

  const response = await fetch(url, { method: 'GET' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { data: null, error: { message: data?.error || `Request failed (${response.status})` } };
  }

  cache.set(cacheKey, { value: data, expiresAt: Date.now() + CACHE_TTL_MS });
  return { data, error: null };
}

export async function fetchLeads({ trustId, trustName = '', force = false }) {
  return fetchLeadsRequest({ trustId, trustName, force });
}

export async function fetchLeadDetails({ trustId, trustName = '', leadId = '', mobile = '', name = '', force = false }) {
  return fetchLeadsRequest({
    trustId,
    trustName,
    params: { leadId, mobile, name },
    force,
  });
}

export async function fetchMatchedMembersByMobile({ trustId, mobile = '', force = false }) {
  const cleanTrustId = String(trustId || '').trim();
  const cleanMobile = String(mobile || '').trim();
  if (!cleanTrustId) return { data: null, error: { message: 'trustId is required.' } };
  if (!cleanMobile) return { data: null, error: { message: 'mobile is required.' } };

  const cacheKey = buildCacheKey(cleanTrustId, { mobile: cleanMobile });
  const cached = cache.get(cacheKey);
  if (!force && cached && Date.now() < cached.expiresAt) {
    return { data: cached.value, error: null };
  }

  const url = new URL(`${API_BASE}/api/leads/${encodeURIComponent(cleanTrustId)}/member-match`);
  url.searchParams.set('mobile', cleanMobile);

  const response = await fetch(url, { method: 'GET' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { data: null, error: { message: data?.error || `Request failed (${response.status})` } };
  }

  cache.set(cacheKey, { value: data, expiresAt: Date.now() + CACHE_TTL_MS });
  return { data, error: null };
}

export async function fetchTrustMembersByMobile({ trustId, trustName = '', mobile = '', force = false }) {
  const cleanTrustId = String(trustId || '').trim();
  const cleanTrustName = String(trustName || '').trim();
  const cleanMobile = String(mobile || '').trim();
  if (!cleanTrustId) return { data: null, error: { message: 'trustId is required.' } };
  if (!cleanMobile) return { data: null, error: { message: 'mobile is required.' } };

  const cacheKey = buildCacheKey(cleanTrustId, { trustName: cleanTrustName, mobile: cleanMobile, kind: 'trust' });
  const cached = cache.get(cacheKey);
  if (!force && cached && Date.now() < cached.expiresAt) {
    return { data: cached.value, error: null };
  }

  const url = new URL(`${API_BASE}/api/leads/${encodeURIComponent(cleanTrustId)}/trust-member-match`);
  url.searchParams.set('mobile', cleanMobile);
  if (cleanTrustName) {
    url.searchParams.set('trustName', cleanTrustName);
  }

  const response = await fetch(url, { method: 'GET' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { data: null, error: { message: data?.error || `Request failed (${response.status})` } };
  }

  cache.set(cacheKey, { value: data, expiresAt: Date.now() + CACHE_TTL_MS });
  return { data, error: null };
}

export async function fetchTrustOwnerDetailsByMobile({ trustId, mobile = '', force = false }) {
  const cleanTrustId = String(trustId || '').trim();
  const cleanMobile = String(mobile || '').trim();
  if (!cleanTrustId) return { data: null, error: { message: 'trustId is required.' } };
  if (!cleanMobile) return { data: null, error: { message: 'mobile is required.' } };

  const cacheKey = buildCacheKey(cleanTrustId, { mobile: cleanMobile, kind: 'owner' });
  const cached = cache.get(cacheKey);
  if (!force && cached && Date.now() < cached.expiresAt) {
    return { data: cached.value, error: null };
  }

  const url = new URL(`${API_BASE}/api/leads/${encodeURIComponent(cleanTrustId)}/trust-owner-details`);
  url.searchParams.set('mobile', cleanMobile);

  const response = await fetch(url, { method: 'GET' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { data: null, error: { message: data?.error || `Request failed (${response.status})` } };
  }

  cache.set(cacheKey, { value: data, expiresAt: Date.now() + CACHE_TTL_MS });
  return { data, error: null };
}

export async function fetchLeadChatHistory({ trustId, mobile = '', force = false }) {
  const cleanTrustId = String(trustId || '').trim();
  const cleanMobile = String(mobile || '').trim();
  if (!cleanTrustId) return { data: null, error: { message: 'trustId is required.' } };
  if (!cleanMobile) return { data: null, error: { message: 'mobile is required.' } };

  const cacheKey = buildCacheKey(cleanTrustId, { mobile: cleanMobile, kind: 'chat' });
  const cached = cache.get(cacheKey);
  if (!force && cached && Date.now() < cached.expiresAt) {
    return { data: cached.value, error: null };
  }

  const url = new URL(`${API_BASE}/api/leads/${encodeURIComponent(cleanTrustId)}/chat-history`);
  url.searchParams.set('mobile', cleanMobile);

  const response = await fetch(url, { method: 'GET' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { data: null, error: { message: data?.error || `Request failed (${response.status})` } };
  }

  cache.set(cacheKey, { value: data, expiresAt: Date.now() + CACHE_TTL_MS });
  return { data, error: null };
}

export async function insertMktAction({ name = '', mobile = '', source = 'admin panel', action = '', trigger = '', flow = '', type = 'marketing' }) {
  const cleanName = String(name || '').trim();
  const cleanMobile = String(mobile || '').trim();
  const cleanSource = String(source || '').trim();
  const cleanAction = String(action || '').trim();
  const cleanTrigger = String(trigger || '').trim();
  const cleanFlow = String(flow || '').trim();
  const cleanType = String(type || '').trim();
  const normalizedMobile = (() => {
    const digitsOnly = cleanMobile.replace(/\D/g, '');
    if (!digitsOnly) return '';
    if (digitsOnly.length === 10) return `91${digitsOnly}`;
    if (digitsOnly.length === 11 && digitsOnly.startsWith('0')) return `91${digitsOnly.slice(1)}`;
    return digitsOnly;
  })();

  if (!normalizedMobile) return { data: null, error: { message: 'mobile is required.' } };
  if (!cleanAction) return { data: null, error: { message: 'action is required.' } };
  if (!cleanTrigger) return { data: null, error: { message: 'trigger is required.' } };
  if (!cleanFlow) return { data: null, error: { message: 'flow is required.' } };

  const { data, error } = await supabase.rpc('insert_mkt_action', {
    name: cleanName,
    mobile: normalizedMobile,
    source: cleanSource,
    action: cleanAction,
    trigger: cleanTrigger,
    flow: cleanFlow,
    type: cleanType,
  });

  if (error) {
    return { data: null, error: { message: error.message || 'Failed to insert marketing action.' } };
  }
  if (data && typeof data === 'object' && !Array.isArray(data) && data.error) {
    return { data: null, error: { message: data.error || 'Failed to insert marketing action.' } };
  }

  invalidateLeadCache();
  return { data, error: null };
}
