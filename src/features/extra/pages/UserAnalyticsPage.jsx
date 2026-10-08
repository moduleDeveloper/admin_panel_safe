import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../../../core/components/PageHeader';
import Sidebar from '../../../core/components/Sidebar';
import { fetchAllUserPanelActivity } from '../../dashboard/services/userPanelAnalyticsService';
import { fetchUserManagementData } from '../../user-management/services/userManagementService';
import '../../../core/pages/legacy/SimplePage.css';
import './UserAnalyticsPage.css';

const PAGE_SIZE_OPTIONS = [10, 25, 50];
const MODULE_COLORS = ['#2563EB', '#3B82F6', '#F59E0B', '#F97316', '#8B5CF6', '#10B981', '#9CA3AF'];
const MAX_ZERO_FILLED_DAYS = 366;

const fmt = (n) => Number(n || 0).toLocaleString('en-IN');

const pad2 = (v) => String(v).padStart(2, '0');

// Local calendar date key ('YYYY-MM-DD') of a timestamp; '' when invalid.
const toDateKey = (input) => {
  if (!input) return '';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

const addDaysToKey = (key, days) => {
  const d = new Date(`${key}T00:00:00`);
  d.setDate(d.getDate() + days);
  return toDateKey(d);
};

const formatTimestamp = (input) => {
  if (!input) return '--';
  const d = new Date(input);
  if (Number.isNaN(d.getTime())) return '--';
  return `${toDateKey(d)} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
};

const formatShortDate = (key) => {
  const d = new Date(`${key}T00:00:00`);
  return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
};

const RANGE_PRESETS = [
  { id: 'today', label: 'Today' },
  { id: 'week', label: 'Last 7 Days' },
  { id: 'month', label: 'Last 30 Days' },
  { id: 'custom', label: 'Custom' },
];
const DEFAULT_RANGE = 'today';

// Resolves a preset to inclusive local date keys. Rolling windows include today.
const presetRange = (preset, todayKey) => {
  if (preset === 'today') return { from: todayKey, to: todayKey };
  if (preset === 'week') return { from: addDaysToKey(todayKey, -6), to: todayKey };
  if (preset === 'month') return { from: addDaysToKey(todayKey, -29), to: todayKey };
  return { from: '', to: '' };
};

const formatRangeLabel = (from, to) => {
  if (!from && !to) return 'All time';
  const fmtKey = (k) => new Date(`${k}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
  if (from && to) return from === to ? fmtKey(from) : `${fmtKey(from)} – ${fmtKey(to)}`;
  return from ? `From ${fmtKey(from)}` : `Until ${fmtKey(to)}`;
};

const toPercent = (count, total) => (total ? `${((count / total) * 100).toFixed(1)}%` : '0.0%');

const hasValue = (v) => v !== null && v !== undefined && v !== '';

function countBy(rows, keyFn) {
  const map = new Map();
  rows.forEach((row) => {
    const key = keyFn(row);
    if (!hasValue(key)) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return [...map.entries()].map(([key, count]) => ({ key, count })).sort((a, b) => b.count - a.count);
}

const CHART_HEIGHT = 230;

// Renders its chart at the real pixel width of the card so axis text stays readable at any zoom.
function ResponsiveChart({ children }) {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className="ua-chart-box">{width > 0 && children(width)}</div>;
}

function TrendChart({ trend, width, height = CHART_HEIGHT }) {
  const W = width;
  const H = height;
  const pad = { l: 36, r: 12, t: 10, b: 24 };
  const max = Math.max(...trend.map((t) => t.count), 1);
  const niceMax = Math.ceil(max / 4) * 4 || 4;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const x = (i) => pad.l + (trend.length > 1 ? (i / (trend.length - 1)) * innerW : innerW / 2);
  const y = (v) => pad.t + innerH - (v / niceMax) * innerH;
  const points = trend.map((t, i) => `${x(i)},${y(t.count)}`).join(' ');
  const area = trend.length
    ? `M${x(0)},${y(0)} L${points.replace(/ /g, ' L')} L${x(trend.length - 1)},${y(0)} Z`
    : '';
  const ticks = [0, 1, 2, 3, 4].map((i) => (niceMax / 4) * i);
  const labelStep = Math.max(Math.ceil(trend.length / Math.max(Math.floor(W / 64), 2)), 1);

  // Hover: snap to the nearest point and show its value in a tooltip
  const [hoverIndex, setHoverIndex] = useState(null);
  const handleMove = (event) => {
    const box = event.currentTarget.getBoundingClientRect();
    const px = event.clientX - box.left;
    if (!trend.length || px < pad.l - 12 || px > W - pad.r + 12) { setHoverIndex(null); return; }
    const raw = trend.length > 1 ? Math.round(((px - pad.l) / innerW) * (trend.length - 1)) : 0;
    setHoverIndex(Math.min(Math.max(raw, 0), trend.length - 1));
  };
  const hovered = hoverIndex !== null ? trend[hoverIndex] : null;
  const tipW = 118;
  const tipH = 40;
  const tipX = hovered ? Math.min(Math.max(x(hoverIndex) - tipW / 2, 2), W - tipW - 2) : 0;
  const tipY = hovered ? (y(hovered.count) - tipH - 12 < 2 ? y(hovered.count) + 12 : y(hovered.count) - tipH - 12) : 0;

  return (
    <svg
      width={W}
      height={H}
      className="ua-trend"
      role="img"
      aria-label="Activity trend"
      onMouseMove={handleMove}
      onMouseLeave={() => setHoverIndex(null)}
    >
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="ua-grid" />
          <text x={pad.l - 6} y={y(t) + 3} textAnchor="end" className="ua-axis">{fmt(Math.round(t))}</text>
        </g>
      ))}
      {area && <path d={area} className="ua-area" />}
      <polyline points={points} className="ua-line" />
      {trend.length <= 45 && trend.map((t, i) => (
        <circle key={t.date} cx={x(i)} cy={y(t.count)} r="2.6" className="ua-dot" />
      ))}
      {trend.map((t, i) => (i % labelStep === 0 ? (
        <text
          key={t.date}
          x={x(i)}
          y={H - 6}
          textAnchor={i === trend.length - 1 && trend.length > 1 ? 'end' : 'middle'}
          className="ua-axis"
        >
          {formatShortDate(t.date)}
        </text>
      ) : null))}
      {hovered && (
        <g className="ua-tip" pointerEvents="none">
          <line x1={x(hoverIndex)} x2={x(hoverIndex)} y1={pad.t} y2={y(0)} className="ua-tip-guide" />
          <circle cx={x(hoverIndex)} cy={y(hovered.count)} r="5" className="ua-tip-dot" />
          <rect x={tipX} y={tipY} width={tipW} height={tipH} rx="6" className="ua-tip-bg" />
          <text x={tipX + 10} y={tipY + 16} className="ua-tip-date">{formatLongDate(hovered.date)}</text>
          <text x={tipX + 10} y={tipY + 32} className="ua-tip-val">
            {fmt(hovered.count)} {hovered.count === 1 ? 'activity' : 'activities'}
          </text>
        </g>
      )}
    </svg>
  );
}

