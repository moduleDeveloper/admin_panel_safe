import { supabaseAdmin } from '../lib/supabaseAdmin.js';
import { cacheGet, cacheSet } from '../lib/ttlCache.js';
import { badRequest } from '../utils/helpers.js';

const CACHE_TTL_MS = 60_000;
const MEMBER_MATCH_CACHE_PREFIX = 'lms_member_match';
const LEAD_FIELD_ALIASES = {
  type: ['type', 'last_type'],
  source: ['source', 'last_source'],
  last_flow: ['last_flow', 'flow'],
  last_action: ['last_action', 'action'],
};
const MEMBER_FIELD_ALIASES = [
  ['member_id', 'members_id', 'id'],
  ['name', 'Name'],
  ['mobile', 'Mobile'],
  ['email', 'Email'],
  ['company_name', 'Company Name'],
  ['address_home', 'Address Home'],
  ['address_office', 'Address Office'],
  ['resident_landline', 'Resident Landline'],
  ['office_landline', 'Office Landline'],
  ['serial_no', 'S.No.'],
  ['membership_number', 'Membership number', 'Membership Number'],
  ['role', 'Role'],
  ['joined_date', 'Joined Date'],
  ['is_active', 'Is Active'],
  ['is_editable', 'is_editable'],
  ['member_type', 'member_type'],
];
const TRUST_MEMBER_FIELD_ALIASES = [
  ['trust_name', 'trustName', 'Trust Name'],
  ['trust_id', 'trustId', 'Trust Id', 'Trust ID'],
  ['member_id', 'members_id', 'id'],
  ['name', 'Name'],
  ['mobile', 'Mobile'],
  ['email', 'Email'],
  ['company_name', 'Company Name'],
  ['address_home', 'Address Home'],
  ['address_office', 'Address Office'],
  ['resident_landline', 'Resident Landline'],
  ['office_landline', 'Office Landline'],
  ['serial_no', 'S.No.'],
  ['membership_number', 'Membership number', 'Membership Number'],
  ['role', 'Role'],
  ['joined_date', 'Joined Date'],
  ['is_active', 'Is Active'],
  ['is_editable', 'is_editable'],
  ['member_type', 'member_type'],
];
const TRUST_OWNER_FIELD_ALIASES = [
  ['trust_name', 'trustName', 'Trust Name'],
  ['trust_id', 'trustId', 'Trust Id', 'Trust ID'],
  ['member_id', 'members_id', 'id'],
  ['name', 'Name'],
  ['mobile', 'Mobile'],
  ['email', 'Email'],
  ['company_name', 'Company Name'],
  ['address_home', 'Address Home'],
  ['address_office', 'Address Office'],
  ['resident_landline', 'Resident Landline'],
  ['office_landline', 'Office Landline'],
  ['serial_no', 'S.No.'],
  ['membership_number', 'Membership number', 'Membership Number'],
  ['role', 'Role'],
  ['joined_date', 'Joined Date'],
  ['is_active', 'Is Active'],
  ['is_editable', 'is_editable'],
  ['member_type', 'member_type'],
];
const CHAT_FIELD_ALIASES = [
  ['flow', 'Flow'],
  ['action', 'Action'],
  ['trigger', 'Trigger'],
  ['date_time', 'dateTime', 'Date Time'],
];

function normalizeLeadValue(value) {
  return String(value ?? '').trim().toLowerCase();
}

function pickLeadValue(lead, keys) {
  for (const key of keys) {
    const value = lead?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') {
      return value;
    }
  }
  return null;
}

async function getLeadsFromRpc() {
  const cacheKey = 'lms_mktaction_rpc_all';
  const cached = cacheGet(cacheKey);
  if (cached) {
    return { data: cached, error: null, meta: { cacheHit: true, rpcMs: 0 } };
  }

  const startedAt = Date.now();
  const { data, error } = await supabaseAdmin.rpc('lms_mktaction', {});
  if (error) return { data: null, error };

  const rows = Array.isArray(data) ? data : [];
  cacheSet(cacheKey, rows, CACHE_TTL_MS);
  return {
    data: rows,
    error: null,
    meta: {
      cacheHit: false,
      rpcMs: Date.now() - startedAt,
    },
  };
}

