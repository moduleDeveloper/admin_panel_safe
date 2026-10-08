import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../../../core/components/PageHeader';
import Sidebar from '../../../core/components/Sidebar';
import { fetchTrustCreationStats } from '../services/trustInsightsService';
import '../../../core/pages/legacy/SimplePage.css';
import './TrustInsightsPage.css';

// Local calendar dates, 'YYYY-MM-DD'
const DATE_PRESETS = [
  { key: 'today', label: 'Today' },
  { key: 'last7days', label: 'Last 7 Days' },
  { key: 'last30days', label: 'Last 30 Days' },
  { key: 'custom', label: 'Custom Range' },
];

const toLocalDateInput = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

const getPresetRange = (preset) => {
  const today = new Date();
  const start = new Date(today);
  if (preset === 'last7days') start.setDate(start.getDate() - 6);
  if (preset === 'last30days') start.setDate(start.getDate() - 29);
  return { from: toLocalDateInput(start), to: toLocalDateInput(today) };
};

const formatDateTime = (input) => {
  if (!input) return '--';
  const parsed = new Date(input);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
};

const formatDayMonth = (localDate) => {
  const parsed = new Date(`${localDate}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return '--';
  return parsed.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

export default function TrustInsightsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};
  const trustName = trust?.name || 'Trust';

  const [datePreset, setDatePreset] = useState('last7days');
  const [fromDate, setFromDate] = useState(() => getPresetRange('last7days').from);
  const [toDate, setToDate] = useState(() => getPresetRange('last7days').to);
  // Last settled response, tagged with the range it was fetched for
  const [result, setResult] = useState({ rangeKey: '', stats: null, error: '' });

  const [pageSize, setPageSize] = useState(10);
  const [pageState, setPageState] = useState({ rangeKey: '', page: 1 });

  const rangeInvalid =!fromDate || !toDate || fromDate > toDate;
  const rangeKey = `${fromDate}|${toDate}`;
  const loading = !rangeInvalid && result.rangeKey !== rangeKey;
  const stats = result.stats;
  const error = result.rangeKey === rangeKey ? result.error : '';

  useEffect(() => {
    if (rangeInvalid) return undefined;
    let cancelled = false;
    const key = `${fromDate}|${toDate}`;

    (async () => {
      let next;
      try {
        const { data, error: fetchError } = await fetchTrustCreationStats({ from: fromDate, to: toDate });
        next = fetchError || !data
          ? { rangeKey: key, stats: null, error: fetchError?.message || 'Unable to load trust stats.' }
          : { rangeKey: key, stats: data, error: '' };
      } catch (err) {
        next = { rangeKey: key, stats: null, error: err?.message || 'Unable to load trust stats.' };
      }
      if (!cancelled) setResult(next);
    })();

    return () => {
      cancelled = true;
    };
  }, [fromDate, toDate, rangeInvalid]);

  const handlePresetChange = (preset) => {
    setDatePreset(preset);
    if (preset === 'custom') return; // keep the current range as the custom starting point
    const range = getPresetRange(preset);
    setFromDate(range.from);
    setToDate(range.to);
  };

  const goToExtra = () =>
    navigate('/dashboard', {
      state: { userName, trust, superuserId, sidebarNavKey: 'extra' },
    });

  const kpiCards = [
    {
      label: 'Total Trusts',
      value: stats ? String(stats.totalTrusts) : '--',
      note: 'All trusts created',
      tone: 'violet',
    },
    {
      label: 'Created Today',
      value: stats ? String(stats.createdToday) : '--',
      note: 'Since local midnight',
      tone: 'green',
    },
    {
      label: 'Selected Period',
      value: stats ? String(stats.createdInPeriod) : '--',
      note: rangeInvalid ? 'Invalid range' : `${formatDayMonth(fromDate)} – ${formatDayMonth(toDate)}`,
      tone: 'orange',
    },
    {
      label: 'Last Trust Created',
      value: stats?.lastTrust?.created_at ? formatDateTime(stats.lastTrust.created_at) : '--',
      note: !stats ? '' : (stats.lastTrust ? (stats.lastTrust.name || 'Name not set') : 'No trusts yet'),
      tone: 'cyan',
      compact: true,
    },
  ];

  const trusts = stats?.trusts || [];

  // Local pagination; the page resets to 1 whenever the date range changes
  const totalPages = Math.max(Math.ceil(trusts.length / pageSize), 1);
  const currentPage = Math.min(pageState.rangeKey === rangeKey ? pageState.page : 1, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const visibleTrusts = trusts.slice(pageStart, pageStart + pageSize);
  const goToPage = (page) => setPageState({ rangeKey, page });

  return (
    <div className="simple-root">
      <Sidebar trustName={trustName} onDashboard={goToExtra} onLogout={() => navigate('/login')} />

      <main className="simple-main">
        <PageHeader
          title="Trust Insights"
          subtitle="Total trusts created and recent trust activity across the platform."
          onBack={goToExtra}
        />

        <div className="simple-content">
          <section className="ti-card">
            <div className="ti-head">
              <div>
                <h2>Trust Creation Overview</h2>
                <span>All trusts on the platform · based on creation date</span>
              </div>
              <div className="ti-presets" role="group" aria-label="Trust creation date range">
                {DATE_PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    className={datePreset === preset.key ? 'is-active' : ''}
                    aria-pressed={datePreset === preset.key}
                    onClick={() => handlePresetChange(preset.key)}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>

            {datePreset === 'custom' && (
              <div className="ti-range">
                <label>
                  <span>From</span>
                  <input
                    type="date"
                    value={fromDate}
                    max={toDate || undefined}
                    onChange={(event) => setFromDate(event.target.value)}
                  />
                </label>
                <label>
                  <span>To</span>
                  <input
                    type="date"
                    value={toDate}
                    min={fromDate || undefined}
                    onChange={(event) => setToDate(event.target.value)}
                  />
                </label>
                {rangeInvalid && (
                  <div className="ti-alert">Please choose a valid range — From must be on or before To.</div>
                )}
              </div>
            )}

            {error && !loading && <div className="ti-alert">Couldn&apos;t load trust stats: {error}</div>}

            <div className={`ti-kpis ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
              {kpiCards.map((item) => (
                <div key={item.label} className={`ti-kpi ti-${item.tone}`}>
                  <div className="ti-kpi-title">{item.label}</div>
                  <div className={`ti-kpi-value ${item.compact ? 'ti-kpi-value-sm' : ''}`}>
                    {loading && !stats ? '…' : item.value}
                  </div>
                  <div className="ti-kpi-note">{item.note}</div>
                </div>
              ))}
            </div>
          </section>

          <section className="ti-card">
            <div className="ti-list-title">
              Trusts Created in Selected Period
              {stats && !loading && <span className="ti-count">{trusts.length}</span>}
              {loading && <em>Loading…</em>}
            </div>

            {!loading && stats && trusts.length === 0 && (
              <div className="ti-empty">No trusts were created in the selected period.</div>
            )}

            {trusts.length > 0 && (
              <div className={`ti-table-wrap ${loading ? 'is-loading' : ''}`}>
                <table className="ti-table">
                  <thead>
                    <tr>
                      <th>Trust</th>
                      <th>Super User Number</th>
                      <th>Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTrusts.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="ti-trust">
                            <span className="ti-trust-logo">
                              {item.icon_url ? (
                                <img src={item.icon_url} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                              ) : (
                                (item.name || 'T').charAt(0).toUpperCase()
                              )}
                            </span>
                            <span className="ti-trust-name">{item.name || 'Untitled Trust'}</span>
                          </div>
                        </td>
                        <td>{item.superuser_mobile || '--'}</td>
                        <td>{formatDateTime(item.created_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {trusts.length > 0 && (
              <div className="ti-pager">
                <label className="ti-per-page">
                  Show
                  <select
                    value={pageSize}
                    onChange={(event) => { setPageSize(Number(event.target.value)); goToPage(1); }}
                  >
                    {[10, 25, 50, 100].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  per page
                </label>
                <span>
                  Showing {pageStart + 1} – {pageStart + visibleTrusts.length} of {trusts.length}
                </span>
                <div className="ti-pager-btns">
                  <button type="button" disabled={currentPage <= 1} onClick={() => goToPage(currentPage - 1)}>‹ Previous</button>
                  <span>Page {currentPage} of {totalPages}</span>
                  <button type="button" disabled={currentPage >= totalPages} onClick={() => goToPage(currentPage + 1)}>Next ›</button>
                </div>
              </div>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
