import { useDeferredValue, useEffect, useLayoutEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  fetchSponsors,
  createSponsor,
  updateSponsor,
  uploadSponsorPhotoDataUrl,
  fetchSponsorFlashByTrust,
  createSponsorFlash,
  updateSponsorFlash,
  deleteSponsorFlash,
} from '../services/sponsorsService';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import { getAllowedImageFormatsMessage, prepareImageFileForUpload } from '../utils/imageUpload';
import './SponsorsPage.css';

const EMPTY_FORM = {
  name: '',
  position: '',
  position2: '',
  about: '',
  photo_url: '',
  company_name: '',
  coPartner: '',
  ContactNumber1: '',
  contactNumber2: '',
  contactNumber3: '',
  email_id1: '',
  emailId2: '',
  emailId3: '',
  address: '',
  address2: '',
  address3: '',
  city: '',
  state: '',
  whatsapp_country: 'IN',
  whatsapp_number: '',
  facebook: '',
  instagram: '',
  X: '',
  linkedin: '',
  website_url: '',
  catalog_url: '',
  badge_label: 'OFFICIAL SPONSOR',
};

const createEmptyForm = () => ({ ...EMPTY_FORM });

const initials = (value = '') =>
  value.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'S';

const sanitizeDigits = (value, maxLength = 15) =>
  String(value || '').replace(/\D/g, '').slice(0, maxLength);

const WHATSAPP_COUNTRIES = [
  { value: 'IN', label: 'India', dialCode: '+91' },
  { value: 'AE', label: 'UAE', dialCode: '+971' },
  { value: 'US', label: 'United States', dialCode: '+1' },
  { value: 'GB', label: 'United Kingdom', dialCode: '+44' },
  { value: 'CA', label: 'Canada', dialCode: '+1' },
  { value: 'AU', label: 'Australia', dialCode: '+61' },
  { value: 'SG', label: 'Singapore', dialCode: '+65' },
  { value: 'SA', label: 'Saudi Arabia', dialCode: '+966' },
  { value: 'QA', label: 'Qatar', dialCode: '+974' },
  { value: 'KW', label: 'Kuwait', dialCode: '+965' },
];

const DEFAULT_WHATSAPP_COUNTRY = 'IN';
const MAX_SPONSOR_IMAGE_SIZE_BYTES = 25 * 1024;

function getWhatsappCountry(value) {
  return (
    WHATSAPP_COUNTRIES.find((country) => country.value === value) ||
    WHATSAPP_COUNTRIES.find((country) => country.value === DEFAULT_WHATSAPP_COUNTRY) ||
    WHATSAPP_COUNTRIES[0]
  );
}

function splitWhatsappForForm(rawValue) {
  const digits = sanitizeDigits(rawValue, 15);
  if (!digits) return { country: DEFAULT_WHATSAPP_COUNTRY, local: '' };

  const matchedCountry = [...WHATSAPP_COUNTRIES]
    .map((country) => ({ ...country, dialDigits: sanitizeDigits(country.dialCode, 4) }))
    .sort((a, b) => b.dialDigits.length - a.dialDigits.length)
    .find((country) => digits.startsWith(country.dialDigits));

  if (!matchedCountry) {
    return { country: DEFAULT_WHATSAPP_COUNTRY, local: digits };
  }

  return {
    country: matchedCountry.value,
    local: digits.slice(matchedCountry.dialDigits.length),
  };
}

function loadImageFromFile(file) {
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

function canvasToBlob(canvas, type, quality) {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), type, quality);
  });
}

async function compressImageToLimit(file, maxBytes) {
  if ((file?.size || 0) <= maxBytes) return { file };

  const image = await loadImageFromFile(file);
  const baseWidth = Math.max(1, image.naturalWidth || image.width || 1);
  const baseHeight = Math.max(1, image.naturalHeight || image.height || 1);
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  if (!context) return null;

  for (let scaleStep = 0; scaleStep < 9; scaleStep += 1) {
    const scale = Math.pow(0.82, scaleStep);
    const targetWidth = Math.max(160, Math.round(baseWidth * scale));
    const targetHeight = Math.max(160, Math.round(baseHeight * scale));
    canvas.width = targetWidth;
    canvas.height = targetHeight;
    context.clearRect(0, 0, targetWidth, targetHeight);
    context.drawImage(image, 0, 0, targetWidth, targetHeight);

    for (let quality = 0.82; quality >= 0.2; quality -= 0.08) {
      const blob = await canvasToBlob(canvas, 'image/jpeg', Number(quality.toFixed(2)));
      if (blob && blob.size <= maxBytes) {
        return { file: blob };
      }
    }
  }

  return null;
}

function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read selected image.'));
    reader.readAsDataURL(blob);
  });
}

function formatWhatsappForDisplay(rawValue) {
  const digits = sanitizeDigits(rawValue, 15);
  if (!digits) return '';

  const matchedCountry = [...WHATSAPP_COUNTRIES]
    .map((country) => ({ ...country, dialDigits: sanitizeDigits(country.dialCode, 4) }))
    .sort((a, b) => b.dialDigits.length - a.dialDigits.length)
    .find((country) => digits.startsWith(country.dialDigits));

  if (!matchedCountry) return `+${digits}`;
  const local = digits.slice(matchedCountry.dialDigits.length);
  return `${matchedCountry.dialCode} ${local}`;
}

function isFlashActive(flash) {
  if (!flash) return false;
  if (!flash.start_date && !flash.end_date) return false;
  const todayStr = toLocalDateString(new Date());
  if (flash.start_date && todayStr < flash.start_date) return false;
  if (flash.end_date && todayStr > flash.end_date) return false;
  return true;
}

