import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../../../core/components/PageHeader';
import Sidebar from '../../../core/components/Sidebar';
import FeatureControlTable from '../components/feature-control/FeatureControlTable';
import FeatureEditModal from '../components/feature-control/FeatureEditModal';
import FeatureViewModal from '../components/feature-control/FeatureViewModal';
import { fetchLinkedTrusts } from '../../auth/services/authService';
import {
  fetchMasterFeatures,
  fetchFeatureFlagsByTrustAndTier,
  mergeFeaturesWithFlags,
  mergeSingleFeatureWithFlag,
  saveFeatureCustomization,
  toggleFeatureEnabled,
} from '../services/featureControlService';
import './FeatureControlPage.css';

function normalizeQuickOrder(value) {
  if (value === null || value === undefined || value === '') return Number.MAX_SAFE_INTEGER;
  return Number(value);
}

const DISPLAY_IN_APP_HOME = 'home';
const DISPLAY_IN_APP_SIDEBAR = 'sideBar';

const normalizeDisplayInApp = (value) => String(value || DISPLAY_IN_APP_HOME).trim().toLowerCase();

// Placement comes from the master features row: Display_option decides
// whether the feature is locked to Home/Sidebar or configurable ('both').
// Missing/unrecognized Display_option means no placement info -> no toggle.
function getDisplayPlacementPolicy(row) {
  const option = String(row.display_option || '').trim().toLowerCase();

  if (option === 'home') {
    return {
      type: 'home-only',
      locked: true,
      forcedDisplayInApp: DISPLAY_IN_APP_HOME,
      displaysInSidebar: false,
      message: 'This feature is meant to show on Home only.',
    };
  }

  if (option === 'sidebar') {
    return {
      type: 'sidebar-only',
      locked: true,
      forcedDisplayInApp: DISPLAY_IN_APP_SIDEBAR,
      displaysInSidebar: true,
      message: 'This feature is meant to show only in Sidebar.',
    };
  }

  if (option === 'both') {
    return {
      type: 'configurable',
      locked: false,
      forcedDisplayInApp: null,
      displaysInSidebar: normalizeDisplayInApp(row.display_in_app) === 'sidebar',
      message: '',
    };
  }

  return {
    type: 'none',
    locked: true,
    forcedDisplayInApp: null,
    displaysInSidebar: false,
    message: 'No display placement configured for this feature.',
  };
}

const APP_CATEGORY_RULES = [
  { key: 'auth-access', label: 'Extra', keywords: ['login', 'otp', 'auth', 'security', 'password', 'permission', 'role', 'vip', 'appointment', 'opd', 'doctor', 'schedule', 'booking', 'book', 'referral', 'reference', 'report', 'document', 'upload', 'download', 'certificate', 'record', 'birthday', 'wishes', 'wish'] },
  { key: 'company-details', label: 'Company Details', keywords: ['trust list', 'trustlist', 'trust_list'] },
  { key: 'content-media', label: 'Home Page', keywords: ['gallery', 'photo', 'image', 'video', 'marquee', 'design', 'theme', 'sponsor', 'banner', 'logo', 'notification'] },
  { key: 'communication', label: 'Quick Action', keywords: ['notice', 'message', 'announcement', 'event', 'events', 'donation', 'executive body', 'executive_body', 'facilities', 'facility', 'feature_profile', 'my profile', 'user profile', 'profile'] },
  { key: 'general-admin', label: 'Menu', keywords: ['othermembership', 'other membership', 'developer_information', 'developer information'] },
];

const CATEGORY_DEFINITIONS = APP_CATEGORY_RULES.reduce((acc, item) => {
  if (acc.some((entry) => entry.key === item.key)) return acc;
  acc.push({ key: item.key, label: item.label });
  return acc;
}, []);

function classifyFeatureByApp(row) {
  const haystack = [
    row.master_name,
    row.master_subname,
    row.display_name,
    row.tagline,
    row.route,
    row.name,
    row.description,
  ]
    .map((value) => String(value || '').toLowerCase())
    .join(' ');

  const matched = APP_CATEGORY_RULES.find((rule) =>
    rule.keywords.some((keyword) => haystack.includes(keyword)),
  );

  return matched || { key: 'general-admin', label: 'Menu' };
}

