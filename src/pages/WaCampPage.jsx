import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import WaCampImport from '../components/WaCampImport';
import Pagination, { PAGE_SIZE } from '../components/Pagination';
import { fetchWaTemplatesByTrust } from '../services/waTemplateService';
import { fetchWaCampsByTrust, submitWaCampaign } from '../services/waCampService';
import './NoticeboardPage.css';

const STATUS_OPTIONS = ['pending', 'sent', 'failed', 'cancelled'];

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(value) {
  if (!value) return '-';
  const [h, m] = String(value).split(':');
  const hour = Number(h);
  if (Number.isNaN(hour)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = ((hour + 11) % 12) + 1;
  return `${hour12}:${m || '00'} ${suffix}`;
}

function getInitials(value = '') {
  const safe = String(value || '').trim();
  if (!safe) return 'C';
  return safe.charAt(0).toUpperCase();
}

function buildScheduledAt(date, time) {
  if (!date || !time) return null;
  const parsed = new Date(`${date}T${time}:00`);
  if (Number.isNaN(parsed.getTime())) return null;
  return parsed.toISOString();
}

const EMPTY_FORM = {
  template_id: '',
  schedule_date: '',
  schedule_time: '',
  status: 'pending',
};

export default function WaCampPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'whatsapp';
  const trustId = trust?.id || null;
  const isCreateRoute = location.pathname === '/whatsapp/campaign/create';
  const isEditRoute = location.pathname === '/whatsapp/campaign/edit';
  const isFormRoute = isCreateRoute || isEditRoute;
  const routeEditId = location.state?.editId || new URLSearchParams(location.search).get('id') || '';

  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [activeMenuId, setActiveMenuId] = useState(null);
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [editingId, setEditingId] = useState(null);
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);

  const [form, setForm] = useState(EMPTY_FORM);
  const [senderList, setSenderList] = useState([]);

  const approvedTemplates = useMemo(() => templates.filter((item) => item.approved), [templates]);
  const selectedTemplate = useMemo(
    () => templates.find((item) => item.id === form.template_id) || null,
    [templates, form.template_id]
  );

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setSenderList([]);
    setFormError('');
    setEditingId(null);
  };

  const goToList = () => {
    navigate('/whatsapp/campaign', { replace: true, state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
  };

  useEffect(() => {
    if (!trustId) {
      navigate('/whatsapp', { replace: true, state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
      return;
    }

    const load = async () => {
      setLoading(true);
      setError('');
      const [{ data: campData, error: campError }, { data: templateData, error: templateError }] = await Promise.all([
        fetchWaCampsByTrust(trustId),
        fetchWaTemplatesByTrust(trustId),
      ]);
      if (campError) setError(campError.message || 'Unable to load campaigns.');
      else if (templateError) setError(templateError.message || 'Unable to load templates.');
      setCampaigns(campData || []);
      setTemplates(templateData || []);
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
    return campaigns.reduce((acc, item) => {
      const key = item.status || 'pending';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [campaigns]);

  const filteredCampaigns = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    let list = [...campaigns];

    if (statusFilter !== 'all') list = list.filter((item) => (item.status || 'pending') === statusFilter);

    if (term) {
      list = list.filter((item) => {
        const templateName = String(item?.template?.name || '').toLowerCase();
        return templateName.includes(term);
      });
    }

    list.sort((left, right) => String(right?.created_at || '').localeCompare(String(left?.created_at || '')));
    return list;
  }, [campaigns, deferredSearch, statusFilter]);

  const selectedCampaign = useMemo(
    () => filteredCampaigns.find((item) => item.id === selectedId) || null,
    [filteredCampaigns, selectedId]
  );

  useEffect(() => {
    if (loading || isFormRoute) return;
    if (!filteredCampaigns.length) {
      setSelectedId('');
      return;
    }
    const exists = filteredCampaigns.some((item) => item.id === selectedId);
    if (!exists) setSelectedId(filteredCampaigns[0].id);
  }, [filteredCampaigns, selectedId, loading, isFormRoute]);

  useEffect(() => {
    const idx = filteredCampaigns.findIndex((item) => item.id === selectedId);
    if (idx === -1) return;
    const targetPage = Math.floor(idx / PAGE_SIZE) + 1;
    setPage((prev) => (prev === targetPage ? prev : targetPage));
  }, [selectedId, filteredCampaigns]);

  const totalPages = Math.max(1, Math.ceil(filteredCampaigns.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedCampaigns = filteredCampaigns.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  useEffect(() => {
    if (!isFormRoute) return;

    if (isCreateRoute) {
      resetForm();
      return;
    }

    if (!isEditRoute) return;
    const targetId = String(routeEditId || selectedId || '');
    if (!targetId) return;
    const target = campaigns.find((item) => String(item.id) === targetId);
    if (!target) return;

    setForm({
      template_id: target.template_id || '',
      schedule_date: target.schedule_date || '',
      schedule_time: target.schedule_time || '',
      status: target.status || 'pending',
    });
    setSenderList(Array.isArray(target.sender_list) ? target.sender_list : []);
    setEditingId(target.id);
    setFormError('');
  }, [isFormRoute, isCreateRoute, isEditRoute, routeEditId, selectedId, campaigns]);

  const handleSend = async () => {
    setFormError('');
    if (!form.template_id) {
      setFormError('Template is required.');
      return;
    }
    if (!form.schedule_date) {
      setFormError('Schedule date is required.');
      return;
    }
    if (!form.schedule_time) {
      setFormError('Schedule time is required.');
      return;
    }
    if (senderList.length === 0) {
      setFormError('Upload an Excel/CSV file with at least one row first.');
      return;
    }

    const scheduledAt = buildScheduledAt(form.schedule_date, form.schedule_time);
    if (!scheduledAt) {
      setFormError('Invalid schedule date/time.');
      return;
    }

    setSaving(true);
    const { data, error: submitError } = await submitWaCampaign({
      trustId,
      templateId: form.template_id,
      rows: senderList,
      scheduledAt,
    });

    if (submitError) {
      setFormError(submitError.message || 'Unable to submit campaign.');
      setSaving(false);
      return;
    }

    const { data: refreshed, error: refreshError } = await fetchWaCampsByTrust(trustId);
    if (!refreshError) setCampaigns(refreshed || []);
    setSelectedId(data?.wa_camp_id || '');

    resetForm();
    setSaving(false);
    if (isFormRoute) goToList();
  };

  const handleEdit = (item) => {
    setForm({
      template_id: item.template_id || '',
      schedule_date: item.schedule_date || '',
      schedule_time: item.schedule_time || '',
      status: item.status || 'pending',
    });
    setSenderList(Array.isArray(item.sender_list) ? item.sender_list : []);
    setEditingId(item.id);
    setFormError('');
    setActiveMenuId(null);
    navigate(`/whatsapp/campaign/edit?id=${item.id}`, {
      state: { userName, trust, editId: item.id, sidebarNavKey: currentSidebarNavKey },
    });
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
          title="Whatsapp Campaign"
          subtitle="Manage WhatsApp campaigning & scheduling"
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
              <h3>{editingId ? 'Edit Campaign' : 'Create Campaign'}</h3>
              <div className="nb-form-layout">
                <section className="nb-form-section">
                  <h4 className="nb-section-title">Campaign Details</h4>
                  <div className="nb-form-grid nb-form-grid-2">
                    <label>
                      <span>Template *</span>
                      <select
                        value={form.template_id}
                        onChange={(e) => setForm((prev) => ({ ...prev, template_id: e.target.value }))}
                      >
                        <option value="">Select approved template</option>
                        {approvedTemplates.map((template) => (
                          <option key={template.id} value={template.id}>
                            {template.name} ({template.language})
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      <span>Service Provider</span>
                      <input
                        value={selectedTemplate?.waService?.provider || selectedTemplate?.waService?.name || ''}
                        placeholder="Select a template"
                        disabled
                        readOnly
                      />
                    </label>
                    <label>
                      <span>Schedule Date *</span>
                      <input
                        type="date"
                        value={form.schedule_date}
                        onChange={(e) => setForm((prev) => ({ ...prev, schedule_date: e.target.value }))}
                        onClick={(e) => e.target.showPicker?.()}
                      />
                    </label>
                    <label>
                      <span>Schedule Time *</span>
                      <input
                        type="time"
                        value={form.schedule_time}
                        onChange={(e) => setForm((prev) => ({ ...prev, schedule_time: e.target.value }))}
                        onClick={(e) => e.target.showPicker?.()}
                      />
                    </label>
                  </div>
                </section>

                <section className="nb-form-section">
                  <h4 className="nb-section-title">Sender List</h4>
                  {!form.template_id ? (
                    <div className="nb-empty">Select a template first.</div>
                  ) : (
                    <WaCampImport
                      value={senderList}
                      onChange={setSenderList}
                      templateId={form.template_id}
                      trustId={trustId}
                    />
                  )}
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
                <button className="nb-add-btn" onClick={handleSend} disabled={saving} type="button">
                  {saving ? 'Sending...' : 'Send'}
                </button>
              </div>
            </div>
          )}

          {!isFormRoute && loading && <div className="nb-empty">Loading campaigns...</div>}

          {!isFormRoute && !loading && campaigns.length === 0 && (
            <div className="nb-empty">
              <button
                className="nb-add-btn nb-list-add-btn"
                type="button"
                onClick={() => navigate('/whatsapp/campaign/create', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
              >
                Add Campaign
              </button>
              <div>No campaign found for this trust. Create your first one.</div>
            </div>
          )}

          {!isFormRoute && !loading && campaigns.length > 0 && (
            <section className="nb-profile-layout">
              <aside className="nb-left-panel">
                <div className="nb-left-head">
                  <h3>All Campaigns</h3>
                  <span className="nb-left-count">{campaigns.length}</span>
                </div>

                <input
                  className="nb-left-search"
                  placeholder="Search by template..."
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
                    <b>{campaigns.length}</b>
                  </button>
                  {STATUS_OPTIONS.map((status) => (
                    <button
                      key={status}
                      type="button"
                      className={`nb-category-tab ${statusFilter === status ? 'active' : ''}`}
                      onClick={() => setStatusFilter(status)}
                    >
                      <span>{status.charAt(0).toUpperCase() + status.slice(1)}</span>
                      <b>{statusCounts[status] || 0}</b>
                    </button>
                  ))}
                </div>

                <button
                  className="nb-add-btn nb-list-add-btn"
                  type="button"
                  onClick={() => navigate('/whatsapp/campaign/create', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
                >
                  Add Campaign
                </button>

                <div className="nb-left-list">
                  {filteredCampaigns.length === 0 && (
                    <div className="nb-empty">No campaign matched your filters.</div>
                  )}
                  {pagedCampaigns.map((item) => (
                    <button
                      key={item.id}
                      className={`nb-left-item ${selectedId === item.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                      type="button"
                    >
                      <div className="nb-left-avatar">{getInitials(item?.template?.name)}</div>
                      <div className="nb-left-item-body">
                        <div className="nb-left-item-title">{item.template?.name || 'Untitled template'}</div>
                        <div className="nb-left-item-sub">
                          {formatDate(item.schedule_date)} • {formatTime(item.schedule_time)}
                        </div>
                        <div className="nb-left-item-sub">
                          {item.sender_list.length} recipient(s) • {item.status}
                        </div>
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
                {!selectedCampaign && <div className="nb-empty">Select a campaign to view details.</div>}

                {selectedCampaign && (
                  <>
                    <div className="nb-profile-hero">
                      <div className="nb-profile-hero-left">
                        <div className="nb-profile-avatar">{getInitials(selectedCampaign.template?.name)}</div>
                        <div>
                          <h3>{selectedCampaign.template?.name || 'Untitled template'}</h3>
                          <div className="nb-profile-hero-actions">
                            <button className="nb-secondary-btn" type="button" onClick={() => handleEdit(selectedCampaign)}>
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
                            setActiveMenuId((prev) => (prev === selectedCampaign.id ? null : selectedCampaign.id));
                          }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                            <path d="M12 20h9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                            <path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
                          </svg>
                        </button>
                        {activeMenuId === selectedCampaign.id && (
                          <div className="nb-card-menu">
                            <button type="button" onClick={() => handleEdit(selectedCampaign)}>
                              Edit Details
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="nb-profile-details">
                      <div className="nb-profile-details-head">
                        <h3>Campaign Details</h3>
                      </div>
                      <div className="nb-profile-detail-grid">
                        <div><span>Template</span><strong>{selectedCampaign.template?.name || '-'}</strong></div>
                        <div><span>Language</span><strong>{selectedCampaign.template?.language || '-'}</strong></div>
                        <div><span>Schedule Date</span><strong>{formatDate(selectedCampaign.schedule_date)}</strong></div>
                        <div><span>Schedule Time</span><strong>{formatTime(selectedCampaign.schedule_time)}</strong></div>
                        <div><span>Status</span><strong>{selectedCampaign.status}</strong></div>
                        <div><span>Recipients</span><strong>{selectedCampaign.sender_list.length}</strong></div>
                        <div><span>Created Date</span><strong>{formatDate(selectedCampaign.created_at)}</strong></div>
                        <div><span>Updated Date</span><strong>{formatDate(selectedCampaign.updated_at)}</strong></div>
                      </div>

                      {selectedCampaign.sender_list.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Sender List</span>
                          <div className="nb-left-list" style={{ marginTop: 6, maxHeight: 300, overflowY: 'auto' }}>
                            {selectedCampaign.sender_list.map((entry, index) => (
                              <div key={`${entry.phone}-${index}`} className="nb-left-item" style={{ cursor: 'default' }}>
                                <div className="nb-left-item-body">
                                  <div className="nb-left-item-title">{entry.phone}</div>
                                  {entry.variables && Object.keys(entry.variables).length > 0 && (
                                    <div className="nb-left-item-sub">
                                      {Object.entries(entry.variables)
                                        .map(([key, val]) => `${key}: ${val || '-'}`)
                                        .join(' • ')}
                                    </div>
                                  )}
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
