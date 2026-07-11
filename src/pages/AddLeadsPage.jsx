import { useEffect, useMemo, useRef, useState } from 'react';
import * as XLSX from 'xlsx';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import { fetchMktOrgFilterValues, manageMktData, searchMktData } from '../services/mktDataService';
import { insertMktAction } from '../services/leadsService';
import './AddLeadsPage.css';

function normalizeResults(data) {
  if (Array.isArray(data)) return data;
  if (Array.isArray(data?.items)) return data.items;
  if (Array.isArray(data?.results)) return data.results;
  if (Array.isArray(data?.rows)) return data.rows;
  if (Array.isArray(data?.data)) return data.data;
  return [];
}

function formatValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (item === null || item === undefined || item === '') return '-';
        if (typeof item === 'object') {
          return item.name || item.org_name || item.organization_name || item.person_name || item.mobile || '-';
        }
        return String(item);
      })
      .filter((item) => item !== '-')
      .join(', ') || '-';
  }
  if (typeof value === 'object') return '-';
  return String(value);
}

function normalizeSearchValue(value) {
  return String(value ?? '').trim().toLowerCase();
}

const SEARCH_FILTER_OPTIONS = [
  { value: 'type', label: 'Type' },
  { value: 'cause', label: 'Cause' },
  { value: 'source', label: 'Source' },
  { value: 'city', label: 'City' },
];

function buildDistinctFilterOptions(rows) {
  const optionMap = {
    type: [],
    cause: [],
    source: [],
    city: [],
  };

  rows.forEach((row) => {
    SEARCH_FILTER_OPTIONS.forEach((option) => {
      const value = String(row?.[option.value] ?? '').trim();
      if (value) {
        optionMap[option.value].push(value);
      }
    });
  });

  return Object.fromEntries(
    Object.entries(optionMap).map(([key, values]) => [
      key,
      [...new Set(values)]
        .sort((left, right) => left.localeCompare(right, undefined, { sensitivity: 'base' }))
        .map((value) => ({ value, label: value })),
    ])
  );
}

function recordMatchesGeneralSearch(record, query) {
  const cleanQuery = normalizeSearchValue(query);
  if (!cleanQuery) return true;

  const directValues = [
    record?.mobile,
    record?.person_name,
    record?.name,
    record?.org_name,
    record?.organization_name,
    record?.title,
    record?.person_role,
    record?.role,
    record?.type,
    record?.record_type,
    record?.cause,
    record?.source,
    record?.sub_source,
    record?.city,
    record?.state,
  ];

  if (directValues.some((value) => normalizeSearchValue(value).includes(cleanQuery))) {
    return true;
  }

  if (!Array.isArray(record?.orgs)) return false;

  return record.orgs.some((org) =>
    [
      org?.org_name,
      org?.organization_name,
      org?.name,
      org?.title,
      org?.city,
      org?.state,
      org?.type,
      org?.cause,
      org?.source,
      org?.sub_source,
    ].some((value) => normalizeSearchValue(value).includes(cleanQuery))
  );
}

function rowMatchesFilterSelections(row, filters, excludedKey = '') {
  return SEARCH_FILTER_OPTIONS.every((option) => {
    if (option.value === excludedKey) return true;

    const selectedValue = normalizeSearchValue(filters?.[option.value] || '');
    if (!selectedValue) return true;

    return normalizeSearchValue(row?.[option.value]) === selectedValue;
  });
}

function recordMatchesFilterValue(record, filterKey, selectedValue) {
  const cleanSelectedValue = normalizeSearchValue(selectedValue);
  if (!cleanSelectedValue) return true;

  const filterValueMap = {
    type: [record?.type, record?.record_type],
    cause: [record?.cause],
    source: [record?.source, record?.sub_source],
    city: [record?.city],
  };

  const directValues = filterValueMap[filterKey] || [];
  if (directValues.some((value) => normalizeSearchValue(value) === cleanSelectedValue)) {
    return true;
  }

  if (!Array.isArray(record?.orgs)) return false;

  return record.orgs.some((org) => {
    const nestedValueMap = {
      type: [org?.type],
      cause: [org?.cause],
      source: [org?.source, org?.sub_source],
      city: [org?.city],
    };

    return (nestedValueMap[filterKey] || []).some((value) => normalizeSearchValue(value) === cleanSelectedValue);
  });
}

function recordMatchesFilters(record, filters) {
  return SEARCH_FILTER_OPTIONS.every((option) => recordMatchesFilterValue(record, option.value, filters?.[option.value] || ''));
}

function getSearchSeedFromInputs(filters, generalSearchText) {
  const cleanGeneralSearchText = String(generalSearchText || '').trim();
  if (cleanGeneralSearchText) return cleanGeneralSearchText;

  for (const option of SEARCH_FILTER_OPTIONS) {
    const value = String(filters?.[option.value] || '').trim();
    if (value) return value;
  }
  return '';
}

function isBlank(value) {
  return value === null || value === undefined || value === '';
}

