import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import { fetchWaCampAudienceByTrust } from '../services/waCampAudienceService';
import Pagination, { PAGE_SIZE } from '../components/Pagination';
import './NoticeboardPage.css';

const STATUS_OPTIONS = ['pending', 'processing', 'sent', 'delivered', 'failed', 'permanently_failed'];

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

function statusLabel(status) {
  return String(status || 'pending')
    .split('_')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function getInitials(value = '') {
  const safe = String(value || '').trim();
  if (!safe) return 'A';
  return safe.charAt(0).toUpperCase();
}

export default function WaCampAudiencePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'whatsapp';
  const trustId = trust?.id || null;

  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const deferredSearch = useDeferredValue(search);

  useEffect(() => {
    if (!trustId) {
      navigate('/whatsapp', { replace: true, state: { userName, trust, sidebarNavKey: currentSidebarNavKey } });
      return;
    }

    const load = async () => {
      setLoading(true);
      setError('');
      const { data, error: fetchError } = await fetchWaCampAudienceByTrust(trustId);
      if (fetchError) setError(fetchError.message || 'Unable to load audience records.');
      setRecords(data || []);
      setLoading(false);
    };

    load();
  }, [navigate, trustId, userName, trust, currentSidebarNavKey]);

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

          {loading && <div className="nb-empty">Loading audience records...</div>}

          {!loading && records.length === 0 && (
            <div className="nb-empty">No audience records found for this trust.</div>
          )}

          {!loading && records.length > 0 && (
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
                        <div><span>Status</span><strong>{statusLabel(selectedRecord.status)}</strong></div>
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
