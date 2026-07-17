import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import { fetchLeads } from '../services/leadsService';
import './LeadManagementPage.css';

function parseMarks(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseLastSeen(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return null;

  const timestamp = Date.parse(rawValue);
  if (Number.isFinite(timestamp)) return timestamp;

  const isoLikeValue = rawValue.replace(' ', 'T');
  const isoTimestamp = Date.parse(isoLikeValue);
  return Number.isFinite(isoTimestamp) ? isoTimestamp : null;
}

function formatLeadTimestamp(value) {
  const rawValue = String(value || '').trim();
  if (!rawValue) return '';

  const parsed = new Date(rawValue.replace(' ', 'T'));
  if (Number.isNaN(parsed.getTime())) return rawValue;

  return parsed.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function formatCellValue(value) {
  if (value === null || value === undefined || value === '') return '-';
  return String(value);
}

function normalizeLead(row = {}) {
  return {
    ...row,
    type: row.type ?? row.last_type ?? row.lead_type ?? null,
    source: row.source ?? row.last_source ?? null,
    last_flow: row.last_flow ?? row.flow ?? null,
    last_action: row.last_action ?? row.action ?? null,
    last_seen: row.last_seen ?? row.date_time ?? row.dateTime ?? row.created_at ?? row.updated_at ?? null,
  };
}

export default function LeadManagementPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};
  const trustName = trust?.name || 'Trust';
  const trustId = trust?.id || null;

  const [leads, setLeads] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [marksSort, setMarksSort] = useState('highest');
  const [lastSeenSort, setLastSeenSort] = useState('newest');

  const loadLeads = useCallback(async (force = false) => {
    if (!trustId) {
      setError('Trust not found. Please re-open from dashboard.');
      setLeads([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');
    const startedAt = performance.now();

    const { data, error: fetchError } = await fetchLeads({ trustId, trustName, force });
    if (fetchError) {
      setError(fetchError.message || 'Unable to load leads.');
      setLeads([]);
      setLoading(false);
      if (import.meta.env.DEV) {
        console.info('[lead-management] fetch failed', {
          trustId,
          force,
          elapsedMs: Math.round(performance.now() - startedAt),
          error: fetchError.message || 'Unknown error',
        });
      }
      return;
    }

    const nextLeads = Array.isArray(data?.leads) ? data.leads.map(normalizeLead) : [];
    setLeads(nextLeads);
    setLoading(false);
    if (import.meta.env.DEV) {
      console.info('[lead-management] fetch complete', {
        trustId,
        force,
        count: nextLeads.length,
        elapsedMs: Math.round(performance.now() - startedAt),
        source: data?.source || 'unknown',
      });
    }
  }, [trustId, trustName]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      loadLeads(false);
    }, 0);

    return () => window.clearTimeout(timer);
  }, [loadLeads]);

  const visibleColumns = useMemo(
    () => [
      { key: 'name', label: 'Name' },
      { key: 'marks', label: 'Marks' },
      { key: 'mobile', label: 'Mobile' },
      { key: 'type', label: 'Type' },
      { key: 'last_flow', label: 'Last Message' },
      { key: 'last_action', label: 'Last Action' },
      { key: 'source', label: 'Source' },
    ],
    []
  );

  const filteredLeads = useMemo(() => {
    const nextRows = [...leads];

    nextRows.sort((left, right) => {
      const leftMarks = parseMarks(left?.marks);
      const rightMarks = parseMarks(right?.marks);
      const leftSeen = parseLastSeen(left?.last_seen);
      const rightSeen = parseLastSeen(right?.last_seen);

      if (marksSort !== 'none') {
        if (leftMarks !== null || rightMarks !== null) {
          const safeLeftMarks = leftMarks ?? Number.NEGATIVE_INFINITY;
          const safeRightMarks = rightMarks ?? Number.NEGATIVE_INFINITY;
          if (safeLeftMarks !== safeRightMarks) {
            return marksSort === 'highest'
              ? safeRightMarks - safeLeftMarks
              : safeLeftMarks - safeRightMarks;
          }
        }
      }

      const safeLeftSeen = leftSeen ?? 0;
      const safeRightSeen = rightSeen ?? 0;
      if (safeLeftSeen !== safeRightSeen) {
        return lastSeenSort === 'newest'
          ? safeRightSeen - safeLeftSeen
          : safeLeftSeen - safeRightSeen;
      }

      return String(left?.name || '').localeCompare(String(right?.name || ''));
    });

    return nextRows;
  }, [lastSeenSort, leads, marksSort]);

  const handleLeadClick = async (row) => {
    if (!row) return;

    navigate('/sales-marketing/leads/details', {
      state: {
        userName,
        trust,
        superuserId,
        lead: normalizeLead(row),
      },
    });
  };

  return (
    <div className="lms-page-root">
      <Sidebar
        trustName={trustName}
        onDashboard={() =>
          navigate('/dashboard', {
            state: { userName, trust, superuserId, sidebarNavKey: 'dashboard' },
          })
        }
        onLogout={() => navigate('/login')}
      />

      <main className="lms-page-main">
        <PageHeader
          title="Lead Management System"
          subtitle={`Leads for ${trustName}`}
          onBack={() =>
            navigate('/sales-marketing', {
              state: { userName, trust, superuserId, sidebarNavKey: 'sales-marketing' },
            })
          }
          right={(
            <button type="button" className="lms-btn" onClick={() => loadLeads(true)} disabled={loading}>
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          )}
        />

        <section className="lms-page-content">
          <div className="lms-page-card">
            <div className="lms-page-intro">
              <div>
                <h2>Lead records</h2>
                <p>Manage incoming leads and keep the pipeline visible for your team.</p>
              </div>
              {!loading && !error && (
                <span className="lms-meta">
                  {leads.length} lead{leads.length === 1 ? '' : 's'} found
                </span>
              )}
            </div>

            {!loading && !error && leads.length > 0 && (
              <div className="lms-filters">
                <label className="lms-filter">
                  <span>Marks</span>
                  <select value={marksSort} onChange={(event) => setMarksSort(event.target.value)}>
                    <option value="highest">Highest first</option>
                    <option value="lowest">Lowest first</option>
                    <option value="none">No marks sort</option>
                  </select>
                </label>

                <label className="lms-filter">
                  <span>Last Seen</span>
                  <select value={lastSeenSort} onChange={(event) => setLastSeenSort(event.target.value)}>
                    <option value="newest">Newest first</option>
                    <option value="oldest">Oldest first</option>
                  </select>
                </label>
              </div>
            )}

            {loading && <div className="lms-state">Loading leads...</div>}

            {!loading && error && <div className="lms-state lms-state-error">{error}</div>}

            {!loading && !error && leads.length === 0 && (
              <div className="lms-state">No leads found for this trust.</div>
            )}

            {!loading && !error && leads.length > 0 && (
              <div className="lms-table-wrap">
                <table className="lms-table">
                  <thead>
                    <tr>
                      {visibleColumns.map((col) => (
                        <th key={col.key}>{col.label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLeads.map((row, idx) => (
                      <tr
                        key={row.id ?? idx}
                        onClick={() => handleLeadClick(row)}
                        onKeyDown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            handleLeadClick(row);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        {visibleColumns.map((col) => {
                          if (col.key === 'name') {
                            return (
                              <td key={col.key}>
                                <div className="lms-lead-name">
                                  <span className="lms-lead-name-main">{formatCellValue(row[col.key])}</span>
                                  <span className="lms-lead-name-meta">
                                    {formatLeadTimestamp(row.last_seen) || '-'}
                                  </span>
                                </div>
                              </td>
                            );
                          }

                          return <td key={col.key}>{formatCellValue(row[col.key])}</td>;
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </section>

      </main>
    </div>
  );
}