function formatKeyLabel(key) {
  return String(key || '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (match) => match.toUpperCase());
}

function pickFirstValue(record, keys) {
  for (const key of keys) {
    const value = record?.[key];
    if (!isBlank(value)) return value;
  }
  return null;
}

function getPrimaryOrg(record) {
  if (!Array.isArray(record?.orgs) || record.orgs.length === 0) return null;
  return record.orgs.find((org) => org && typeof org === 'object') || null;
}

function formatExportMobile(value) {
  const rawValue = String(value ?? '').trim();
  if (!rawValue) return '-';

  const digitsOnly = rawValue.replace(/\D/g, '');
  if (digitsOnly.length === 10) {
    return `91${digitsOnly}`;
  }

  return digitsOnly || rawValue;
}

function buildExportRows(records) {
  return records.map((record) => {
    const primaryOrg = getPrimaryOrg(record);

    return {
      name: formatValue(pickFirstValue(record, ['person_name', 'name'])),
      mobile_no: formatExportMobile(pickFirstValue(record, ['mobile'])),
      role: formatValue(pickFirstValue(record, ['person_role', 'role'])),
      org_name: formatValue(
        pickFirstValue(primaryOrg, ['org_name', 'organization_name', 'name', 'title']) ||
          pickFirstValue(record, ['org_name', 'organization_name'])
      ),
      city: formatValue(pickFirstValue(primaryOrg, ['city']) || pickFirstValue(record, ['city'])),
    };
  });
}

const SUMMARY_FIELDS = [
  { key: 'person_name', label: 'Person Name', aliases: ['person_name', 'name'] },
  { key: 'mobile', label: 'Mobile', aliases: ['mobile'] },
  { key: 'person_role', label: 'Person Role', aliases: ['person_role', 'role'] },
  { key: 'mobile_remark', label: 'Mobile Remark', aliases: ['mobile_remark', 'remark'] },
  { key: 'city', label: 'City', aliases: ['city'] },
  { key: 'state', label: 'State', aliases: ['state'] },
  { key: 'cause', label: 'Cause', aliases: ['cause'] },
  { key: 'type', label: 'Type', aliases: ['type', 'record_type'] },
];

const ORG_FIELDS = [
  { key: 'org_name', label: 'Org Name', aliases: ['org_name', 'organization_name', 'name', 'title'] },
  { key: 'city', label: 'City', aliases: ['city'] },
  { key: 'state', label: 'State', aliases: ['state'] },
  { key: 'type', label: 'Type', aliases: ['type'] },
  { key: 'cause', label: 'Cause', aliases: ['cause'] },
];

const ADD_PERSON_FIELDS = [
  { key: 'person_name', label: 'Person Name' },
  { key: 'person_role', label: 'Person Role' },
  { key: 'email', label: 'Email' },
  { key: 'person_address', label: 'Address' },
  { key: 'person_remark', label: 'Person Remark' },
  { key: 'influence', label: 'Influence' },
];

const ADD_MOBILE_FIELDS = [
  { key: 'mobile', label: 'Mobile' },
  { key: 'mobile_remark', label: 'Mobile Remark' },
];

const ADD_ORG_FIELDS = [
  { key: 'org_name', label: 'Org Name' },
  { key: 'org_type', label: 'Org Type' },
  { key: 'city', label: 'City' },
  { key: 'state', label: 'State' },
  { key: 'cause', label: 'Cause' },
  { key: 'source', label: 'Source' },
  { key: 'sub_source', label: 'Sub Source' },
  { key: 'landline', label: 'Landline' },
  { key: 'website', label: 'Website' },
  { key: 'fb', label: 'Facebook' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'org_remark', label: 'Org Remark' },
];

function formatRecordSummary(record) {
  if (!record || typeof record !== 'object') return [];
  return SUMMARY_FIELDS.map((field) => ({
    key: field.key,
    label: field.label,
    value: pickFirstValue(record, field.aliases),
  }));
}

function formatOrgItems(record) {
  const orgs = Array.isArray(record?.orgs) ? record.orgs : [];
  return orgs
    .map((org, index) => {
      if (!org || typeof org !== 'object') return null;
      const entries = ORG_FIELDS.map((field) => ({
        key: field.key,
        label: field.label,
        value: pickFirstValue(org, field.aliases),
      }));

      return {
        key: String(org?.id || org?.org_id || index),
        title: pickFirstValue(org, ['org_name', 'organization_name', 'name', 'title']) || `Org ${index + 1}`,
        entries,
      };
    })
    .filter(Boolean);
}

function buildEditFormState(record) {
  const topLevelFields = {};
  const editableKeys = new Set([
    'type',
    'record_type',
    'person_name',
    'name',
    'org_name',
    'organization_name',
    'mobile',
    'person_role',
    'mobile_remark',
    'city',
    'state',
    'cause',
  ]);
  const excludedKeys = new Set(['id', 'person_id', 'org_id', 'mobile_id', 'personId', 'orgId', 'mobileId', 'orgs', 'items', 'results', 'rows', 'data']);

  Object.entries(record || {}).forEach(([key, value]) => {
    if (excludedKeys.has(key) || Array.isArray(value) || (value && typeof value === 'object')) return;
    if (editableKeys.size > 0 && !editableKeys.has(key) && topLevelFields[key] === undefined) {
      topLevelFields[key] = value ?? '';
      return;
    }
    topLevelFields[key] = value ?? '';
  });

  const orgs = Array.isArray(record?.orgs)
    ? record.orgs.map((org) => {
        const orgFields = {};
        Object.entries(org || {}).forEach(([key, value]) => {
          if (['id', 'org_id', 'orgId', 'person_id', 'mobile_id', 'personId', 'mobileId', 'items', 'results', 'rows', 'data'].includes(key)) {
            return;
          }
          if (['org_name', 'organization_name', 'name', 'title', 'orgs'].includes(key)) return;
          if (Array.isArray(value) || (value && typeof value === 'object')) return;
          orgFields[key] = value ?? '';
        });

        return {
          id: org?.id || org?.org_id || org?.orgId || '',
          title: pickFirstValue(org, ['org_name', 'organization_name', 'name', 'title']) || '',
          fields: orgFields,
        };
      })
    : [];

  return {
    fields: topLevelFields,
    orgs,
    meta: {
      personId: record?.person_id || record?.personId || record?.id || record?.record_id || '',
      mobileId: record?.mobile_id || record?.mobileId || '',
    },
  };
}

function buildAddFormState() {
  return {
    fields: {
      org_name: '',
      org_type: '',
      city: '',
      state: '',
      cause: '',
      source: '',
      sub_source: '',
      landline: '',
      website: '',
      fb: '',
      instagram: '',
      org_remark: '',
      person_name: '',
      person_role: '',
      email: '',
      person_address: '',
      person_remark: '',
      influence: '',
      mobile: '',
      mobile_remark: '',
    },
    orgs: [],
  };
}

function buildFullCreatePayload(formState) {
  const fields = formState?.fields || {};
  const payload = {};

  [
    'org_name',
    'org_type',
    'city',
    'state',
    'cause',
    'source',
    'sub_source',
    'landline',
    'website',
    'fb',
    'instagram',
    'org_remark',
    'person_name',
    'person_role',
    'email',
    'person_address',
    'person_remark',
    'influence',
    'mobile',
    'mobile_remark',
  ].forEach((key) => {
    const normalized = String(fields[key] ?? '').trim();
    if (normalized !== '') {
      payload[key] = normalized;
    }
  });

  return payload;
}

function inferRecordType(record) {
  const explicitType = String(record?.type || record?.record_type || '').trim().toLowerCase();
  if (explicitType) return explicitType;

  if (
    !isBlank(record?.person_name) ||
    !isBlank(record?.person_role) ||
    !isBlank(record?.mobile) ||
    !isBlank(record?.mobile_remark)
  ) {
    return 'person';
  }

  if (!isBlank(record?.org_name) || !isBlank(record?.organization_name)) {
    return 'org';
  }

  if (!isBlank(record?.mobile_id) || !isBlank(record?.mobileId)) {
    return 'mobile';
  }

  return 'org';
}

function inferRecordId(record, type) {
  const cleanType = String(type || '').trim().toLowerCase();

  if (cleanType === 'person') {
    return record?.person_id || record?.personId || record?.id || record?.record_id || '';
  }

  if (cleanType === 'mobile' || cleanType === 'mobile_add' || cleanType === 'mobile_delete') {
    return record?.mobile_id || record?.mobileId || record?.id || record?.record_id || '';
  }

  if (cleanType === 'org') {
    return record?.org_id || record?.orgId || record?.id || record?.record_id || '';
  }

  return record?.id || record?.record_id || record?.person_id || record?.org_id || record?.mobile_id || '';
}

function buildEditPayload(formState, type) {
  const cleanType = String(type || '').trim().toLowerCase();
  const payload = {};
  const fields = formState?.fields || {};
  const org = Array.isArray(formState?.orgs) ? formState.orgs[0] : null;

  if (cleanType === 'org') {
    const orgName = String(org?.title || org?.fields?.org_name || org?.fields?.organization_name || org?.fields?.name || org?.fields?.title || '').trim();
    if (orgName) {
      payload.name = orgName;
    }

    Object.entries(org?.fields || {}).forEach(([key, value]) => {
      const normalized = String(value ?? '').trim();
      if (normalized !== '') {
        payload[key] = normalized;
      }
    });

    return payload;
  }

  if (cleanType === 'person') {
    const name = String(fields.person_name || fields.name || '').trim();
    const role = String(fields.person_role || fields.role || '').trim();
    const remark = String(fields.mobile_remark || fields.remark || '').trim();
    const address = String(fields.city || fields.address || '').trim();

    if (name) payload.name = name;
    if (role) payload.role = role;
    if (remark) payload.remark = remark;
    if (address) payload.address = address;
    if (fields.email) payload.email = String(fields.email).trim();
    if (fields.influence) payload.influence = String(fields.influence).trim();
    return payload;
  }

  if (cleanType === 'mobile' || cleanType === 'mobile_add') {
    const mobile = String(fields.mobile || '').trim();
    const remark = String(fields.mobile_remark || fields.remark || '').trim();
    if (mobile) payload.mobile = mobile;
    if (remark) payload.remark = remark;
    return payload;
  }

  if (cleanType === 'mobile_delete' || cleanType === 'link' || cleanType === 'unlink') {
    return payload;
  }

  Object.entries(fields).forEach(([key, value]) => {
    const normalized = String(value ?? '').trim();
    if (normalized !== '') {
      payload[key] = normalized;
    }
  });

  return payload;
}

export default function AddLeadsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};
  const trustName = trust?.name || 'Trust';

  const [searchFilters, setSearchFilters] = useState({
    type: '',
    cause: '',
    source: '',
    city: '',
  });
  const [generalSearchText, setGeneralSearchText] = useState('');
  const [filterValueOptions, setFilterValueOptions] = useState({
    type: [],
    cause: [],
    source: [],
    city: [],
  });
  const [filterSourceRows, setFilterSourceRows] = useState([]);
  const [filterOptionsLoading, setFilterOptionsLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [records, setRecords] = useState([]);
  const [searched, setSearched] = useState(false);
  const [actionRecordId, setActionRecordId] = useState('');
  const [actionForm, setActionForm] = useState({ fields: {}, orgs: [] });
  const [actionMode, setActionMode] = useState(null);
  const [actionError, setActionError] = useState('');
  const [actionSaving, setActionSaving] = useState(false);
  const [actionNotice, setActionNotice] = useState('');
  const [actionNoticeType, setActionNoticeType] = useState('success');
  const [mktActionOpen, setMktActionOpen] = useState(false);
  const [mktActionSaving, setMktActionSaving] = useState(false);
  const [mktActionError, setMktActionError] = useState('');
  const [mktActionForm, setMktActionForm] = useState({
    name: '',
    mobile: '',
    trigger: '',
    action: '',
    flow: '',
    marks: '',
  });
  const [currentPage, setCurrentPage] = useState(1);
  const actionNoticeTimerRef = useRef(null);

  const pageSize = 10;

  const hasResults = records.length > 0;
  const totalPages = Math.max(1, Math.ceil(records.length / pageSize));
  const safePage = Math.min(currentPage, totalPages);
  const pageErrorMessage = actionError || error;
  const exportRows = useMemo(() => buildExportRows(records), [records]);

  const showTransientActionNotice = (message, type = 'success') => {
    if (actionNoticeTimerRef.current) {
      window.clearTimeout(actionNoticeTimerRef.current);
    }

    setActionNoticeType(type);
    setActionNotice(message);
    actionNoticeTimerRef.current = window.setTimeout(() => {
      setActionNotice('');
      actionNoticeTimerRef.current = null;
    }, 2000);
  };

  useEffect(() => {
    return () => {
      if (actionNoticeTimerRef.current) {
        window.clearTimeout(actionNoticeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    async function loadFilterValues() {
      setFilterOptionsLoading(true);
      const { data, error: filterError } = await fetchMktOrgFilterValues({ trustId: trust?.id || null });

      if (!isMounted) return;

      if (filterError) {
        setFilterOptionsLoading(false);
        setError(filterError.message || 'Unable to load filter values.');
        return;
      }

      const nextRows = Array.isArray(data) ? data : [];
      setFilterSourceRows(nextRows);
      setFilterValueOptions(buildDistinctFilterOptions(nextRows));
      setFilterOptionsLoading(false);
    }

    loadFilterValues();

    return () => {
      isMounted = false;
    };
  }, [trust?.id]);

  const dependentFilterOptions = useMemo(() => {
    if (!filterSourceRows.length) return filterValueOptions;

    const nextOptions = {};
    SEARCH_FILTER_OPTIONS.forEach((option) => {
      const scopedRows = filterSourceRows.filter((row) => rowMatchesFilterSelections(row, searchFilters, option.value));
      nextOptions[option.value] = buildDistinctFilterOptions(scopedRows)[option.value] || [];
    });

    return nextOptions;
  }, [filterSourceRows, filterValueOptions, searchFilters]);

  useEffect(() => {
    setSearchFilters((current) => {
      let hasChanges = false;
      const nextFilters = { ...current };

      SEARCH_FILTER_OPTIONS.forEach((option) => {
        const selectedValue = String(current[option.value] || '').trim();
        if (!selectedValue) return;

        const availableOptions = dependentFilterOptions[option.value] || [];
        const isStillAvailable = availableOptions.some((item) => item.value === selectedValue);
        if (!isStillAvailable) {
          nextFilters[option.value] = '';
          hasChanges = true;
        }
      });

      return hasChanges ? nextFilters : current;
    });
  }, [dependentFilterOptions]);

  const openActionModal = (mode, record = null) => {
    const nextType = inferRecordType(record);
    const nextId = inferRecordId(record, nextType);

    setActionMode(mode);
    setActionRecordId(nextId);
    setActionForm(mode === 'edit' ? buildEditFormState(record) : buildAddFormState());
    setActionError('');
    setActionNotice('');
  };

  const openMarketingActionModal = (record) => {
    const leadName = String(record?.name || record?.person_name || record?.org_name || record?.title || '').trim();
    const leadMobile = String(record?.mobile || '').trim();

    setMktActionForm({
      name: leadName,
      mobile: leadMobile,
      trigger: '',
      action: '',
      flow: '',
      marks: '',
    });
    setMktActionError('');
    setMktActionOpen(true);
  };

  const closeMarketingActionModal = () => {
    if (mktActionSaving) return;
    setMktActionOpen(false);
    setMktActionError('');
    setMktActionForm({
      name: '',
      mobile: '',
      trigger: '',
      action: '',
      flow: '',
      marks: '',
    });
  };

  const closeActionModal = () => {
    setActionError('');
    setActionSaving(false);
    setActionMode(null);
    setActionRecordId('');
    setActionForm({ fields: {}, orgs: [] });
  };

  const runSearch = async (filters = searchFilters, generalQuery = generalSearchText) => {
    const cleanSearch = getSearchSeedFromInputs(filters, generalQuery);
    if (!cleanSearch) {
      setError('General search ya at least one filter required hai.');
      setRecords([]);
      setSearched(false);
      return false;
    }

    setLoading(true);
    setError('');
    setSearched(true);

    const { data, error: searchError } = await searchMktData({ search: cleanSearch });
    if (searchError) {
      setError(searchError.message || 'Unable to search marketing data.');
      setRecords([]);
      setLoading(false);
      return false;
    }

    const nextRecords = normalizeResults(data).filter(
      (record) => recordMatchesFilters(record, filters) && recordMatchesGeneralSearch(record, generalQuery)
    );
    setRecords(nextRecords);
    setCurrentPage(1);
    setLoading(false);
    return true;
  };

  const handleSearch = async (event) => {
    event.preventDefault();
    await runSearch(searchFilters, generalSearchText);
  };

  const handleGeneralSearchChange = (event) => {
    const nextValue = event.target.value;
    setGeneralSearchText(nextValue);
    setRecords([]);
    setSearched(false);
    setError('');
    setCurrentPage(1);
  };

  const handleSearchFilterChange = (filterKey) => (event) => {
    const nextValue = event.target.value;
    setSearchFilters((current) => ({
      ...current,
      [filterKey]: nextValue,
    }));
    setRecords([]);
    setSearched(false);
    setError('');
    setCurrentPage(1);
  };

  const handleMarketingActionFieldChange = (field) => (event) => {
    const { value } = event.target;
    setMktActionForm((current) => ({ ...current, [field]: value }));
  };

  const handleDownloadExcel = () => {
    if (!exportRows.length) return;

    const worksheet = XLSX.utils.json_to_sheet(exportRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Leads');

    const selectedLabels = SEARCH_FILTER_OPTIONS.map((option) => {
      const selectedValue = String(searchFilters?.[option.value] || '').trim();
      return selectedValue ? `${option.label}-${selectedValue}` : null;
    }).filter(Boolean);

    const generalLabel = String(generalSearchText || '').trim();
    const fileSuffix = [...selectedLabels, generalLabel ? `search-${generalLabel}` : null]
      .filter(Boolean)
      .join('_')
      .replace(/[^a-z0-9_-]+/gi, '-')
      .replace(/-+/g, '-')
      .replace(/^[-_]+|[-_]+$/g, '')
      .slice(0, 80);

    const fileName = `leads${fileSuffix ? `-${fileSuffix}` : ''}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  const handleSaveMarketingAction = async () => {
    const cleanMobile = String(mktActionForm.mobile || '').trim();
    const cleanAction = String(mktActionForm.action || '').trim();
    const cleanTrigger = String(mktActionForm.trigger || '').trim();
    const cleanFlow = String(mktActionForm.flow || '').trim();

    if (!cleanMobile) {
      setMktActionError('Mobile is required.');
      return;
    }
    if (!cleanAction) {
      setMktActionError('Action is required.');
      return;
    }
    if (!cleanTrigger) {
      setMktActionError('Trigger is required.');
      return;
    }
    if (!cleanFlow) {
      setMktActionError('Flow is required.');
      return;
    }

    setMktActionSaving(true);
    setMktActionError('');

    const { error: insertError } = await insertMktAction({
      name: String(mktActionForm.name || '').trim(),
      mobile: cleanMobile,
      source: 'admin panel',
      action: cleanAction,
      trigger: cleanTrigger,
      flow: cleanFlow,
      type: 'marketing',
    });

    if (insertError) {
      setMktActionError(insertError.message || 'Unable to add action.');
      setMktActionSaving(false);
      return;
    }

    setMktActionSaving(false);
    showTransientActionNotice('Action added successfully.');
    closeMarketingActionModal();
  };

  const handleSave = async () => {
    const saveRequests = [];

    if (actionMode === 'edit') {
      const personPayload = buildEditPayload({ fields: actionForm?.fields || {}, orgs: [] }, 'person');
      const personId = actionForm?.meta?.personId || actionRecordId || '';
      if (personId && Object.keys(personPayload).length > 0) {
        saveRequests.push({
          type: 'person',
          id: personId,
          data: personPayload,
        });
      }

      (actionForm?.orgs || []).forEach((org) => {
        const orgPayload = buildEditPayload(
          {
            fields: {},
            orgs: [
              {
                title: org?.title || '',
                fields: org?.fields || {},
              },
            ],
          },
          'org'
        );
        const orgId = org?.id || org?.org_id || org?.orgId || '';
        if (orgId && Object.keys(orgPayload).length > 0) {
          saveRequests.push({
            type: 'org',
            id: orgId,
            data: orgPayload,
          });
        }
      });
    } else {
      const parsedPayload = buildFullCreatePayload(actionForm);
      if (Object.keys(parsedPayload).length > 0) {
        saveRequests.push({
          type: 'full_create',
          id: '',
          data: parsedPayload,
        });
      }
    }

    if (saveRequests.length === 0) {
      setActionError('No editable fields found for this record.');
      setActionNoticeType('error');
      setActionNotice('No editable fields found for this record.');
      return;
    }

    setActionSaving(true);
    setActionError('');
    for (const request of saveRequests) {
      const { error: saveError } = await manageMktData(request);
      if (saveError) {
        setActionError(saveError.message || 'Unable to save changes.');
        setActionNoticeType('error');
        setActionNotice(saveError.message || 'Unable to save changes.');
        setActionSaving(false);
        return;
      }
    }

    setActionSaving(false);
    showTransientActionNotice(actionMode === 'edit' ? 'Record updated successfully.' : 'Record added successfully.');

    const refreshSearch = String(
      actionMode === 'edit'
        ? getSearchSeedFromInputs(searchFilters, generalSearchText)
        : actionForm?.fields?.mobile || actionForm?.fields?.person_name || actionForm?.orgs?.[0]?.title || actionForm?.orgs?.[0]?.fields?.org_name || ''
    ).trim();

    closeActionModal();
    if (refreshSearch) {
      await runSearch(searchFilters, generalSearchText);
    }
  };

  const resultCards = useMemo(
    () =>
      records.slice((safePage - 1) * pageSize, safePage * pageSize).map((record, index) => ({
        key: String(record?.id || record?.record_id || index),
        summary: formatRecordSummary(record),
        orgCards: formatOrgItems(record),
        raw: record,
      })),
    [pageSize, records, safePage]
  );

  return (
    <div className="add-leads-page-root">
      <Sidebar
        trustName={trustName}
        onDashboard={() =>
          navigate('/dashboard', {
            state: { userName, trust, superuserId, sidebarNavKey: 'dashboard' },
          })
        }
        onLogout={() => navigate('/login')}
      />

      <main className="add-leads-page-main">
        <PageHeader
          title="Add Leads"
          subtitle="Search marketing records and manage entries."
          onBack={() =>
            navigate('/sales-marketing', {
              state: { userName, trust, superuserId, sidebarNavKey: 'sales-marketing' },
            })
          }
        />

        <section className="add-leads-page-content">
          <div className="add-leads-shell">
            <form className="add-leads-searchbar" onSubmit={handleSearch}>
              <div className="add-leads-searchfilters-grid">
                {SEARCH_FILTER_OPTIONS.map((option) => {
                  const currentOptions = dependentFilterOptions[option.value] || [];

                  return (
                    <div className="add-leads-searchfilter" key={option.value}>
                      <span>{option.label}</span>
                      <select value={searchFilters[option.value]} onChange={handleSearchFilterChange(option.value)} disabled={filterOptionsLoading}>
                        <option value="">All {option.label}</option>
                        {currentOptions.map((item) => (
                          <option key={`${option.value}-${item.value}`} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </div>
                  );
                })}
              </div>
              <div className="add-leads-searchfield add-leads-searchfield-general">
                <span>General Search</span>
                <div className="add-leads-searchinput-wrap">
                  <span className="add-leads-searchinput-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path
                        d="M10.5 4a6.5 6.5 0 104.13 11.54l4.41 4.42 1.41-1.42-4.42-4.41A6.5 6.5 0 0010.5 4zm0 2a4.5 4.5 0 110 9 4.5 4.5 0 010-9z"
                        fill="currentColor"
                      />
                    </svg>
                  </span>
                  <input
                    value={generalSearchText}
                    onChange={handleGeneralSearchChange}
                    placeholder="Search by mobile, person, org, cause, source, city"
                    autoComplete="off"
                  />
                </div>
              </div>
              <button type="submit" className="add-leads-searchbtn" disabled={loading}>
                <span className="add-leads-searchbtn-icon" aria-hidden="true">
                  {loading ? (
                    <span className="add-leads-spinner" />
                  ) : (
                    <svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">
                      <path
                        d="M10.5 4a6.5 6.5 0 104.13 11.54l4.41 4.42 1.41-1.42-4.42-4.41A6.5 6.5 0 0010.5 4zm0 2a4.5 4.5 0 110 9 4.5 4.5 0 010-9z"
                        fill="currentColor"
                      />
                    </svg>
                  )}
                </span>
                <span>{loading ? 'Searching...' : 'Search'}</span>
              </button>
            </form>

            {pageErrorMessage && (
              <div className="add-leads-state add-leads-state-error add-leads-state-page" role="alert" aria-live="assertive">
                {pageErrorMessage}
              </div>
            )}
            {!loading && searched && !hasResults && !error && (
              <div className="add-leads-empty">
                <div className="add-leads-empty-badge">Ready to create</div>
                <div className="add-leads-empty-copy">
                  <h2>No data found</h2>
                  <p>Search result empty hai. Aap new record add kar sakte ho.</p>
                </div>
                <button
                  type="button"
                  className="add-leads-action-btn add-leads-action-btn-large add-leads-action-btn-cta"
                  onClick={() => openActionModal('add')}
                >
                  <span className="add-leads-action-btn-icon">+</span>
                  <span className="add-leads-action-btn-text">
                    <strong>Add New Lead</strong>
                    <small>Create a fresh marketing record</small>
                  </span>
                </button>
              </div>
            )}

            {!loading && hasResults && (
              <div className="add-leads-results">
                <div className="add-leads-results-head">
                  <div className="add-leads-results-title">
                    <h2>Results</h2>
                    <span>{records.length} found</span>
                  </div>
                  <button type="button" className="add-leads-mini-btn is-export" onClick={handleDownloadExcel}>
                    Download Excel
                  </button>
                </div>

                <div className="add-leads-cards">
                  {resultCards.map((card) => (
                    <article className="add-leads-card" key={card.key}>
                      <div className="add-leads-card-head">
                        <div>
                          <h3>{formatValue(card.raw?.name || card.raw?.org_name || card.raw?.person_name || card.raw?.mobile || 'Record')}</h3>
                          <p>{formatValue(card.raw?.type || card.raw?.record_type || 'mkt record')}</p>
                        </div>
                        <div className="add-leads-card-actions">
                          <button type="button" className="add-leads-mini-btn is-action" onClick={() => openMarketingActionModal(card.raw)}>
                            + Add action
                          </button>
                          <button type="button" className="add-leads-mini-btn" onClick={() => openActionModal('edit', card.raw)}>
                            Edit
                          </button>
                          <button
                            type="button"
                            className="add-leads-mini-btn is-danger"
                            onClick={async () => {
                              const confirmed = window.confirm('Delete this record?');
                              if (!confirmed) return;

                              setActionSaving(true);
                              const { error: deleteError } = await manageMktData({
                                type: 'person_delete',
                                id: inferRecordId(card.raw, 'person'),
                                data: {},
                              });
                              setActionSaving(false);

                              if (deleteError) {
                                setError(deleteError.message || 'Unable to delete record.');
                                showTransientActionNotice(deleteError.message || 'Unable to delete record.', 'error');
                                return;
                              }

                              showTransientActionNotice('Record deleted successfully.');
                              await runSearch(searchFilters, generalSearchText);
                            }}
                          >
                            Delete
                          </button>
                        </div>
                      </div>

                      <div className="add-leads-card-grid">
                        {card.summary.map((item) => (
                          <div className="add-leads-card-item" key={`${card.key}-${item.key}`}>
                            <span>{item.label}</span>
                            <strong>{formatValue(item.value)}</strong>
                          </div>
                        ))}
                      </div>

                      {card.orgCards.length > 0 && (
                        <div className="add-leads-org-block">
                          <div className="add-leads-org-block-head">
                            <span>Orgs</span>
                            <strong>{card.orgCards.length}</strong>
                          </div>
                          <div className="add-leads-org-list">
                            {card.orgCards.map((org) => (
                              <article className="add-leads-org-card" key={`${card.key}-${org.key}`}>
                                <div className="add-leads-org-card-title">
                                  <span className="add-leads-org-card-title-icon" aria-hidden="true">
                                    ◦
                                  </span>
                                  <span>{org.title}</span>
                                </div>
                                <div className="add-leads-org-card-grid">
                                  {org.entries.length > 0 ? (
                                    org.entries.map((entry) => (
                                      <div className="add-leads-org-item" key={`${card.key}-${org.key}-${entry.key}`}>
                                        <span>{entry.label}</span>
                                        <strong>{formatValue(entry.value)}</strong>
                                      </div>
                                    ))
                                  ) : (
                                    <div className="add-leads-org-empty">-</div>
                                  )}
                                </div>
                              </article>
                            ))}
                          </div>
                        </div>
                      )}
                    </article>
                  ))}
                </div>

                {records.length > pageSize && (
                  <div className="add-leads-pagination">
                    <button
                      type="button"
                      className="add-leads-pagination-btn"
                      onClick={() => setCurrentPage((page) => Math.max(1, page - 1))}
                      disabled={safePage === 1}
                    >
                      ← Prev
                    </button>
                    <div className="add-leads-pagination-info">
                      Page <strong>{safePage}</strong> of <strong>{totalPages}</strong>
                    </div>
                    <button
                      type="button"
                      className="add-leads-pagination-btn"
                      onClick={() => setCurrentPage((page) => Math.min(totalPages, page + 1))}
                      disabled={safePage === totalPages}
                    >
                      Next →
                    </button>
                  </div>
                )}
              </div>
            )}

            {actionNotice && (
              <div
                className={`add-leads-toast ${actionNoticeType === 'error' ? 'add-leads-toast-error' : 'add-leads-toast-success'}`}
                role="status"
                aria-live="polite"
              >
                {actionNotice}
              </div>
            )}

            {loading && <div className="add-leads-state">Searching records...</div>}
          </div>
        </section>
      </main>

      {actionMode !== null && (
        <div className="add-leads-modal-backdrop" role="presentation" onMouseDown={closeActionModal}>
          <div className="add-leads-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <div className="add-leads-modal-head">
              <div>
                <h3>{actionMode === 'edit' ? 'Edit Record' : 'Add Record'}</h3>
                <p>Fill the fields and save through the RPC.</p>
              </div>
              <button type="button" className="add-leads-modal-close" onClick={closeActionModal} aria-label="Close">
                ×
              </button>
            </div>

            {actionMode === 'add' ? (
              <>
                <div className="add-leads-modal-section">
                  <div className="add-leads-modal-section-head">
                    <h4>Person</h4>
                  </div>
                  <div className="add-leads-modal-field-grid">
                    {ADD_PERSON_FIELDS.map((field) => (
                      <label className="add-leads-field" key={field.key}>
                        <span>{field.label}</span>
                        <input
                          value={actionForm.fields?.[field.key] || ''}
                          onChange={(event) =>
                            setActionForm((prev) => ({
                              ...prev,
                              fields: {
                                ...(prev.fields || {}),
                                [field.key]: event.target.value,
                              },
                            }))
                          }
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="add-leads-modal-section">
                  <div className="add-leads-modal-section-head">
                    <h4>Mobile</h4>
                  </div>
                  <div className="add-leads-modal-field-grid">
                    {ADD_MOBILE_FIELDS.map((field) => (
                      <label className="add-leads-field" key={field.key}>
                        <span>{field.label}</span>
                        <input
                          value={actionForm.fields?.[field.key] || ''}
                          onChange={(event) =>
                            setActionForm((prev) => ({
                              ...prev,
                              fields: {
                                ...(prev.fields || {}),
                                [field.key]: event.target.value,
                              },
                            }))
                          }
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                        />
                      </label>
                    ))}
                  </div>
                </div>

                <div className="add-leads-modal-section">
                  <div className="add-leads-modal-section-head">
                    <h4>Org</h4>
                  </div>
                  <div className="add-leads-modal-field-grid">
                    {ADD_ORG_FIELDS.map((field) => (
                      <label
                        className={`add-leads-field ${field.key === 'org_name' ? 'add-leads-field-full' : ''}`}
                        key={field.key}
                      >
                        <span>{field.label}</span>
                        <input
                          value={actionForm.fields?.[field.key] || ''}
                          onChange={(event) =>
                            setActionForm((prev) => ({
                              ...prev,
                              fields: {
                                ...(prev.fields || {}),
                                [field.key]: event.target.value,
                              },
                            }))
                          }
                          placeholder={`Enter ${field.label.toLowerCase()}`}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="add-leads-modal-section">
                  <div className="add-leads-modal-section-head">
                    <h4>Record fields</h4>
                  </div>
                  <div className="add-leads-modal-field-grid">
                    {Object.entries(actionForm.fields || {}).length > 0 ? (
                      Object.entries(actionForm.fields || {}).map(([key, value]) => (
                        <label className="add-leads-field" key={key}>
                          <span>{formatKeyLabel(key)}</span>
                          <input
                            value={value}
                            onChange={(event) =>
                              setActionForm((prev) => ({
                                ...prev,
                                fields: {
                                  ...(prev.fields || {}),
                                  [key]: event.target.value,
                                },
                              }))
                            }
                            placeholder={`Enter ${formatKeyLabel(key).toLowerCase()}`}
                          />
                        </label>
                      ))
                    ) : (
                      <div className="add-leads-modal-empty">No editable fields found.</div>
                    )}
                  </div>
                </div>

                <div className="add-leads-modal-section">
                  <div className="add-leads-modal-section-head">
                    <h4>Orgs</h4>
                    <span>{actionForm.orgs?.length || 0}</span>
                  </div>
                  <div className="add-leads-edit-orgs">
                    {(actionForm.orgs || []).length > 0 ? (
                      actionForm.orgs.map((org, orgIndex) => (
                        <article className="add-leads-edit-org-card" key={`org-${orgIndex}`}>
                          <div className="add-leads-edit-org-head">
                            <label className="add-leads-field">
                              <span>Org name</span>
                              <input
                                value={org.title || ''}
                                onChange={(event) =>
                                  setActionForm((prev) => ({
                                    ...prev,
                                    orgs: (prev.orgs || []).map((item, currentIndex) =>
                                      currentIndex === orgIndex ? { ...item, title: event.target.value } : item
                                    ),
                                  }))
                                }
                                placeholder="Organization name"
                              />
                            </label>
                          </div>
                          <div className="add-leads-modal-field-grid">
                            {Object.entries(org.fields || {}).length > 0 ? (
                              Object.entries(org.fields || {}).map(([key, value]) => (
                                <label className="add-leads-field" key={`${orgIndex}-${key}`}>
                                  <span>{formatKeyLabel(key)}</span>
                                  <input
                                    value={value}
                                    onChange={(event) =>
                                      setActionForm((prev) => ({
                                        ...prev,
                                        orgs: (prev.orgs || []).map((item, currentIndex) =>
                                          currentIndex === orgIndex
                                            ? {
                                                ...item,
                                                fields: {
                                                  ...(item.fields || {}),
                                                  [key]: event.target.value,
                                                },
                                              }
                                            : item
                                        ),
                                      }))
                                    }
                                    placeholder={`Enter ${formatKeyLabel(key).toLowerCase()}`}
                                  />
                                </label>
                              ))
                            ) : (
                              <div className="add-leads-modal-empty">No org fields found.</div>
                            )}
                          </div>
                        </article>
                      ))
                    ) : (
                      <div className="add-leads-modal-empty">No org data found.</div>
                    )}
                  </div>
                </div>
              </>
            )}

            {actionError && <div className="add-leads-state add-leads-state-error">{actionError}</div>}

            <div className="add-leads-modal-actions">
              <button type="button" className="add-leads-secondary-btn" onClick={closeActionModal} disabled={actionSaving}>
                Cancel
              </button>
              <button type="button" className="add-leads-primary-btn" onClick={handleSave} disabled={actionSaving}>
                {actionSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {mktActionOpen && (
        <div className="add-leads-modal-backdrop" role="presentation" onMouseDown={closeMarketingActionModal}>
          <div
            className="add-leads-modal add-leads-action-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-marketing-action-title"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="add-leads-modal-head">
              <div>
                <h3 id="add-marketing-action-title">Add Action</h3>
                <p>Creates a marketing action for this selected lead.</p>
              </div>
              <button type="button" className="add-leads-modal-close" onClick={closeMarketingActionModal} aria-label="Close">
                ×
              </button>
            </div>

            <div className="add-leads-modal-section">
              <div className="add-leads-modal-section-head">
                <h4>Lead details</h4>
              </div>
              <div className="add-leads-modal-field-grid">
                <label className="add-leads-field">
                  <span>Name</span>
                  <input value={mktActionForm.name || ''} readOnly />
                </label>
                <label className="add-leads-field">
                  <span>Mobile</span>
                  <input value={mktActionForm.mobile || ''} readOnly />
                </label>
              </div>
            </div>

            <div className="add-leads-modal-section">
              <div className="add-leads-modal-section-head">
                <h4>Action fields</h4>
              </div>
              <div className="add-leads-modal-field-grid">
                <label className="add-leads-field">
                  <span>Trigger</span>
                  <input
                    value={mktActionForm.trigger}
                    onChange={handleMarketingActionFieldChange('trigger')}
                    placeholder="Enter trigger"
                    autoComplete="off"
                  />
                </label>

                <label className="add-leads-field">
                  <span>Action</span>
                  <input
                    value={mktActionForm.action}
                    onChange={handleMarketingActionFieldChange('action')}
                    placeholder="Enter action"
                    autoComplete="off"
                  />
                </label>

                <label className="add-leads-field">
                  <span>Flow</span>
                  <input
                    value={mktActionForm.flow}
                    onChange={handleMarketingActionFieldChange('flow')}
                    placeholder="Enter flow"
                    autoComplete="off"
                  />
                </label>

                <label className="add-leads-field">
                  <span>Marks</span>
                  <input
                    value={mktActionForm.marks}
                    onChange={handleMarketingActionFieldChange('marks')}
                    placeholder="Enter marks"
                    autoComplete="off"
                  />
                </label>
              </div>
            </div>

            {mktActionError && <div className="add-leads-state add-leads-state-error">{mktActionError}</div>}

            <div className="add-leads-modal-actions">
              <button type="button" className="add-leads-secondary-btn" onClick={closeMarketingActionModal} disabled={mktActionSaving}>
                Cancel
              </button>
              <button type="button" className="add-leads-primary-btn" onClick={handleSaveMarketingAction} disabled={mktActionSaving}>
                {mktActionSaving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
