import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import { fetchWaServicesByTrust } from '../services/waServiceProviderService';
import {
  createWaTemplate,
  deleteWaTemplate,
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
  { value: 'Marketing', label: 'Marketing' },
  { value: 'Utility', label: 'Utility' },
  { value: 'Authentication', label: 'Authentication' },
];

function languageLabel(value = '') {
  return WHATSAPP_LANGUAGES.find((lang) => lang.value === value)?.label || value || '-';
}

function createEmptyVar() {
  return { var_key: '', display_label: '', source_table: '', source_column: '', fallback_value: '' };
}

const EMPTY_FORM = {
  wa_service_id: '',
  name: '',
  language: 'en',
  text: '',
  type: '',
  purpose: '',
  footer: '',
  approved: false,
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
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const deferredSearch = useDeferredValue(search);

  const [form, setForm] = useState(EMPTY_FORM);
  const [variables, setVariables] = useState([createEmptyVar()]);

  const activeServices = useMemo(() => services.filter((item) => item.is_active), [services]);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setVariables([createEmptyVar()]);
    setFormError('');
    setEditingId(null);
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
    const closeMenu = () => setActiveMenuId(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

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
      name: target.name || '',
      language: target.language || 'en',
      text: target.text || '',
      type: target.type || '',
      purpose: target.purpose || '',
      footer: target.footer || '',
      approved: target.approved === true,
    });
    setVariables(target.variables?.length ? target.variables.map((v) => ({ ...v })) : [createEmptyVar()]);
    setEditingId(target.id);
    setFormError('');
  }, [isFormRoute, isCreateRoute, isEditRoute, routeEditId, selectedId, templates]);

  const updateVarRow = (index, field, value) => {
    setVariables((prev) => prev.map((row, i) => (i === index ? { ...row, [field]: value } : row)));
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

    setSaving(true);
    const payload = { ...form, trust_id: trustId };

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

  const handleDelete = async (item) => {
    const shouldDelete = window.confirm(`Delete template "${item?.name || 'this entry'}"?`);
    if (!shouldDelete) {
      setActiveMenuId(null);
      return;
    }

    setUpdatingId(item.id);
    const { error: deleteError } = await deleteWaTemplate(item.id, trustId);
    if (deleteError) {
      setError(deleteError.message || 'Unable to delete template.');
    } else {
      setTemplates((prev) => prev.filter((entry) => entry.id !== item.id));
    }
    setUpdatingId(null);
    setActiveMenuId(null);
  };

  const handleEdit = (item) => {
    setForm({
      wa_service_id: item.wa_service_id || '',
      name: item.name || '',
      language: item.language || 'en',
      text: item.text || '',
      type: item.type || '',
      purpose: item.purpose || '',
      footer: item.footer || '',
      approved: item.approved === true,
    });
    setVariables(item.variables?.length ? item.variables.map((v) => ({ ...v })) : [createEmptyVar()]);
    setEditingId(item.id);
    setFormError('');
    setActiveMenuId(null);
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

          {isFormRoute && (
            <div className="nb-form-card">
              <h3>{editingId ? 'Edit Template' : 'Create Template'}</h3>
              <div className="nb-form-layout">
                <section className="nb-form-section">
                  <h4 className="nb-section-title">Template Details</h4>
                  <div className="nb-form-grid nb-form-grid-2">
                    <label>
                      <span>Service Provider *</span>
                      <select
                        value={form.wa_service_id}
                        onChange={(e) => setForm((prev) => ({ ...prev, wa_service_id: e.target.value }))}
                      >
                        <option value="">Select active service provider</option>
                        {activeServices.map((service) => (
                          <option key={service.id} value={service.id}>
                            {service.name} ({service.provider})
                          </option>
                        ))}
                      </select>
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
                        onChange={(e) => setForm((prev) => ({ ...prev, text: e.target.value }))}
                        placeholder="Enter template message, use {{1}}, {{2}} for variables"
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
                        <span>Display Label</span>
                        <input
                          value={row.display_label}
                          onChange={(e) => updateVarRow(index, 'display_label', e.target.value)}
                          placeholder="e.g. Member Name"
                        />
                      </label>
                      <label>
                        <span>Source Table</span>
                        <input
                          value={row.source_table}
                          onChange={(e) => updateVarRow(index, 'source_table', e.target.value)}
                          placeholder="e.g. members"
                        />
                      </label>
                      <label>
                        <span>Source Column</span>
                        <input
                          value={row.source_column}
                          onChange={(e) => updateVarRow(index, 'source_column', e.target.value)}
                          placeholder="e.g. name"
                        />
                      </label>
                      <label className="nb-span-2">
                        <span>Fallback Value</span>
                        <div className="nb-input-with-actions">
                          <input
                            value={row.fallback_value}
                            onChange={(e) => updateVarRow(index, 'fallback_value', e.target.value)}
                            placeholder="Value used when source is empty"
                          />
                          <button
                            type="button"
                            className="nb-input-action-btn"
                            onClick={() => setVariables((prev) => prev.filter((_, i) => i !== index))}
                          >
                            Remove
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
                  {filteredTemplates.map((item) => (
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
                      <div className="nb-card-menu-wrap">
                        <button
                          type="button"
                          className="nb-card-menu-btn"
                          title="Actions"
                          onClick={(event) => {
                            event.stopPropagation();
                            setActiveMenuId((prev) => (prev === selectedTemplate.id ? null : selectedTemplate.id));
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          </svg>
                        </button>
                        {activeMenuId === selectedTemplate.id && (
                          <div className="nb-card-menu">
                            <button
                              type="button"
                              onClick={() => handleEdit(selectedTemplate)}
                              disabled={updatingId === selectedTemplate.id}
                            >
                              Edit Details
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => handleDelete(selectedTemplate)}
                              disabled={updatingId === selectedTemplate.id}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="nb-profile-details">
                      <div className="nb-profile-details-head">
                        <h3>Template Details</h3>
                      </div>
                      <div className="nb-profile-detail-grid">
                        <div><span>Service Provider</span><strong>{selectedTemplate.waService?.name || '-'}</strong></div>
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
                                  <div className="nb-left-item-sub">
                                    {v.source_table && v.source_column ? `${v.source_table}.${v.source_column}` : 'No source'}
                                    {v.fallback_value ? ` (fallback: ${v.fallback_value})` : ''}
                                  </div>
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