function pickAlias(row, keys) {
  for (const key of keys) {
    const value = row?.[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return value;
  }
  return null;
}

function normalizeMemberMatchRow(row = {}) {
  const normalized = {};

  for (const aliases of MEMBER_FIELD_ALIASES) {
    const [primaryKey] = aliases;
    normalized[primaryKey] = pickAlias(row, aliases);
  }

  return {
    ...row,
    ...normalized,
  };
}

function normalizeTrustMemberRow(row = {}) {
  const normalized = {};

  for (const aliases of TRUST_MEMBER_FIELD_ALIASES) {
    const [primaryKey] = aliases;
    normalized[primaryKey] = pickAlias(row, aliases);
  }

  return {
    ...row,
    ...normalized,
  };
}

function normalizeTrustOwnerRow(row = {}) {
  const normalized = {};

  for (const aliases of TRUST_OWNER_FIELD_ALIASES) {
    const [primaryKey] = aliases;
    normalized[primaryKey] = pickAlias(row, aliases);
  }

  return {
    ...row,
    ...normalized,
  };
}

function normalizeChatHistoryRow(row = {}) {
  const normalized = {};

  for (const aliases of CHAT_FIELD_ALIASES) {
    const [primaryKey] = aliases;
    normalized[primaryKey] = pickAlias(row, aliases);
  }

  return {
    ...row,
    ...normalized,
  };
}

function normalizeRpcRows(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function normalizeMktDataPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  return payload;
}

function matchesLead(row, filters) {
  const leadId = normalizeLeadValue(filters.leadId);
  const mobile = normalizeLeadValue(filters.mobile);
  const name = normalizeLeadValue(filters.name);

  if (leadId) {
    const candidates = [
      row?.id,
      row?.lead_id,
      row?.leadId,
      row?.mobile,
    ].map(normalizeLeadValue);

    if (candidates.includes(leadId)) return true;
  }

  if (mobile && normalizeLeadValue(row?.mobile) === mobile) return true;
  if (name && normalizeLeadValue(row?.name) === name) return true;
  return false;
}

function shapeLeadRow(row) {
  return {
    ...row,
    type: pickLeadValue(row, LEAD_FIELD_ALIASES.type),
    source: pickLeadValue(row, LEAD_FIELD_ALIASES.source),
    last_flow: pickLeadValue(row, LEAD_FIELD_ALIASES.last_flow),
    last_action: pickLeadValue(row, LEAD_FIELD_ALIASES.last_action),
    last_seen: pickLeadValue(row, ['last_seen', 'date_time', 'dateTime', 'created_at', 'updated_at']),
  };
}

export async function getMemberMatchHandler(req, res) {
  try {
    const trustId = String(req.params?.trustId || '').trim();
    if (!trustId) return badRequest(res, 'trustId is required.');

    const mobile = String(req.query?.mobile || '').trim();
    if (!mobile) return badRequest(res, 'mobile is required.');

    const cacheKey = `${MEMBER_MATCH_CACHE_PREFIX}:${trustId}:${mobile}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ members: cached, source: 'lms_member_match_rpc' });
    }

    const { data, error } = await supabaseAdmin.rpc('lms_member_match', { p_mobile: mobile });
    if (error) {
      return res.status(500).json({
        error: error.message || 'Failed to fetch matched members.',
      });
    }

    const rows = Array.isArray(data) ? data.map(normalizeMemberMatchRow) : [];
    cacheSet(cacheKey, rows, CACHE_TTL_MS);
    return res.json({ members: rows, source: 'lms_member_match_rpc' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch matched members.' });
  }
}

export async function getTrustMemberMatchHandler(req, res) {
  try {
    const trustId = String(req.params?.trustId || '').trim();
    if (!trustId) return badRequest(res, 'trustId is required.');

    const mobile = String(req.query?.mobile || '').trim();
    if (!mobile) return badRequest(res, 'mobile is required.');
    const cacheKey = `${MEMBER_MATCH_CACHE_PREFIX}:trust:${trustId}:${mobile}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ members: cached, source: 'reg_trust_by_mob_rpc' });
    }

    const { data, error } = await supabaseAdmin.rpc('reg_trust_by_mob', { p_mobile: mobile });
    if (error) {
      return res.status(500).json({
        error: error.message || 'Failed to fetch trust member details.',
      });
    }

    const rows = Array.isArray(data) ? data.map(normalizeTrustMemberRow) : [];
    cacheSet(cacheKey, rows, CACHE_TTL_MS);
    return res.json({ members: rows, source: 'reg_trust_by_mob_rpc' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch trust member details.' });
  }
}

