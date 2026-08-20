import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import Sidebar from '../../components/Sidebar';
import { fetchWaCampAudienceByCampaign } from '../../services/whatsapp/waCampAudienceService';
import { fetchWaCampsByTrust } from '../../services/whatsapp/waCampService';
import { fetchWaServicesByTrust } from '../../services/whatsapp/waServiceProviderService';
import { fetchWaTemplatesByTrust } from '../../services/whatsapp/waTemplateService';
import Pagination, { PAGE_SIZE } from '../../components/Pagination';
import '../NoticeboardPage.css';

const STATUS_OPTIONS = ['pending', 'processing', 'sent', 'delivered', 'failed', 'permanently_failed'];
const CAMPAIGN_STATUS_OPTIONS = ['pending', 'processing', 'sent', 'delivered', 'failed', 'cancelled'];
const AUDIENCE_METRIC_CARDS = [
  {
    label: 'Template',
    value: '_rwas_data',
    hint: '10 Aug 2026 11:31 AM',
    tone: 'blue',
    icon: 'megaphone',
  },
  {
    label: 'Contacts',
    value: '324',
    hint: '100% of your contacts',
    tone: 'sky',
    icon: 'user',
  },
  {
    label: 'Sent',
    value: '323',
    hint: '99.7% of contacts',
    tone: 'purple',
    icon: 'send',
  },
  {
    label: 'Delivered',
    value: '200',
    hint: '61.7% delivery rate',
    tone: 'green',
    icon: 'check',
  },
  {
    label: 'Failed',
    value: '91',
    hint: '28.1% not delivered',
    tone: 'red',
    icon: 'x',
  },
  {
    label: 'Pending / In Queue',
    value: '33',
    hint: 'Still sending or awaiting delivery status',
    tone: 'slate',
    icon: 'clock',
  },
];

function formatDateTime(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCampaignDate(value) {
  if (!value) return '-';
  const [year, month, day] = String(value).split('-');
  if (!year || !month || !day) return value;
  return `${day}-${month}-${year}`;
}

function formatCampaignTime(value) {
  if (!value) return '';
  const [h, m] = String(value).split(':');
  const hour = Number(h);
  if (Number.isNaN(hour)) return value;
  const suffix = hour >= 12 ? 'PM' : 'AM';
  const hour12 = ((hour + 11) % 12) + 1;
  return `${String(hour12).padStart(2, '0')}:${m || '00'} ${suffix}`;
}

function formatCampaignDateTime(dateValue, timeValue) {
  return `${formatCampaignDate(dateValue)} ${formatCampaignTime(timeValue)}`.trim();
}

function statusLabel(status) {
  return String(status || 'pending')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function statusPillClass(status) {
  return `nb-status-pill nb-status-pill-${status || 'pending'}`;
}

function getInitials(value = '') {
  const safe = String(value || '').trim();
  if (!safe) return 'A';
  return safe.charAt(0).toUpperCase();
}

function MetricIcon({ type }) {
  if (type === 'user') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M20 21a8 8 0 0 0-16 0" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
        <path d="M12 13a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  if (type === 'send') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m22 2-7 20-4-9-9-4 20-7Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
        <path d="M22 2 11 13" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === 'check') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="m20 6-11 11-5-5" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (type === 'x') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M18 6 6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
      </svg>
    );
  }
  if (type === 'clock') {
    return (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path d="M12 8v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20Z" stroke="currentColor" strokeWidth="2" />
      </svg>
    );
  }
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M3 11v2a2 2 0 0 0 2 2h2l4 4v-4h2l8 4V5l-8 4H5a2 2 0 0 0-2 2Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function normalizeProviderId(value) {
  return String(value || '').trim();
}

