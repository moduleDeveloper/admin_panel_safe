import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import ServiceProviderQuickAddModal from '../components/ServiceProviderQuickAddModal';
import Pagination, { PAGE_SIZE } from '../components/Pagination';
import { fetchWaServicesByTrust } from '../services/waServiceProviderService';
import { createWaMedia, updateWaMedia, uploadWaMediaFile, replaceWaMediaFile } from '../services/waMediaService';
import {
  createWaTemplate,
  fetchWaTemplatesByTrust,
  updateWaTemplate,
} from '../services/waTemplateService';
import './NoticeboardPage.css';

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getInitials(value = '') {
  const safe = String(value || '').trim();
  if (!safe) return 'T';
  return safe.charAt(0).toUpperCase();
}

function formatBytes(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB'];
  let size = value;
  let unitIndex = 0;
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex += 1;
  }
  return `${size.toFixed(unitIndex === 0 ? 0 : 1)} ${units[unitIndex]}`;
}

// `size` is stored in KB in the database.
function bytesToKb(bytes) {
  const value = Number(bytes);
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.round((value / 1024) * 100) / 100;
}

const WHATSAPP_LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'en_US', label: 'English (US)' },
  { value: 'en_GB', label: 'English (UK)' },
  { value: 'hi', label: 'Hindi' },
  { value: 'es', label: 'Spanish' },
  { value: 'es_MX', label: 'Spanish (Mexico)' },
  { value: 'pt_BR', label: 'Portuguese (Brazil)' },
  { value: 'ar', label: 'Arabic' },
  { value: 'fr', label: 'French' },
  { value: 'de', label: 'German' },
  { value: 'id', label: 'Indonesian' },
  { value: 'zh_CN', label: 'Chinese (Simplified)' },
];

const WHATSAPP_TEMPLATE_TYPES = [
  { value: 'marketing', label: 'Marketing' },
  { value: 'utility', label: 'Utility' },
  { value: 'authentication', label: 'Authentication' },
];

function languageLabel(value = '') {
  return WHATSAPP_LANGUAGES.find((lang) => lang.value === value)?.label || value || '-';
}

function createEmptyVar() {
  return { var_key: '', display_label: '' };
}

function extractTemplateVarKeys(text = '') {
  const keys = [];
  const seen = new Set();
  const pattern = /\{\{\s*([^{}]+?)\s*\}\}/g;
  const source = String(text || '');

  for (const match of source.matchAll(pattern)) {
    const key = String(match?.[1] || '').trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    keys.push(key);
  }

  return keys;
}

function syncVariablesFromText(text, currentVariables = []) {
  const keys = extractTemplateVarKeys(text);
  if (!keys.length) return [createEmptyVar()];

  const existingByKey = new Map(
    (Array.isArray(currentVariables) ? currentVariables : []).map((row) => [String(row?.var_key || '').trim(), row])
  );

  return keys.map((key) => {
    const existing = existingByKey.get(key);
    if (!existing) return { var_key: key, display_label: '' };
    return {
      ...createEmptyVar(),
      ...existing,
      var_key: key,
      display_label: String(existing.display_label || ''),
    };
  });
}

const EMPTY_FORM = {
  wa_service_id: '',
  wa_media_id: '',
  name: '',
  language: 'en',
  text: '',
  type: '',
  purpose: '',
  footer: '',
  approved: false,
};

const EMPTY_MEDIA_FORM = {
  name: '',
  purpose: '',
  is_active: true,
};