export default function FeatureControlPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};
  const openedFromFeatures20 = !!location.state?.fromFeatures20;
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'dashboard';

  const [trustOptions, setTrustOptions] = useState(trust ? [trust] : []);
  const [selectedTrustId, setSelectedTrustId] = useState(trust?.id || '');
  const [selectedTier] = useState(
    location.state?.tier === 'vip' ? 'vip' : 'general',
  );
  const [masterFeatures, setMasterFeatures] = useState([]);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [quickOrderSort, setQuickOrderSort] = useState('asc');
  const [activeCategoryView, setActiveCategoryView] = useState('all');
  const categoryInlineRef = useRef(null);

  // Bring the inline feature list into view when it opens.
  useEffect(() => {
    if (!activeCategoryView) return;
    const frame = window.requestAnimationFrame(() => {
      categoryInlineRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeCategoryView]);

  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [togglingMap, setTogglingMap] = useState({});
  const [displayTogglingMap, setDisplayTogglingMap] = useState({});
  const [activeEditRow, setActiveEditRow] = useState(null);
  const [activeViewRow, setActiveViewRow] = useState(null);
  const [savingEdit, setSavingEdit] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [flash, setFlash] = useState(null);

  const selectedTrust = useMemo(
    () => trustOptions.find((item) => String(item.id) === String(selectedTrustId)) || null,
    [trustOptions, selectedTrustId]
  );
  const filterStorageKey = useMemo(
    () => `fc:filters:${selectedTrustId || 'default'}:${selectedTier || 'general'}`,
    [selectedTier, selectedTrustId]
  );

  const loadTrusts = useCallback(async () => {
    if (!superuserId) {
      setTrustOptions(trust ? [trust] : []);
      return;
    }

    const { data, error: trustsError } = await fetchLinkedTrusts(superuserId);
    if (trustsError) {
      setTrustOptions(trust ? [trust] : []);
      return;
    }

    const linked = data || [];
    if (!linked.length && trust) {
      setTrustOptions([trust]);
      return;
    }

    setTrustOptions(linked);
    setSelectedTrustId((prev) => {
      if (prev && linked.some((item) => String(item.id) === String(prev))) return prev;
      return linked[0]?.id || '';
    });
  }, [superuserId, trust]);

  const loadMasterFeatures = useCallback(async () => {
    const { data, error: masterError } = await fetchMasterFeatures(selectedTrustId);
    if (masterError) {
      setError(masterError.message || 'Unable to load features master list.');
      return [];
    }
    const masterList = data || [];
    setMasterFeatures(masterList);
    return masterList;
  }, []);

  const loadMergedRows = useCallback(async (featuresInput) => {
    if (!selectedTrustId) return;

    setLoading(true);
    setError('');

    const masterList = featuresInput || [];
    const { data: flags, error: flagsError } = await fetchFeatureFlagsByTrustAndTier(selectedTrustId, selectedTier);

    if (flagsError) {
      setError(flagsError.message || 'Unable to load feature flags.');
      setLoading(false);
      return;
    }

    // Only show features that are NOT flagged Display_upanel = true
    // (i.e. false, null, or missing).
    const visibleMasterList = masterList.filter((f) => f.Display_upanel !== true);

    const merged = mergeFeaturesWithFlags(visibleMasterList, flags || [], selectedTrustId, selectedTier);
    setRows(merged);
    setLoading(false);
  }, [selectedTier, selectedTrustId]);

  useEffect(() => {
    if (!trust?.id) {
      navigate('/dashboard', { replace: true, state: { userName, trust } });
    }
  }, [navigate, trust, userName]);

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, []);

  useEffect(() => {
    if (!openedFromFeatures20) setActiveCategoryView(null);
  }, [openedFromFeatures20]);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(filterStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.searchTerm === 'string') setSearchTerm(parsed.searchTerm);
      if (typeof parsed.statusFilter === 'string') setStatusFilter(parsed.statusFilter);
      // categoryFilter is not restored: there is no Category picker any more,
      // so an old saved value would silently hide features.
      if (typeof parsed.quickOrderSort === 'string') setQuickOrderSort(parsed.quickOrderSort);
    } catch {
      // ignore invalid persisted value
    }
  }, [filterStorageKey]);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        filterStorageKey,
        JSON.stringify({
          searchTerm,
          statusFilter,
          categoryFilter,
          quickOrderSort,
        }),
      );
    } catch {
      // ignore storage failure
    }
  }, [filterStorageKey, searchTerm, statusFilter, categoryFilter, quickOrderSort]);

  useEffect(() => {
    const checkViewport = () => setIsMobileViewport(window.innerWidth <= 680);
    checkViewport();
    window.addEventListener('resize', checkViewport);
    return () => window.removeEventListener('resize', checkViewport);
  }, []);

  useEffect(() => {
    const run = async () => {
      await loadTrusts();
    };
    run();
  }, [loadTrusts]);

  useEffect(() => {
    let mounted = true;

    const run = async () => {
      if (!selectedTrustId) return;
      const master = await loadMasterFeatures();
      if (!mounted) return;
      await loadMergedRows(master);
    };

    run();

    return () => {
      mounted = false;
    };
  }, [selectedTrustId, selectedTier, loadMasterFeatures, loadMergedRows]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(timer);
  }, [flash]);

  const rowsWithCounts = useMemo(
    () =>
      rows
        .map((row) => {
          const category = classifyFeatureByApp(row);
          const placementPolicy = getDisplayPlacementPolicy(row);
          return {
            ...row,
            app_category: category.key,
            app_category_label: category.label,
            display_placement_policy: placementPolicy,
          };
        })
        .filter((row) => row.display_placement_policy.type !== 'none'),
    [rows],
  );

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const searched = rowsWithCounts.filter((row) => {
      if (!normalizedSearch) return true;
      const fields = [
        row.master_name,
        row.master_subname,
        row.display_name,
        row.tagline,
        row.route,
        row.name,
        row.description,
      ];
      return fields.some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    });

    const byStatus = searched.filter((row) => {
      if (statusFilter === 'enabled') return !!row.is_enabled;
      if (statusFilter === 'disabled') return !row.is_enabled;
      return true;
    });

    const byCategory = byStatus.filter((row) => {
      if (categoryFilter === 'all') return true;
      return row.app_category === categoryFilter;
    });

    return [...byCategory].sort((left, right) => {
      const direction = quickOrderSort === 'desc' ? -1 : 1;
      return String(left.master_name || '').localeCompare(String(right.master_name || ''), undefined, {
        sensitivity: 'base',
      }) * direction;
    });
  }, [rowsWithCounts, searchTerm, statusFilter, categoryFilter, quickOrderSort]);

  const categorySummary = useMemo(() => {
    const counts = new Map(
      CATEGORY_DEFINITIONS.map((item) => [item.key, { key: item.key, label: item.label, total: 0, enabled: 0 }]),
    );

    rowsWithCounts.forEach((row) => {
      const key = row.app_category || 'general-admin';
      const label = row.app_category_label || 'Menu';
      const current = counts.get(key) || { key, label, total: 0, enabled: 0 };
      current.total += 1;
      if (row.is_enabled) current.enabled += 1;
      counts.set(key, current);
    });

    return Array.from(counts.values());
  }, [rowsWithCounts]);

  useEffect(() => {
    if (categoryFilter === 'all') return;
    const exists = categorySummary.some((item) => item.key === categoryFilter);
    if (!exists) setCategoryFilter('all');
  }, [categoryFilter, categorySummary]);

  useEffect(() => {
    if (!activeCategoryView) return;
    if (activeCategoryView === 'all') return;
    const exists = categorySummary.some((item) => item.key === activeCategoryView);
    if (!exists) {
      setActiveCategoryView(null);
      setCategoryFilter('all');
    }
  }, [activeCategoryView, categorySummary]);

  const activeCategoryMeta = useMemo(() => {
    if (!activeCategoryView) return null;
    if (activeCategoryView === 'all') {
      return { key: 'all', label: 'All Categories', total: rowsWithCounts.length, enabled: rowsWithCounts.filter((row) => row.is_enabled).length };
    }
    return categorySummary.find((item) => item.key === activeCategoryView) || null;
  }, [activeCategoryView, categorySummary, rowsWithCounts]);

  // Stats for the "All Categories" card
  const allTotalCount = rowsWithCounts.length;
  const allEnabledCount = rowsWithCounts.filter((row) => row.is_enabled).length;
  const allEnabledPercent = allTotalCount ? Math.round((allEnabledCount / allTotalCount) * 100) : 0;

  const openCategoryView = (categoryKey) => {
    const next = categoryKey || 'all';

    if (activeCategoryView === next) {
      setActiveCategoryView(null);
      setCategoryFilter('all');
      return;
    }

    setCategoryFilter(next);
    setActiveCategoryView(next);
    if (window.innerWidth <= 680) setMobileFiltersOpen(false);
  };

  const closeCategoryView = () => {
    setActiveCategoryView(null);
    setCategoryFilter('all');
    setMobileFiltersOpen(false);
  };

  const hasActiveFilters = !!searchTerm.trim() || statusFilter !== 'all' || quickOrderSort !== 'asc';
  const resetFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setQuickOrderSort('asc');
  };

  const renderControls = (extraClass = '') => (
    // Trust, Tier and Category pickers were removed from the UI: the page
    // always uses the trust it was opened for, the tier passed in from
    // Features20 (default general), and all categories.
    <div className={`fc-controls${extraClass ? ` ${extraClass}` : ''}`}>
      <label className="fc-search">
        <span>Search</span>
        <div className="fc-search-field">
          <svg className="fc-search-icon" width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6" />
            <path d="M11 11l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            placeholder="Search feature, display name, route..."
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
          />
          {searchTerm ? (
            <button
              type="button"
              className="fc-search-clear"
              onClick={(event) => {
                event.preventDefault();
                setSearchTerm('');
              }}
              aria-label="Clear search"
              title="Clear search"
            >
              ×
            </button>
          ) : null}
        </div>
      </label>

      <label>
        <span>Status</span>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">All</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>
      </label>

      <label>
        <span>Sort</span>
        <select value={quickOrderSort} onChange={(event) => setQuickOrderSort(event.target.value)}>
          <option value="asc">A to Z</option>
          <option value="desc">Z to A</option>
        </select>
      </label>

      {hasActiveFilters ? (
        <button type="button" className="fc-reset-filters" onClick={resetFilters}>
          Reset filters
        </button>
      ) : null}
    </div>
  );

  const applyUpdatedFlag = (featureId, updatedFlag) => {
    setRows((prev) =>
      prev.map((row) => (row.feature_id === featureId ? mergeSingleFeatureWithFlag(row, updatedFlag) : row))
    );
  };

  const handleToggle = async (row, nextEnabled) => {
    const key = row.feature_id;
    setTogglingMap((prev) => ({ ...prev, [key]: true }));
    const placementPolicy = getDisplayPlacementPolicy(row);
    const forcedDisplayInApp = nextEnabled ? placementPolicy.forcedDisplayInApp : null;

    const { data, error: toggleError } = forcedDisplayInApp
      ? await saveFeatureCustomization({
        mergedFeature: row,
        trustId: selectedTrustId,
        tier: selectedTier,
        trustName: selectedTrust?.name || '',
        updates: {
          is_enabled: !!nextEnabled,
          display_in_app: forcedDisplayInApp,
        },
      })
      : await toggleFeatureEnabled({
        mergedFeature: row,
        trustId: selectedTrustId,
        tier: selectedTier,
        isEnabled: nextEnabled,
        trustName: selectedTrust?.name || '',
      });

    setTogglingMap((prev) => ({ ...prev, [key]: false }));

    if (toggleError) {
      setFlash({ type: 'error', text: toggleError.message || 'Unable to update status.' });
      return;
    }

    applyUpdatedFlag(row.feature_id, data);
    setFlash({
      type: 'success',
      text: forcedDisplayInApp
        ? `Feature ${nextEnabled ? 'enabled' : 'disabled'} successfully. ${placementPolicy.message}`
        : `Feature ${nextEnabled ? 'enabled' : 'disabled'} successfully.`,
    });
  };

  const handleDisplayInAppToggle = async (row, displayInSidebar) => {
    const placementPolicy = getDisplayPlacementPolicy(row);
    if (placementPolicy.locked) {
      const actualDisplay = normalizeDisplayInApp(row.display_in_app);
      const desiredDisplay = normalizeDisplayInApp(placementPolicy.forcedDisplayInApp);

      if (row.flag_id && actualDisplay === desiredDisplay) {
        setFlash({ type: 'info', text: placementPolicy.message });
        return;
      }

      const key = row.feature_id;
      setDisplayTogglingMap((prev) => ({ ...prev, [key]: true }));

      const { data, error: updateError } = await saveFeatureCustomization({
        mergedFeature: row,
        trustId: selectedTrustId,
        tier: selectedTier,
        trustName: selectedTrust?.name || '',
        updates: {
          display_in_app: placementPolicy.forcedDisplayInApp,
        },
      });

      setDisplayTogglingMap((prev) => ({ ...prev, [key]: false }));

      if (updateError) {
        setFlash({ type: 'error', text: updateError.message || 'Unable to update app display.' });
        return;
      }

      applyUpdatedFlag(row.feature_id, data);
      setFlash({ type: 'info', text: placementPolicy.message });
      return;
    }

    const key = row.feature_id;
    setDisplayTogglingMap((prev) => ({ ...prev, [key]: true }));

    const { data, error: updateError } = await saveFeatureCustomization({
      mergedFeature: row,
      trustId: selectedTrustId,
      tier: selectedTier,
      trustName: selectedTrust?.name || '',
      updates: {
        display_in_app: displayInSidebar ? DISPLAY_IN_APP_SIDEBAR : DISPLAY_IN_APP_HOME,
      },
    });

    setDisplayTogglingMap((prev) => ({ ...prev, [key]: false }));

    if (updateError) {
      setFlash({ type: 'error', text: updateError.message || 'Unable to update app display.' });
      return;
    }

    applyUpdatedFlag(row.feature_id, data);
    setFlash({ type: 'success', text: `Feature display set to ${displayInSidebar ? 'sidebar' : 'home'}.` });
  };

  const handleOpenEdit = (row) => {
    setSaveError('');
    setActiveEditRow(row);
  };

  const handleOpenView = (row) => {
    setActiveViewRow(row);
  };

  const handleSaveEdit = async (payload) => {
    if (!activeEditRow) return;

    setSavingEdit(true);
    setSaveError('');

    const { data, error: updateError } = await saveFeatureCustomization({
      mergedFeature: activeEditRow,
      trustId: selectedTrustId,
      tier: selectedTier,
      trustName: selectedTrust?.name || '',
      updates: payload,
    });

    setSavingEdit(false);

    if (updateError) {
      setSaveError(updateError.message || 'Unable to save feature details.');
      return;
    }

    applyUpdatedFlag(activeEditRow.feature_id, data);
    setActiveEditRow(null);
    setFlash({ type: 'success', text: 'Feature updated successfully.' });
  };

  if (!trust?.id) return null;

  return (
    <div className="fc-root">
      <Sidebar
        trustName={selectedTrust?.name || trust?.name || 'Trust'}
        onDashboard={() => navigate('/dashboard', { state: { userName, trust: selectedTrust || trust, sidebarNavKey: currentSidebarNavKey } })}
        onLogout={() => navigate('/login')}
      />

      <main className="fc-main">
        <PageHeader
          title="Feature Control"
          subtitle="Master features are read-only; this page edits feature_flags only"
          onBack={() => navigate('/dashboard', {
            state: {
              userName,
              trust: selectedTrust || trust,
              sidebarNavKey: currentSidebarNavKey,
              tier: selectedTier,
            },
          })}
        />

        <section className="fc-panel">
          {!openedFromFeatures20 ? renderControls() : null}

          {/* Card hides while its feature list is open; the list takes its place */}
          {!activeCategoryView ? (
          <div className="fc-category-summary" aria-label="Feature category summary">
            <button
              type="button"
              className={`fc-category-card ${activeCategoryView === 'all' ? 'active' : ''}`}
              onClick={() => openCategoryView('all')}
              aria-pressed={activeCategoryView === 'all'}
              title={activeCategoryView === 'all' ? 'Click to close category view' : 'Click to view all features'}
            >
              <span className="fc-cat-top">
                <span className="fc-cat-icon" aria-hidden="true">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                    <rect x="3" y="3" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.9" />
                    <rect x="13.5" y="3" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.9" />
                    <rect x="3" y="13.5" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.9" />
                    <rect x="13.5" y="13.5" width="7.5" height="7.5" rx="2" stroke="currentColor" strokeWidth="1.9" />
                  </svg>
                </span>
                <span className="fc-cat-badge">{allTotalCount} features</span>
              </span>

              <span className="fc-cat-body">
                <span className="fc-category-card-title">All Categories</span>
                <span className="fc-category-card-sub">View and manage every feature in one place</span>
              </span>

              <span className="fc-cat-stats">
                <span className="fc-cat-stat">
                  <strong>{allEnabledCount}</strong>
                  <small>Enabled</small>
                </span>
                <span className="fc-cat-stat">
                  <strong>{allTotalCount - allEnabledCount}</strong>
                  <small>Disabled</small>
                </span>
                <span className="fc-cat-stat">
                  <strong>{categorySummary.length}</strong>
                  <small>Categories</small>
                </span>
              </span>

              <span className="fc-cat-progress" aria-hidden="true">
                <span style={{ width: `${allEnabledPercent}%` }} />
              </span>

              <span className="fc-cat-foot">
                <span>{allEnabledPercent}% enabled</span>
                <span className="fc-cat-open">
                  Open
                  <span className="fc-category-card-arrow" aria-hidden="true">→</span>
                </span>
              </span>
            </button>
          </div>
          ) : null}

          {error ? (
            <div className="fc-error">
              <span>{error}</span>
              <button type="button" onClick={() => loadMergedRows(masterFeatures)}>
                Retry
              </button>
            </div>
          ) : null}

      {/* Opens inline in the card's place (full width), not as an overlay */}
      {activeCategoryView ? (
        <section
          id="fc-category-inline"
          ref={categoryInlineRef}
          className="fc-category-inline"
          aria-label="Category features"
        >
          <div className="fc-category-view-panel">
            <div className="fc-category-view-head">
              <div className="fc-view-titles">
                <h3>{activeCategoryMeta?.label || 'Category Features'}</h3>
                <p>
                  Showing {filteredRows.length} of {rowsWithCounts.length} feature{rowsWithCounts.length === 1 ? '' : 's'}
                </p>
              </div>
              <div className="fc-view-chips" aria-label="Feature summary">
                <span className="fc-chip">
                  <strong>{allTotalCount}</strong> Total
                </span>
                <span className="fc-chip on">
                  <strong>{allEnabledCount}</strong> Enabled
                </span>
                <span className="fc-chip off">
                  <strong>{allTotalCount - allEnabledCount}</strong> Disabled
                </span>
              </div>
            </div>
            {openedFromFeatures20 ? (
              <div className="fc-category-controls-wrap">
                {isMobileViewport ? (
                  <>
                    <button
                      type="button"
                      className="fc-mobile-filters-toggle"
                      onClick={() => setMobileFiltersOpen((prev) => !prev)}
                    >
                      {mobileFiltersOpen ? 'Hide Filters' : 'Show Filters'}
                    </button>
                    {mobileFiltersOpen ? renderControls('fc-controls-inline') : null}
                  </>
                ) : (
                  renderControls('fc-controls-inline')
                )}
              </div>
            ) : null}

            <FeatureControlTable
              rows={filteredRows}
              loading={loading}
              togglingMap={togglingMap}
              displayTogglingMap={displayTogglingMap}
              onToggle={handleToggle}
              onDisplayInAppToggle={handleDisplayInAppToggle}
              onEdit={handleOpenEdit}
              onView={handleOpenView}
            />
          </div>
        </section>
      ) : null}

        </section>
      </main>

      <FeatureViewModal
        open={!!activeViewRow}
        row={activeViewRow}
        onClose={() => setActiveViewRow(null)}
      />

      <FeatureEditModal
        key={activeEditRow ? `${activeEditRow.feature_id}-${activeEditRow.tier}` : 'feature-edit'}
        open={!!activeEditRow}
        row={activeEditRow}
        trustId={selectedTrustId}
        tier={selectedTier}
        saving={savingEdit}
        saveError={saveError}
        onClose={() => setActiveEditRow(null)}
        onSave={handleSaveEdit}
      />

      {flash ? (
        <div className={`fc-toast ${flash.type === 'error' ? 'error' : 'success'}`} role="status">
          {flash.text}
        </div>
      ) : null}
    </div>
  );
}