export default function WaCampAudiencePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'whatsapp';
  const trustId = trust?.id || null;

  const [campaigns, setCampaigns] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [services, setServices] = useState([]);
  const [campaignsLoading, setCampaignsLoading] = useState(true);
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [campaignSearch, setCampaignSearch] = useState('');
  const [campaignStatusFilter, setCampaignStatusFilter] = useState('all');
  const [campaignProviderFilter, setCampaignProviderFilter] = useState('all');
  const [campaignStartDate, setCampaignStartDate] = useState('');
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);
  const hasCampaignFilters = Boolean(
    campaignSearch || campaignStatusFilter !== 'all' || campaignProviderFilter !== 'all' || campaignStartDate
  );

  // wa_camp_audience_view RPC only accepts a single campaign id, so we first
  // need the trust's campaign list to let the user pick which one to view.
  useEffect(() => {
    if (!trustId) {
      navigate('/whatsapp', { replace: true, state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
      return;
    }

    const loadCampaigns = async () => {
      setCampaignsLoading(true);
      const [
        { data, error: fetchError },
        { data: templateData, error: templateError },
        { data: serviceData, error: serviceError },
      ] = await Promise.all([
        fetchWaCampsByTrust(trustId),
        fetchWaTemplatesByTrust(trustId),
        fetchWaServicesByTrust(trustId),
      ]);
      if (fetchError) setError(fetchError.message || 'Unable to load campaigns.');
      else if (templateError) setError(templateError.message || 'Unable to load templates.');
      else if (serviceError) setError(serviceError.message || 'Unable to load service providers.');
      const list = data || [];
      setCampaigns(list);
      setTemplates(templateData || []);
      setServices(serviceData || []);
      setSelectedCampaignId((prev) => (prev && list.some((c) => c.id === prev) ? prev : ''));
      setCampaignsLoading(false);
    };

    loadCampaigns();
  }, [navigate, trustId, userName, trust, currentSidebarNavKey]);

  const templateById = useMemo(() => {
    return new Map(templates.map((template) => [template.id, template]));
  }, [templates]);

  const serviceById = useMemo(() => {
    return new Map(services.map((service) => [service.id, service]));
  }, [services]);

  const getCampaignTemplate = (campaign) => campaign?.template || templateById.get(campaign?.template_id) || null;

  const getCampaignProviderId = (campaign) => {
    const template = getCampaignTemplate(campaign);
    return normalizeProviderId(
      template?.wa_service_id ||
      template?.waService?.id ||
      template?.WaService?.id ||
      template?.wa_service?.id ||
      campaign?.wa_service_id
    );
  };

  const getCampaignProviderLabel = (campaign) => {
    const template = getCampaignTemplate(campaign);
    const providerId = getCampaignProviderId(campaign);
    const service = serviceById.get(providerId);
    return (
      service?.provider ||
      service?.name ||
      template?.waService?.provider ||
      template?.waService?.name ||
      template?.WaService?.provider ||
      template?.WaService?.name ||
      template?.wa_service?.provider ||
      template?.wa_service?.name ||
      'Unknown Provider'
    );
  };

  const campaignProviderOptions = useMemo(() => {
    const providers = new Map();
    campaigns.forEach((campaign) => {
      const providerId = getCampaignProviderId(campaign);
      if (!providerId || providers.has(providerId)) return;
      providers.set(providerId, getCampaignProviderLabel(campaign));
    });
    return Array.from(providers, ([id, label]) => ({ id, label })).sort((left, right) =>
      left.label.localeCompare(right.label)
    );
  }, [campaigns, serviceById, templateById]);

  const filteredCampaigns = useMemo(() => {
    const term = campaignSearch.trim().toLowerCase();
    let list = [...campaigns];

    if (campaignStatusFilter !== 'all') {
      list = list.filter((item) => (item.status || 'pending') === campaignStatusFilter);
    }

    if (campaignProviderFilter !== 'all') {
      list = list.filter((item) => getCampaignProviderId(item) === campaignProviderFilter);
    }

    if (campaignStartDate) {
      list = list.filter((item) => item.schedule_date === campaignStartDate);
    }

    if (term) {
      list = list.filter((item) => {
        const haystack = [
          item?.template?.name,
          item?.template?.language,
          item?.schedule_date,
          item?.schedule_time,
          item?.status,
          getCampaignProviderLabel(item),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      });
    }

    list.sort((left, right) => String(right?.created_at || '').localeCompare(String(left?.created_at || '')));

    return list;
  }, [campaigns, campaignSearch, campaignStatusFilter, campaignProviderFilter, campaignStartDate, serviceById, templateById]);

  const selectedCampaign = useMemo(
    () => campaigns.find((c) => c.id === selectedCampaignId) || null,
    [campaigns, selectedCampaignId]
  );

  const campaignSelectOptions = useMemo(() => {
    return filteredCampaigns;
  }, [filteredCampaigns]);

  const clearCampaignFilters = () => {
    setCampaignSearch('');
    setCampaignStatusFilter('all');
    setCampaignProviderFilter('all');
    setCampaignStartDate('');
  };

  useEffect(() => {
    if (!selectedCampaignId) return;
    const selectedVisible = filteredCampaigns.some((camp) => camp.id === selectedCampaignId);
    if (selectedVisible) return;
    setSelectedCampaignId('');
    setRecords([]);
    setSelectedId('');
    setPage(1);
  }, [filteredCampaigns, selectedCampaignId]);

  useEffect(() => {
    if (!trustId || !selectedCampaignId) {
      setRecords([]);
      setSelectedId('');
      setLoading(false);
      return;
    }

    let active = true;
    const load = async () => {
      setLoading(true);
      setError('');
      const { data, error: fetchError } = await fetchWaCampAudienceByCampaign(selectedCampaignId, trustId);
      if (!active) return;
      if (fetchError) setError(fetchError.message || 'Unable to load audience records.');
      const withCampaign = (data || []).map((item) => ({
        ...item,
        camp_id: item.camp_id || selectedCampaignId,
        campaign: selectedCampaign,
        template: selectedCampaign?.template || null,
      }));
      setRecords(withCampaign);
      setLoading(false);
    };

    load();
    return () => {
      active = false;
    };
  }, [trustId, selectedCampaignId, selectedCampaign]);

  const showLoading = campaignsLoading || (loading && !!selectedCampaignId);

  const statusCounts = useMemo(() => {
    return records.reduce((acc, item) => {
      const key = item.status || 'pending';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {});
  }, [records]);

  const filteredRecords = useMemo(() => {
    const term = deferredSearch.trim().toLowerCase();
    let list = [...records];

    if (statusFilter !== 'all') list = list.filter((item) => (item.status || 'pending') === statusFilter);

    if (term) {
      list = list.filter((item) => {
        const haystack = [
          item?.phone,
          item?.template?.name,
          item?.provider_message_id,
          ...Object.values(item?.variables || {}),
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return haystack.includes(term);
      });
    }

    list.sort((left, right) => String(right?.created_at || '').localeCompare(String(left?.created_at || '')));
    return list;
  }, [records, deferredSearch, statusFilter]);

  const selectedRecord = useMemo(
    () => filteredRecords.find((item) => item.id === selectedId) || null,
    [filteredRecords, selectedId]
  );

  useEffect(() => {
    if (loading) return;
    if (!filteredRecords.length) {
      setSelectedId('');
      return;
    }
    const exists = filteredRecords.some((item) => item.id === selectedId);
    if (!exists) setSelectedId(filteredRecords[0].id);
  }, [filteredRecords, selectedId, loading]);

  useEffect(() => {
    const idx = filteredRecords.findIndex((item) => item.id === selectedId);
    if (idx === -1) return;
    const targetPage = Math.floor(idx / PAGE_SIZE) + 1;
    setPage((prev) => (prev === targetPage ? prev : targetPage));
  }, [selectedId, filteredRecords]);

  const totalPages = Math.max(1, Math.ceil(filteredRecords.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pagedRecords = filteredRecords.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const variableEntries = useMemo(
    () => Object.entries(selectedRecord?.variables || {}),
    [selectedRecord]
  );

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
          title="Whatsapp Audience"
          subtitle="View campaign recipients and delivery status"
          onBack={() => navigate('/whatsapp', { state: { userName, trust, sidebarNavKey: currentSidebarNavKey } })}
        />

        <section className="nb-content">
          {error && <div className="nb-error">{error}</div>}

          {!campaignsLoading && campaigns.length === 0 && (
            <div className="nb-empty">No campaigns found for this trust.</div>
          )}

          {campaigns.length > 0 && (
            <section className="nb-filter-card">
              <div className="nb-filter-head">
                <h3>Campaign Filters</h3>
                <div className="nb-filter-head-actions">
                  <span>
                    Showing {filteredCampaigns.length} of {campaigns.length}
                  </span>
                  <button
                    type="button"
                    className="nb-clear-filter-btn"
                    onClick={clearCampaignFilters}
                    disabled={!hasCampaignFilters}
                  >
                    Clear Filters
                  </button>
                </div>
              </div>
              <div className="nb-filter-grid nb-filter-grid-5">
                <label>
                  <span>Campaign</span>
                  <select
                    value={selectedCampaignId}
                    onChange={(event) => setSelectedCampaignId(event.target.value)}
                  >
                    <option value="">
                      {campaignSelectOptions.length === 0 ? 'No campaigns match' : 'Select campaign'}
                    </option>
                    {campaignSelectOptions.map((camp) => (
                      <option key={camp.id} value={camp.id}>
                        {camp.template?.name || 'Untitled template'} - {formatCampaignDateTime(camp.schedule_date, camp.schedule_time)}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Search Campaign</span>
                  <input
                    value={campaignSearch}
                    onChange={(event) => setCampaignSearch(event.target.value)}
                    placeholder="Search template, date or status..."
                  />
                </label>
                <label>
                  <span>Status</span>
                  <select
                    value={campaignStatusFilter}
                    onChange={(event) => setCampaignStatusFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    {CAMPAIGN_STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>{statusLabel(status)}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Service Provider</span>
                  <select
                    value={campaignProviderFilter}
                    onChange={(event) => setCampaignProviderFilter(event.target.value)}
                  >
                    <option value="all">All</option>
                    {campaignProviderOptions.map((provider) => (
                      <option key={provider.id} value={provider.id}>{provider.label}</option>
                    ))}
                  </select>
                </label>
                <label>
                  <span>Start Date</span>
                  <input
                    type="date"
                    value={campaignStartDate}
                    onChange={(event) => setCampaignStartDate(event.target.value)}
                    onClick={(event) => event.target.showPicker?.()}
                  />
                </label>
              </div>
              {selectedCampaign && (
                <div className="nb-selected-campaign">
                  <strong>{selectedCampaign.template?.name || 'Untitled template'}</strong>
                  <span>{formatCampaignDateTime(selectedCampaign.schedule_date, selectedCampaign.schedule_time)}</span>
                  <span className={statusPillClass(selectedCampaign.status)}>{statusLabel(selectedCampaign.status)}</span>
                  <span>{records.length} recipient{records.length === 1 ? '' : 's'}</span>
                </div>
              )}
            </section>
          )}

          {showLoading && <div className="nb-empty">Loading audience records...</div>}

          {!showLoading && campaigns.length > 0 && !selectedCampaignId && (
            <div className="nb-empty">Select a campaign to view audience records.</div>
          )}

          {!showLoading && campaigns.length > 0 && selectedCampaignId && records.length === 0 && (
            <div className="nb-empty">No audience records found for this campaign.</div>
          )}

          {!showLoading && selectedCampaignId && (
            <section className="nb-audience-metrics" aria-label="Audience status summary">
              {AUDIENCE_METRIC_CARDS.map((card) => (
                <button
                  key={card.label}
                  type="button"
                  className={`nb-audience-metric nb-audience-metric-${card.tone}`}
                >
                  <div>
                    <span>{card.label}</span>
                    <strong>{card.value}</strong>
                    <small>{card.hint}</small>
                  </div>
                  <b aria-hidden="true">
                    <MetricIcon type={card.icon} />
                  </b>
                </button>
              ))}
            </section>
          )}

          {!showLoading && selectedCampaignId && records.length > 0 && (
            <section className="nb-profile-layout">
              <aside className="nb-left-panel">
                <div className="nb-left-head">
                  <h3>All Recipients</h3>
                  <span className="nb-left-count">{records.length}</span>
                </div>

                <input
                  className="nb-left-search"
                  placeholder="Search by name, phone or template..."
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />

                <label style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Status</span>
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                    style={{
                      height: 44,
                      border: '1px solid #cbd5e1',
                      borderRadius: 12,
                      background: '#fff',
                      color: '#0f172a',
                      fontSize: 14,
                      padding: '0 12px',
                    }}
                  >
                    <option value="all">All ({records.length})</option>
                    {STATUS_OPTIONS.map((status) => (
                      <option key={status} value={status}>
                        {statusLabel(status)} ({statusCounts[status] || 0})
                      </option>
                    ))}
                  </select>
                </label>

                <div className="nb-left-list">
                  {filteredRecords.length === 0 && (
                    <div className="nb-empty">No recipients matched your filters.</div>
                  )}
                  {pagedRecords.map((item) => (
                    <button
                      key={item.id}
                      className={`nb-left-item ${selectedId === item.id ? 'active' : ''}`}
                      onClick={() => setSelectedId(item.id)}
                      type="button"
                    >
                      <div className="nb-left-avatar">{getInitials(item?.phone)}</div>
                      <div className="nb-left-item-body">
                        <div className="nb-left-item-title">{item.phone || '-'}</div>
                        <div className="nb-left-item-sub">{item.template?.name || 'No template'} • {statusLabel(item.status)}</div>
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
                {!selectedRecord && (
                  <div className="nb-empty">Select a recipient to view details.</div>
                )}

                {selectedRecord && (
                  <>
                    <div className="nb-profile-hero">
                      <div className="nb-profile-hero-left">
                        <div className="nb-profile-avatar">{getInitials(selectedRecord.phone)}</div>
                        <div>
                          <h3>{selectedRecord.phone || '-'}</h3>
                        </div>
                      </div>
                    </div>

                    <div className="nb-profile-details">
                      <div className="nb-profile-details-head">
                        <h3>Recipient Details</h3>
                      </div>
                      <div className="nb-profile-detail-grid">
                        <div><span>Template</span><strong>{selectedRecord.template?.name || '-'}</strong></div>
                        <div>
                          <span>Status</span>
                          <strong>
                            <span className={statusPillClass(selectedRecord.status)}>{statusLabel(selectedRecord.status)}</span>
                          </strong>
                        </div>
                        <div><span>Provider Message Id</span><strong>{selectedRecord.provider_message_id || '-'}</strong></div>
                        <div><span>Scheduled At</span><strong>{formatDateTime(selectedRecord.schedule_date_time)}</strong></div>
                        <div><span>Sent At</span><strong>{formatDateTime(selectedRecord.sent_at)}</strong></div>
                        <div><span>Delivered At</span><strong>{formatDateTime(selectedRecord.delivered_at)}</strong></div>
                        <div><span>Created Date</span><strong>{formatDateTime(selectedRecord.created_at)}</strong></div>
                        <div><span>Updated Date</span><strong>{formatDateTime(selectedRecord.updated_at)}</strong></div>
                      </div>

                      {variableEntries.length > 0 && (
                        <div style={{ marginTop: 14 }}>
                          <span style={{ fontSize: 12, fontWeight: 600, color: '#64748b' }}>Variables</span>
                          <div className="nb-left-list" style={{ marginTop: 6 }}>
                            {variableEntries.map(([key, val]) => (
                              <div key={key} className="nb-left-item" style={{ cursor: 'default' }}>
                                <div className="nb-left-item-body">
                                  <div className="nb-left-item-title">{key}</div>
                                  <div className="nb-left-item-sub">{String(val ?? '') || '-'}</div>
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
