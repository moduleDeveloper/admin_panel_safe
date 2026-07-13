import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import {
  createWaService,
  deleteWaService,
  fetchWaServicesByTrust,
  updateWaService,
} from '../services/waServiceProviderService';
import './NoticeboardPage.css';

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getInitials(value = '') {
  const safe = String(value || '').trim();
  if (!safe) return 'S';
  return safe.charAt(0).toUpperCase();
}

function sanitizeDigits(value, maxLength = 10) {
  return String(value ?? '').replace(/\D/g, '').slice(0, maxLength);
}

function maskToken(value = '') {
  const safe = String(value || '');
  if (!safe) return '-';
  if (safe.length <= 4) return '****';
  return `${'*'.repeat(Math.max(0, safe.length - 4))}${safe.slice(-4)}`;
}

const EMPTY_FORM = {
  provider: '',
  purpose: '',
  name: '',
  wa_number: '',
  company_id: '',
  endpoint: '',
  api_token: '',
  is_active: true,
};

export default function ServiceProviderPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'whatsapp';
  const trustId = trust?.id || null;
  const isCreateRoute = location.pathname === '/whatsapp/service-provider/create';
  const isEditRoute = location.pathname === '/whatsapp/service-provider/edit';
  const isFormRoute = isCreateRoute || isEditRoute;
  const routeEditId = location.state?.editId || new URLSearchParams(location.search).get('id') || '';

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
  const [showToken, setShowToken] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [numberWarning, setNumberWarning] = useState('');
  const deferredSearch = useDeferredValue(search);

  const [form, setForm] = useState(EMPTY_FORM);

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setFormError('');
    setEditingId(null);
    setShowToken(false);
    setNumberWarning('');
  };

  const handleWaNumberChange = (rawValue) => {
    const raw = String(rawValue ?? '');
    const sanitized = sanitizeDigits(raw, 10);
    setNumberWarning(/\D/.test(raw) ? 'Only numbers are allowed in WhatsApp Number.' : '');
    setForm((prev) => ({ ...prev, wa_number: sanitized }));
  };

  const goToList = () => {
    navigate('/whatsapp/service-provider', { replace: true, state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
  };

  useEffect(() => {
    if (!trustId) {
      navigate('/whatsapp', { replace: true, state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
      return;
    }

    const load = async () => {
      setLoading(true);
      setError('');
      const { data, error: fetchError } = await fetchWaServicesByTrust(trustId);
      if (fetchError) setError(fetchError.message || 'Unable to load service providers.');
      setServices(data || []);
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
    return services.reduce(
      (acc, item) => {
        if (item.is_active) acc.active += 1;
        else acc.inactive += 1;
        return acc;
      },
      { active: 0, inactive: 0 }
    );
  }, [services]);

  const filteredServices = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    let list = [...services];

    if (statusFilter === 'active') list = list.filter((item) => item.is_active);
    else if (statusFilter === 'inactive') list = list.filter((item) => !item.is_active);

    if (term) {
      list = list.filter((item) => {
        const name = String(item?.name || '').toLowerCase();
        const provider = String(item?.provider || '').toLowerCase();
        const purpose = String(item?.purpose || '').toLowerCase();
        const number = String(item?.wa_number || '').toLowerCase();
        return name.includes(term) || provider.includes(term) || purpose.includes(term) || number.includes(term);
      });
    }

    list.sort((left, right) => String(right?.created_at || '').localeCompare(String(left?.created_at || '')));
    return list;
  }, [services, deferredSearch, statusFilter]);

  const selectedService = useMemo(
    () => filteredServices.find((item) => item.id === selectedId) || null,
    [filteredServices, selectedId]
  );

  useEffect(() => {
    if (loading || isFormRoute) return;
    if (!filteredServices.length) {
      setSelectedId('');
      return;
    }
    const exists = filteredServices.some((item) => item.id === selectedId);
    if (!exists) setSelectedId(filteredServices[0].id);
  }, [filteredServices, selectedId, loading, isFormRoute]);

  useEffect(() => {
    if (!isFormRoute) return;

    if (isCreateRoute) {
      resetForm();
      return;
    }

    if (!isEditRoute) return;
    const targetId = String(routeEditId || selectedId || '');
    if (!targetId) return;
    const target = services.find((item) => String(item.id) === targetId);
    if (!target) return;

    setForm({
      provider: target.provider || '',
      purpose: target.purpose || '',
      name: target.name || '',
      wa_number: target.wa_number || '',
      company_id: target.company_id || '',
      endpoint: target.endpoint || '',
      api_token: target.api_token || '',
      is_active: target.is_active !== false,
    });
    setEditingId(target.id);
    setFormError('');
    setShowToken(false);
    setNumberWarning('');
  }, [isFormRoute, isCreateRoute, isEditRoute, routeEditId, selectedId, services]);

  const handleSave = async () => {
    setFormError('');
    if (!form.provider.trim()) {
      setFormError('Provider is required.');
      return;
    }
    if (!form.purpose.trim()) {
      setFormError('Purpose is required.');
      return;
    }
    if (!form.name.trim()) {
      setFormError('Name is required.');
      return;
    }
    if (form.wa_number.trim() && form.wa_number.trim().length !== 10) {
      setFormError('WhatsApp Number must be exactly 10 digits.');
      return;
    }

    setSaving(true);
    const payload = { ...form, trust_id: trustId };

    if (editingId) {
      const { data, error: updateError } = await updateWaService(editingId, payload, trustId);
      if (updateError) {
        setFormError(updateError.message || 'Unable to update service provider.');
        setSaving(false);
        return;
      }
      setServices((prev) => prev.map((item) => (item.id === editingId ? data : item)));
    } else {
      const { data, error: createError } = await createWaService(payload);
      if (createError) {
        setFormError(createError.message || 'Unable to create service provider.');
        setSaving(false);
        return;
      }
      setServices((prev) => [data, ...prev]);
      setSelectedId(data.id);
    }

    resetForm();
    setSaving(false);
    if (isFormRoute) goToList();
  };

  const handleDelete = async (item) => {
    const shouldDelete = window.confirm(`Delete service provider "${item?.name || 'this entry'}"?`);
    if (!shouldDelete) {
      setActiveMenuId(null);
      return;
    }

    setUpdatingId(item.id);
    const { error: deleteError } = await deleteWaService(item.id, trustId);
    if (deleteError) {
      setError(deleteError.message || 'Unable to delete service provider.');
    } else {
      setServices((prev) => prev.filter((entry) => entry.id !== item.id));
    }
    setUpdatingId(null);
    setActiveMenuId(null);
  };

  const handleEdit = (item) => {
    setForm({
      provider: item.provider || '',
      purpose: item.purpose || '',
      name: item.name || '',
      wa_number: item.wa_number || '',
      company_id: item.company_id || '',
      endpoint: item.endpoint || '',
      api_token: item.api_token || '',
      is_active: item.is_active !== false,
    });
    setEditingId(item.id);
    setFormError('');
    setShowToken(false);
    setNumberWarning('');
    setActiveMenuId(null);
    navigate(`/whatsapp/service-provider/edit?id=${item.id}`, {
      state: { userName, trust, editId: item.id, sidebarNavKey: currentSidebarNavKey },
    });
  };

  const handleToggleActive = async (item) => {
    setUpdatingId(item.id);
    const { data, error: updateError } = await updateWaService(item.id, { is_active: !item.is_active }, trustId);
    if (updateError) {
      setError(updateError.message || 'Unable to update status.');
    } else if (data) {
      setServices((prev) => prev.map((entry) => (entry.id === item.id ? data : entry)));
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
          title="Service Provider"
          subtitle="Manage WhatsApp service provider settings"
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
              <h3>{editingId ? 'Edit Service Provider' : 'Create Service Provider'}</h3>
              <div className="nb-form-layout">
                <section className="nb-form-section">
                  <h4 className="nb-section-title">Provider Details</h4>
                  <div className="nb-form-grid nb-form-grid-2">
                    <label>
                      <span>Provider *</span>
                      <input
                        value={form.provider}
                        onChange={(e) => setForm((prev) => ({ ...prev, provider: e.target.value }))}
                        placeholder="e.g. Blotato, Meta Cloud API"
                      />
                    </label>
                    <label>
                      <span>Purpose *</span>
                      <input
                        value={form.purpose}
                        onChange={(e) => setForm((prev) => ({ ...prev, purpose: e.target.value }))}
                        placeholder="e.g. OTP, Marketing"
                      />
                    </label>
                    <label>
                      <span>Name *</span>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                        placeholder="Enter display name"
                      />
                    </label>
                    <label>
                      <span>WhatsApp Number</span>
                      <input
                        value={form.wa_number}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        maxLength={10}
                        onChange={(e) => handleWaNumberChange(e.target.value)}
                        placeholder="Enter 10 digit WhatsApp number"
                      />
                    </label>
                    <label>
                      <span>Company Id</span>
                      <input
                        value={form.company_id}
                        onChange={(e) => setForm((prev) => ({ ...prev, company_id: e.target.value }))}
                        placeholder="Enter company id"
                      />
                    </label>
                    <label>
                      <span>Endpoint</span>
                      <input
                        value={form.endpoint}
                        onChange={(e) => setForm((prev) => ({ ...prev, endpoint: e.target.value }))}
                        placeholder="Enter API endpoint URL"
                      />
                    </label>
                    <label>
                      <span>API Token</span>
                      <div className="nb-input-with-actions">
                        <input
                          type={showToken ? 'text' : 'password'}
                          value={form.api_token}
                          onChange={(e) => setForm((prev) => ({ ...prev, api_token: e.target.value }))}
                          placeholder="Enter API token"
                        />
                        <button
                          type="button"
                          className="nb-input-action-btn"
                          onClick={() => setShowToken((prev) => !prev)}
                          title={showToken ? 'Hide token' : 'Show token'}
                        >
                          {showToken ? 'Hide' : 'Show'}
                        </button>
                      </div>
                    </label>
                    <label className="nb-checkbox-field">
                      <input
                        type="checkbox"
                        checked={form.is_active}
                        onChange={(e) => setForm((prev) => ({ ...prev, is_active: e.target.checked }))}
                      />
                      <span>Active</span>
                    </label>
                  </div>
                  {numberWarning && <div className="nb-warning-inline">{numberWarning}</div>}
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
                  {saving ? 'Saving...' : editingId ? 'Update Service Provider' : 'Save Service Provider'}
                </button>
              </div>
            </div>
          )}

          {!isFormRoute && loading && <div className="nb-empty">Loading service providers...</div>}

          {!isFormRoute && !loading && services.length === 0 && (
            <div className="nb-empty">
              <button
                className="nb-add-btn nb-list-add-btn"
                type="button"
                onClick={() => navigate('/whatsapp/service-provider/create', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
              >
                Add Service Provider
              </button>
              <div>No service provider found for this trust. Create your first one.</div>
            </div>
          )}

          {!isFormRoute && !loading && services.length > 0 && (
            <section className="nb-profile-layout">
              <aside className="nb-left-panel">
                <div className="nb-left-head">
                  <h3>All Service Providers</h3>
                  <span className="nb-left-count">{services.length}</span>
                </div>

                <input
                  className="nb-left-search"
                  placeholder="Search service provider..."
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
                    <b>{services.length}</b>
                  </button>
                  <button
                    type="button"
                    className={`nb-category-tab ${statusFilter === 'active' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('active')}
                  >
                    <span>Active</span>
                    <b>{statusCounts.active}</b>
                  </button>
                  <button
                    type="button"
                    className={`nb-category-tab ${statusFilter === 'inactive' ? 'active' : ''}`}
                    onClick={() => setStatusFilter('inactive')}
                  >
                    <span>Inactive</span>
                    <b>{statusCounts.inactive}</b>
                  </button>
                </div>

                <button
                  className="nb-add-btn nb-list-add-btn"
                  type="button"
                  onClick={() => navigate('/whatsapp/service-provider/create', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
                >
                  Add Service Provider
                </button>

                <div className="nb-left-list">
                  {filteredServices.length === 0 && (
                    <div className="nb-empty">No service provider matched your filters.</div>
                  )}
                  {filteredServices.map((item) => (
                    <button
                      key={item.id}
                      className={`nb-left-item ${selectedId === item.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                      type="button"
                    >
                      <div className="nb-left-avatar">{getInitials(item?.name)}</div>
                      <div className="nb-left-item-body">
                        <div className="nb-left-item-title">{item.name || '-'}</div>
                        <div className="nb-left-item-sub">{item.provider || '-'} • {item.purpose || '-'}</div>
                      </div>
                    </button>
                  ))}
                </div>
              </aside>

              <section className="nb-right-panel">
                {!selectedService && (
                  <div className="nb-empty">Select a service provider to view details.</div>
                )}

                {selectedService && (
                  <>
                    <div className="nb-profile-hero">
                      <div className="nb-profile-hero-left">
                        <div className="nb-profile-avatar">{getInitials(selectedService.name)}</div>
                        <div>
                          <h3>{selectedService.name || '-'}</h3>
                          <div className="nb-profile-hero-actions">
                            <button
                              className="nb-secondary-btn"
                              type="button"
                              onClick={() => handleToggleActive(selectedService)}
                              disabled={updatingId === selectedService.id}
                            >
                              {selectedService.is_active ? 'Mark Inactive' : 'Mark Active'}
                            </button>
                            <button
                              className="nb-secondary-btn"
                              type="button"
                              onClick={() => handleEdit(selectedService)}
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
                            setActiveMenuId((prev) => (prev === selectedService.id ? null : selectedService.id));
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          </svg>
                        </button>
                        {activeMenuId === selectedService.id && (
                          <div className="nb-card-menu">
                            <button
                              type="button"
                              onClick={() => handleEdit(selectedService)}
                              disabled={updatingId === selectedService.id}
                            >
                              Edit Details
                            </button>
                            <button
                              type="button"
                              className="danger"
                              onClick={() => handleDelete(selectedService)}
                              disabled={updatingId === selectedService.id}
                            >
                              Delete
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="nb-profile-details">
                      <div className="nb-profile-details-head">
                        <h3>Service Provider Details</h3>
                      </div>
                      <div className="nb-profile-detail-grid">
                        <div><span>Provider</span><strong>{selectedService.provider || '-'}</strong></div>
                        <div><span>Purpose</span><strong>{selectedService.purpose || '-'}</strong></div>
                        <div><span>WhatsApp Number</span><strong>{selectedService.wa_number || '-'}</strong></div>
                        <div><span>Company Id</span><strong>{selectedService.company_id || '-'}</strong></div>
                        <div><span>Endpoint</span><strong>{selectedService.endpoint || '-'}</strong></div>
                        <div><span>API Token</span><strong>{maskToken(selectedService.api_token)}</strong></div>
                        <div><span>Status</span><strong>{selectedService.is_active ? 'Active' : 'Inactive'}</strong></div>
                        <div><span>Created Date</span><strong>{formatDate(selectedService.created_at)}</strong></div>
                        <div><span>Updated Date</span><strong>{formatDate(selectedService.updated_at)}</strong></div>
                      </div>
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