export async function getTrustOwnerDetailsHandler(req, res) {
  try {
    const trustId = String(req.params?.trustId || '').trim();
    if (!trustId) return badRequest(res, 'trustId is required.');

    const mobile = String(req.query?.mobile || '').trim();
    if (!mobile) return badRequest(res, 'mobile is required.');

    const cacheKey = `${MEMBER_MATCH_CACHE_PREFIX}:owner:${trustId}:${mobile}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ trusts: cached, source: 'get_trusts_by_mobile_rpc' });
    }

    const { data, error } = await supabaseAdmin.rpc('get_trusts_by_mobile', { p_mobile: mobile });
    if (error) {
      return res.status(500).json({
        error: error.message || 'Failed to fetch trust owner details.',
      });
    }

    const rawRows = Array.isArray(data?.trusts) ? data.trusts : Array.isArray(data) ? data : [];
    const rows = rawRows.map(normalizeTrustOwnerRow);
    cacheSet(cacheKey, rows, CACHE_TTL_MS);
    return res.json({ trusts: rows, source: 'get_trusts_by_mobile_rpc' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch trust owner details.' });
  }
}

export async function getChatHistoryHandler(req, res) {
  try {
    const trustId = String(req.params?.trustId || '').trim();
    if (!trustId) return badRequest(res, 'trustId is required.');

    const mobile = String(req.query?.mobile || '').trim();
    if (!mobile) return badRequest(res, 'mobile is required.');

    const cacheKey = `${MEMBER_MATCH_CACHE_PREFIX}:chat:${trustId}:${mobile}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return res.json({ chat: cached, source: 'lms_chat_history_rpc' });
    }

    const { data, error } = await supabaseAdmin.rpc('lms_chat_history', { p_mobile: mobile });
    if (error) {
      return res.status(500).json({
        error: error.message || 'Failed to fetch chat history.',
      });
    }

    const rawRows = Array.isArray(data?.chat) ? data.chat : Array.isArray(data) ? data : [];
    const rows = rawRows.map(normalizeChatHistoryRow);
    cacheSet(cacheKey, rows, CACHE_TTL_MS);
    return res.json({ chat: rows, source: 'lms_chat_history_rpc' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch chat history.' });
  }
}

export async function getLeadsHandler(req, res) {
  try {
    const trustId = String(req.params?.trustId || '').trim();
    if (!trustId) return badRequest(res, 'trustId is required.');

    const requestStartedAt = Date.now();
    const rpcResult = await getLeadsFromRpc();

    if (rpcResult.error) {
      return res.status(500).json({
        error: rpcResult.error.message || 'Failed to fetch leads from lms_mktaction.',
      });
    }

    const filters = {
      leadId: String(req.query?.leadId || '').trim(),
      mobile: String(req.query?.mobile || '').trim(),
      name: String(req.query?.name || '').trim(),
    };

    const shapedLeads = rpcResult.data.map(shapeLeadRow);
    const totalMs = Date.now() - requestStartedAt;
    if (globalThis.process?.env?.NODE_ENV !== 'production') {
      console.info('[leads] fetch complete', {
        trustId,
        count: shapedLeads.length,
        cacheHit: rpcResult.meta?.cacheHit ?? false,
        rpcMs: rpcResult.meta?.rpcMs ?? null,
        totalMs,
      });
    }

    const hasFilters = filters.leadId || filters.mobile || filters.name;

    if (hasFilters) {
      const lead = shapedLeads.find((row) => matchesLead(row, filters));
      if (!lead) {
        return res.status(404).json({
          error: 'Lead not found.',
          source: 'lms_mktaction_rpc',
        });
      }

      return res.json({ lead, source: 'lms_mktaction_rpc' });
    }

    return res.json({ leads: shapedLeads, source: 'lms_mktaction_rpc' });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to fetch leads.' });
  }
}

export async function searchMktDataHandler(req, res) {
  try {
    const pSearch = String(req.body?.p_search || req.query?.p_search || req.query?.search || '').trim();
    if (!pSearch) return badRequest(res, 'p_search is required.');

    const { data, error } = await supabaseAdmin.rpc('search_mkt_data', { p_search: pSearch });
    if (error) {
      return res.status(500).json({
        error: error.message || 'Failed to search marketing data.',
      });
    }

    return res.json({
      items: normalizeRpcRows(data),
      source: 'search_mkt_data_rpc',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to search marketing data.' });
  }
}

export async function manageMktDataHandler(req, res) {
  try {
    const pType = String(req.body?.p_type || '').trim();
    const pId = String(req.body?.p_id || '').trim();
    const pData = normalizeMktDataPayload(req.body?.p_data);

    if (!pType) return badRequest(res, 'p_type is required.');

    const { data, error } = await supabaseAdmin.rpc('mkt_data_manager', {
      p_type: pType,
      p_id: pId || null,
      p_data: pData,
    });

    if (error) {
      return res.status(500).json({
        error: error.message || 'Failed to update marketing data.',
      });
    }

    return res.json({
      data,
      source: 'mkt_data_manager_rpc',
    });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Failed to update marketing data.' });
  }
}
