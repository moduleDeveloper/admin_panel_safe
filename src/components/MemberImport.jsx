import { useEffect, useMemo, useRef, useState } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { supabase } from '../lib/supabase';

const MEMBER_IMPORT_STATE_KEY = 'memberImportState';

function normalizePhone(raw) {
  if (!raw) return null;
  let phone = String(raw).trim();
  phone = phone.replace(/[\s\-\(\)\.]/g, '');
  phone = phone.replace(/^\+/, '');
  if (phone.length === 12 && phone.startsWith('91')) phone = phone.slice(2);
  if (phone.length === 11 && phone.startsWith('0')) phone = phone.slice(1);
  if (!/^\d+$/.test(phone)) return null;
  if (phone.length !== 10) return null;
  if (!/^[6-9]/.test(phone)) return null;
  return phone;
}

function extractFirstPhone(raw) {
  if (!raw) return null;
  const rawStr = String(raw).trim();
  const parts = rawStr.split(/[\s,;\/]+/).filter((p) => p.trim() !== '');

  for (const part of parts) {
    const normalized = normalizePhone(part.trim());
    if (normalized) return normalized;
  }

  const joined = parts.join('');
  const joinedResult = normalizePhone(joined);
  if (joinedResult) return joinedResult;

  return null;
}

const statusStyles = {
  new_member: { background: '#E6F9F0', color: '#0F6E56' },
  cross_trust_link: { background: '#E6F1FB', color: '#185FA5' },
  manual_review: { background: '#FDF3E3', color: '#854F0B' },
  ambiguous: { background: '#FCEBEB', color: '#A32D2D' },
  skipped_registered: { background: '#F1EFE8', color: '#5F5E5A' },
  dup: { background: '#F1EFE8', color: '#5F5E5A' },
  invalid: { background: '#FCEBEB', color: '#A32D2D' }
};
// Legacy alias kept for any remaining references
const statusColors = {
  new_member: '',
  cross_trust_link: '',
  manual_review: '',
  ambiguous: '',
  skipped_registered: '',
  dup: '',
  invalid: ''
};

function getFileSizeText(bytes) {
  if (!bytes && bytes !== 0) return '';
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function validateRow(row) {
  const errors = [];
  if (!row.editName || row.editName.trim() === '') errors.push('Name is empty');
  if (!row.editPhone || row.editPhone.trim() === '') {
    errors.push('Mobile is missing');
  } else if (!normalizePhone(row.editPhone)) {
    errors.push('Invalid mobile number');
  }
  if (!row.editRole || row.editRole.trim() === '') {
    errors.push('Role is missing');
  }
  if (!row.editMembershipNumber || row.editMembershipNumber.trim() === '') {
    errors.push('Membership Number is missing');
  }
  return errors;
}

const normalizeKeys = (row) => {
  const normalized = {};
  const seenKeys = new Set();

  Object.keys(row).forEach((key) => {
    const trimmedKey = key.trim();

    if (seenKeys.has(trimmedKey)) {
      normalized[key] = typeof row[key] === 'string' ? row[key].trim() : row[key];
    } else {
      seenKeys.add(trimmedKey);
      normalized[trimmedKey] = typeof row[key] === 'string' ? row[key].trim() : row[key];
    }
  });

  return normalized;
};

const isRowEmpty = (row) =>
  Object.values(row).every(
    (val) => val === null || val === undefined || String(val).trim() === ''
  );

function truncateId(id) {
  if (!id) return '';
  const s = String(id);
  if (s.length <= 12) return s;
  return `${s.slice(0, 8)}...${s.slice(-4)}`;
}

async function fetchAllMembers(supabaseClient) {
  const allMembers = [];
  const pageSize = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabaseClient
      .from('Members')
      .select('members_id, "Name", "Mobile"')
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allMembers.push(...data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
      }
    }
  }

  return allMembers;
}

async function fetchAllRegMembers(supabaseClient, trustId) {
  const allReg = [];
  const pageSize = 1000;
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    const { data, error } = await supabaseClient
      .from('reg_members')
      .select('members_id')
      .eq('trust_id', trustId)
      .range(from, from + pageSize - 1);

    if (error) throw error;
    if (!data || data.length === 0) {
      hasMore = false;
    } else {
      allReg.push(...data);
      if (data.length < pageSize) {
        hasMore = false;
      } else {
        from += pageSize;
      }
    }
  }

  return allReg;
}