function toLocalDateString(date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

export default function SponsorsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'dashboard';
  const trustId = trust?.id || null;
  const forceCreateFromState = location.state?.sponsorFormMode === 'create';
  const isCreateRoute = location.pathname.includes('/create_sponsor');
  const isEditRoute =
    location.pathname.includes('/sponsor/edit_sponsor') ||
    location.pathname.includes('/sponsorts/edit_sponsor');
  const isCreateMode = isCreateRoute || forceCreateFromState;
  const editSponsorIdFromRouteState = location.state?.editSponsorId || null;

  const [sponsors, setSponsors] = useState([]);
  const [flashMap, setFlashMap] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [hiddenIds, setHiddenIds] = useState(new Set());

  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [showFlashModal, setShowFlashModal] = useState(false);
  const [flashSponsorId, setFlashSponsorId] = useState(null);
  const [showFlashInfoModal, setShowFlashInfoModal] = useState(false);
  const [flashInfoSponsorId, setFlashInfoSponsorId] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [detailSponsorId, setDetailSponsorId] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('my');
  const [sortBy, setSortBy] = useState('name');
  const [listSearch, setListSearch] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [flashForm, setFlashForm] = useState({
    start_date: '',
    end_date: '',
    duration_seconds: '5',
    priority: '',
  });
  const [flashError, setFlashError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [showContact2, setShowContact2] = useState(false);
  const [showContact3, setShowContact3] = useState(false);
  const [showEmail2, setShowEmail2] = useState(false);
  const [showEmail3, setShowEmail3] = useState(false);
  const [showAddress2, setShowAddress2] = useState(false);
  const [showAddress3, setShowAddress3] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [numberWarning, setNumberWarning] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const deferredListSearch = useDeferredValue(listSearch);
  const deferredPickerSearch = useDeferredValue(searchTerm);

  useEffect(() => {
    if (!trustId) navigate('/dashboard', { replace: true, state: { userName, trust } });
  }, [trustId, navigate, userName, trust]);

  const sponsorsById = useMemo(() => {
    const map = new Map();
    sponsors.forEach((sponsor) => map.set(sponsor.id, sponsor));
    return map;
  }, [sponsors]);

  const editableSponsorIds = useMemo(() => {
    const set = new Set();
    sponsors.forEach((sponsor) => {
      if (sponsor?.trust_id && trustId && sponsor.trust_id === trustId) {
        set.add(sponsor.id);
      }
    });
    return set;
  }, [sponsors, trustId]);

  const flashActiveBySponsorId = useMemo(() => {
    const map = {};
    sponsors.forEach((sponsor) => {
      map[sponsor.id] = isFlashActive(flashMap[sponsor.id]);
    });
    return map;
  }, [sponsors, flashMap]);

  const selectedSponsor = useMemo(
    () => (selectedId ? sponsorsById.get(selectedId) || null : null),
    [sponsorsById, selectedId]
  );
  const formMode = isCreateMode ? 'create' : ((isEditRoute || (showForm && !!selectedId)) ? 'edit' : 'create');

  const filteredSponsorChoices = useMemo(() => {
    const term = deferredPickerSearch.trim().toLowerCase();
    if (!term) return sponsors;
    return sponsors.filter((s) => {
      const name = (s.name || '').toLowerCase();
      const company = (s.company_name || '').toLowerCase();
      const phone = String(s.ContactNumber1 ?? s.phone ?? '').toLowerCase();
      return name.includes(term) || company.includes(term) || phone.includes(term);
    });
  }, [sponsors, deferredPickerSearch]);

  const mySponsorChoices = useMemo(
    () => filteredSponsorChoices.filter(s => s.trust_id === trustId),
    [filteredSponsorChoices, trustId]
  );

  const otherSponsorChoices = useMemo(
    () => filteredSponsorChoices.filter(s => s.trust_id !== trustId),
    [filteredSponsorChoices, trustId]
  );

  const visibleSponsors = useMemo(
    () => sponsors.filter((s) => !hiddenIds.has(s.id)),
    [sponsors, hiddenIds]
  );

  const mySponsorCount = useMemo(
    () => visibleSponsors.filter((s) => s.trust_id === trustId).length,
    [visibleSponsors, trustId]
  );

  const otherSponsorCount = useMemo(
    () => visibleSponsors.filter((s) => s.trust_id !== trustId).length,
    [visibleSponsors, trustId]
  );

  const totalSponsorCount = mySponsorCount + otherSponsorCount;

  const ownerScopedSponsors = useMemo(() => {
    if (ownerFilter === 'my') return visibleSponsors.filter((s) => s.trust_id === trustId);
    if (ownerFilter === 'others') return visibleSponsors.filter((s) => s.trust_id !== trustId);
    return visibleSponsors;
  }, [visibleSponsors, ownerFilter, trustId]);

  const activeSponsorCount = useMemo(
    () => ownerScopedSponsors.filter((s) => flashActiveBySponsorId[s.id]).length,
    [ownerScopedSponsors, flashActiveBySponsorId]
  );

  const inactiveSponsorCount = useMemo(
    () => ownerScopedSponsors.filter((s) => !flashActiveBySponsorId[s.id]).length,
    [ownerScopedSponsors, flashActiveBySponsorId]
  );

  const panelSponsors = useMemo(() => {
    const term = deferredListSearch.trim().toLowerCase();
    let list = [...visibleSponsors];

    if (ownerFilter === 'my') {
      list = list.filter((s) => s.trust_id === trustId);
    } else if (ownerFilter === 'others') {
      list = list.filter((s) => s.trust_id !== trustId);
    }

    if (term) {
      list = list.filter((s) => {
        const name = (s.name || '').toLowerCase();
        const company = (s.company_name || '').toLowerCase();
        const phone = String(s.ContactNumber1 ?? s.phone ?? '').toLowerCase();
        return name.includes(term) || company.includes(term) || phone.includes(term);
      });
    }

    if (statusFilter === 'active') {
      list = list.filter((s) => flashActiveBySponsorId[s.id]);
    } else if (statusFilter === 'inactive') {
      list = list.filter((s) => !flashActiveBySponsorId[s.id]);
    }

    if (sortBy === 'name') {
      list.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
    } else if (sortBy === 'start') {
      list.sort((a, b) =>
        String(flashMap[a.id]?.start_date || '').localeCompare(String(flashMap[b.id]?.start_date || ''))
      );
    } else if (sortBy === 'end') {
      list.sort((a, b) =>
        String(flashMap[a.id]?.end_date || '').localeCompare(String(flashMap[b.id]?.end_date || ''))
      );
    }

    return list;
  }, [visibleSponsors, ownerFilter, trustId, deferredListSearch, statusFilter, sortBy, flashMap, flashActiveBySponsorId]);

  const PAGE_SIZE = 10;
  const totalPages = Math.max(1, Math.ceil(panelSponsors.length / PAGE_SIZE));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedSponsors = useMemo(() => {
    const startIndex = (safeCurrentPage - 1) * PAGE_SIZE;
    return panelSponsors.slice(startIndex, startIndex + PAGE_SIZE);
  }, [panelSponsors, safeCurrentPage]);

  const detailSponsor = useMemo(
    () => (detailSponsorId ? sponsorsById.get(detailSponsorId) || null : null),
    [sponsorsById, detailSponsorId]
  );

  const canEditSponsorId = (sponsorId) => editableSponsorIds.has(sponsorId);

  const flashInfo = useMemo(
    () => (flashInfoSponsorId ? flashMap[flashInfoSponsorId] : null),
    [flashInfoSponsorId, flashMap]
  );

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError('');
      const { data: sponsorsData, error: sponsorsErr } = await fetchSponsors();
      if (sponsorsErr) setError(sponsorsErr.message || 'Unable to load sponsors.');
      setSponsors(sponsorsData || []);
      setLoading(false);

      const { data: flashData, error: flashErr } = await fetchSponsorFlashByTrust(trustId);
      if (flashErr) setError(flashErr.message || 'Unable to load sponsor flash data.');
      const flashBySponsor = {};
      (flashData || []).forEach((row) => {
        flashBySponsor[row.sponsor_id] = row;
      });
      setFlashMap(flashBySponsor);
    };
    if (trustId) load();
  }, [trustId]);

  useLayoutEffect(() => {
    if (!isCreateMode) return;
    setSelectedId(null);
    setForm(createEmptyForm());
    setShowContact2(false);
    setShowContact3(false);
    setShowEmail2(false);
    setShowEmail3(false);
    setShowAddress2(false);
    setShowAddress3(false);
    setSaveError('');
    setNumberWarning('');
    if (!showForm) setShowForm(true);
  }, [isCreateMode, location.key, showForm]);

  useEffect(() => {
    if (isCreateMode) {
      setForm(createEmptyForm());
      setShowContact2(false);
      setShowContact3(false);
      setShowEmail2(false);
      setShowEmail3(false);
      setShowAddress2(false);
      setShowAddress3(false);
      setNumberWarning('');
      return;
    }
    if (selectedSponsor) {
      const whatsappData = splitWhatsappForForm(selectedSponsor.whatsapp_number);
      setForm({
        name: selectedSponsor.name || '',
        position: selectedSponsor.position || '',
        position2: selectedSponsor.position2 || '',
        about: selectedSponsor.about || '',
        photo_url: selectedSponsor.photo_url || '',
        company_name: selectedSponsor.company_name || '',
        coPartner: selectedSponsor.coPartner || '',
        ContactNumber1: selectedSponsor.ContactNumber1 || selectedSponsor.phone || '',
        contactNumber2: selectedSponsor.contactNumber2 != null ? String(selectedSponsor.contactNumber2) : '',
        contactNumber3: selectedSponsor.contactNumber3 != null ? String(selectedSponsor.contactNumber3) : '',
        email_id1: selectedSponsor.email_id1 || selectedSponsor.email_id || '',
        emailId2: selectedSponsor.emailId2 || '',
        emailId3: selectedSponsor.emailId3 || '',
        address: selectedSponsor.address || '',
        address2: selectedSponsor.address2 || '',
        address3: selectedSponsor.address3 || '',
        city: selectedSponsor.city || '',
        state: selectedSponsor.state || '',
        whatsapp_country: whatsappData.country,
        whatsapp_number: whatsappData.local,
        facebook: selectedSponsor.facebook || '',
        instagram: selectedSponsor.instagram || '',
        X: selectedSponsor.X || '',
        linkedin: selectedSponsor.linkedin || '',
        website_url: selectedSponsor.website_url || '',
        catalog_url: selectedSponsor.catalog_url || '',
        badge_label: selectedSponsor.badge_label || 'OFFICIAL SPONSOR',
      });
      const hasContact2 = !!String(selectedSponsor.contactNumber2 ?? '').trim();
      const hasContact3 = !!String(selectedSponsor.contactNumber3 ?? '').trim();
      setShowContact2(hasContact2 || hasContact3);
      setShowContact3(hasContact3);
      const hasEmail2 = !!String(selectedSponsor.emailId2 || '').trim();
      const hasEmail3 = !!String(selectedSponsor.emailId3 || '').trim();
      setShowEmail2(hasEmail2 || hasEmail3);
      setShowEmail3(hasEmail3);
      const hasAddress2 = !!String(selectedSponsor.address2 || '').trim();
      const hasAddress3 = !!String(selectedSponsor.address3 || '').trim();
      setShowAddress2(hasAddress2 || hasAddress3);
      setShowAddress3(hasAddress3);
      setNumberWarning('');
    } else {
      setForm(createEmptyForm());
      setShowContact2(false);
      setShowContact3(false);
      setShowEmail2(false);
      setShowEmail3(false);
      setShowAddress2(false);
      setShowAddress3(false);
      setNumberWarning('');
    }
  }, [selectedSponsor, flashMap, isCreateMode]);

  useEffect(() => {
    if (isCreateMode || isEditRoute || showForm) return;
    if (!panelSponsors.length) return;
    const exists = panelSponsors.some((s) => s.id === selectedId);
    if (!exists) setSelectedId(panelSponsors[0].id);
  }, [panelSponsors, selectedId, isCreateMode, isEditRoute, showForm]);

  useEffect(() => {
    if (!isEditRoute) return;
    if (!sponsors.length) return;

    const routeSponsorId =
      editSponsorIdFromRouteState && editableSponsorIds.has(editSponsorIdFromRouteState)
        ? editSponsorIdFromRouteState
        : null;
    const currentEditableId =
      selectedId && editableSponsorIds.has(selectedId) ? selectedId : null;
    const fallbackEditableId = sponsors.find((s) => editableSponsorIds.has(s.id))?.id || null;
    const nextEditableId = routeSponsorId || currentEditableId || fallbackEditableId;

    if (!nextEditableId) {
      navigate('/sponsor', { replace: true, state: { userName, trust } });
      return;
    }

    if (selectedId !== nextEditableId) setSelectedId(nextEditableId);
    if (!showForm) setShowForm(true);
  }, [
    isEditRoute,
    sponsors,
    selectedId,
    showForm,
    editableSponsorIds,
    editSponsorIdFromRouteState,
    navigate,
    userName,
    trust,
  ]);

  useEffect(() => {
    if (!isCreateMode && !isEditRoute && location.pathname.includes('/sponsor')) {
      setShowForm(false);
      setSaveError('');
    }
  }, [isCreateMode, isEditRoute, location.pathname]);

  useEffect(() => {
    setCurrentPage(1);
  }, [ownerFilter, statusFilter, sortBy, listSearch]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const handleFile = async (file) => {
    if (!file) return;
    const prepared = await prepareImageFileForUpload(file);
    if (prepared.error || !prepared.file) {
      setSaveError(prepared.error?.message || getAllowedImageFormatsMessage());
      return;
    }
    try {
      const processed = await compressImageToLimit(prepared.file, MAX_SPONSOR_IMAGE_SIZE_BYTES);
      if (!processed?.file) {
        setSaveError(`Image is too large and could not be compressed to ${Math.floor(MAX_SPONSOR_IMAGE_SIZE_BYTES / 1024)}KB.`);
        return;
      }
      const dataUrl = await blobToDataUrl(processed.file);
      setForm(prev => ({ ...prev, photo_url: dataUrl }));
      setSaveError(prepared.warning || '');
    } catch {
      setSaveError('Unable to process selected image.');
    }
  };

  const startAdd = () => {
    setSelectedId(null);
    setForm(createEmptyForm());
    setShowContact2(false);
    setShowContact3(false);
    setShowEmail2(false);
    setShowEmail3(false);
    setShowAddress2(false);
    setShowAddress3(false);
    setSaveError('');
    setNumberWarning('');
    setShowForm(true);
    navigate('/sponsor/create_sponsor', {
      state: { userName, trust, sponsorFormMode: 'create', sponsorFormNonce: Date.now() },
    });
  };

  const openEditSponsor = (sponsorId) => {
    if (!sponsorId) return;
    setSelectedId(sponsorId);
    setShowForm(true);
    setSaveError('');
    setNumberWarning('');
    navigate('/sponsor/edit_sponsor', {
      state: { userName, trust, editSponsorId: sponsorId },
    });
  };

  const handleNumericInputChange = (field, rawValue, label, maxLength = 15) => {
    const raw = String(rawValue ?? '');
    const sanitized = sanitizeDigits(raw, maxLength);
    setNumberWarning(/\D/.test(raw) ? `Only numbers are allowed in ${label}.` : '');
    setForm((prev) => ({ ...prev, [field]: sanitized }));
  };


  const openPicker = () => {
    setSearchTerm('');
    setShowPicker(true);
  };

  const openAdvertisementForSponsor = (sponsorId) => {
    openFlashEditor(sponsorId);
    setShowPicker(false);
  };

  const openDetail = (sponsorId) => {
    setDetailSponsorId(sponsorId);
    setShowDetailModal(true);
  };

  const openFlashEditor = (sponsorId) => {
    const existing = flashMap[sponsorId];
    setFlashSponsorId(sponsorId);
    setFlashForm({
      start_date: existing?.start_date || '',
      end_date: existing?.end_date || '',
      duration_seconds: existing?.duration_seconds != null ? String(existing.duration_seconds) : '5',
      priority: existing?.priority != null ? String(existing.priority) : '',
    });
    setFlashError('');
    setShowFlashModal(true);
  };

  const openFlashInfo = (sponsorId) => {
    setFlashInfoSponsorId(sponsorId);
    setShowFlashInfoModal(true);
  };

  const handleSaveFlash = async () => {
    if (!flashSponsorId) return;
    setFlashError('');
    const duration = Number(flashForm.duration_seconds);
    if (Number.isNaN(duration) || duration <= 0) {
      setFlashError('Duration (sec) must be a positive number.');
      return;
    }
    const startDate = flashForm.start_date || null;
    const endDate = flashForm.end_date || null;
    if (startDate && endDate && startDate > endDate) {
      setFlashError('Start date must be before or equal to end date.');
      return;
    }
    const payload = {
      trust_id: trustId,
      sponsor_id: flashSponsorId,
      start_date: startDate,
      end_date: endDate,
      duration_seconds: duration,
      priority: flashForm.priority ? Number(flashForm.priority) : null,
    };
    const existing = flashMap[flashSponsorId];
    const action = existing?.id
      ? updateSponsorFlash(existing.id, payload)
      : createSponsorFlash(payload);
    const { data, error: err } = await action;
    if (err) {
      setFlashError(err.message || 'Unable to update status.');
      return;
    }
    if (data) {
      setFlashMap((prev) => ({ ...prev, [flashSponsorId]: data }));
      setHiddenIds((prev) => {
        const next = new Set(prev);
        next.delete(flashSponsorId);
        return next;
      });
      setShowFlashModal(false);
    }
  };

  const handleRemoveFromView = async (id) => {
    const ok = window.confirm('Remove this sponsor from sponsor flash? This will keep sponsor master data intact.');
    if (!ok) return;
    const flash = flashMap[id];
    if (!flash?.id) {
      setHiddenIds((prev) => new Set([...prev, id]));
      if (selectedId === id) setSelectedId(null);
      return;
    }

    const { error: err } = await deleteSponsorFlash(flash.id);
    if (err) {
      setError(err.message || 'Unable to remove sponsor from sponsor flash.');
      return;
    }

    setFlashMap((prev) => {
      const next = { ...prev };
      delete next[id];
      return next;
    });
    setHiddenIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    if (selectedId === id) setSelectedId(null);
  };

  const handleSave = async () => {
    setSaveError('');
    const isEditMode = formMode === 'edit' && !!selectedId;
    if (!form.name.trim()) {
      setSaveError('Name is required.');
      return;
    }
    if (!form.company_name.trim()) {
      setSaveError('Company name is required.');
      return;
    }
    if (isEditMode && !canEditSponsorId(selectedId)) {
      setSaveError('You can only edit sponsors linked to your trust.');
      return;
    }
    const defaultWhatsappCountry = getWhatsappCountry(DEFAULT_WHATSAPP_COUNTRY);
    const countryDigits = sanitizeDigits(defaultWhatsappCountry.dialCode, 4);
    const localMaxLength = Math.max(4, 15 - countryDigits.length);
    const whatsappDigits = sanitizeDigits(form.whatsapp_number, localMaxLength);
    const contactNumber2Digits = sanitizeDigits(form.contactNumber2, 15);
    const contactNumber3Digits = sanitizeDigits(form.contactNumber3, 15);
    const whatsappInternationalDigits = whatsappDigits
      ? `${countryDigits}${whatsappDigits}`.slice(0, 15)
      : '';

    let resolvedPhotoUrl = String(form.photo_url || '').trim();
    if (resolvedPhotoUrl.startsWith('data:image/')) {
      const { data: uploadData, error: uploadError } = await uploadSponsorPhotoDataUrl(resolvedPhotoUrl, { trustId });
      if (uploadError || !uploadData?.publicUrl) {
        setSaveError(uploadError?.message || 'Unable to upload sponsor photo.');
        return;
      }
      if (uploadData?.warning) setSaveError(uploadData.warning);
      resolvedPhotoUrl = uploadData.publicUrl;
    }

    const payload = {
      name: form.name.trim(),
      position: form.position.trim() || null,
      position2: form.position2.trim() || null,
      about: form.about.trim() || null,
      photo_url: resolvedPhotoUrl || null,
      company_name: form.company_name.trim(),
      coPartner: form.coPartner.trim() || null,
      trust_id: trustId,
      ref_no: isEditMode
        ? (selectedSponsor?.ref_no ?? null)
        : (Math.max(0, ...sponsors.map(s => Number(s.ref_no) || 0)) + 1),
      ContactNumber1: sanitizeDigits(form.ContactNumber1, 15) || null,
      contactNumber2: contactNumber2Digits ? Number(contactNumber2Digits) : null,
      contactNumber3: contactNumber3Digits ? Number(contactNumber3Digits) : null,
      email_id1: form.email_id1.trim() || null,
      emailId2: form.emailId2.trim() || null,
      emailId3: form.emailId3.trim() || null,
      address: form.address.trim() || null,
      address2: form.address2.trim() || null,
      address3: form.address3.trim() || null,
      city: form.city.trim() || null,
      state: form.state.trim() || null,
      whatsapp_number: whatsappInternationalDigits ? Number(whatsappInternationalDigits) : null,
      facebook: form.facebook.trim() || null,
      instagram: form.instagram.trim() || null,
      X: form.X.trim() || null,
      linkedin: form.linkedin.trim() || null,
      website_url: form.website_url.trim() || null,
      catalog_url: form.catalog_url.trim() || null,
      badge_label: form.badge_label.trim() || 'OFFICIAL SPONSOR',
    };

    setSaving(true);
    if (isEditMode) {
      const { data, error: err } = await updateSponsor(selectedId, payload);
      if (err) {
        setSaveError(err.message || 'Unable to update sponsor.');
      } else if (data) {
        setSponsors(prev => prev.map(s => (s.id === selectedId ? data : s)));
        if (isEditRoute) {
          navigate('/sponsor', { state: { userName, trust } });
        } else {
          setShowForm(false);
        }
      }
    } else {
      const { data, error: err } = await createSponsor(payload);
      if (err) {
        setSaveError(err.message || 'Unable to create sponsor.');
      } else if (data) {
        setSponsors(prev => [data, ...prev]);
        if (isCreateMode) {
          navigate('/sponsor', { state: { userName, trust } });
        } else {
          setSelectedId(data.id);
          setShowForm(false);
          setShowPicker(true);
          setSearchTerm(data.name || '');
        }
      }
    }
    setSaving(false);
  };

  const previewName = form.name?.trim() || 'Sponsor Name';
  const previewCompany = form.company_name?.trim() || 'Company Name';
  const previewCoPartner = form.coPartner?.trim() || '';
  const previewRole = [form.position?.trim(), form.position2?.trim()].filter(Boolean).join(' • ') || 'Role';
  const previewAbout = form.about?.trim() || 'Sponsor description will appear here.';
  const previewBadge = form.badge_label?.trim() || 'OFFICIAL SPONSOR';
  const previewPrimaryContact = form.ContactNumber1?.trim() || '';
  const previewWhatsapp = form.whatsapp_number?.trim() || '';
  const previewWebsite = form.website_url?.trim() || '';
  const selectedPreviewName = selectedSponsor?.name?.trim() || 'Sponsor Name';
  const selectedPreviewCompany = selectedSponsor?.company_name?.trim() || 'Company Name';
  const selectedPreviewCoPartner = selectedSponsor?.coPartner?.trim() || '';
  const selectedPreviewRole = [selectedSponsor?.position?.trim(), selectedSponsor?.position2?.trim()].filter(Boolean).join(' | ') || 'Role';
  const selectedPreviewAbout = selectedSponsor?.about?.trim() || 'Sponsor description will appear here.';
  const selectedPreviewBadge = selectedSponsor?.badge_label?.trim() || 'OFFICIAL SPONSOR';
  const selectedPreviewPrimaryContact = String(selectedSponsor?.ContactNumber1 || selectedSponsor?.phone || '').trim();
  const selectedPreviewWhatsapp = String(selectedSponsor?.whatsapp_number || '').trim();
  const selectedPreviewWebsite = selectedSponsor?.website_url?.trim() || '';
  const selectedPriority = selectedSponsor ? flashMap[selectedSponsor.id]?.priority : null;

  return (
    <div className="sp-root">
      <Sidebar
        trustName={trust?.name || 'Trust'}
        onDashboard={() => navigate('/dashboard', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
        onLogout={() => navigate('/login')}
      />

      <main className="sp-main">
        <PageHeader
          title="Sponsors"
          subtitle="Manage sponsor profiles and details"
          onBack={() => {
            if (isCreateMode || isEditRoute) {
              setShowForm(false);
              setSaveError('');
              navigate('/sponsor', { state: { userName, trust } });
              return;
            }
            navigate('/dashboard', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
          }}
          right={null}
        />

        {error && <div className="sp-error">{error}</div>}

        <div className={`sp-content ${isCreateMode || isEditRoute || showForm ? 'form-only' : ''}`}>
          {!isCreateMode && !isEditRoute && !showForm && (
            <section className="sp-profile-layout">
              <aside className="sp-left-panel">
                <div className="sp-left-head">
                  <h3>All Sponsors</h3>
                  <span className="sp-left-count">{totalSponsorCount}</span>
                </div>

                <div className="sp-owner-tabs">
                  <button
                    type="button"
                    className={`sp-owner-tab ${ownerFilter === 'my' ? 'active my' : ''}`}
                    onClick={() => setOwnerFilter('my')}
                  >
                    <span>My</span>
                    <b>{mySponsorCount}</b>
                  </button>
                  <button
                    type="button"
                    className={`sp-owner-tab ${ownerFilter === 'others' ? 'active others' : ''}`}
                    onClick={() => setOwnerFilter('others')}
                  >
                    <span>Others</span>
                    <b>{otherSponsorCount}</b>
                  </button>
                </div>

                <div className="sp-filter-head">Role</div>
                <div className="sp-role-tabs">
                  <button
                    type="button"
                    className={`sp-role-tab ${statusFilter === 'all' ? 'active all' : ''}`}
                    onClick={() => setStatusFilter('all')}
                  >
                    <span>All</span>
                    <b>{ownerScopedSponsors.length}</b>
                  </button>
                  <button
                    type="button"
                    className={`sp-role-tab ${statusFilter === 'active' ? 'active active' : ''}`}
                    onClick={() => setStatusFilter('active')}
                  >
                    <span>Active</span>
                    <b>{activeSponsorCount}</b>
                  </button>
                  <button
                    type="button"
                    className={`sp-role-tab ${statusFilter === 'inactive' ? 'active inactive' : ''}`}
                    onClick={() => setStatusFilter('inactive')}
                  >
                    <span>Inactive</span>
                    <b>{inactiveSponsorCount}</b>
                  </button>
                </div>

                <input
                  className="sp-left-search"
                  placeholder="Search sponsor..."
                  value={listSearch}
                  onChange={(e) => setListSearch(e.target.value)}
                />

                <button className="sp-left-create-btn" onClick={startAdd} type="button">
                  + Create New Sponsor
                </button>

                <div className="sp-filter-row">
                  <label className="sp-inline-field">
                    <span>Sort By</span>
                    <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}>
                      <option value="name">Name A-Z</option>
                      <option value="start">Start Date</option>
                      <option value="end">End Date</option>
                    </select>
                  </label>
                </div>

                <div className="sp-members-scroll-area">
                  <div className="sp-left-list">
                    {loading && <div className="sp-loading">Loading sponsors...</div>}
                    {!loading && panelSponsors.length === 0 && (
                      <div className="sp-empty">
                        <div className="sp-empty-icon">+</div>
                        <h3>No sponsors</h3>
                        <p>No sponsor matched your filter.</p>
                      </div>
                    )}
                    {!loading && paginatedSponsors.map((s) => (
                      <button
                        key={s.id}
                        className={`sp-left-item ${selectedId === s.id ? 'active' : ''}`}
                        onClick={() => setSelectedId(s.id)}
                        type="button"
                      >
                        <div className="sp-left-item-top">
                          <div className="sp-left-avatar">
                            {s.photo_url
                              ? <img src={s.photo_url} alt={s.name} />
                              : <span>{initials(s.name)}</span>
                            }
                          </div>
                          {flashMap[s.id]?.priority != null && (
                            <div className="sp-priority-badge">
                              Priority: {flashMap[s.id].priority}
                            </div>
                          )}
                        </div>
                        <div className="sp-left-item-body">
                          <div className="sp-left-item-title">{s.name}</div>
                          <div className="sp-left-item-sub">{s.company_name || 'No company'}</div>
                        </div>
                      </button>
                    ))}
                  </div>

                  {!loading && panelSponsors.length > 0 && (
                    <div className="sp-left-pagination">
                      <button
                        type="button"
                        onClick={() => setCurrentPage((prev) => Math.max(1, Math.min(prev, totalPages) - 1))}
                        disabled={safeCurrentPage <= 1}
                      >
                        Prev
                      </button>
                      <span>Page {safeCurrentPage} / {totalPages}</span>
                      <button
                        type="button"
                        onClick={() => setCurrentPage((prev) => Math.min(totalPages, Math.min(prev, totalPages) + 1))}
                        disabled={safeCurrentPage >= totalPages}
                      >
                        Next
                      </button>
                    </div>
                  )}
                </div>
              </aside>

              <section className="sp-right-panel">
                {!loading && selectedSponsor && (
                  <>
                    <div className="sp-profile-public-preview">
                      <div className="sp-public-preview-head">
                        <h4>Public Facing Card Preview</h4>
                        <p>App card size preview</p>
                      </div>
                      <div className="sp-public-preview-body">
                        <article className="sp-public-face">
                          <div className="sp-public-badge-row">
                            <span className="sp-public-badge">{selectedPreviewBadge}</span>
                          </div>
                          <div className="sp-public-main">
                            <div className="sp-public-avatar">
                              {selectedSponsor.photo_url ? (
                                <img src={selectedSponsor.photo_url} alt={selectedPreviewName} />
                              ) : (
                                <span>{initials(selectedPreviewName)}</span>
                              )}
                            </div>
                            <div className="sp-public-content">
                              <h5>{selectedPreviewName}</h5>
                              <div className="sp-public-company">
                                <span>{selectedPreviewCompany}</span>
                                {selectedPreviewCoPartner && <span className="sp-public-company-sep">|</span>}
                                {selectedPreviewCoPartner && <span>{selectedPreviewCoPartner}</span>}
                              </div>
                              <div className="sp-public-role">{selectedPreviewRole}</div>
                              <p>{selectedPreviewAbout}</p>
                            </div>
                          </div>
                        <div className="sp-public-actions">
                          {selectedPreviewPrimaryContact && <span>{selectedPreviewPrimaryContact}</span>}
                          {selectedPreviewWhatsapp && <span>WhatsApp</span>}
                          {selectedPreviewWebsite && <span>Website</span>}
                        </div>
                        {selectedPriority != null && (
                          <div className="sp-selected-priority">
                            Priority: {selectedPriority}
                          </div>
                        )}
                      </article>

                        <div className="sp-public-preview-side">
                          <p className="sp-public-owner-tag">
                            {canEditSponsorId(selectedSponsor.id) ? 'My Sponsor' : 'Other Sponsor'}
                          </p>
                          <div className="sp-profile-hero-actions sp-profile-hero-actions-preview">
                            <select
                              className={`sp-role-select ${flashActiveBySponsorId[selectedSponsor.id] ? 'active' : 'inactive'}`}
                              value={flashActiveBySponsorId[selectedSponsor.id] ? 'active' : 'inactive'}
                              onChange={(e) => {
                                const next = e.target.value;
                                if (next === 'active') openFlashEditor(selectedSponsor.id);
                                else if (flashActiveBySponsorId[selectedSponsor.id]) openFlashInfo(selectedSponsor.id);
                              }}
                            >
                              <option value="active">Active</option>
                              <option value="inactive">Inactive</option>
                            </select>
                            <button
                              className="sp-icon-btn danger"
                              onClick={() => handleRemoveFromView(selectedSponsor.id)}
                              type="button"
                            >
                              Remove
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="sp-profile-details">
                      <div className="sp-profile-details-head">
                        <h3>Sponsor Details</h3>
                        <div className="sp-profile-head-actions">
                          <button className="sp-icon-btn" onClick={() => openDetail(selectedSponsor.id)} type="button">
                            View Details
                          </button>
                          {canEditSponsorId(selectedSponsor.id) && (
                            <button
                              className="sp-primary"
                              onClick={() => {
                                openEditSponsor(selectedSponsor.id);
                              }}
                              type="button"
                            >
                              Edit Details
                            </button>
                          )}
                        </div>
                      </div>

                      <div className="sp-profile-detail-grid">
                        <div><span>Company</span><strong>{selectedSponsor.company_name || '—'}</strong></div>
                        <div><span>Role / Position</span><strong>{selectedSponsor.position || '—'}</strong></div>
                        <div><span>Contact Number 1</span><strong>{selectedSponsor.ContactNumber1 || selectedSponsor.phone || '—'}</strong></div>
                        <div><span>Email ID 1</span><strong>{selectedSponsor.email_id1 || selectedSponsor.email_id || '—'}</strong></div>
                        <div><span>Start Date</span><strong>{flashMap[selectedSponsor.id]?.start_date || '—'}</strong></div>
                        <div><span>End Date</span><strong>{flashMap[selectedSponsor.id]?.end_date || '—'}</strong></div>
                      </div>
                    </div>
                  </>
                )}
              </section>
            </section>
          )}

          {(isCreateMode || isEditRoute || showForm) && (
            <section className="sp-form">
              <div className="sp-form-layout">
                <div className="sp-form-card">
                  <div className="sp-form-title">
                    {formMode === 'edit' ? 'Edit Sponsor' : 'Add Sponsor'}
                  </div>

                  <div className="sp-form-section">
                    <div className="sp-form-section-title">Public Facing Card</div>
                    <div className="sp-grid">
                      <label className="sp-field">
                        <span>Name *</span>
                        <input value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} />
                      </label>
                      <label className="sp-field">
                        <span>Company Name *</span>
                        <input value={form.company_name} onChange={e => setForm(p => ({ ...p, company_name: e.target.value }))} />
                      </label>
                      <label className="sp-field">
                        <span>Position</span>
                        <input value={form.position} onChange={e => setForm(p => ({ ...p, position: e.target.value }))} />
                      </label>
                      <label className="sp-field">
                        <span>Position 2</span>
                        <input value={form.position2} onChange={e => setForm(p => ({ ...p, position2: e.target.value }))} />
                      </label>
                      <label className="sp-field">
                        <span>Co Partner</span>
                        <input value={form.coPartner} onChange={e => setForm(p => ({ ...p, coPartner: e.target.value }))} />
                      </label>
                      <label className="sp-field">
                        <span>Badge Label</span>
                        <input value={form.badge_label} onChange={e => setForm(p => ({ ...p, badge_label: e.target.value }))} />
                      </label>
                      <label className="sp-field">
                        <span>Website URL</span>
                        <input value={form.website_url} onChange={e => setForm(p => ({ ...p, website_url: e.target.value }))} />
                      </label>
                      <label className="sp-field">
                        <span>Catalog URL</span>
                        <input value={form.catalog_url} onChange={e => setForm(p => ({ ...p, catalog_url: e.target.value }))} />
                      </label>
                      <label className="sp-field sp-span-2">
                        <span>About</span>
                        <textarea rows="3" value={form.about} onChange={e => setForm(p => ({ ...p, about: e.target.value }))} />
                      </label>
                      <div className="sp-field sp-span-2">
                        <span>Photo URL (drag & drop)</span>
                        <p className="sp-upload-note">Max file size: 25 KB</p>
                        <label
                          className={`sp-drop ${dragOver ? 'drag' : ''}`}
                          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                          onDragLeave={() => setDragOver(false)}
                          onDrop={e => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files[0]); }}
                        >
                          <input
                            type="file"
                            accept="image/*"
                            onChange={e => handleFile(e.target.files?.[0])}
                          />
                          <div className="sp-drop-inner">
                            <span>Drag & drop image here</span>
                            <span className="sp-drop-sub">or click to upload</span>
                          </div>
                        </label>
                        {form.photo_url && (
                          <div className="sp-photo-preview">
                            <img src={form.photo_url} alt="Preview" />
                            <button className="sp-link" type="button" onClick={() => setForm(p => ({ ...p, photo_url: '' }))}>
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="sp-form-section">
                    <div className="sp-form-section-title">Company Details Card</div>
                    <div className="sp-grid">
                      <label className="sp-field">
                        <span>Contact Number 1</span>
                        <div className="sp-input-with-actions">
                          <input
                            inputMode="numeric"
                            pattern="[0-9]*"
                            value={form.ContactNumber1}
                            onChange={e => handleNumericInputChange('ContactNumber1', e.target.value, 'Contact Number 1', 15)}
                          />
                          {!showContact2 && (
                            <button
                              type="button"
                              className="sp-input-action-btn"
                              title="Add Contact Number 2"
                              onClick={() => setShowContact2(true)}
                            >
                              +
                            </button>
                          )}
                        </div>
                      </label>
                      <label className="sp-field">
                        <span>Email ID 1</span>
                        <div className="sp-input-with-actions">
                          <input value={form.email_id1} onChange={e => setForm(p => ({ ...p, email_id1: e.target.value }))} />
                          {!showEmail2 && (
                            <button
                              type="button"
                              className="sp-input-action-btn"
                              title="Add Email ID 2"
                              onClick={() => setShowEmail2(true)}
                            >
                              +
                            </button>
                          )}
                        </div>
                      </label>
                      {showContact2 && (
                        <label className="sp-field">
                          <span>Contact Number 2</span>
                          <div className="sp-input-with-actions">
                            <input
                              type="tel"
                              inputMode="numeric"
                              value={form.contactNumber2}
                              onChange={e => handleNumericInputChange('contactNumber2', e.target.value, 'Contact Number 2', 15)}
                            />
                            {!showContact3 && (
                              <button
                                type="button"
                                className="sp-input-action-btn"
                                title="Add Contact Number 3"
                                onClick={() => setShowContact3(true)}
                              >
                                +
                              </button>
                            )}
                            <button
                              type="button"
                              className="sp-input-action-btn remove"
                              title="Remove Contact Number 2"
                              onClick={() => {
                                setForm((p) => ({
                                  ...p,
                                  contactNumber2: '',
                                  contactNumber3: '',
                                }));
                                setShowContact2(false);
                                setShowContact3(false);
                              }}
                            >
                              -
                            </button>
                          </div>
                        </label>
                      )}
                      {showEmail2 && (
                        <label className="sp-field">
                          <span>Email ID 2</span>
                          <div className="sp-input-with-actions">
                            <input value={form.emailId2} onChange={e => setForm(p => ({ ...p, emailId2: e.target.value }))} />
                            {!showEmail3 && (
                              <button
                                type="button"
                                className="sp-input-action-btn"
                                title="Add Email ID 3"
                                onClick={() => setShowEmail3(true)}
                              >
                                +
                              </button>
                            )}
                            <button
                              type="button"
                              className="sp-input-action-btn remove"
                              title="Remove Email ID 2"
                              onClick={() => {
                                setForm((p) => ({ ...p, emailId2: '', emailId3: '' }));
                                setShowEmail2(false);
                                setShowEmail3(false);
                              }}
                            >
                              -
                            </button>
                          </div>
                        </label>
                      )}
                      {showEmail3 && (
                        <label className="sp-field">
                          <span>Email ID 3</span>
                          <div className="sp-input-with-actions">
                            <input value={form.emailId3} onChange={e => setForm(p => ({ ...p, emailId3: e.target.value }))} />
                            <button
                              type="button"
                              className="sp-input-action-btn remove"
                              title="Remove Email ID 3"
                              onClick={() => {
                                setForm((p) => ({ ...p, emailId3: '' }));
                                setShowEmail3(false);
                              }}
                            >
                              -
                            </button>
                          </div>
                        </label>
                      )}
                      {showContact3 && (
                        <label className="sp-field">
                          <span>Contact Number 3</span>
                          <div className="sp-input-with-actions">
                            <input
                              type="tel"
                              inputMode="numeric"
                              value={form.contactNumber3}
                              onChange={e => handleNumericInputChange('contactNumber3', e.target.value, 'Contact Number 3', 15)}
                            />
                            <button
                              type="button"
                              className="sp-input-action-btn remove"
                              title="Remove Contact Number 3"
                              onClick={() => {
                                setForm((p) => ({ ...p, contactNumber3: '' }));
                                setShowContact3(false);
                              }}
                            >
                              -
                            </button>
                          </div>
                        </label>
                      )}
                      <label className="sp-field sp-span-2">
                        <span>Address 1</span>
                        <div className="sp-input-with-actions">
                          <input value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} />
                          {!showAddress2 && (
                            <button
                              type="button"
                              className="sp-input-action-btn"
                              title="Add Address 2"
                              onClick={() => setShowAddress2(true)}
                            >
                              +
                            </button>
                          )}
                        </div>
                      </label>
                      {showAddress2 && (
                        <label className="sp-field sp-span-2">
                          <span>Address 2</span>
                          <div className="sp-input-with-actions">
                            <input value={form.address2} onChange={e => setForm(p => ({ ...p, address2: e.target.value }))} />
                            {!showAddress3 && (
                              <button
                                type="button"
                                className="sp-input-action-btn"
                                title="Add Address 3"
                                onClick={() => setShowAddress3(true)}
                              >
                                +
                              </button>
                            )}
                            <button
                              type="button"
                              className="sp-input-action-btn remove"
                              title="Remove Address 2"
                              onClick={() => {
                                setForm((p) => ({ ...p, address2: '', address3: '' }));
                                setShowAddress2(false);
                                setShowAddress3(false);
                              }}
                            >
                              -
                            </button>
                          </div>
                        </label>
                      )}
                      {showAddress3 && (
                        <label className="sp-field sp-span-2">
                          <span>Address 3</span>
                          <div className="sp-input-with-actions">
                            <input value={form.address3} onChange={e => setForm(p => ({ ...p, address3: e.target.value }))} />
                            <button
                              type="button"
                              className="sp-input-action-btn remove"
                              title="Remove Address 3"
                              onClick={() => {
                                setForm((p) => ({ ...p, address3: '' }));
                                setShowAddress3(false);
                              }}
                            >
                              -
                            </button>
                          </div>
                        </label>
                      )}
                      <label className="sp-field">
                        <span>City</span>
                        <input value={form.city} onChange={e => setForm(p => ({ ...p, city: e.target.value }))} />
                      </label>
                      <label className="sp-field">
                        <span>State</span>
                        <input value={form.state} onChange={e => setForm(p => ({ ...p, state: e.target.value }))} />
                      </label>
                      <label className="sp-field">
                        <span>WhatsApp No</span>
                        <div className="sp-whatsapp-row">
                          <input
                            type="tel"
                            inputMode="numeric"
                            autoComplete="tel-national"
                            pattern="[0-9]*"
                            maxLength={13}
                            placeholder="WhatsApp number"
                            value={form.whatsapp_number}
                            onChange={(e) => handleNumericInputChange('whatsapp_number', e.target.value, 'WhatsApp number', 13)}
                            onKeyDown={(e) => {
                              if (['e', 'E', '+', '-', '.'].includes(e.key)) {
                                e.preventDefault();
                              }
                            }}
                          />
                        </div>
                      </label>
                      <label className="sp-field">
                        <span>Facebook</span>
                        <input value={form.facebook} onChange={e => setForm(p => ({ ...p, facebook: e.target.value }))} />
                      </label>
                      <label className="sp-field">
                        <span>Instagram</span>
                        <input value={form.instagram} onChange={e => setForm(p => ({ ...p, instagram: e.target.value }))} />
                      </label>
                      <label className="sp-field">
                        <span>X</span>
                        <input value={form.X} onChange={e => setForm(p => ({ ...p, X: e.target.value }))} />
                      </label>
                      <label className="sp-field">
                        <span>LinkedIn</span>
                        <input value={form.linkedin} onChange={e => setForm(p => ({ ...p, linkedin: e.target.value }))} />
                      </label>
                    </div>
                  </div>

                  {numberWarning && <div className="sp-warning">{numberWarning}</div>}
                  {saveError && <div className="sp-error">{saveError}</div>}

                  <div className="sp-form-actions">
                    <button
                      className="sp-secondary"
                      onClick={() => {
                        if (isCreateMode || isEditRoute) {
                          navigate('/sponsor', { state: { userName, trust } });
                          return;
                        }
                        setShowForm(false);
                        setSelectedId(null);
                        setSaveError('');
                      }}
                      type="button"
                    >
                      Close
                    </button>
                    <button className="sp-primary" onClick={handleSave} disabled={saving} type="button">
                      {saving ? 'Saving...' : 'Save Sponsor'}
                    </button>
                  </div>
                </div>

                <aside className="sp-public-preview-card">
                  <div className="sp-public-preview-head">
                    <h4>Public Facing Card Preview</h4>
                    <p>Only public-facing card preview</p>
                  </div>
                  <article className="sp-public-face">
                    <div className="sp-public-badge-row">
                      <span className="sp-public-badge">{previewBadge}</span>
                    </div>
                    <div className="sp-public-main">
                      <div className="sp-public-avatar">
                        {form.photo_url ? (
                          <img src={form.photo_url} alt={previewName} />
                        ) : (
                          <span>{initials(previewName)}</span>
                        )}
                      </div>
                      <div className="sp-public-content">
                        <h5>{previewName}</h5>
                        <div className="sp-public-company">
                          <span>{previewCompany}</span>
                          {previewCoPartner && <span className="sp-public-company-sep">|</span>}
                          {previewCoPartner && <span>{previewCoPartner}</span>}
                        </div>
                        <div className="sp-public-role">{previewRole}</div>
                        <p>{previewAbout}</p>
                      </div>
                    </div>
                    <div className="sp-public-actions">
                      {previewPrimaryContact && <span>{previewPrimaryContact}</span>}
                      {previewWhatsapp && <span>WhatsApp</span>}
                      {previewWebsite && <span>Website</span>}
                    </div>
                  </article>
                </aside>
              </div>
            </section>
          )}
        </div>

        {showPicker && (
          <div className="sp-modal-overlay" onClick={() => setShowPicker(false)}>
            <div className="sp-modal" onClick={(e) => e.stopPropagation()}>
              <div className="sp-modal-head">
                <div>
                  <h3>Select Sponsor</h3>
                  <p>Search by name, company, or mobile.</p>
                </div>
                <button className="sp-modal-close" onClick={() => setShowPicker(false)}>×</button>
              </div>
              <div className="sp-modal-search">
                <input
                  placeholder="Search sponsors..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                <button className="sp-add-btn" onClick={() => { setShowPicker(false); startAdd(); }}>
                  Create New Sponsor
                </button>
              </div>
              <div className="sp-modal-list">
                {mySponsorChoices.length > 0 && (
                  <div className="sp-modal-section my">
                    <div className="sp-modal-section-title">My Sponsors</div>
                    {mySponsorChoices.map((s) => {
                      const alreadyAdded = !!flashMap[s.id];
                      const flash = flashMap[s.id];
                      return (
                        <div
                          key={s.id}
                          className="sp-modal-item"
                          onClick={() => openDetail(s.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openDetail(s.id);
                            }
                          }}
                        >
                          <div>
                            <div className="sp-modal-title-row">
                              <div className="sp-modal-title">{s.name}</div>
                              <span className="sp-modal-badge my">My</span>
                            </div>
                            <div className="sp-modal-sub">{s.company_name || 'No company'}</div>
                            <div className="sp-modal-sub">{s.ContactNumber1 || s.phone || ''}</div>
                            {alreadyAdded && (
                              <div className="sp-modal-meta">
                                <span>Start: {flash?.start_date || 'Not set'}</span>
                                <span>End: {flash?.end_date || 'Not set'}</span>
                                <span>Duration: {flash?.duration_seconds ?? 5}s</span>
                                <span>Priority: {flash?.priority ?? '-'}</span>
                              </div>
                            )}
                          </div>
                          <div className="sp-modal-actions">
                            <button
                              className="sp-icon-btn"
                              onClick={(e) => { e.stopPropagation(); openAdvertisementForSponsor(s.id); }}
                            >
                              {alreadyAdded ? 'Edit Launching' : 'Launch Advertisement'}
                            </button>
                            {canEditSponsorId(s.id) && (
                              <button
                                className="sp-icon-btn"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setShowPicker(false);
                                  openEditSponsor(s.id);
                                }}
                                title="Edit"
                              >
                                Edit
                              </button>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {otherSponsorChoices.length > 0 && (
                  <div className="sp-modal-section other">
                    <div className="sp-modal-section-title">Other Sponsors</div>
                    {otherSponsorChoices.map((s) => {
                      const alreadyAdded = !!flashMap[s.id];
                      const flash = flashMap[s.id];
                      return (
                        <div
                          key={s.id}
                          className="sp-modal-item"
                          onClick={() => openDetail(s.id)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openDetail(s.id);
                            }
                          }}
                        >
                          <div>
                            <div className="sp-modal-title-row">
                              <div className="sp-modal-title">{s.name}</div>
                              <span className="sp-modal-badge other">Other</span>
                            </div>
                            <div className="sp-modal-sub">{s.company_name || 'No company'}</div>
                            <div className="sp-modal-sub">{s.ContactNumber1 || s.phone || ''}</div>
                            {alreadyAdded && (
                              <div className="sp-modal-meta">
                                <span>Start: {flash?.start_date || 'Not set'}</span>
                                <span>End: {flash?.end_date || 'Not set'}</span>
                                <span>Duration: {flash?.duration_seconds ?? 5}s</span>
                                <span>Priority: {flash?.priority ?? '-'}</span>
                              </div>
                            )}
                          </div>
                          <div className="sp-modal-actions">
                            <button
                              className="sp-icon-btn"
                              onClick={(e) => { e.stopPropagation(); openAdvertisementForSponsor(s.id); }}
                            >
                              {alreadyAdded ? 'Edit Launching' : 'Launch Advertisement'}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {filteredSponsorChoices.length === 0 && (
                  <div className="sp-modal-empty">No sponsors found.</div>
                )}
              </div>
            </div>
          </div>
        )}

        {showFlashModal && (
          <div className="sp-modal-overlay" onClick={() => setShowFlashModal(false)}>
            <div className="sp-modal" onClick={(e) => e.stopPropagation()}>
              <div className="sp-modal-head">
                <div>
                  <h3>Activate Sponsor</h3>
                  <p>Set schedule and priority.</p>
                </div>
                <button className="sp-modal-close" onClick={() => setShowFlashModal(false)}>×</button>
              </div>
              <div className="sp-modal-form">
                <label>
                  <span>Start Date</span>
                  <input
                    type="date"
                    value={flashForm.start_date}
                    onChange={(e) => setFlashForm((p) => ({ ...p, start_date: e.target.value }))}
                    onFocus={(e) => e.target.showPicker?.()}
                    onClick={(e) => e.target.showPicker?.()}
                  />
                </label>
                <label>
                  <span>End Date</span>
                  <input
                    type="date"
                    value={flashForm.end_date}
                    onChange={(e) => setFlashForm((p) => ({ ...p, end_date: e.target.value }))}
                    onFocus={(e) => e.target.showPicker?.()}
                    onClick={(e) => e.target.showPicker?.()}
                  />
                </label>
                <label>
                  <span>Duration (sec)</span>
                  <input type="number" min="1" value={flashForm.duration_seconds} onChange={(e) => setFlashForm((p) => ({ ...p, duration_seconds: e.target.value }))} />
                </label>
                <label>
                  <span>Priority</span>
                  <input type="number" value={flashForm.priority} onChange={(e) => setFlashForm((p) => ({ ...p, priority: e.target.value }))} />
                </label>
                {flashError && <div className="sp-error">{flashError}</div>}
                <div className="sp-form-actions">
                  <button className="sp-secondary" onClick={() => setShowFlashModal(false)} type="button">Cancel</button>
                  <button className="sp-primary" onClick={handleSaveFlash} type="button">Save</button>
                </div>
              </div>
            </div>
          </div>
        )}

        {showFlashInfoModal && (
          <div className="sp-modal-overlay" onClick={() => setShowFlashInfoModal(false)}>
            <div className="sp-modal sp-detail-modal" onClick={(e) => e.stopPropagation()}>
              <div className="sp-modal-head">
                <div>
                  <h3>Advertisement Details</h3>
                  <p>{flashInfoSponsorId ? sponsors.find(s => s.id === flashInfoSponsorId)?.name : ''}</p>
                </div>
                <button className="sp-modal-close" onClick={() => setShowFlashInfoModal(false)}>×</button>
              </div>
              <div className="sp-detail-info">
                <div><strong>Start Date:</strong> {flashInfo?.start_date || 'Not set'}</div>
                <div><strong>End Date:</strong> {flashInfo?.end_date || 'Not set'}</div>
                <div><strong>Duration:</strong> {(flashInfo?.duration_seconds ?? 5)}s</div>
                <div><strong>Priority:</strong> {flashInfo?.priority ?? '-'}</div>
              </div>
              <div className="sp-detail-actions">
                <button
                  className="sp-icon-btn"
                  onClick={() => {
                    setShowFlashInfoModal(false);
                    if (flashInfoSponsorId) openFlashEditor(flashInfoSponsorId);
                  }}
                >
                  Edit Launching
                </button>
              </div>
            </div>
          </div>
        )}

        {showDetailModal && detailSponsor && (
          <div className="sp-modal-overlay" onClick={() => setShowDetailModal(false)}>
            <div className="sp-modal sp-detail-modal" onClick={(e) => e.stopPropagation()}>
              <div className="sp-modal-head">
                <div>
                  <h3>{detailSponsor.name || 'Sponsor'}</h3>
                  <p>{detailSponsor.company_name || 'No company'}</p>
                </div>
                <button className="sp-modal-close" onClick={() => setShowDetailModal(false)}>×</button>
              </div>
              <div className="sp-detail-body">
                <div className="sp-detail-avatar">
                  {detailSponsor.photo_url
                    ? <img src={detailSponsor.photo_url} alt={detailSponsor.name} />
                    : <span>{initials(detailSponsor.name)}</span>
                  }
                </div>
                <div className="sp-detail-info">
                  {detailSponsor.position && <div><strong>Position:</strong> {detailSponsor.position}</div>}
                  {(detailSponsor.ContactNumber1 || detailSponsor.phone) && <div><strong>Contact Number 1:</strong> {detailSponsor.ContactNumber1 || detailSponsor.phone}</div>}
                  {detailSponsor.whatsapp_number && (
                    <div><strong>WhatsApp:</strong> {formatWhatsappForDisplay(detailSponsor.whatsapp_number)}</div>
                  )}
                  {(detailSponsor.email_id1 || detailSponsor.email_id) && <div><strong>Email ID 1:</strong> {detailSponsor.email_id1 || detailSponsor.email_id}</div>}
                  {detailSponsor.badge_label && <div><strong>Badge:</strong> {detailSponsor.badge_label}</div>}
                  <div><strong>Status:</strong> {flashActiveBySponsorId[detailSponsor.id] ? 'Active' : 'Inactive'}</div>
                </div>
              </div>
              <div className="sp-detail-actions">
                <button className="sp-icon-btn" onClick={() => { setShowDetailModal(false); openAdvertisementForSponsor(detailSponsor.id); }}>
                  {flashMap[detailSponsor.id] ? 'Edit Launching' : 'Launch Advertisement'}
                </button>
                {canEditSponsorId(detailSponsor.id) && (
                  <button
                    className="sp-icon-btn"
                    onClick={() => {
                      setShowDetailModal(false);
                      openEditSponsor(detailSponsor.id);
                    }}
                  >
                    Edit Details
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