export default function WhatsappTemplatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'whatsapp';
  const trustId = trust?.id || null;
  const isCreateRoute = location.pathname === '/whatsapp/template/create';
  const isEditRoute = location.pathname === '/whatsapp/template/edit';
  const isFormRoute = isCreateRoute || isEditRoute;
  const routeEditId = location.state?.editId || new URLSearchParams(location.search).get('id') || '';

  const [templates, setTemplates] = useState([]);
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [updatingId, setUpdatingId] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [showAddProvider, setShowAddProvider] = useState(false);
  const [editingService, setEditingService] = useState(null);
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);

  const [form, setForm] = useState(EMPTY_FORM);
  const [variables, setVariables] = useState([createEmptyVar()]);
  const [mediaForm, setMediaForm] = useState(EMPTY_MEDIA_FORM);
  const [existingMedia, setExistingMedia] = useState(null);
  const [selectedFile, setSelectedFile] = useState(null);
  const [filePreviewUrl, setFilePreviewUrl] = useState('');
  const [dragOver, setDragOver] = useState(false);
  const [replacingMedia, setReplacingMedia] = useState(false);

  const activeServices = useMemo(() => services.filter((item) => item.is_active), [services]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setVariables([createEmptyVar()]);
    setMediaForm(EMPTY_MEDIA_FORM);
    setExistingMedia(null);
    setSelectedFile(null);
    setFilePreviewUrl('');
    setReplacingMedia(false);
    setFormError('');
    setEditingId(null);
  };

  const handleFile = (file) => {
    if (!file) return;
    setFormError('');
    if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    setSelectedFile(file);
    setFilePreviewUrl(file.type.startsWith('image/') ? URL.createObjectURL(file) : '');
  };

  const goToList = () => {
    navigate('/whatsapp/template', { replace: true, state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
  };

  useEffect(() => {
    if (!trustId) {
      navigate('/whatsapp', { replace: true, state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
      return;
    }

    const load = async () => {
      setLoading(true);
      setError('');
      const [{ data: templateData, error: templateError }, { data: serviceData, error: serviceError }] =
        await Promise.all([fetchWaTemplatesByTrust(trustId), fetchWaServicesByTrust(trustId)]);
      if (templateError) setError(templateError.message || 'Unable to load templates.');
      else if (serviceError) setError(serviceError.message || 'Unable to load service providers.');
      setTemplates(templateData || []);
      setServices(serviceData || []);
      setLoading(false);
    };

    load();
  }, [navigate, trustId, userName, trust, currentSidebarNavKey]);

  useEffect(() => {
    return () => {
      if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
    };
  }, [filePreviewUrl]);

  const statusCounts = useMemo(() => {
    return templates.reduce(
      (acc, item) => {
        if (item.approved) acc.approved += 1;
        else acc.pending += 1;
        return acc;
      },
      { approved: 0, pending: 0 }
    );
  }, [templates]);

  const filteredTemplates = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    let list = [...templates];

    if (statusFilter === 'approved') list = list.filter((item) => item.approved);
    else if (statusFilter === 'pending') list = list.filter((item) => !item.approved);

    if (term) {
      list = list.filter((item) => {
        const name = String(item?.name || '').toLowerCase();
        const purpose = String(item?.purpose || '').toLowerCase();
        const type = String(item?.type || '').toLowerCase();
        const serviceName = String(item?.waService?.name || '').toLowerCase();
        return name.includes(term) || purpose.includes(term) || type.includes(term) || serviceName.includes(term);
      });
    }

    list.sort((left, right) => String(right?.created_at || '').localeCompare(String(left?.created_at || '')));
    return list;
  }, [templates, deferredSearch, statusFilter]);

  const selectedTemplate = useMemo(
    () => filteredTemplates.find((item) => item.id === selectedId) || null,
    [filteredTemplates, selectedId]
  );

  useEffect(() => {
    if (loading || isFormRoute) return;
    if (!filteredTemplates.length) {
      setSelectedId('');
      return;
    }
    const exists = filteredTemplates.some((item) => item.id === selectedId);
    if (!exists) setSelectedId(filteredTemplates[0].id);
  }, [filteredTemplates, selectedId, loading, isFormRoute]);

  useEffect(() => {
    const idx = filteredTemplates.findIndex((item) => item.id === selectedId);
    if (idx === -1) return;
    const targetPage = Math.floor(idx / PAGE_SIZE) + 1;
    setPage((prev) => (prev === targetPage ? prev : targetPage));
  }, [selectedId, filteredTemplates]);

  const totalPages = Math.max(1, Math.ceil(filteredTemplates.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedTemplates = filteredTemplates.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    if (!isFormRoute) return;

    if (isCreateRoute) {
      resetForm();
      return;
    }

    if (!isEditRoute) return;
    const targetId = String(routeEditId || selectedId || '');
    if (!targetId) return;
    const target = templates.find((item) => String(item.id) === targetId);
    if (!target) return;

    setForm({
      wa_service_id: target.wa_service_id || '',
      wa_media_id: target.wa_media_id || '',
      name: target.name || '',
      language: target.language || 'en',
      text: target.text || '',
      type: target.type || '',
      purpose: target.purpose || '',
      footer: target.footer || '',
      approved: target.approved === true,
    });
    setMediaForm(
      target.waMedia
        ? {
            name: target.waMedia.name || '',
            purpose: target.waMedia.purpose || '',
            is_active: target.waMedia.is_active !== false,
          }
        : EMPTY_MEDIA_FORM
    );
    setExistingMedia(target.waMedia || null);
    setSelectedFile(null);
    setFilePreviewUrl('');
    setReplacingMedia(false);
    setVariables(target.variables?.length ? target.variables.map((v) => ({ ...v })) : [createEmptyVar()]);
    setEditingId(target.id);
    setFormError('');
  }, [isFormRoute, isCreateRoute, isEditRoute, routeEditId, selectedId, templates]);

  const updateVarRow = (index, field, value) => {
    setVariables((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
  };

  const handleTextChange = (value) => {
    setForm((prev) => ({ ...prev, text: value }));
    setVariables((prev) => syncVariablesFromText(value, prev));
  };

  const handleSave = async () => {
    setFormError('');
    if (!form.wa_service_id) {
      setFormError('Service Provider is required.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }

    const wantsNewMedia = !form.wa_media_id && mediaForm.name.trim();
    if (wantsNewMedia && !selectedFile) {
      setFormError('Please select a file for the new media.');
      return;
    }
    if (!form.wa_media_id && selectedFile && !mediaForm.name.trim()) {
      setFormError('Media Name is required to upload a file.');
      return;
    }

    setSaving(true);

    let finalMediaId = form.wa_media_id || null;

    if (form.wa_media_id) {
      if (mediaForm.name.trim()) {
        const { error: mediaError } = await updateWaMedia(
          form.wa_media_id,
          { name: mediaForm.name, purpose: mediaForm.purpose, is_active: mediaForm.is_active },
          trustId
        );
        if (mediaError) {
          setFormError(mediaError.message || 'Unable to update media.');
          setSaving(false);
          return;
        }

        if (replacingMedia && selectedFile) {
          const { error: replaceError } = await replaceWaMediaFile(form.wa_media_id, selectedFile, {
            trustId,
            oldPublicUrl: existingMedia?.public_url || '',
          });
          if (replaceError) {
            setFormError(replaceError.message || 'Unable to replace file.');
            setSaving(false);
            return;
          }
        }
      } else {
        finalMediaId = null;
      }
    } else if (wantsNewMedia) {
      const { data: uploaded, error: uploadError } = await uploadWaMediaFile(selectedFile, { trustId });
      if (uploadError) {
        setFormError(uploadError.message || 'Unable to upload file.');
        setSaving(false);
        return;
      }
      const { data: createdMedia, error: mediaCreateError } = await createWaMedia({
        trust_id: trustId,
        name: mediaForm.name,
        purpose: mediaForm.purpose,
        is_active: mediaForm.is_active,
        public_url: uploaded.publicUrl,
        type: uploaded.type,
        extn: uploaded.extn,
        size: bytesToKb(uploaded.size),
      });
      if (mediaCreateError) {
        setFormError(mediaCreateError.message || 'Unable to create media.');
        setSaving(false);
        return;
      }
      finalMediaId = createdMedia.id;
    }

    const payload = { ...form, wa_media_id: finalMediaId, trust_id: trustId };

    if (editingId) {
      const { data, error: updateError } = await updateWaTemplate(editingId, payload, variables, trustId);
      if (updateError) {
        setFormError(updateError.message || 'Unable to update template.');
        setSaving(false);
        return;
      }
      setTemplates((prev) => prev.map((item) => (item.id === editingId ? data : item)));
    } else {
      const { data, error: createError } = await createWaTemplate(payload, variables);
      if (createError) {
        setFormError(createError.message || 'Unable to create template.');
        setSaving(false);
        return;
      }
      setTemplates((prev) => [data, ...prev]);
      setSelectedId(data.id);
    }

    resetForm();
    setSaving(false);
    if (isFormRoute) goToList();
  };

  const handleEdit = (item) => {
    setForm({
      wa_service_id: item.wa_service_id || '',
      wa_media_id: item.wa_media_id || '',
      name: item.name || '',
      language: item.language || 'en',
      text: item.text || '',
      type: item.type || '',
      purpose: item.purpose || '',
      footer: item.footer || '',
      approved: item.approved === true,
    });
    setMediaForm(
      item.waMedia
        ? {
            name: item.waMedia.name || '',
            purpose: item.waMedia.purpose || '',
            is_active: item.waMedia.is_active !== false,
          }
        : EMPTY_MEDIA_FORM
    );
    setExistingMedia(item.waMedia || null);
    setSelectedFile(null);
    setFilePreviewUrl('');
    setReplacingMedia(false);
    setVariables(item.variables?.length ? item.variables.map((v) => ({ ...v })) : [createEmptyVar()]);
    setEditingId(item.id);
    setFormError('');
    navigate(`/whatsapp/template/edit?id=${item.id}`, {
      state: { userName, trust, editId: item.id, sidebarNavKey: currentSidebarNavKey },
    });
  };

  const handleToggleApproved = async (item) => {
    setUpdatingId(item.id);
    const { data, error: updateError } = await updateWaTemplate(
      item.id,
      { approved: !item.approved },
      item.variables,
      trustId
    );
    if (updateError) {
      setError(updateError.message || 'Unable to update status.');
    } else if (data) {
      setTemplates((prev) => prev.map((entry) => (entry.id === item.id ? data : entry)));
    }
    setUpdatingId(null);
  };

  if (!trustId) return null;

  return (
    <div className="nb-root">
      <Sidebar
        trustName={trust?.name || 'Trust'}
        onDashboard={() => navigate('/dashboard', { state: { userName, trust, sidebarNavKey: 'dashboard' } })}
        onLogout={() => navigate('/login')}
      />

      <main className="nb-main">
        <PageHeader
          title="Whatsapp Template"
          subtitle="Manage WhatsApp message templates"
          onBack={() => {
            if (isFormRoute) {
              goToList();
              return;
            }
            navigate('/whatsapp', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
          }}
        />

        <section className="nb-content">
          {error && <div className="nb-error">{error}</div>}

          {showAddProvider && (
            <ServiceProviderQuickAddModal
              trustId={trustId}
              editingService={editingService}
              onClose={() => {
                setShowAddProvider(false);
                setEditingService(null);
              }}
              onSaved={(savedService) => {
                setServices((prev) => {
                  const exists = prev.some((item) => item.id === savedService.id);
                  return exists
                    ? prev.map((item) => (item.id === savedService.id ? savedService : item))
                    : [savedService, ...prev];
                });
                setForm((prev) => ({ ...prev, wa_service_id: savedService.id }));
                setShowAddProvider(false);
                setEditingService(null);
              }}
            />
          )}

          {isFormRoute && (
            <div className="nb-form-card">
              <h3>{editingId ? 'Edit Template' : 'Create Template'}</h3>
              <div className="nb-form-layout">
                <section className="nb-form-section">
                  <h4 className="nb-section-title">Template Details</h4>
                  <div className="nb-form-grid nb-form-grid-2">
                    <label>
                      <span>Service Provider *</span>
                      <div className="nb-input-with-actions">
                        <select
                          style={{ flex: 1 }}
                          value={form.wa_service_id}
                          onChange={(e) => {
                            const value = e.target.value;
                            if (value === '__add_new__') {
                              setEditingService(null);
                              setShowAddProvider(true);
                              return;
                            }
                            setForm((prev) => ({ ...prev, wa_service_id: value }));
                          }}
                        >
                          <option value="">Select active service provider</option>
                          <option value="__add_new__">+ Add Service Provider</option>
                          {activeServices.map((service) => (
                            <option key={service.id} value={service.id}>
                              {service.provider}
                            </option>
                          ))}
                        </select>
                        {form.wa_service_id && form.wa_service_id !== '__add_new__' && (
                          <button
                            type="button"
                            className="nb-input-action-btn"
                            title="Edit service provider"
                            onClick={() => {
                              const target = services.find((item) => item.id === form.wa_service_id);
                              if (!target) return;
                              setEditingService(target);
                              setShowAddProvider(true);
                            }}
                          >
                            Edit
                          </button>
                        )}
                      </div>
                    </label>
                    <label>
                      <span>Name *</span>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter template name"
                      />
                    </label>
                    <label>
                      <span>Language</span>
                      <select
                        value={form.language}
                        onChange={(e) => setForm((prev) => ({ ...prev, language: e.target.value }))}
                      >
                        {WHATSAPP_LANGUAGES.map((lang) => (
                          <option key={lang.value} value={lang.value}>{lang.label}</option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Type</span>
                      <select
                        value={form.type}
                        onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value }))}
                      >
                        <option value="">Select type</option>
                        {WHATSAPP_TEMPLATE_TYPES.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Purpose</span>
                      <input
                        value={form.purpose}
                        onChange={(e) => setForm((prev) => ({ ...prev, purpose: e.target.value }))}
                        placeholder="e.g. OTP, Reminder"
                      />
                    </label>
                    <label className="nb-span-2">
                      <span>Footer</span>
                      <input
                        value={form.footer}
                        onChange={(e) => setForm((prev) => ({ ...prev, footer: e.target.value }))}
                        placeholder="Enter footer text"
                      />
                    </label>
                    <label className="nb-span-2">
                      <span>Text</span>
                      <textarea
                        rows="4"
                        value={form.text}
                        onChange={(e) => handleTextChange(e.target.value)}
                        placeholder="Enter template message, use {{body_1}}, {{body_2}} for variables"
                      />
                    </label>
                    <label className="nb-checkbox-field">
                      <input
                        type="checkbox"
                        checked={form.approved}
                        onChange={(e) => setForm((prev) => ({ ...prev, approved: e.target.checked }))}
                      />
                      <span>Approved</span>
                    </label>
                  </div>
                </section>

                <section className="nb-form-section">
                  <h4 className="nb-section-title">Media (optional)</h4>
                  <div className="nb-form-grid nb-form-grid-2">
                    <label>
                      <span>Name</span>
                      <input
                        value={mediaForm.name}
                        onChange={(e) => setMediaForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter media name"
                      />
                    </label>
                    <label>
                      <span>Purpose</span>
                      <input
                        value={mediaForm.purpose}
                        onChange={(e) => setMediaForm((prev) => ({ ...prev, purpose: e.target.value }))}
                        placeholder="e.g. Marketing, Notification"
                      />
                    </label>
                    <label className="nb-checkbox-field">
                      <input
                        type="checkbox"
                        checked={mediaForm.is_active}
                        onChange={(e) => setMediaForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                      />
                      <span>Active</span>
                    </label>
                  </div>

                  {(!form.wa_media_id || replacingMedia) && (
                    <div className="nb-span-full" style={{ marginTop: 12 }}>
                      <span>File</span>
                      <p className="nb-dropzone-sub" style={{ margin: '4px 0 8px' }}>
                        Uploaded as-is, no compression.
                      </p>
                      <label
                        className={`nb-dropzone ${dragOver ? 'drag' : ''}`}
                        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
                        onDragLeave={() => setDragOver(false)}
                        onDrop={(e) => { e.preventDefault(); setDragOver(false); handleFile(e.dataTransfer.files?.[0]); }}
                      >
                        <input type="file" onChange={(e) => handleFile(e.target.files?.[0])} />
                        <div className="nb-dropzone-inner">
                          <span>Drag & drop file here</span>
                          <span className="nb-dropzone-sub">or click to browse</span>
                        </div>
                      </label>
                      {selectedFile && (
                        <div className="nb-file-preview">
                          {filePreviewUrl ? (
                            <img src={filePreviewUrl} alt={selectedFile.name} />
                          ) : (
                            <div className="nb-file-preview-icon">{selectedFile.name.split('.').pop()}</div>
                          )}
                          <div className="nb-file-preview-body">
                            <div className="nb-file-preview-name">{selectedFile.name}</div>
                            <div className="nb-file-preview-meta">{formatBytes(selectedFile.size)}</div>
                          </div>
                        </div>
                      )}
                      {replacingMedia && (
                        <button
                          type="button"
                          className="nb-input-action-btn"
                          style={{ marginTop: 8 }}
                          onClick={() => {
                            setReplacingMedia(false);
                            setSelectedFile(null);
                            if (filePreviewUrl) URL.revokeObjectURL(filePreviewUrl);
                            setFilePreviewUrl('');
                          }}
                        >
                          Cancel
                        </button>
                      )}
                    </div>
                  )}

                  {form.wa_media_id && existingMedia && !replacingMedia && (
                    <div className="nb-file-preview" style={{ marginTop: 12 }}>
                      {existingMedia.type === 'image' && existingMedia.public_url ? (
                        <img src={existingMedia.public_url} alt={existingMedia.name} />
                      ) : (
                        <div className="nb-file-preview-icon">{existingMedia.extn || '-'}</div>
                      )}
                      <div className="nb-file-preview-body">
                        <div className="nb-file-preview-name">Existing file (unchanged)</div>
                      </div>
                      <button
                        type="button"
                        className="nb-input-action-btn"
                        onClick={() => setReplacingMedia(true)}
                      >
                        Replace File
                      </button>
                    </div>
                  )}
                </section>

                <section className="nb-form-section">
                  <h4 className="nb-section-title">Variables</h4>
                  {variables.map((row, index) => (
                    <div className="nb-form-grid nb-form-grid-2" key={`var-${index}`} style={{ marginBottom: 10 }}>
                      <label>
                        <span>Var Key *</span>
                        <input
                          value={row.var_key}
                          onChange={(e) => updateVarRow(index, 'var_key', e.target.value)}
                          placeholder="e.g. 1"
                        />
                      </label>
                      <label>
                        <span>Field Name</span>
                        <div className="nb-input-with-actions">
                          <input
                            value={row.display_label}
                            onChange={(e) => updateVarRow(index, 'display_label', e.target.value)}
                            placeholder="e.g. Member Name"
                          />
                          <button
                            type="button"
                            className="nb-input-action-btn"
                            title="Remove variable"
                            aria-label="Remove variable"
                            onClick={() => setVariables((prev) => prev.filter((_, i) => i !== index))}
                            style={{ width: 40, minWidth: 40, padding: 10 }}
                          >
                            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true"><path d="M9 3.75C9 3.33579 9.33579 3 9.75 3H14.25C14.6642 3 15 3.33579 15 3.75V4.5H20.25C20.6642 4.5 21 4.83579 21 5.25C21 5.66421 20.6642 6 20.25 6H19.2826L18.4824 18.1433C18.3873 19.5868 17.1904 20.7 15.7438 20.7H8.25617C6.80964 20.7 5.61266 19.5868 5.51763 18.1433L4.71736 6H3.75C3.33579 6 3 5.66421 3 5.25C3 4.83579 3.33579 4.5 3.75 4.5H9V3.75ZM10.5 4.5H13.5V4.125H10.5V4.5ZM6.22365 6L6.99946 17.9944C7.04534 18.7037 7.63233 19.25 8.34307 19.25H15.6569C16.3677 19.25 16.9547 18.7037 17.0005 17.9944L17.7763 6H6.22365ZM9.75 8.25C10.1642 8.25 10.5 8.58579 10.5 9V15C10.5 15.4142 10.1642 15.75 9.75 15.75C9.33579 15.75 9 15.4142 9 15V9C9 8.58579 9.33579 8.25 9.75 8.25ZM14.25 8.25C14.6642 8.25 15 8.58579 15 9V15C15 15.4142 14.6642 15.75 14.25 15.75C13.8358 15.75 13.5 15.4142 13.5 15V9C13.5 8.58579 13.8358 8.25 14.25 8.25Z" fill="currentColor"/></svg>
                          </button>
                        </div>
                      </label>
                    </div>
                  ))}
                  <button
                    type="button"
                    className="nb-secondary-btn"
                    onClick={() => setVariables((prev) => [...prev, createEmptyVar()])}
                  >
                    + Add Variable
                  </button>
                </section>
              </div>

              {formError && <div className="nb-error">{formError}</div>}
              <div className="nb-form-actions">
                <button
                  className="nb-secondary-btn"
                  onClick={() => {
                    resetForm();
                    goToList();
                  }}
                  type="button"
                >
                  Cancel
                </button>
                <button className="nb-add-btn" onClick={handleSave} disabled={saving} type="button">
                  {saving ? 'Saving...' : editingId ? 'Update Template' : 'Save Template'}
                </button>
              </div>
            </div>
          )}

          {!isFormRoute && loading && <div className="nb-empty">Loading templates...</div>}

          {!isFormRoute && !loading && templates.length === 0 && (
            <div className="nb-empty">
              <button
                className="nb-add-btn nb-list-add-btn"
                type="button"
                onClick={() => navigate('/whatsapp/template/create', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
              >
                Add Template
              </button>
              <div>No template found for this trust. Create your first one.</div>
            </div>
          )}

          {!isFormRoute && !loading && templates.length > 0 && (
            <section className="nb-profile-layout">
              <aside className="nb-left-panel">
                <div className="nb-left-head">
                  <h3>All Templates</h3>
                  <span className="nb-left-count">{templates.length}</span>
                </div>

                <input
                  className="nb-left-search"
                  placeholder="Search template..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />

                <div className="nb-category-tabs">
                  <button
                    type="button"
                    className={`nb-category-tab ${statusFilter === 'all' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('all')}
                  >
                    <span>All</span>
                    <b>{templates.length}</b>
                  </button>
                  <button
                    type="button"
                    className={`nb-category-tab ${statusFilter === 'approved' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('approved')}
                  >
                    <span>Approved</span>
                    <b>{statusCounts.approved}</b>
                  </button>
                  <button
                    type="button"
                    className={`nb-category-tab ${statusFilter === 'pending' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('pending')}
                  >
                    <span>Pending</span>
                    <b>{statusCounts.pending}</b>
                  </button>
                </div>

                <button
                  className="nb-add-btn nb-list-add-btn"
                  type="button"
                  onClick={() => navigate('/whatsapp/template/create', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
                >
                  Add Template
                </button>

                <div className="nb-left-list">
                  {filteredTemplates.length === 0 && (
                    <div className="nb-empty">No template matched your filters.</div>
                  )}
                  {pagedTemplates.map((item) => (
                    <button
                      key={item.id}
                      className={`nb-left-item ${selectedId === item.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                      type="button"
                    >
                      <div className="nb-left-avatar">{getInitials(item?.name)}</div>
                      <div className="nb-left-item-body">
                        <div className="nb-left-item-title">{item.name || '-'}</div>
                        <div className="nb-left-item-sub">{item.waService?.name || 'No provider'} • {languageLabel(item.language)}</div>
                        <div className="nb-left-item-sub">{item.type || '-'} • {item.footer || 'No footer'}</div>
                      </div>
                    </button>
                  ))}
                </div>
                <Pagination
                  page={safePage}
                  totalPages={totalPages}
                  onPrev={() => setPage((p) => Math.max(1, p - 1))}
                  onNext={() => setPage((p) => Math.min(totalPages, p + 1))}
                />
              </aside>

              <section className="nb-right-panel">
                {!selectedTemplate && (
                  <div className="nb-empty">Select a template to view details.</div>
                )}

                {selectedTemplate && (
                  <>
                    <div className="nb-profile-hero">
                      <div className="nb-profile-hero-left">
                        <div className="nb-profile-avatar">{getInitials(selectedTemplate.name)}</div>
                        <div>
                          <h3>{selectedTemplate.name || '-'}</h3>
                          <div className="nb-profile-hero-actions">
                            <button
                              className="nb-secondary-btn"
                              type="button"
                              onClick={() => handleToggleApproved(selectedTemplate)}
                              disabled={updatingId === selectedTemplate.id}
                            >
                              {selectedTemplate.approved ? 'Mark Pending' : 'Mark Approved'}
                            </button>
                            <button
                              className="nb-secondary-btn"
                              type="button"
                              onClick={() => handleEdit(selectedTemplate)}
                            >
                              Edit Details
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="nb-profile-details">
                      <div className="nb-profile-details-head">
                        <h3>Template Details</h3>
                      </div>
                      <div className="nb-profile-detail-grid">
                        <div><span>Service Provider</span><strong>{selectedTemplate.waService?.name || '-'}</strong></div>
                        <div><span>Media</span><strong>{selectedTemplate.waMedia?.name || 'No media'}</strong></div>
                        <div><span>Language</span><strong>{languageLabel(selectedTemplate.language)}</strong></div>
                        <div><span>Type</span><strong>{selectedTemplate.type || '-'}</strong></div>
                        <div><span>Purpose</span><strong>{selectedTemplate.purpose || '-'}</strong></div>
                        <div className="nb-detail-span-2"><span>Footer</span><strong>{selectedTemplate.footer || '-'}</strong></div>
                        <div><span>Status</span><strong>{selectedTemplate.approved ? 'Approved' : 'Pending'}</strong></div>
                        <div><span>Variables</span><strong>{selectedTemplate.var_count}</strong></div>
                        <div><span>Created Date</span><strong>{formatDate(selectedTemplate.created_at)}</strong></div>
                        <div><span>Updated Date</span><strong>{formatDate(selectedTemplate.updated_at)}</strong></div>
                      </div>
                      {selectedTemplate.text && (
                        <div style={{ marginTop: 14 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Text</span>
                          <p style={{ whiteSpace: 'pre-wrap', margin: '6px 0 0' }}>{selectedTemplate.text}</p>
                        </div>
                      )}
                      {selectedTemplate.variables?.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Variables</span>
                          <div className="nb-left-list" style={{ marginTop: 6 }}>
                            {selectedTemplate.variables.map((v) => (
                              <div key={v.id} className="nb-left-item" style={{ cursor: 'default' }}>
                                <div className="nb-left-item-body">
                                  <div className="nb-left-item-title">{v.var_key} {v.display_label ? `— ${v.display_label}` : ''}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </>
                )}
              </section>
            </section>
          )}
        </section>
      </main>
    </div>
  );
}