export default function MemberImport({ onComplete }) {
  console.log('MemberImport rendered');
  const [screen, setScreen] = useState('upload');
  const [trusts, setTrusts] = useState([]);
  const [selectedTrustId, setSelectedTrustId] = useState('');
  const [loadingTrusts, setLoadingTrusts] = useState(false);
  const [file, setFile] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [uploadError, setUploadError] = useState('');
  const [parseErrorRows, setParseErrorRows] = useState([]);
  const [toast, setToast] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const [retryAction, setRetryAction] = useState(null);
  const fileInputRef = useRef(null);

  const [allRows, setAllRows] = useState([]);
  const [validRows, setValidRows] = useState([]);
  const [newRows, setNewRows] = useState([]);
  const [crossTrustRows, setCrossTrustRows] = useState([]);
  const [manualReviewRows, setManualReviewRows] = useState([]);
  const [ambiguousRows, setAmbiguousRows] = useState([]);
  const [skippedRegisteredRows, setSkippedRegisteredRows] = useState([]);
  const [fileDupRows, setFileDupRows] = useState([]);
  const [errorRows, setErrorRows] = useState([]);
  const [decisions, setDecisions] = useState({});
  const [ambiguousDecisions, setAmbiguousDecisions] = useState({});
  const [summary, setSummary] = useState(null);
  const [showSkippedAccordion, setShowSkippedAccordion] = useState(false);
  const [activeFilter, setActiveFilter] = useState(null);
  const skippedAccordionRef = useRef(null);

  const [invalidRows, setInvalidRows] = useState([]);
  const [validRowsDraft, setValidRowsDraft] = useState([]);
  const [dismissedRows, setDismissedRows] = useState([]);
  const [showFixPanel, setShowFixPanel] = useState(false);
  const [parsingDone, setParsingDone] = useState(false);

  const [insertLog, setInsertLog] = useState({
    membersInserted: [],
    regMembersInserted: [],
    regMembersFailed: []
  });

  const selectedTrust = useMemo(
    () => trusts.find((t) => t.id === selectedTrustId) || null,
    [trusts, selectedTrustId]
  );

  useEffect(() => {
    const saved = sessionStorage.getItem(MEMBER_IMPORT_STATE_KEY);
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved);
      const twoHours = 2 * 60 * 60 * 1000;
      if (!parsed?.savedAt || Date.now() - parsed.savedAt > twoHours) {
        sessionStorage.removeItem(MEMBER_IMPORT_STATE_KEY);
        return;
      }

      if (parsed.currentScreen) setScreen(parsed.currentScreen);
      if (parsed.selectedTrustId) setSelectedTrustId(parsed.selectedTrustId);
      if (parsed.validRowsDraft) setValidRowsDraft(parsed.validRowsDraft);
      if (parsed.invalidRows) setInvalidRows(parsed.invalidRows);
      if (parsed.newRows) setNewRows(parsed.newRows);
      if (parsed.crossTrustRows) setCrossTrustRows(parsed.crossTrustRows);
      if (parsed.manualReviewRows) setManualReviewRows(parsed.manualReviewRows);
      if (parsed.ambiguousRows) setAmbiguousRows(parsed.ambiguousRows);
      if (parsed.skippedRows) setSkippedRegisteredRows(parsed.skippedRows);
      if (parsed.fileDupRows) setFileDupRows(parsed.fileDupRows);
      if (parsed.errorRows) setErrorRows(parsed.errorRows);
      if (parsed.insertLog) setInsertLog(parsed.insertLog);
      if (parsed.decisions) setDecisions(parsed.decisions);
      if (parsed.ambiguousDecisions) setAmbiguousDecisions(parsed.ambiguousDecisions);
      if (typeof parsed.parsingDone === 'boolean') setParsingDone(parsed.parsingDone);
      if (typeof parsed.showFixPanel === 'boolean') setShowFixPanel(parsed.showFixPanel);
      if (typeof parsed.showSkippedAccordion === 'boolean') setShowSkippedAccordion(parsed.showSkippedAccordion);
      if (parsed.allRows) setAllRows(parsed.allRows);
      if (parsed.validRows) setValidRows(parsed.validRows);
      if (parsed.summary) setSummary(parsed.summary);
      if (parsed.dismissedRows) setDismissedRows(parsed.dismissedRows);
      if (parsed.parseErrorRows) setParseErrorRows(parsed.parseErrorRows);
      if (parsed.activeFilter !== undefined) setActiveFilter(parsed.activeFilter);
    } catch (e) {
      sessionStorage.removeItem(MEMBER_IMPORT_STATE_KEY);
    }
  }, []);

  useEffect(() => {
    const stateToSave = {
      currentScreen: screen,
      selectedTrustId,
      validRowsDraft,
      invalidRows,
      newRows,
      crossTrustRows,
      manualReviewRows,
      ambiguousRows,
      skippedRows: skippedRegisteredRows,
      excludedRows: [],
      fileDupRows,
      errorRows,
      insertLog,
      decisions,
      ambiguousDecisions,
      parsingDone,
      showFixPanel,
      showSkippedAccordion,
      allRows,
      validRows,
      summary,
      dismissedRows,
      parseErrorRows,
      activeFilter,
      savedAt: Date.now()
    };
    sessionStorage.setItem(MEMBER_IMPORT_STATE_KEY, JSON.stringify(stateToSave));
  }, [
    screen,
    selectedTrustId,
    validRowsDraft,
    invalidRows,
    newRows,
    crossTrustRows,
    manualReviewRows,
    ambiguousRows,
    skippedRegisteredRows,
    fileDupRows,
    errorRows,
    insertLog,
    decisions,
    ambiguousDecisions,
    parsingDone,
    showFixPanel,
    showSkippedAccordion,
    allRows,
    validRows,
    summary,
    dismissedRows,
    parseErrorRows,
    activeFilter
  ]);

  useEffect(() => {
    const loadTrusts = async () => {
      setLoadingTrusts(true);
      const { data, error } = await supabase.from('Trust').select('id, name').order('name');
      if (error) setToast({ type: 'error', message: `Insert failed: ${error.message}` });
      else setTrusts(data || []);
      setLoadingTrusts(false);
    };
    loadTrusts();
  }, []);

  const handleFileSelection = (f) => {
    if (!f) return;
    const validType = /\.(csv|xlsx)$/i.test(f.name);
    const maxOk = f.size <= 5 * 1024 * 1024;
    if (!validType || !maxOk) {
      setUploadError('Only .csv or .xlsx files are accepted');
      setFile(null);
      return;
    }
    setUploadError('');
    setFile(f);
    setParsingDone(false);
    setInvalidRows([]);
    setValidRowsDraft([]);
    setDismissedRows([]);
    setShowFixPanel(false);
    setParseErrorRows([]);
  };

  const parseRowsFromFile = async (inputFile) => {
    if (/\.csv$/i.test(inputFile.name)) {
      return new Promise((resolve, reject) => {
        Papa.parse(inputFile, {
          header: true,
          skipEmptyLines: true,
          complete: (results) => resolve(results.data || []),
          error: reject
        });
      });
    }
    const arrBuf = await inputFile.arrayBuffer();
    const wb = XLSX.read(arrBuf, { type: 'array' });
    const ws = wb.Sheets[wb.SheetNames[0]];
    return XLSX.utils.sheet_to_json(ws, { defval: '' });
  };

  const toStructuredRow = (row, idx) => {
    const rowNumber = row.rowNumber ?? idx + 2;
    const name = (row['Name'] || row['name'] || '').toString().trim();
    const rawPhone = row['Mobile'] || row['mobile'] || row['phone'] || row['Phone'] || '';
    const email = row['Email'] || row['email'] || null;
    const role = row['Role'] || row['role'] || row['ROLE'] || null;
    const membershipNumber =
      row['Membership Number'] ||
      row['membership_number'] ||
      row['Membership number'] ||
      row['MembershipNumber'] ||
      null;
    const addressHome = row['Address Home'] || null;
    const companyName = row['Company Name'] || null;
    const addressOffice = row['Address Office'] || null;
    const residentLandline = row['Resident Landline'] || null;
    const officeLandline = row['Office Landline'] || null;
    const contact = row.contact || row.Contact || null;
    const cleanPhone = extractFirstPhone(rawPhone);
    const errors = validateRow({
      editName: name,
      editPhone: cleanPhone ?? (rawPhone ? String(rawPhone) : ''),
      editRole: role || '',
      editMembershipNumber: membershipNumber || ''
    });

    return {
      rowNumber,
      name,
      rawPhone: rawPhone ? String(rawPhone) : '',
      cleanPhone,
      email,
      role,
      membershipNumber,
      addressHome,
      companyName,
      addressOffice,
      residentLandline,
      officeLandline,
      contact,
      errors,
      editName: name,
      editPhone: cleanPhone ?? (rawPhone ? String(rawPhone) : ''),
      editRole: role || '',
      editMembershipNumber: membershipNumber || '',
      phonePreview: cleanPhone
    };
  };

  const updateInvalidRow = (rowNumber, patch) => {
    setInvalidRows((prev) =>
      prev.map((r) => {
        if (r.rowNumber !== rowNumber) return r;
        const next = { ...r, ...patch };
        next.phonePreview = normalizePhone(next.editPhone || '');
        next.errors = validateRow(next);
        return next;
      })
    );
  };

  const saveInvalidRow = (rowNumber) => {
    setInvalidRows((prev) => {
      const row = prev.find((r) => r.rowNumber === rowNumber);
      if (!row) return prev;
      const newName = (row.editName || '').trim();
      const newPhone = row.editPhone || '';
      const newErrors = validateRow(row);
      if (newErrors.length > 0) {
        return prev.map((r) =>
          r.rowNumber === rowNumber ? { ...r, errors: newErrors, phonePreview: normalizePhone(r.editPhone || '') } : r
        );
      }
      setValidRowsDraft((v) => [
        ...v,
        {
          ...row,
          name: newName,
          rawPhone: newPhone,
          cleanPhone: normalizePhone(newPhone),
          role: row.editRole || null,
          membershipNumber: row.editMembershipNumber || null,
          errors: []
        }
      ]);
      return prev.filter((r) => r.rowNumber !== rowNumber);
    });
  };

  const deleteInvalidRow = (rowNumber) => {
    setInvalidRows((prev) => {
      const target = prev.find((r) => r.rowNumber === rowNumber);
      if (target) setDismissedRows((d) => [...d, target]);
      return prev.filter((r) => r.rowNumber !== rowNumber);
    });
  };

  const revalidateAll = () => {
    const fixed = [];
    const remaining = [];
    invalidRows.forEach((row) => {
      const newName = (row.editName || '').trim();
      const newPhone = row.editPhone || '';
      const newErrors = validateRow(row);
      if (newErrors.length === 0) {
        fixed.push({
          ...row,
          name: newName,
          rawPhone: newPhone,
          cleanPhone: normalizePhone(newPhone),
          role: row.editRole || null,
          membershipNumber: row.editMembershipNumber || null,
          errors: []
        });
      } else {
        remaining.push({ ...row, errors: newErrors, phonePreview: normalizePhone(newPhone) });
      }
    });
    if (fixed.length) setValidRowsDraft((v) => [...v, ...fixed]);
    setInvalidRows(remaining);
  };

  const downloadInvalidCsv = () => {
    if (!invalidRows.length) return;
    const csvData = invalidRows.map((r) => ({
      'Row No.': r.rowNumber,
      Name: r.editName,
      Mobile: r.editPhone,
      Role: r.editRole,
      'Membership No.': r.editMembershipNumber,
      Errors: r.errors.join(' | ')
    }));
    const csv = Papa.unparse(csvData);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'invalid_rows.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const runDedupAndPreparePreview = async (inputRows) => {
    const seenInFile = new Set();
    const dedupedRows = [];
    const nextFileDupRows = [];
    inputRows.forEach((row) => {
      const key = `${row.name.trim().toLowerCase()}||${row.cleanPhone}`;
      if (seenInFile.has(key)) nextFileDupRows.push(row);
      else {
        seenInFile.add(key);
        dedupedRows.push(row);
      }
    });

    const existingMembers = await fetchAllMembers(supabase);
    const existingReg = await fetchAllRegMembers(supabase, selectedTrust.id);

    const alreadyLinkedSet = new Set((existingReg || []).map((r) => r.members_id));

    const membersByNamePhone = new Map();
    const membersByPhone = new Map();
    (existingMembers || []).forEach((m) => {
      const cleanPhone = normalizePhone(String(m.Mobile));
      if (!cleanPhone) return;
      const dbName = (m.Name || '').trim().toLowerCase();
      const namePhoneKey = `${dbName}||${cleanPhone}`;
      membersByNamePhone.set(namePhoneKey, m);

      if (!membersByPhone.has(cleanPhone)) {
        membersByPhone.set(cleanPhone, []);
      }
      membersByPhone.get(cleanPhone).push(m);
    });


    const nextNewRows = [];
    const nextCrossTrustRows = [];
    const nextManualReviewRows = [];
    const nextAmbiguousRows = [];
    const nextSkippedRegisteredRows = [];

    dedupedRows.forEach((row) => {
      const namePhoneKey = `${row.name.trim().toLowerCase()}||${row.cleanPhone}`;
      const phoneKey = row.cleanPhone;
      if (membersByNamePhone.has(namePhoneKey)) {
        const existing = membersByNamePhone.get(namePhoneKey);
        if (alreadyLinkedSet.has(existing.members_id)) {
          nextSkippedRegisteredRows.push({ ...row, existingMember: existing });
        } else {
          nextCrossTrustRows.push({ ...row, existingMember: existing, members_id: existing.members_id });
        }
        return;
      }

      const phoneMatches = membersByPhone.get(phoneKey) || [];
      if (phoneMatches.length > 1) {
        nextAmbiguousRows.push({ ...row, phoneMatches });
        return;
      }
      if (phoneMatches.length === 1) {
        nextManualReviewRows.push({ ...row, existing: phoneMatches[0] });
        return;
      }
      nextNewRows.push(row);
    });


    const merged = [
      ...nextNewRows.map((r) => ({ ...r, bucket: 'new_member' })),
      ...nextCrossTrustRows.map((r) => ({ ...r, bucket: 'cross_trust_link' })),
      ...nextManualReviewRows.map((r) => ({ ...r, bucket: 'manual_review' })),
      ...nextAmbiguousRows.map((r) => ({ ...r, bucket: 'ambiguous' })),
      ...nextFileDupRows.map((r) => ({ ...r, bucket: 'dup' })),
      ...errorRows.map((r) => ({ ...r, bucket: 'invalid' }))
    ].sort((a, b) => (a.rowNumber || 0) - (b.rowNumber || 0));

    setValidRows(inputRows);
    setFileDupRows(nextFileDupRows);
    setNewRows(nextNewRows);
    setCrossTrustRows(nextCrossTrustRows);
    setManualReviewRows(nextManualReviewRows);
    setAmbiguousRows(nextAmbiguousRows);
    setSkippedRegisteredRows(nextSkippedRegisteredRows);
    setAllRows(merged);
    setDecisions({});
    setAmbiguousDecisions({});
    setShowSkippedAccordion(false);
    setScreen('preview');
  };

  const handleParseAndContinue = async () => {
    console.log('Member import started', { trustId: selectedTrust?.id, trustName: selectedTrust?.name, fileName: file?.name });
    if (!selectedTrust || !file) return;
    setIsBusy(true);
    setUploadError('');
    setRetryAction(null);
    try {
      if (!parsingDone) {
        const rawParsedData = await parseRowsFromFile(file);
        const parsedRows = [];
        for (const [idx, row] of rawParsedData.entries()) {
          const normalized = normalizeKeys(row);
          if (isRowEmpty(normalized)) continue;
          parsedRows.push({ ...normalized, rowNumber: idx + 2 });
        }
        const structuredRows = parsedRows.map((row, idx) => toStructuredRow(row, idx));
        const nextValid = structuredRows.filter((r) => r.errors.length === 0);
        const nextInvalid = structuredRows.filter((r) => r.errors.length > 0);
        setValidRowsDraft(nextValid);
        setInvalidRows(nextInvalid);
        setDismissedRows([]);
        setParsingDone(true);
        setShowFixPanel(nextInvalid.length > 0);
        setParseErrorRows(
          nextInvalid.map(
            (r) => `Row ${r.rowNumber}: ${r.errors.join(', ')} — Name: '${r.editName}', Mobile: '${r.editPhone}'`
          )
        );
        if (nextInvalid.length === 0 && nextValid.length > 0) {
          await runDedupAndPreparePreview(nextValid);
        }
      } else if (invalidRows.length === 0 && validRowsDraft.length > 0) {
        await runDedupAndPreparePreview(validRowsDraft);
      }
    } catch (error) {
      setToast({ type: 'error', message: `Insert failed: ${error.message}` });
      setRetryAction(() => handleParseAndContinue);
    } finally {
      setIsBusy(false);
    }
  };

  const resolvedManualCount = useMemo(
    () => manualReviewRows.filter((row) => decisions[row.rowNumber]).length,
    [manualReviewRows, decisions]
  );
  const resolvedAmbiguousCount = useMemo(
    () => ambiguousRows.filter((row) => ambiguousDecisions[row.rowNumber]).length,
    [ambiguousRows, ambiguousDecisions]
  );
  const canConfirmImport =
    manualReviewRows.length === resolvedManualCount &&
    ambiguousRows.length === resolvedAmbiguousCount;
  const importCount =
    newRows.length + crossTrustRows.length + resolvedManualCount + resolvedAmbiguousCount;

  const createMembersPayload = (row) => ({
    Name: row.name,
    Mobile: Number(normalizePhone(row.cleanPhone)),
    Email: row.email || null,
    'Address Home': row.addressHome || null,
    'Company Name': row.companyName || null,
    'Address Office': row.addressOffice || null,
    'Resident Landline': row.residentLandline || null,
    'Office Landline': row.officeLandline || null,
    trust_id: String(selectedTrust.id),
    contact: row.contact || null
  });

  const retryFailedLinks = async () => {
    if (!insertLog.regMembersFailed.length) return;
    setIsBusy(true);
    try {
      const payload = insertLog.regMembersFailed.map((f) => f.payload);
      const { data, error } = await supabase
        .from('reg_members')
        .upsert(payload, { onConflict: 'trust_id,members_id', ignoreDuplicates: true })
        .select('id');
      if (error) throw error;
      setInsertLog((prev) => ({
        ...prev,
        regMembersInserted: [...prev.regMembersInserted, ...(data || []).map((d) => d.id)],
        regMembersFailed: []
      }));
      setToast({ type: 'success', message: 'Retry successful for failed trust links' });
    } catch (error) {
      setToast({ type: 'error', message: `Insert failed: ${error.message}` });
    } finally {
      setIsBusy(false);
    }
  };

  const handleFinalImport = async () => {
    if (!selectedTrust) return;
    setIsBusy(true);
    setRetryAction(null);
    setInsertLog({ membersInserted: [], regMembersInserted: [], regMembersFailed: [] });

    try {
      const rowMemberMap = new Map();
      const membersInsertedIds = [];

      if (newRows.length) {
        const payload = newRows.map(createMembersPayload);
        const { data, error } = await supabase.from('Members').insert(payload).select('members_id');
        if (error) throw error;
        (data || []).forEach((d, idx) => {
          rowMemberMap.set(newRows[idx].rowNumber, d.members_id);
          membersInsertedIds.push(d.members_id);
        });
      }

      crossTrustRows.forEach((row) => {
        rowMemberMap.set(row.rowNumber, row.members_id || row.existingMember?.members_id);
      });

      for (const row of manualReviewRows) {
        const decision = decisions[row.rowNumber];
        if (!decision) continue;
        if (decision.type === 'link') {
          rowMemberMap.set(row.rowNumber, row.existing.members_id);
          continue;
        }
        if (decision.type === 'create') {
          const { data, error } = await supabase
            .from('Members')
            .insert([createMembersPayload(row)])
            .select('members_id');
          if (error || !data?.[0]?.members_id) throw new Error(`Failed at row ${row.rowNumber}`);
          rowMemberMap.set(row.rowNumber, data[0].members_id);
          membersInsertedIds.push(data[0].members_id);
          continue;
        }
        if (decision.type === 'overwrite') {
          const { error } = await supabase
            .from('Members')
            .update({ Name: row.name })
            .eq('members_id', row.existing.members_id);
          if (error) throw new Error(`Failed at row ${row.rowNumber}`);
          rowMemberMap.set(row.rowNumber, row.existing.members_id);
        }
      }

      for (const row of ambiguousRows) {
        const decision = ambiguousDecisions[row.rowNumber];
        if (!decision) continue;
        if (decision.type === 'create') {
          const { data, error } = await supabase
            .from('Members')
            .insert([createMembersPayload(row)])
            .select('members_id');
          if (error || !data?.[0]?.members_id) throw new Error(`Failed at row ${row.rowNumber}`);
          rowMemberMap.set(row.rowNumber, data[0].members_id);
          membersInsertedIds.push(data[0].members_id);
          continue;
        }
        rowMemberMap.set(row.rowNumber, decision.members_id);
      }

      const joinedDate = new Date().toISOString().split('T')[0];
      const regPayload = [];
      const pushReg = (row, memberId) => {
        regPayload.push({
          trust_id: selectedTrust.id,
          members_id: memberId,
          Name: row.name,
          Mobile: Number(normalizePhone(row.cleanPhone)),
          role: row.role || null,
          'Membership number': row.membershipNumber || null,
          joined_date: joinedDate,
          is_active: true
        });
      };

      newRows.forEach((row) => {
        const memberId = rowMemberMap.get(row.rowNumber);
        if (memberId) pushReg(row, memberId);
      });
      crossTrustRows.forEach((row) => {
        const memberId = rowMemberMap.get(row.rowNumber);
        if (memberId) pushReg(row, memberId);
      });
      manualReviewRows.forEach((row) => {
        const decision = decisions[row.rowNumber];
        if (!decision) return;
        const memberId = rowMemberMap.get(row.rowNumber);
        if (memberId) pushReg(row, memberId);
      });
      ambiguousRows.forEach((row) => {
        const decision = ambiguousDecisions[row.rowNumber];
        if (!decision) return;
        const memberId = rowMemberMap.get(row.rowNumber);
        if (memberId) pushReg(row, memberId);
      });

      let regInsertedIds = [];
      let regFailed = [];
      if (regPayload.length) {
        const { data, error } = await supabase
          .from('reg_members')
          .upsert(regPayload, { onConflict: 'trust_id,members_id', ignoreDuplicates: true })
          .select('id');
        if (error) {
          regFailed = regPayload.map((row) => ({ payload: row, reason: error.message }));
        } else {
          regInsertedIds = (data || []).map((d) => d.id);
        }
      }

      setInsertLog({
        membersInserted: membersInsertedIds,
        regMembersInserted: regInsertedIds,
        regMembersFailed: regFailed
      });

      const linkedExistingManual =
        manualReviewRows.filter((r) => decisions[r.rowNumber]?.type === 'link').length +
        manualReviewRows.filter((r) => decisions[r.rowNumber]?.type === 'overwrite').length;
      const ambiguousLinkedExisting = ambiguousRows.filter(
        (r) => ambiguousDecisions[r.rowNumber]?.type === 'link'
      ).length;
      const createdManual =
        manualReviewRows.filter((r) => decisions[r.rowNumber]?.type === 'create').length +
        ambiguousRows.filter((r) => ambiguousDecisions[r.rowNumber]?.type === 'create').length;

      setSummary({
        globalNew: newRows.length + createdManual,
        linkedTrust: crossTrustRows.length + linkedExistingManual + ambiguousLinkedExisting,
        skippedRegistered: skippedRegisteredRows.length,
        manualResolved: manualReviewRows.length,
        ambiguousResolved: ambiguousRows.length
      });
      sessionStorage.removeItem(MEMBER_IMPORT_STATE_KEY);
      setScreen('done');
    } catch (error) {
      setToast({ type: 'error', message: `Insert failed: ${error.message}` });
      setRetryAction(() => handleFinalImport);
    } finally {
      setIsBusy(false);
    }
  };

  const resetAll = () => {
    setScreen('upload');
    setFile(null);
    setUploadError('');
    setAllRows([]);
    setValidRows([]);
    setNewRows([]);
    setCrossTrustRows([]);
    setManualReviewRows([]);
    setAmbiguousRows([]);
    setSkippedRegisteredRows([]);
    setFileDupRows([]);
    setErrorRows([]);
    setDecisions({});
    setAmbiguousDecisions({});
    setParseErrorRows([]);
    setSummary(null);
    setInvalidRows([]);
    setValidRowsDraft([]);
    setDismissedRows([]);
    setShowFixPanel(false);
    setParsingDone(false);
    setInsertLog({ membersInserted: [], regMembersInserted: [], regMembersFailed: [] });
    setShowSkippedAccordion(false);
    setActiveFilter(null);
    sessionStorage.removeItem(MEMBER_IMPORT_STATE_KEY);
  };

  const reviewCount = manualReviewRows.length + ambiguousRows.length;

  const toggleFilter = (value) => {
    setActiveFilter((prev) => (prev === value ? null : value));
  };

  const handleSkippedCardClick = () => {
    if (skippedRegisteredRows.length === 0) return;
    setShowSkippedAccordion(true);
    toggleFilter('skipped_registered');
    requestAnimationFrame(() => {
      skippedAccordionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const filteredRows =
    activeFilter === null ? allRows : allRows.filter((row) => row.bucket === activeFilter);

  return (
    <div className="min-h-screen p-4 md:p-10" style={{ background: '#F8F9FC', color: '#1a1a2e' }}>
      <div className="max-w-6xl mx-auto rounded-2xl p-5 md:p-8" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: '14px' }}>
        {toast && (
          <div
            className="mb-4 px-4 py-3"
            style={{
              borderRadius: '0 8px 8px 0',
              ...(toast.type === 'error'
                ? { background: '#FCEBEB', borderLeft: '3px solid #E24B4A', color: '#A32D2D' }
                : { background: '#E6F9F0', borderLeft: '3px solid #1D9E75', color: '#0F6E56' })
            }}
          >
            {toast.message}
          </div>
        )}

        {retryAction && (
          <button
            className="mb-4 px-3 py-2 text-sm"
            style={{ background: '#FFFFFF', border: '1px solid #ddd', color: '#555', borderRadius: '8px' }}
            onClick={retryAction}
            type="button"
          >
            Retry
          </button>
        )}

        {screen === 'upload' && (
          <div>
            <p className="text-xs uppercase tracking-widest" style={{ color: '#534AB7', letterSpacing: '0.08em', fontWeight: 600 }}>
              Step 1 of 3 - Trust select and file upload
            </p>
            <h1 className="mt-3 font-semibold" style={{ color: '#1a1a2e', fontSize: '26px' }}>Import members</h1>
            <p className="mt-2" style={{ color: '#888888' }}>Step 1 of 3 — Select trust and upload file</p>

            <div className="mt-6 p-5" style={{ background: '#FFFFFF', border: '1px solid #E8E8F0', borderTop: '3px solid #534AB7', borderRadius: '16px' }}>
              <label className="block text-lg font-semibold mb-2" style={{ color: '#1a1a2e' }}>Select trust</label>
              <select
                className="w-full px-4 py-3 focus:outline-none focus:ring-0 focus:border-[#534AB7]"
                style={{ background: '#FAFAFE', border: '1.5px solid #C5C3F0', borderRadius: '10px', color: '#1a1a2e' }}
                value={selectedTrustId}
                onChange={(e) => setSelectedTrustId(e.target.value)}
                disabled={loadingTrusts}
              >
                <option value="">Choose trust</option>
                {trusts.map((trust) => (
                  <option key={trust.id} value={trust.id}>
                    {trust.name}
                  </option>
                ))}
              </select>
              {selectedTrust ? (
                <p className="mt-3 text-sm inline-flex items-center gap-2" style={{ color: '#0F6E56', background: '#E6F9F0', borderRadius: '20px', padding: '4px 12px' }}>
                  <span style={{ color: '#1D9E75' }}>●</span> ✓ {selectedTrust.name} loaded
                </p>
              ) : (
                <p className="mt-3 text-sm" style={{ color: '#A32D2D' }}>Please select a trust to continue</p>
              )}

              <div className="mt-6">
                <label className="block text-lg font-semibold mb-2" style={{ color: '#534AB7', fontWeight: 600 }}>Upload file</label>
                <input
                  ref={fileInputRef}
                  className="hidden"
                  type="file"
                  accept=".csv,.xlsx"
                  onChange={(e) => handleFileSelection(e.target.files?.[0])}
                />
                <div
                  className="rounded-xl p-10 text-center cursor-pointer"
                  style={{
                    background: dragging ? '#EEEDFE' : '#FAFAFE',
                    border: dragging ? '2px dashed #534AB7' : '2px dashed #C5C3F0',
                    borderRadius: '14px',
                    transition: 'border-color 0.2s'
                  }}
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragging(true);
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragging(false);
                    handleFileSelection(e.dataTransfer.files?.[0]);
                  }}
                >
                  <p style={{ color: '#534AB7', fontSize: '32px', lineHeight: 1 }}>⇪</p>
                  <p className="text-2xl mt-4">Drag & drop your Excel or CSV file here</p>
                  <p className="text-zinc-400 mt-2">.xlsx or .csv only — max 5MB</p>
                  <button
                    className="mt-5 px-6 py-2 rounded-xl border border-zinc-500"
                    onClick={() => fileInputRef.current?.click()}
                    type="button"
                  >
                    Browse file
                  </button>
                  {file && <p className="mt-4 text-sm text-zinc-300">{file.name} ({getFileSizeText(file.size)})</p>}
                  {uploadError && <p className="mt-4 text-sm text-red-400">{uploadError}</p>}
                </div>
              </div>

              <div className="mt-6 rounded-xl p-4" style={{ background: '#F8F9FC' }}>
                <p className="mb-3" style={{ color: '#1a1a2e' }}>Required columns in your file:</p>
                <div className="flex flex-wrap gap-2">
                  <span className="px-3 py-1" style={{ background: '#EEEDFE', color: '#534AB7', borderRadius: '20px', fontSize: '12px', fontWeight: 500, padding: '4px 12px' }}>Name</span>
                  <span className="px-3 py-1" style={{ background: '#EEEDFE', color: '#534AB7', borderRadius: '20px', fontSize: '12px', fontWeight: 500, padding: '4px 12px' }}>Mobile</span>
                  <span className="px-3 py-1" style={{ background: '#EEEDFE', color: '#534AB7', borderRadius: '20px', fontSize: '12px', fontWeight: 500, padding: '4px 12px' }}>Role</span>
                  <span className="px-3 py-1" style={{ background: '#EEEDFE', color: '#534AB7', borderRadius: '20px', fontSize: '12px', fontWeight: 500, padding: '4px 12px' }}>Membership Number</span>
                  <span className="px-3 py-1" style={{ background: '#F1EFE8', color: '#5F5E5A', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>Email</span>
                  <span className="px-3 py-1" style={{ background: '#F1EFE8', color: '#5F5E5A', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>Address Home</span>
                  <span className="px-3 py-1" style={{ background: '#F1EFE8', color: '#5F5E5A', borderRadius: '20px', fontSize: '12px', fontWeight: 500 }}>Company Name</span>
                </div>
              </div>

              {parsingDone && (
                <div className="mt-4 space-y-3">
                  {invalidRows.length > 0 ? (
                    <div className="p-3 flex items-center justify-between gap-3" style={{ background: '#FDF3E3', borderLeft: '3px solid #EF9F27', borderRadius: '0 8px 8px 0', color: '#854F0B' }}>
                      <span>{invalidRows.length} invalid rows found — fix or delete to continue</span>
                      <button
                        type="button"
                        className="px-3 py-1"
                        style={{ background: '#FFFFFF', border: '1px solid #EF9F27', color: '#854F0B', borderRadius: '8px' }}
                        onClick={() => setShowFixPanel((s) => !s)}
                      >
                        Fix invalid rows
                      </button>
                    </div>
                  ) : validRowsDraft.length > 0 ? (
                    <div className="p-3" style={{ background: '#E6F9F0', borderLeft: '3px solid #1D9E75', borderRadius: '0 8px 8px 0', color: '#0F6E56' }}>
                      All {validRowsDraft.length} rows are valid — ready to continue
                    </div>
                  ) : null}

                  {showFixPanel && invalidRows.length > 0 && (
                    <div className="rounded-xl p-4" style={{ border: '1px solid #EEEEEE', background: '#FFFFFF' }}>
                      <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                        <p className="font-semibold" style={{ color: '#1a1a2e' }}>Invalid rows ({invalidRows.length} remaining)</p>
                        <div className="flex gap-2 flex-wrap">
                          <button
                            type="button"
                            className="px-3 py-2 rounded"
                            style={{ background: '#FFFFFF', border: '1px solid #ddd', color: '#555' }}
                            onClick={() => {
                              if (window.confirm('Delete all invalid rows?')) {
                                setDismissedRows((d) => [...d, ...invalidRows]);
                                setInvalidRows([]);
                              }
                            }}
                          >
                            Delete all invalid
                          </button>
                          <button
                            type="button"
                            className="px-3 py-2 rounded"
                            style={{ background: '#FFFFFF', border: '1px solid #ddd', color: '#555' }}
                            onClick={downloadInvalidCsv}
                          >
                            Download as CSV
                          </button>
                          <button
                            type="button"
                            className="px-3 py-2 rounded"
                            style={{ background: '#E6F9F0', border: '1px solid #1D9E75', color: '#0F6E56' }}
                            onClick={revalidateAll}
                          >
                            Re-validate all
                          </button>
                        </div>
                      </div>

                      <div className="max-h-[380px] overflow-auto rounded" style={{ border: '1px solid #EEEEEE' }}>
                        <table className="w-full min-w-[1100px] text-left">
                          <thead className="sticky top-0" style={{ background: '#F8F9FC' }}>
                            <tr>
                              <th className="px-3 py-2" style={{ color: '#888', fontSize: '12px' }}>Row No.</th>
                              <th className="px-3 py-2" style={{ color: '#888', fontSize: '12px' }}>Name</th>
                              <th className="px-3 py-2" style={{ color: '#888', fontSize: '12px' }}>Mobile</th>
                              <th className="px-3 py-2" style={{ color: '#888', fontSize: '12px' }}>Role</th>
                              <th className="px-3 py-2" style={{ color: '#888', fontSize: '12px' }}>Membership No.</th>
                              <th className="px-3 py-2" style={{ color: '#888', fontSize: '12px' }}>Error</th>
                              <th className="px-3 py-2" style={{ color: '#888', fontSize: '12px' }}>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {invalidRows.map((row) => {
                              const hasNameError = row.errors.includes('Name is empty');
                              const hasPhoneError =
                                row.errors.includes('Mobile is missing') || row.errors.includes('Invalid mobile number');
                              const normalizedForAuto = normalizePhone(row.editPhone || '');
                              const showAuto = Boolean(normalizedForAuto) && row.editPhone !== normalizedForAuto;
                              return (
                                <tr key={row.rowNumber} className="align-top" style={{ borderTop: '1px solid #f5f5f5', color: '#222' }}>
                                  <td className="px-3 py-2">{row.rowNumber}</td>
                                  <td className="px-3 py-2">
                                    <input
                                      className="w-full rounded px-2 py-1"
                                      style={{ background: '#FFFFFF', border: hasNameError ? '1px solid #E24B4A' : '1px solid #EEEEEE', color: '#1a1a2e' }}
                                      value={row.editName}
                                      onChange={(e) => updateInvalidRow(row.rowNumber, { editName: e.target.value })}
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      className="w-full rounded px-2 py-1"
                                      style={{ background: '#FFFFFF', border: hasPhoneError ? '1px solid #E24B4A' : '1px solid #EEEEEE', color: '#1a1a2e' }}
                                      value={row.editPhone}
                                      onChange={(e) => updateInvalidRow(row.rowNumber, { editPhone: e.target.value })}
                                      onPaste={(e) => {
                                        e.preventDefault();
                                        const pasted = e.clipboardData.getData('text');
                                        const normalized = normalizePhone(pasted);
                                        updateInvalidRow(row.rowNumber, { editPhone: normalized || pasted });
                                      }}
                                    />
                                    {row.phonePreview ? (
                                      <p className="text-xs mt-1" style={{ color: '#0F6E56' }}>→ {row.phonePreview} ✓</p>
                                    ) : row.editPhone ? (
                                      <p className="text-xs mt-1" style={{ color: '#A32D2D' }}>Invalid ✗</p>
                                    ) : null}
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      className="w-full rounded px-2 py-1"
                                      style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', color: '#1a1a2e' }}
                                      value={row.editRole}
                                      onChange={(e) => updateInvalidRow(row.rowNumber, { editRole: e.target.value })}
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    <input
                                      className="w-full rounded px-2 py-1"
                                      style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', color: '#1a1a2e' }}
                                      value={row.editMembershipNumber}
                                      onChange={(e) =>
                                        updateInvalidRow(row.rowNumber, { editMembershipNumber: e.target.value })
                                      }
                                    />
                                  </td>
                                  <td className="px-3 py-2">
                                    {row.errors.map((err) => (
                                      <span
                                        key={`${row.rowNumber}-${err}`}
                                        className="inline-block mr-1 mb-1 px-2 py-1 text-xs"
                                        style={{ background: '#FCEBEB', color: '#A32D2D', borderRadius: '20px' }}
                                      >
                                        {err}
                                      </span>
                                    ))}
                                  </td>
                                  <td className="px-3 py-2">
                                    <div className="flex flex-wrap gap-2">
                                      {showAuto && (
                                        <button
                                          type="button"
                                          className="px-2 py-1 rounded text-xs"
                                          style={{ border: '1px solid #185FA5', color: '#185FA5' }}
                                          onClick={() => {
                                            updateInvalidRow(row.rowNumber, { editPhone: normalizedForAuto });
                                            setTimeout(() => saveInvalidRow(row.rowNumber), 0);
                                          }}
                                        >
                                          Auto-fix →
                                        </button>
                                      )}
                                      <button
                                        type="button"
                                        className="px-2 py-1 rounded text-xs"
                                        style={{ border: '1px solid #1D9E75', color: '#0F6E56' }}
                                        onClick={() => saveInvalidRow(row.rowNumber)}
                                      >
                                        Save
                                      </button>
                                      <button
                                        type="button"
                                        className="px-2 py-1 rounded text-xs"
                                        style={{ border: '1px solid #E24B4A', color: '#A32D2D' }}
                                        onClick={() => deleteInvalidRow(row.rowNumber)}
                                      >
                                        Delete
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <span className="px-3 py-1" style={{ background: '#E6F9F0', color: '#0F6E56', borderRadius: '20px', fontSize: '12px' }}>
                      {validRowsDraft.length} valid
                    </span>
                    <span className="px-3 py-1" style={{ background: '#FDF3E3', color: '#854F0B', borderRadius: '20px', fontSize: '12px' }}>
                      {invalidRows.length} invalid
                    </span>
                    <span className="px-3 py-1" style={{ background: '#F1EFE8', color: '#5F5E5A', borderRadius: '20px', fontSize: '12px' }}>
                      {dismissedRows.length} deleted
                    </span>
                  </div>
                </div>
              )}

              <div className="mt-6 flex justify-end">
                <button
                  className="px-6 py-3 disabled:opacity-40"
                  style={{ background: '#534AB7', color: '#FFFFFF', border: 'none', borderRadius: '10px', padding: '10px 24px', fontSize: '14px' }}
                  disabled={
                    !selectedTrust ||
                    !file ||
                    isBusy ||
                    invalidRows.length > 0 ||
                    (parsingDone && validRowsDraft.length === 0)
                  }
                  title={invalidRows.length > 0 ? `Fix or delete ${invalidRows.length} invalid rows to continue` : ''}
                  onClick={handleParseAndContinue}
                  type="button"
                >
                  {isBusy ? 'Parsing...' : 'Parse file & continue →'}
                </button>
              </div>

              {parseErrorRows.length > 0 && invalidRows.length > 0 && (
                <div className="mt-4 max-h-48 overflow-auto p-3 text-sm" style={{ background: '#FCEBEB', borderLeft: '3px solid #E24B4A', borderRadius: '0 8px 8px 0', color: '#A32D2D' }}>
                  {parseErrorRows.map((line) => (
                    <p key={line}>{line}</p>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {screen === 'preview' && (
          <div>
            <p className="text-xs uppercase tracking-widest" style={{ color: '#888888', letterSpacing: '0.08em' }}>Step 2 of 3 - Import preview</p>
            <h2 className="mt-3 text-3xl font-semibold" style={{ color: '#1a1a2e' }}>Import preview</h2>
            <p className="mt-2" style={{ color: '#888888' }}>Step 2 of 3 — Review before importing</p>

            <div className="mt-4 flex flex-wrap justify-between" style={{ color: '#888888' }}>
              <span>{file?.name}</span>
              <span className="px-3 py-1" style={{ background: '#EEEDFE', color: '#534AB7', borderRadius: '20px', fontSize: '13px' }}>{selectedTrust?.name}</span>
            </div>

            <div className="mt-5 grid grid-cols-2 md:grid-cols-5 gap-3">
              {/* New members card */}
              <button
                type="button"
                onClick={() => newRows.length > 0 && toggleFilter('new_member')}
                className="group text-left transition"
                style={{
                  background: '#E6F9F0',
                  color: '#0F6E56',
                  borderRadius: '14px',
                  padding: '16px 14px',
                  border: activeFilter === 'new_member' ? '2px solid #0a5240' : '1px solid transparent',
                  cursor: newRows.length > 0 ? 'pointer' : 'default',
                  transform: 'translateY(0)',
                  transition: 'transform 0.18s'
                }}
                onMouseEnter={e => newRows.length > 0 && (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <p style={{ fontSize: '11px', fontWeight: 500 }}>New members</p>
                <p style={{ fontSize: '28px', fontWeight: 700 }}>{newRows.length}</p>
                {newRows.length > 0 && activeFilter !== 'new_member' && <p className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: '11px' }}>click to view ↓</p>}
              </button>

              {/* Cross-trust links card */}
              <button
                type="button"
                onClick={() => crossTrustRows.length > 0 && toggleFilter('cross_trust_link')}
                className="group text-left transition"
                style={{
                  background: '#E6F1FB',
                  color: '#185FA5',
                  borderRadius: '14px',
                  padding: '16px 14px',
                  border: activeFilter === 'cross_trust_link' ? '2px solid #0f4070' : '1px solid transparent',
                  cursor: crossTrustRows.length > 0 ? 'pointer' : 'default',
                  transition: 'transform 0.18s'
                }}
                onMouseEnter={e => crossTrustRows.length > 0 && (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <p style={{ fontSize: '11px', fontWeight: 500 }}>Cross-trust links</p>
                <p style={{ fontSize: '28px', fontWeight: 700 }}>{crossTrustRows.length}</p>
                {crossTrustRows.length > 0 && activeFilter !== 'cross_trust_link' && <p className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: '11px' }}>click to view ↓</p>}
              </button>

              {/* Review needed card */}
              <button
                type="button"
                onClick={() => manualReviewRows.length > 0 && toggleFilter('manual_review')}
                className="group text-left transition"
                style={{
                  background: '#FDF3E3',
                  color: '#854F0B',
                  borderRadius: '14px',
                  padding: '16px 14px',
                  border: activeFilter === 'manual_review' ? '2px solid #6b3e08' : '1px solid transparent',
                  cursor: manualReviewRows.length > 0 ? 'pointer' : 'default',
                  transition: 'transform 0.18s'
                }}
                onMouseEnter={e => manualReviewRows.length > 0 && (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <p style={{ fontSize: '11px', fontWeight: 500 }}>Review needed</p>
                <p style={{ fontSize: '28px', fontWeight: 700 }}>{manualReviewRows.length}</p>
                {manualReviewRows.length > 0 && activeFilter !== 'manual_review' && <p className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: '11px' }}>click to view ↓</p>}
              </button>

              {/* Ambiguous card */}
              <button
                type="button"
                onClick={() => ambiguousRows.length > 0 && toggleFilter('ambiguous')}
                className="group text-left transition"
                style={{
                  background: '#FCEBEB',
                  color: '#A32D2D',
                  borderRadius: '14px',
                  padding: '16px 14px',
                  border: activeFilter === 'ambiguous' ? '2px solid #7a2020' : '1px solid transparent',
                  cursor: ambiguousRows.length > 0 ? 'pointer' : 'default',
                  transition: 'transform 0.18s'
                }}
                onMouseEnter={e => ambiguousRows.length > 0 && (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <p style={{ fontSize: '11px', fontWeight: 500 }}>Ambiguous</p>
                <p style={{ fontSize: '28px', fontWeight: 700 }}>{ambiguousRows.length}</p>
                {ambiguousRows.length > 0 && activeFilter !== 'ambiguous' && <p className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: '11px' }}>click to view ↓</p>}
              </button>

              {/* Skipped card */}
              <button
                type="button"
                onClick={handleSkippedCardClick}
                className="group text-left transition"
                style={{
                  background: '#F1EFE8',
                  color: '#5F5E5A',
                  borderRadius: '14px',
                  padding: '16px 14px',
                  border: activeFilter === 'skipped_registered' ? '2px solid #45443f' : '1px solid transparent',
                  cursor: skippedRegisteredRows.length > 0 ? 'pointer' : 'default',
                  transition: 'transform 0.18s'
                }}
                onMouseEnter={e => skippedRegisteredRows.length > 0 && (e.currentTarget.style.transform = 'translateY(-2px)')}
                onMouseLeave={e => (e.currentTarget.style.transform = 'translateY(0)')}
              >
                <p style={{ fontSize: '11px', fontWeight: 500 }}>Skipped</p>
                <p style={{ fontSize: '28px', fontWeight: 700 }}>{skippedRegisteredRows.length}</p>
                {skippedRegisteredRows.length > 0 && activeFilter !== 'skipped_registered' && <p className="mt-1 opacity-0 group-hover:opacity-100 transition-opacity" style={{ fontSize: '11px' }}>click to view ↓</p>}
              </button>
            </div>

            {activeFilter !== null && (
              <div className="mt-4 flex items-center gap-3">
                <span className="px-3 py-1 text-sm" style={{ background: '#F1EFE8', color: '#5F5E5A', borderRadius: '20px' }}>
                  Showing: {activeFilter === 'new_member' && 'New members only'}
                  {activeFilter === 'cross_trust_link' && 'Cross-trust links only'}
                  {activeFilter === 'manual_review' && 'Review needed only'}
                  {activeFilter === 'ambiguous' && 'Ambiguous only'}
                  {activeFilter === 'skipped_registered' && 'Skipped only'}
                </span>
                <button type="button" className="text-sm underline" style={{ color: '#888888' }} onClick={() => setActiveFilter(null)}>
                  ✕ Clear filter
                </button>
              </div>
            )}

            <div className="mt-5 max-h-[360px] overflow-auto" style={{ background: '#FFFFFF', border: '1px solid #EEEEEE', borderRadius: '12px' }}>
              <table className="w-full text-left min-w-[900px]">
                <thead className="sticky top-0" style={{ background: '#F8F9FC' }}>
                  <tr>
                    <th className="px-4 py-3" style={{ color: '#888', fontSize: '12px', fontWeight: 500 }}>Name</th>
                    <th className="px-4 py-3" style={{ color: '#888', fontSize: '12px', fontWeight: 500 }}>Mobile</th>
                    <th className="px-4 py-3" style={{ color: '#888', fontSize: '12px', fontWeight: 500 }}>Email</th>
                    <th className="px-4 py-3" style={{ color: '#888', fontSize: '12px', fontWeight: 500 }}>Role</th>
                    <th className="px-4 py-3" style={{ color: '#888', fontSize: '12px', fontWeight: 500 }}>Membership No.</th>
                    <th className="px-4 py-3" style={{ color: '#888', fontSize: '12px', fontWeight: 500 }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows
                    .filter((row) => row.bucket !== 'skipped_registered')
                    .map((row) => (
                      <tr key={`${row.rowNumber}-${row.bucket}`} style={{ borderTop: '1px solid #f5f5f5', color: '#222' }}>
                        <td className="px-4 py-3">{row.name || '-'}</td>
                        <td className="px-4 py-3">{row.cleanPhone || row.rawPhone || '-'}</td>
                        <td className="px-4 py-3">{row.email || '-'}</td>
                        <td className="px-4 py-3">{row.role || '—'}</td>
                        <td className="px-4 py-3">{row.membershipNumber || '—'}</td>
                        <td className="px-4 py-3">
                          <span
                            className="px-3 py-1"
                            style={{
                              ...statusStyles[row.bucket],
                              borderRadius: '20px',
                              fontSize: '11px',
                              padding: '3px 10px'
                            }}
                          >
                            {row.bucket === 'new_member' && 'New member'}
                            {row.bucket === 'cross_trust_link' && 'Existing — linking to this trust'}
                            {row.bucket === 'manual_review' && 'Review needed'}
                            {row.bucket === 'ambiguous' && 'Ambiguous — multiple DB records'}
                            {row.bucket === 'dup' && 'File duplicate — skipped'}
                            {row.bucket === 'invalid' && 'Invalid — skipped'}
                          </span>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>

            <div ref={skippedAccordionRef} className="mt-4" style={{ border: '1px solid #EEEEEE', borderRadius: '12px', background: '#FFFFFF' }}>
              <button
                className="w-full text-left px-4 py-3"
                style={{ background: '#F8F9FC', borderRadius: '12px 12px 0 0', color: '#1a1a2e' }}
                type="button"
                onClick={() => setShowSkippedAccordion((s) => !s)}
              >
                {showSkippedAccordion ? '▲' : '▼'} Show {skippedRegisteredRows.length} already-registered rows (skipped)
              </button>
              {showSkippedAccordion && (
                <div className="max-h-56 overflow-auto">
                  <table className="w-full text-left">
                    <thead style={{ background: '#F8F9FC' }}>
                      <tr>
                        <th className="px-4 py-2" style={{ color: '#888', fontSize: '12px' }}>Name</th>
                        <th className="px-4 py-2" style={{ color: '#888', fontSize: '12px' }}>Mobile</th>
                        <th className="px-4 py-2" style={{ color: '#888', fontSize: '12px' }}>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {skippedRegisteredRows.map((row) => (
                        <tr key={`skip-${row.rowNumber}`} style={{ borderTop: '1px solid #f5f5f5', color: '#222' }}>
                          <td className="px-4 py-2">{row.name}</td>
                          <td className="px-4 py-2">{row.cleanPhone}</td>
                          <td className="px-4 py-2">
                            <span style={{ background: '#F1EFE8', color: '#5F5E5A', borderRadius: '20px', fontSize: '11px', padding: '3px 10px' }}>Already registered</span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>

            {(reviewCount > 0 || ambiguousRows.length > 0) && (
              <div className="mt-5 px-4 py-3" style={{ background: '#FDF3E3', borderLeft: '3px solid #EF9F27', borderRadius: '0 8px 8px 0', color: '#854F0B' }}>
                {reviewCount} rows need manual review before final import
              </div>
            )}

            <div className="mt-6 flex flex-wrap justify-between gap-3">
              <button
                className="px-6 py-3"
                style={{ background: '#FFFFFF', border: '1px solid #ddd', color: '#555', borderRadius: '8px' }}
                onClick={() => setScreen('upload')}
                type="button"
              >
                ← Back
              </button>
              <div className="flex gap-3 flex-wrap">
                {reviewCount > 0 && (
                  <button
                    className="px-6 py-3"
                    style={{ background: '#FDF3E3', border: '1px solid #EF9F27', color: '#854F0B', borderRadius: '8px' }}
                    onClick={() => setScreen('review')}
                    type="button"
                  >
                    Resolve {reviewCount} conflicts →
                  </button>
                )}
                <button
                  className="px-6 py-3 disabled:opacity-40"
                  style={{ background: '#0F6E56', color: '#FFFFFF', border: 'none', borderRadius: '8px' }}
                  disabled={reviewCount > 0 || isBusy}
                  onClick={handleFinalImport}
                  type="button"
                >
                  Import {importCount} members
                </button>
              </div>
            </div>
          </div>
        )}

        {screen === 'review' && (
          <div>
            <p className="text-xs uppercase tracking-widest" style={{ color: '#888888', letterSpacing: '0.08em' }}>Step 3 of 3 - Manual conflict review</p>
            <h2 className="mt-3 text-3xl font-semibold" style={{ color: '#1a1a2e' }}>Resolve conflicts</h2>
            <p className="mt-2" style={{ color: '#888888' }}>Step 3 of 3 — Same mobile, different name</p>
            <span className="mt-2 inline-block px-3 py-1" style={{ background: '#FDF3E3', color: '#854F0B', borderRadius: '20px', fontSize: '13px' }}>
              {reviewCount} rows
            </span>

            {ambiguousRows.length > 0 && (
              <div className="mt-6 space-y-3">
                <div className="p-4" style={{ background: '#FCEBEB', borderLeft: '3px solid #E24B4A', borderRadius: '0 8px 8px 0', color: '#A32D2D' }}>
                  These rows matched multiple existing members with same phone number. Choose existing member or create as new person.
                </div>
                {ambiguousRows.map((row) => {
                  const decision = ambiguousDecisions[row.rowNumber];
                  return (
                    <div key={`amb-${row.rowNumber}`} className="overflow-hidden" style={{ border: '1px solid #EF9F27', borderRadius: '12px' }}>
                      <div className="p-4" style={{ background: '#FDF3E3' }}>
                        <p className="font-semibold" style={{ color: '#854F0B' }}>{row.name} ({row.cleanPhone})</p>
                      </div>
                      <div className="p-4" style={{ background: '#FFFFFF' }}>
                        <div className="space-y-2">
                          {row.phoneMatches.map((m) => (
                            <label key={m.members_id} className="flex items-center gap-2 text-sm" style={{ color: '#1a1a2e' }}>
                              <input
                                type="radio"
                                name={`amb-${row.rowNumber}`}
                                checked={decision?.type === 'link' && decision?.members_id === m.members_id}
                                onChange={() =>
                                  setAmbiguousDecisions((prev) => ({
                                    ...prev,
                                    [row.rowNumber]: { type: 'link', members_id: m.members_id }
                                  }))
                                }
                              />
                              <span>{m.Name} ({truncateId(m.members_id)})</span>
                            </label>
                          ))}
                        </div>
                        <button
                          className="mt-3 px-4 py-2"
                          style={{ background: '#FFFFFF', border: '1px solid #ddd', color: '#555', borderRadius: '8px' }}
                          type="button"
                          onClick={() =>
                            setAmbiguousDecisions((prev) => ({ ...prev, [row.rowNumber]: { type: 'create' } }))
                          }
                        >
                          Create as new person
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <div className="mt-6 space-y-4">
              {manualReviewRows.map((row) => {
                const decision = decisions[row.rowNumber];
                return (
                  <div
                    key={row.rowNumber}
                    className="overflow-hidden"
                    style={{ borderRadius: '12px', border: decision ? '1px solid #1D9E75' : '1px solid #EF9F27' }}
                  >
                    <div
                      className="p-4 flex flex-wrap justify-between gap-3"
                      style={{ background: decision ? '#E6F9F0' : '#FDF3E3' }}
                    >
                      <div className="flex flex-wrap items-center gap-3">
                        <div>
                          <p className="text-sm" style={{ color: decision ? '#0F6E56' : '#854F0B' }}>From Excel</p>
                          <p className="font-bold text-xl" style={{ color: '#1a1a2e' }}>{row.name}</p>
                        </div>
                        <p style={{ color: '#888' }}>⇄</p>
                        <div>
                          <p className="text-sm" style={{ color: decision ? '#0F6E56' : '#854F0B' }}>In DB</p>
                          <p className="font-bold text-xl" style={{ color: '#1a1a2e' }}>{row.existing.Name}</p>
                        </div>
                      </div>
                      <p className="text-2xl" style={{ color: '#1a1a2e' }}>{row.cleanPhone}</p>
                    </div>

                    {!decision ? (
                      <div className="p-4 flex flex-wrap gap-3" style={{ background: '#FFFFFF' }}>
                        <button
                          title="Person already exists globally — just add to this trust"
                          className="px-4 py-2"
                          style={{ background: '#E6F1FB', border: '1px solid #185FA5', color: '#185FA5', borderRadius: '8px' }}
                          onClick={() => setDecisions((p) => ({ ...p, [row.rowNumber]: { type: 'link' } }))}
                          type="button"
                        >
                          Link to this trust
                        </button>
                        <button
                          title="Treat as different person — new entry in global directory"
                          className="px-4 py-2"
                          style={{ background: '#FFFFFF', border: '1px solid #ddd', color: '#555', borderRadius: '8px' }}
                          onClick={() => setDecisions((p) => ({ ...p, [row.rowNumber]: { type: 'create' } }))}
                          type="button"
                        >
                          Create as new person
                        </button>
                        <button
                          title="Overwrite this person's name everywhere, then add to trust"
                          className="px-4 py-2"
                          style={{ background: '#FCEBEB', border: '1px solid #E24B4A', color: '#A32D2D', borderRadius: '8px' }}
                          onClick={() => setDecisions((p) => ({ ...p, [row.rowNumber]: { type: 'overwrite' } }))}
                          type="button"
                        >
                          Update global name + link
                        </button>
                      </div>
                    ) : (
                      <div className="p-4 flex items-center justify-between" style={{ background: '#E6F9F0' }}>
                        <p style={{ color: '#0F6E56' }}>
                          Resolved —{' '}
                          {decision.type === 'link'
                            ? 'linked to this trust'
                            : decision.type === 'create'
                            ? 'create as new person'
                            : 'update global name + link'}
                        </p>
                        <button
                          className="underline"
                          style={{ color: '#888' }}
                          onClick={() =>
                            setDecisions((p) => {
                              const n = { ...p };
                              delete n[row.rowNumber];
                              return n;
                            })
                          }
                          type="button"
                        >
                          Change
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="mt-6 p-4" style={{ background: '#F8F9FC', borderRadius: '12px', border: '1px solid #EEEEEE' }}>
              <p style={{ color: '#1a1a2e' }}>
                Progress: {resolvedManualCount + resolvedAmbiguousCount} of {reviewCount} resolved
              </p>
              <div className="h-3 rounded-full mt-3 overflow-hidden" style={{ background: '#EEEEEE' }}>
                <div
                  className="h-full"
                  style={{
                    background: '#1D9E75',
                    width: `${reviewCount ? ((resolvedManualCount + resolvedAmbiguousCount) / reviewCount) * 100 : 0}%`,
                    transition: 'width 0.3s'
                  }}
                />
              </div>
            </div>

            <div className="mt-6 flex flex-wrap justify-between gap-3">
              <button
                className="px-6 py-3"
                style={{ background: '#FFFFFF', border: '1px solid #ddd', color: '#555', borderRadius: '8px' }}
                onClick={() => setScreen('preview')}
                type="button"
              >
                ← Back to preview
              </button>
              <button
                className="px-6 py-3 disabled:opacity-40"
                style={{ background: '#0F6E56', color: '#FFFFFF', border: 'none', borderRadius: '8px' }}
                disabled={!canConfirmImport || isBusy}
                onClick={handleFinalImport}
                type="button"
              >
                {isBusy ? 'Importing...' : 'Confirm final import'}
              </button>
            </div>
          </div>
        )}

        {screen === 'done' && (
          <div className="text-center py-10">
            <div className="inline-flex items-center justify-center w-20 h-20 mb-4" style={{ background: '#E6F9F0', borderRadius: '50%' }}>
              <span className="text-4xl" style={{ color: '#0F6E56' }}>✓</span>
            </div>
            <h2 className="text-4xl font-semibold mt-3" style={{ color: '#1a1a2e' }}>Import complete</h2>
            <div className="mt-6 space-y-2 text-left inline-block">
              <p style={{ color: '#1a1a2e' }}><span style={{ color: '#0F6E56' }}>●</span> {summary?.globalNew || 0} new members added to global directory</p>
              <p style={{ color: '#1a1a2e' }}><span style={{ color: '#185FA5' }}>●</span> {summary?.linkedTrust || 0} existing members linked to this trust</p>
              <p style={{ color: '#1a1a2e' }}><span style={{ color: '#5F5E5A' }}>●</span> {summary?.skippedRegistered || 0} members already registered in this trust — skipped</p>
              <p style={{ color: '#1a1a2e' }}><span style={{ color: '#854F0B' }}>●</span> {summary?.manualResolved || 0} conflicts resolved manually</p>
              <p style={{ color: '#1a1a2e' }}><span style={{ color: '#A32D2D' }}>●</span> {summary?.ambiguousResolved || 0} ambiguous records resolved</p>
            </div>

            {insertLog.regMembersFailed.length > 0 && (
              <div className="mt-6 p-4 text-left" style={{ background: '#FDF3E3', border: '1px solid #EF9F27', borderRadius: '12px', color: '#854F0B' }}>
                <p className="font-semibold">
                  {insertLog.regMembersFailed.length} trust links failed — Members were created but trust linking failed
                </p>
                <details className="mt-3">
                  <summary className="cursor-pointer">Show failed rows</summary>
                  <div className="mt-2 max-h-48 overflow-auto text-sm">
                    {insertLog.regMembersFailed.map((f, idx) => (
                      <p key={`fail-${idx}`}>
                        {f.payload.Name} ({f.payload.Mobile}) — {f.reason}
                      </p>
                    ))}
                  </div>
                </details>
                <button
                  className="mt-3 px-4 py-2"
                  style={{ background: '#FFFFFF', border: '1px solid #EF9F27', color: '#854F0B', borderRadius: '8px' }}
                  type="button"
                  onClick={retryFailedLinks}
                  disabled={isBusy}
                >
                  Retry failed links
                </button>
              </div>
            )}

            <div className="mt-6 flex gap-3 justify-center flex-wrap">
              <button
                className="px-6 py-3"
                style={{ background: '#FFFFFF', border: '1px solid #ddd', color: '#555', borderRadius: '8px' }}
                onClick={resetAll}
                type="button"
              >
                Import another file
              </button>
              <button
                className="px-6 py-3"
                style={{ background: '#0F6E56', color: '#FFFFFF', border: 'none', borderRadius: '8px' }}
                onClick={() => (onComplete ? onComplete() : (window.location.href = '/members'))}
                type="button"
              >
                View members list
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