const formatHour = (hour) => {
  const suffix = hour < 12 ? 'AM' : 'PM';
  return `${hour % 12 === 0 ? 12 : hour % 12} ${suffix}`;
};

function HourChart({ buckets, width, height = CHART_HEIGHT }) {
  const W = width;
  const H = height;
  const labelEvery = W < 300 ? 6 : 3;
  const pad = { l: 30, r: 6, t: 10, b: 24 };
  const max = Math.max(...buckets.map((b) => b.count), 1);
  const niceMax = Math.ceil(max / 4) * 4 || 4;
  const innerW = W - pad.l - pad.r;
  const innerH = H - pad.t - pad.b;
  const slot = innerW / buckets.length;
  const y = (v) => pad.t + innerH - (v / niceMax) * innerH;
  const ticks = [0, 1, 2, 3, 4].map((i) => (niceMax / 4) * i);

  return (
    <svg width={W} height={H} className="ua-trend" role="img" aria-label="Activity by hour">
      {ticks.map((t) => (
        <g key={t}>
          <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="ua-grid" />
          <text x={pad.l - 4} y={y(t) + 3} textAnchor="end" className="ua-axis">{fmt(Math.round(t))}</text>
        </g>
      ))}
      {buckets.map((b) => (
        <g key={b.hour}>
          <rect
            x={pad.l + b.hour * slot + slot * 0.15}
            y={y(b.count)}
            width={slot * 0.7}
            height={Math.max(y(0) - y(b.count), 0)}
            rx="1.5"
            className="ua-bar"
          >
            <title>{`${formatHour(b.hour)} — ${fmt(b.count)} ${b.count === 1 ? 'activity' : 'activities'}`}</title>
          </rect>
          {b.hour % labelEvery === 0 && (
            <text x={pad.l + b.hour * slot + slot / 2} y={H - 6} textAnchor="middle" className="ua-axis">
              {formatHour(b.hour)}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}

function Donut({ segments, total }) {
  const R = 52;
  const C = 2 * Math.PI * R;
  let offset = 0;
  return (
    <svg viewBox="0 0 140 140" className="ua-donut" role="img">
      <circle cx="70" cy="70" r={R} className="ua-donut-bg" />
      {total > 0 && segments.map((s) => {
        const len = (s.count / total) * C;
        const el = (
          <circle
            key={s.key}
            cx="70"
            cy="70"
            r={R}
            fill="none"
            stroke={s.color}
            strokeWidth="18"
            strokeDasharray={`${len} ${C - len}`}
            strokeDashoffset={-offset}
            transform="rotate(-90 70 70)"
          >
            <title>{`${s.key}: ${fmt(s.count)}`}</title>
          </circle>
        );
        offset += len;
        return el;
      })}
      <text x="70" y="68" textAnchor="middle" className="ua-donut-total">{fmt(total)}</text>
      <text x="70" y="83" textAnchor="middle" className="ua-donut-sub">Activities</text>
    </svg>
  );
}

const formatLongDate = (key) => {
  const d = new Date(`${key}T00:00:00`);
  return Number.isNaN(d.getTime()) ? key : d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
};

// With a mouse, clicks on these keep their own meaning (tooltips / hover) and do not open the detail modal.
// On touch screens every tap on a chart card opens it.
const DETAIL_IGNORE_SELECTOR = '.ua-dot, .ua-bar, .ua-donut circle[stroke], .ua-route-row, .ua-legend';

function DetailModal({ title, subtitle, onClose, children }) {
  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  return (
    <div className="ua-modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="ua-modal" role="dialog" aria-modal="true" aria-label={title}>
        <header className="ua-modal-head">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="ua-modal-close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="ua-modal-body">{children}</div>
      </div>
    </div>
  );
}

export default function UserAnalyticsPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust: trustFromState = null, superuserId = null } = location.state || {};
  const fallbackTrustId =
    typeof window !== 'undefined' ? window.sessionStorage.getItem('admin:activeTrustId') : null;
  const trustId = location.state?.trustId || trustFromState?.id || fallbackTrustId || null;
  const trustName = trustFromState?.name || '';

  const [usersResult, setUsersResult] = useState({ trustId: null, users: [], error: '' });
  const usersLoading = Boolean(trustId) && usersResult.trustId !== trustId;
  const users = usersResult.users;
  const usersError = usersResult.error;
  const [selectedUserRegId, setSelectedUserRegId] = useState('');

  // Filters applied locally to the fully fetched dataset
  const [rangePreset, setRangePreset] = useState(DEFAULT_RANGE);
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const todayKey = toDateKey(new Date());
  const { from: fromDate, to: toDate } = rangePreset === 'custom'
    ? { from: customFrom, to: customTo }
    : presetRange(rangePreset, todayKey);
  const [moduleFilter, setModuleFilter] = useState('');

  // Local table pagination (no RPC call on page change)
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);

  // Full dataset for the last settled request, tagged with the request it answers
  const [result, setResult] = useState({ key: '', rows: [], truncated: false, error: '' });
  const [progress, setProgress] = useState({ key: '', count: 0 });

  // '' means all users in the trust. Rows carry their own user id, so resolve labels per row.
  const userLabelById = useMemo(() => {
    const map = new Map();
    users.forEach((u) => map.set(String(u.user_reg_id), u.name || u.email || u.mobile_no || '--'));
    return map;
  }, [users]);
  const userLabelForRow = (row) => {
    const id = row.user_reg_id ?? row.user_id;
    if (hasValue(id) && userLabelById.has(String(id))) return userLabelById.get(String(id));
    return row.user_name || row.name || (selectedUserRegId ? userLabelById.get(String(selectedUserRegId)) : '') || '--';
  };

  // Jump-to-top button (shown on mobile only via CSS) once the page is scrolled down
  const [showTop, setShowTop] = useState(false);
  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 400);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  // Detail modal for the chart cards: 'trend' | 'routes' | 'modules' | 'hours' | null
  const [detail, setDetail] = useState(null);
  // Activity list can be collapsed on mobile (the toggle is hidden on desktop)
  const [activityOpen, setActivityOpen] = useState(true);
  const [kpisOpen, setKpisOpen] = useState(true);
  const closeDetail = useCallback(() => setDetail(null), []);

  // Redirect safety (same as TrusteesPage)
  useEffect(() => {
    if (!trustId) navigate('/dashboard', { replace: true });
  }, [trustId, navigate]);

  // Users of the active trust → each carries the user_reg_id the RPC needs
  useEffect(() => {
    if (!trustId) return undefined;
    let cancelled = false;
    (async () => {
      const { data, error } = await fetchUserManagementData(trustId);
      if (cancelled) return;
      setUsersResult(error
        ? { trustId, users: [], error: error.message || 'Unable to load users.' }
        : { trustId, users: (data?.users || []).filter((u) => u.user_reg_id), error: '' });
    })();
    return () => { cancelled = true; };
  }, [trustId]);

  // Whole activity history for trust + user, fetched once per selection
  const requestKey = trustId ? `${trustId}|${selectedUserRegId || 'all'}` : '';
  const loading = Boolean(requestKey) && result.key !== requestKey;
  const settled = Boolean(requestKey) && result.key === requestKey;
  const allRows = useMemo(() => (settled ? result.rows : []), [settled, result.rows]);
  const truncated = settled && result.truncated;
  const error = settled ? result.error : '';
  const loadedCount = progress.key === requestKey ? progress.count : 0;

  useEffect(() => {
    if (!trustId) return undefined;
    const controller = new AbortController();
    const key = `${trustId}|${selectedUserRegId || 'all'}`;

    (async () => {
      let next;
      try {
        const { rows, truncated: wasTruncated } = await fetchAllUserPanelActivity({
          trustId,
          userRegId: selectedUserRegId || undefined,
          signal: controller.signal,
          onProgress: (count) => {
            if (!controller.signal.aborted) setProgress({ key, count });
          },
        });
        next = { key, rows, truncated: wasTruncated, error: '' };
      } catch (err) {
        next = { key, rows: [], truncated: false, error: err?.message || 'Unable to load user activity.' };
      }
      if (!controller.signal.aborted) setResult(next);
    })();

    return () => controller.abort();
  }, [trustId, selectedUserRegId]);

  // ── Derived analytics (all from the RPC rows) ───────────────────────────────
  const rangeInvalid = Boolean(fromDate && toDate && fromDate > toDate);

  // Module / Page options come from the data; filter value is 'module:<name>' or 'page:<name>'
  const pageLabel = (row) => (hasValue(row.page_name) ? row.page_name : row.route);
  const { moduleOptions, pageOptions } = useMemo(() => ({
    moduleOptions: [...new Set(allRows.map((r) => r.module).filter(hasValue))].sort(),
    pageOptions: [...new Set(allRows.map(pageLabel).filter(hasValue))].sort(),
  }), [allRows]);

  const filteredRows = useMemo(() => allRows.filter((row) => {
    if (moduleFilter.startsWith('module:') && row.module !== moduleFilter.slice(7)) return false;
    if (moduleFilter.startsWith('page:') && pageLabel(row) !== moduleFilter.slice(5)) return false;
    if (fromDate || toDate) {
      const key = toDateKey(row.created_at);
      if (!key) return false;
      if (fromDate && key < fromDate) return false;
      if (toDate && key > toDate) return false;
    }
    return true;
  }), [allRows, fromDate, toDate, moduleFilter]);

  const analytics = useMemo(() => {
    const total = filteredRows.length;
    const uniquePages = new Set(filteredRows.map((r) => r.page_id).filter(hasValue)).size;

    const perDay = new Map();
    filteredRows.forEach((r) => {
      const key = toDateKey(r.created_at);
      if (key) perDay.set(key, (perDay.get(key) || 0) + 1);
    });
    const dayKeys = [...perDay.keys()].sort();
    let trend = dayKeys.map((date) => ({ date, count: perDay.get(date) }));
    if (dayKeys.length > 1) {
      const first = dayKeys[0];
      const last = dayKeys[dayKeys.length - 1];
      const span = Math.round((new Date(`${last}T00:00:00`) - new Date(`${first}T00:00:00`)) / 86400000) + 1;
      if (span <= MAX_ZERO_FILLED_DAYS) {
        trend = Array.from({ length: span }, (_, i) => {
          const date = addDaysToKey(first, i);
          return { date, count: perDay.get(date) || 0 };
        });
      }
    }

    const routes = countBy(filteredRows, (r) => r.route).slice(0, 7);

    const moduleCounts = countBy(filteredRows, (r) => r.module);
    const topModules = moduleCounts.slice(0, 6);
    const otherCount = moduleCounts.slice(6).reduce((s, m) => s + m.count, 0);
    const modules = (otherCount ? [...topModules, { key: 'Others', count: otherCount }] : topModules)
      .map((m, i) => ({ ...m, color: MODULE_COLORS[i % MODULE_COLORS.length] }));

    return {
      total,
      uniquePages,
      activeDays: perDay.size,
      avgPerDay: perDay.size ? total / perDay.size : 0,
      trend,
      routes,
      modules,
      moduleTotal: moduleCounts.reduce((s, m) => s + m.count, 0),
      allRoutes: countBy(filteredRows, (r) => r.route),
      allModules: moduleCounts,
    };
  }, [filteredRows]);

  // 24 hourly buckets in the browser's local time (same as the table timestamps)
  const activityByHour = useMemo(() => {
    const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
    filteredRows.forEach((row) => {
      if (!row.created_at) return;
      const hour = new Date(row.created_at).getHours();
      if (Number.isInteger(hour) && hour >= 0 && hour <= 23) buckets[hour].count += 1;
    });
    return buckets;
  }, [filteredRows]);

  // Columns only appear when the RPC actually returned that field
  const showPageName = allRows.some((r) => hasValue(r.page_name));
  const showRoute = allRows.some((r) => hasValue(r.route));
  const showModule = allRows.some((r) => hasValue(r.module));

  const totalRows = filteredRows.length;
  const totalPages = Math.max(Math.ceil(totalRows / pageSize), 1);
  const safePage = Math.min(page, totalPages);
  const start = (safePage - 1) * pageSize;
  const visibleRows = filteredRows.slice(start, start + pageSize);

  const goBack = () =>
    navigate('/dashboard', { state: { userName, trust: trustFromState, superuserId, sidebarNavKey: 'menu' } });

  const handleUserChange = (event) => {
    setSelectedUserRegId(event.target.value);
    setModuleFilter('');
    setPage(1);
  };
  const handleFromDate = (event) => { setCustomFrom(event.target.value); setPage(1); };
  const handleToDate = (event) => { setCustomTo(event.target.value); setPage(1); };
  const handlePreset = (id) => {
    if (id === 'custom' && rangePreset !== 'custom') {
      // Seed custom with the range currently shown so the user can tweak it
      setCustomFrom(fromDate);
      setCustomTo(toDate);
    }
    setRangePreset(id);
    setPage(1);
  };
  const handleModule = (event) => { setModuleFilter(event.target.value); setPage(1); };
  const handlePageSize = (event) => { setPageSize(Number(event.target.value)); setPage(1); };
  const resetFilters = () => {
    setRangePreset(DEFAULT_RANGE);
    setCustomFrom('');
    setCustomTo('');
    setModuleFilter('');
    setPage(1);
  };

  if (!trustId) return null;

  const filtersActive = Boolean(rangePreset !== DEFAULT_RANGE || moduleFilter);
  const ready = settled && !error;
  const columnCount = 2 +[showPageName, showRoute, showModule].filter(Boolean).length;

  const kpis = [
    { label: 'Total Activities', value: fmt(analytics.total), note: 'In selected range', tone: 'blue', icon: '▤' },
    { label: 'Active Days', value: fmt(analytics.activeDays), note: 'Days with activity', tone: 'green', icon: '📅' },
    { label: 'Unique Pages Visited', value: fmt(analytics.uniquePages), note: 'Distinct pages', tone: 'purple', icon: '▣' },
    {
      label: 'Avg Activities per Day',
      value: analytics.avgPerDay.toFixed(1),
      note: `Over ${fmt(analytics.activeDays)} active day${analytics.activeDays === 1 ? '' : 's'}`,
      tone: 'orange',
      icon: '▥',
    },
  ];

  const maxRoute = analytics.routes[0]?.count || 1;
  const emptyChart = (message) => <div className="ua-empty">{message}</div>;
  const chartEmpty = (field) => {
    if (loading) return 'Loading…';
    if (error) return 'Unavailable';
    if (!allRows.length) return 'No activity found.';
    if (!allRows.some((r) => hasValue(r[field]))) return `Not included in the RPC response (${field}).`;
    return 'No data for the selected filters.';
  };

  // Heading / empty space of a chart card opens its detail modal (any tap on touch screens)
  const openProps = (kind) => ({
    tabIndex: 0,
    'aria-haspopup': 'dialog',
    onClick: (event) => {
      if (!ready) return;
      if (window.matchMedia('(hover: hover)').matches && event.target.closest(DETAIL_IGNORE_SELECTOR)) return;
      setDetail(kind);
    },
    onKeyDown: (event) => {
      if (event.key !== 'Enter' || event.target !== event.currentTarget) return;
      if (ready) setDetail(kind);
    },
  });
  const moreHint = <span className="ua-more">View details ›</span>;

  const rangeText = formatRangeLabel(fromDate, toDate);
  const userText = selectedUserRegId ? (userLabelById.get(String(selectedUserRegId)) || 'Selected user') : 'All users';
  const detailSubtitle = `${userText} · ${rangeText}${moduleFilter ? ` · ${moduleFilter.split(':').slice(1).join(':')}` : ''}`;

  const share = (count, total) => toPercent(count, total);
  const peakDay = analytics.trend.reduce((best, d) => (d.count > (best?.count ?? -1) ? d : best), null);
  const peakHour = activityByHour.reduce((best, h) => (h.count > (best?.count ?? -1) ? h : best), null);
  const statRow = (items) => (
    <div className="ua-modal-stats">
      {items.map((item) => (
        <div key={item.label} className="ua-modal-stat">
          <span>{item.label}</span>
          <b>{item.value}</b>
        </div>
      ))}
    </div>
  );

  let detailView = null;
  if (detail === 'trend') {
    detailView = (
      <DetailModal title="Activity Trend" subtitle={detailSubtitle} onClose={closeDetail}>
        {statRow([
          { label: 'Total activities', value: fmt(analytics.total) },
          { label: 'Days in range', value: fmt(analytics.trend.length) },
          { label: 'Daily average', value: (analytics.trend.length ? analytics.total / analytics.trend.length : 0).toFixed(1) },
          { label: 'Busiest day', value: peakDay ? `${formatLongDate(peakDay.date)} (${fmt(peakDay.count)})` : '--' },
        ])}
        <ResponsiveChart>{(w) => <TrendChart trend={analytics.trend} width={w} height={320} />}</ResponsiveChart>
        <table className="ua-table ua-modal-table">
          <thead><tr><th>Date</th><th>Activities</th><th>Share</th></tr></thead>
          <tbody>
            {[...analytics.trend].reverse().map((d) => (
              <tr key={d.date}>
                <td>{formatLongDate(d.date)}</td>
                <td>{fmt(d.count)}</td>
                <td>{share(d.count, analytics.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailModal>
    );
  } else if (detail === 'routes') {
    const topCount = analytics.allRoutes[0]?.count || 1;
    detailView = (
      <DetailModal title="Most Visited Routes" subtitle={detailSubtitle} onClose={closeDetail}>
        <table className="ua-table ua-modal-table">
          <thead><tr><th>#</th><th>Route</th><th>Activities</th><th>Share</th><th aria-label="Bar" /></tr></thead>
          <tbody>
            {analytics.allRoutes.map((r, i) => (
              <tr key={r.key}>
                <td>{i + 1}</td>
                <td className="ua-modal-route">{r.key}</td>
                <td>{fmt(r.count)}</td>
                <td>{share(r.count, analytics.total)}</td>
                <td className="ua-modal-bar"><span className="ua-route-track"><i style={{ width: `${(r.count / topCount) * 100}%` }} /></span></td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailModal>
    );
  } else if (detail === 'modules') {
    const colorFor = (key) => analytics.modules.find((m) => m.key === key)?.color || '#9CA3AF';
    detailView = (
      <DetailModal title="Top Modules" subtitle={detailSubtitle} onClose={closeDetail}>
        <div className="ua-modal-split">
          <div className="ua-modal-donut"><Donut segments={analytics.modules} total={analytics.moduleTotal} /></div>
          <table className="ua-table ua-modal-table">
            <thead><tr><th>Module</th><th>Activities</th><th>Share</th></tr></thead>
            <tbody>
              {analytics.allModules.map((m) => (
                <tr key={m.key}>
                  <td><i className="ua-modal-dot" style={{ background: colorFor(m.key) }} />{m.key}</td>
                  <td>{fmt(m.count)}</td>
                  <td>{share(m.count, analytics.moduleTotal)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DetailModal>
    );
  } else if (detail === 'hours') {
    detailView = (
      <DetailModal title="Activity by Hour" subtitle={detailSubtitle} onClose={closeDetail}>
        {statRow([
          { label: 'Total activities', value: fmt(analytics.total) },
          { label: 'Busiest hour', value: peakHour && peakHour.count ? `${formatHour(peakHour.hour)} (${fmt(peakHour.count)})` : '--' },
        ])}
        <ResponsiveChart>{(w) => <HourChart buckets={activityByHour} width={w} height={320} />}</ResponsiveChart>
        <table className="ua-table ua-modal-table">
          <thead><tr><th>Hour</th><th>Activities</th><th>Share</th></tr></thead>
          <tbody>
            {activityByHour.filter((h) => h.count > 0).map((h) => (
              <tr key={h.hour}>
                <td>{formatHour(h.hour)} – {formatHour((h.hour + 1) % 24)}</td>
                <td>{fmt(h.count)}</td>
                <td>{share(h.count, analytics.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </DetailModal>
    );
  }

  return (
    <div className="simple-root">
      <Sidebar trustName={trustName || 'Trust'} onDashboard={goBack} onLogout={() => navigate('/login')} />

      <main className="simple-main">
        <PageHeader
          title="User Panel Analytics"
          subtitle="Track activity captured from up_activity_view."
          onBack={goBack}
        />

        <div className="simple-content ua-root">
          <section className="ua-card ua-filters">
            <label className="ua-field ua-field-user">
              <span>User</span>
              <select value={selectedUserRegId} onChange={handleUserChange} disabled={usersLoading}>
                <option value="">All users</option>
                {users.map((u) => (
                  <option key={u.user_reg_id} value={u.user_reg_id}>
                    {u.name || u.email || u.mobile_no || u.user_reg_id}
                    {u.name && (u.mobile_no || u.email) ? ` · ${u.mobile_no || u.email}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <div className="ua-field ua-field-date">
              <span>Date Range</span>
              <div className="ua-range-chips" role="group" aria-label="Date range">
                {RANGE_PRESETS.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`ua-chip ${rangePreset === p.id ? 'is-active' : ''}`}
                    aria-pressed={rangePreset === p.id}
                    onClick={() => handlePreset(p.id)}
                    disabled={!ready}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
              {rangePreset === 'custom' ? (
                <div className="ua-date-box">
                  <label className="ua-date-part">
                    <span className="ua-date-cap">From</span>
                    <input
                      type="date"
                      value={customFrom}
                      max={customTo || todayKey}
                      onChange={handleFromDate}
                      disabled={!ready}
                    />
                  </label>
                  <em>–</em>
                  <label className="ua-date-part">
                    <span className="ua-date-cap">To</span>
                    <input
                      type="date"
                      value={customTo}
                      min={customFrom || undefined}
                      max={todayKey}
                      onChange={handleToDate}
                      disabled={!ready}
                    />
                  </label>
                </div>
              ) : (
                <small className="ua-range-label">{formatRangeLabel(fromDate, toDate)}</small>
              )}
            </div>
            <label className="ua-field ua-field-module">
              <span>Module / Page</span>
              <select
                value={moduleFilter}
                onChange={handleModule}
                disabled={!ready || (moduleOptions.length === 0 && pageOptions.length === 0)}
              >
                <option value="">All Modules</option>
                {moduleOptions.length > 0 && (
                  <optgroup label="Modules">
                    {moduleOptions.map((m) => <option key={`m-${m}`} value={`module:${m}`}>{m}</option>)}
                  </optgroup>
                )}
                {pageOptions.length > 0 && (
                  <optgroup label="Pages">
                    {pageOptions.map((p) => <option key={`p-${p}`} value={`page:${p}`}>{p}</option>)}
                  </optgroup>
                )}
              </select>
            </label>
            <div className="ua-actions">
              <button type="button" className="ua-btn" onClick={resetFilters} disabled={!filtersActive}>Reset</button>
            </div>
          </section>

          {usersError && <div className="ua-alert">Couldn&apos;t load users: {usersError}</div>}
          {rangeInvalid && <div className="ua-alert">Please choose a valid range — From must be on or before To.</div>}
          {error && !loading && <div className="ua-alert">Couldn&apos;t load activity: {error}</div>}
          {truncated && (
            <div className="ua-alert ua-warn">Showing the most recent 50,000 activities only; older activity is not included.</div>
          )}
          {loading && (
            <div className="ua-mock-note">
              Loading activity analytics…{loadedCount ? ` ${fmt(loadedCount)} rows loaded` : ''}
            </div>
          )}

          <button
            type="button"
            className="ua-kpi-toggle"
            aria-expanded={kpisOpen}
            onClick={() => setKpisOpen((open) => !open)}
          >
            {kpisOpen ? 'Hide summary cards' : 'Show summary cards'}
            <span aria-hidden="true">{kpisOpen ? '▲' : '▼'}</span>
          </button>

          <div className={`ua-kpis ${loading ? 'is-loading' : ''} ${kpisOpen ? '' : 'is-collapsed'}`} aria-busy={loading}>
            {kpis.map((k) => (
              <div key={k.label} className="ua-card ua-kpi">
                <span className={`ua-kpi-icon ua-${k.tone}`}>{k.icon}</span>
                <div>
                  <div className="ua-kpi-label">{k.label}</div>
                  <div className="ua-kpi-value">{ready ? k.value : '--'}</div>
                  <span className="ua-delta ua-flat">{ready ? k.note : ''}</span>
                </div>
              </div>
            ))}
          </div>

          <div className={`ua-charts ${loading ? 'is-loading' : ''}`}>
            <section className="ua-card ua-chart-trend ua-clickable" {...openProps('trend')}>
              <h3>Activity Trend{moreHint}</h3>
              {ready && analytics.trend.length > 0
                ? <ResponsiveChart>{(w) => <TrendChart trend={analytics.trend} width={w} />}</ResponsiveChart>
                : emptyChart(chartEmpty('created_at'))}
            </section>

            <section className="ua-card ua-chart-routes ua-clickable" {...openProps('routes')}>
              <h3>Most Visited Routes{moreHint}</h3>
              {ready && analytics.routes.length > 0 ? analytics.routes.map((r) => (
                <div key={r.key} className="ua-route-row">
                  <span className="ua-route-name" title={r.key}>{r.key}</span>
                  <span className="ua-route-track"><i style={{ width: `${(r.count / maxRoute) * 100}%` }} /></span>
                  <span className="ua-route-count">{fmt(r.count)}</span>
                </div>
              )) : emptyChart(chartEmpty('route'))}
            </section>

            <section className="ua-card ua-chart-modules ua-clickable" {...openProps('modules')}>
              <h3>Top Modules{moreHint}</h3>
              {ready && analytics.modules.length > 0 ? (
                <div className="ua-donut-wrap">
                  <Donut segments={analytics.modules} total={analytics.moduleTotal} />
                  <ul className="ua-legend">
                    {analytics.modules.map((s) => (
                      <li key={s.key}>
                        <i style={{ background: s.color }} />
                        <span>{s.key}</span>
                        <b>{toPercent(s.count, analytics.moduleTotal)}</b>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : emptyChart(chartEmpty('module'))}
            </section>

            <section className="ua-card ua-chart-hours ua-clickable" {...openProps('hours')}>
              <h3>Activity by Hour{moreHint}</h3>
              {!ready
                ? emptyChart(chartEmpty('created_at'))
                : (filteredRows.length > 0
                  ? <ResponsiveChart>{(w) => <HourChart buckets={activityByHour} width={w} />}</ResponsiveChart>
                  : emptyChart('No activity in the selected range.'))}
            </section>
          </div>

          <section className={`ua-card ua-table-card ${loading ? 'is-loading' : ''}`} aria-busy={loading}>
            <div className="ua-table-head">
              <h3>Recent User Panel Activity</h3>
              <button
                type="button"
                className="ua-collapse-btn"
                aria-expanded={activityOpen}
                onClick={() => setActivityOpen((open) => !open)}
              >
                {activityOpen ? 'Hide' : 'Show'}
                <span aria-hidden="true">{activityOpen ? '▲' : '▼'}</span>
              </button>
            </div>
            <div className={`ua-table-wrap ${activityOpen ? '' : 'is-collapsed'}`}>
              <table className="ua-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>User</th>
                    {showPageName && <th>Page Name</th>}
                    {showRoute && <th>Route</th>}
                    {showModule && <th>Module</th>}
                  </tr>
                </thead>
                <tbody>
                  {ready && visibleRows.map((r, i) => (
                    <tr key={r.id ?? `${start}-${i}`}>
                      <td data-label="Time" className="ua-td-time">{formatTimestamp(r.created_at)}</td>
                      <td data-label="User">{userLabelForRow(r)}</td>
                      {showPageName && <td data-label="Page">{r.page_name ?? '--'}</td>}
                      {showRoute && <td data-label="Route">{r.route ?? '--'}</td>}
                      {showModule && <td data-label="Module">{r.module ?? '--'}</td>}
                    </tr>
                  ))}
                  {loading && (
                    <tr><td colSpan={columnCount} className="ua-empty">Loading activity analytics…</td></tr>
                  )}
                  {ready && totalRows === 0 && (
                    <tr>
                      <td colSpan={columnCount} className="ua-empty">
                        {allRows.length === 0 ? 'No activity found.' : 'No activity matches the selected filters.'}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            <div className={`ua-pager ${activityOpen ? '' : 'is-collapsed'}`}>
              <label className="ua-per-page">
                Show
                <select value={pageSize} onChange={handlePageSize}>
                  {PAGE_SIZE_OPTIONS.map((n) => <option key={n} value={n}>{n}</option>)}
                </select>
                per page
              </label>
              <span className="ua-showing">
                {ready && totalRows > 0
                  ? `Showing ${fmt(start + 1)} – ${fmt(start + visibleRows.length)} of ${fmt(totalRows)}`
                  : ''}
              </span>
              <div className="ua-pages">
                <button type="button" disabled={!ready || safePage <= 1} onClick={() => setPage(safePage - 1)}>
                  ‹ Previous
                </button>
                <span className="ua-gap">{ready ? `Page ${fmt(safePage)} of ${fmt(totalPages)}` : ''}</span>
                <button type="button" disabled={!ready || safePage >= totalPages} onClick={() => setPage(safePage + 1)}>
                  Next ›
                </button>
              </div>
            </div>
          </section>
        </div>
      </main>

      <button
        type="button"
        className={`ua-top-btn ${showTop ? 'is-visible' : ''}`}
        onClick={scrollToTop}
        aria-label="Back to top"
        tabIndex={showTop ? 0 : -1}
      >
        ↑
      </button>

      {detailView}
    </div>
  );
}
