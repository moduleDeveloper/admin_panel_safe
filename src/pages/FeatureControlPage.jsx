import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import FeatureControlTable from '../components/feature-control/FeatureControlTable';
import FeatureEditModal from '../components/feature-control/FeatureEditModal';
import { fetchLinkedTrusts } from '../services/authService';
import {
  fetchMasterFeatures,
  fetchSubFeatureCountsByFeatureIds,
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
  const [selectedTier, setSelectedTier] = useState(
    location.state?.tier === 'vip' ? 'vip' : 'general',
  );
  const [masterFeatures, setMasterFeatures] = useState([]);
  const [subFeatureCountByFeatureId, setSubFeatureCountByFeatureId] = useState({});
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [quickOrderSort, setQuickOrderSort] = useState('asc');
  const [activeCategoryView, setActiveCategoryView] = useState(null);
  const [isMobileViewport, setIsMobileViewport] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);

  const [togglingMap, setTogglingMap] = useState({});
  const [displayTogglingMap, setDisplayTogglingMap] = useState({});
  const [activeEditRow, setActiveEditRow] = useState(null);
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
    const { data, error: masterError } = await fetchMasterFeatures();
    if (masterError) {
      setError(masterError.message || 'Unable to load features master list.');
      return [];
    }
    const masterList = data || [];
    setMasterFeatures(masterList);

    const { data: counts, error: countError } = await fetchSubFeatureCountsByFeatureIds(
      masterList.map((item) => item.id).filter(Boolean),
    );
    if (!countError) setSubFeatureCountByFeatureId(counts || {});

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

    const merged = mergeFeaturesWithFlags(masterList, flags || [], selectedTrustId, selectedTier);
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
    // On refresh/load: keep page state clean by closing category modal.
    setActiveCategoryView(null);
  }, []);

  useEffect(() => {
    try {
      const raw = window.sessionStorage.getItem(filterStorageKey);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (typeof parsed.searchTerm === 'string') setSearchTerm(parsed.searchTerm);
      if (typeof parsed.statusFilter === 'string') setStatusFilter(parsed.statusFilter);
      if (typeof parsed.categoryFilter === 'string') setCategoryFilter(parsed.categoryFilter);
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
      rows.map((row) => {
        const category = classifyFeatureByApp(row);
        return {
          ...row,
          sub_feature_count: Number(subFeatureCountByFeatureId[String(row.feature_id)] || 0),
          app_category: category.key,
          app_category_label: category.label,
        };
      }),
    [rows, subFeatureCountByFeatureId],
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
      const leftOrder = normalizeQuickOrder(left.quick_order);
      const rightOrder = normalizeQuickOrder(right.quick_order);
      const direction = quickOrderSort === 'desc' ? -1 : 1;
      if (leftOrder !== rightOrder) return (leftOrder - rightOrder) * direction;
      return String(left.master_name || '').localeCompare(String(right.master_name || ''), undefined, {
        sensitivity: 'base',
      });
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

  const handleCategoryFilterChange = (nextValue) => {
    setCategoryFilter(nextValue);
    if (activeCategoryView) {
      setActiveCategoryView(nextValue === 'all' ? 'all' : nextValue);
    }
  };

  const renderControls = (extraClass = '') => (
    <div className={`fc-controls${extraClass ? ` ${extraClass}` : ''}`}>
      <label>
        <span>Trust</span>
        <select value={selectedTrustId} onChange={(event) => setSelectedTrustId(event.target.value)}>
          {trustOptions.map((item) => (
            <option key={item.id} value={item.id}>{item.name}</option>
          ))}
        </select>
      </label>

      <label>
        <span>Tier</span>
        <select value={selectedTier} onChange={(event) => setSelectedTier(event.target.value)}>
          <option value="general">general</option>
          <option value="vip">vip</option>
        </select>
      </label>

      <label className="fc-search">
        <span>Search</span>
        <input
          type="text"
          placeholder="Search feature, display name, route..."
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
        />
      </label>

      <label>
        <span>Status</span>
        <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
          <option value="all">all</option>
          <option value="enabled">enabled</option>
          <option value="disabled">disabled</option>
        </select>
      </label>

      <label>
        <span>Category</span>
        <select value={categoryFilter} onChange={(event) => handleCategoryFilterChange(event.target.value)}>
          <option value="all">all app categories</option>
          {categorySummary.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
            </option>
          ))}
        </select>
      </label>

      <label>
        <span>Sort by Quick Order</span>
        <select value={quickOrderSort} onChange={(event) => setQuickOrderSort(event.target.value)}>
          <option value="asc">ascending</option>
          <option value="desc">descending</option>
        </select>
      </label>
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

    const { data, error: toggleError } = await toggleFeatureEnabled({
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
    setFlash({ type: 'success', text: `Feature ${nextEnabled ? 'enabled' : 'disabled'} successfully.` });
  };

  const handleDisplayInAppToggle = async (row, displayInSidebar) => {
    const key = row.feature_id;
    setDisplayTogglingMap((prev) => ({ ...prev, [key]: true }));

    const { data, error: updateError } = await saveFeatureCustomization({
      mergedFeature: row,
      trustId: selectedTrustId,
      tier: selectedTier,
      trustName: selectedTrust?.name || '',
      updates: {
        display_in_app: displayInSidebar ? 'sideBar' : 'home',
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

  const handleOpenSubScreens = (row) => {
    navigate('/sub-feature-control', {
      state: {
        userName,
        trust: selectedTrust || trust,
        sidebarNavKey: currentSidebarNavKey,
        fromFeatures20: openedFromFeatures20,
        featureId: row.feature_id,
        tier: selectedTier === 'vip' ? 'vip' : 'gen',
      },
    });
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
          <div className="fc-readonly-note">
            {openedFromFeatures20 ? (
              <>View only</>
            ) : (
              <>Source table: <strong>features</strong> (view only). Editable table: <strong>feature_flags</strong>.</>
            )}
          </div>

          {!openedFromFeatures20 ? renderControls() : null}

          <div className="fc-category-summary" aria-label="Feature category summary">
            <button
              type="button"
              className={`fc-category-card ${activeCategoryView === 'all' ? 'active' : ''}`}
              onClick={() => openCategoryView('all')}
              aria-pressed={activeCategoryView === 'all'}
              title={activeCategoryView === 'all' ? 'Click to close category view' : 'Click to view all features'}
            >
              <div className="fc-category-card-left">
                <span className="fc-category-card-title">All Categories</span>
                <span className="fc-category-card-sub">
                  Showing all features
                </span>
                <span className="fc-category-card-hint">
                  {activeCategoryView === 'all' ? 'Click again to close' : 'Click to open details'}
                </span>
              </div>
              <div className="fc-category-card-right">
                <strong>{rowsWithCounts.length}</strong>
                <span className="fc-category-card-arrow" aria-hidden="true">→</span>
              </div>
            </button>
            {categorySummary.map((item) => (
              <button
                key={item.key}
                type="button"
                className={`fc-category-card category-${item.key} ${activeCategoryView === item.key ? 'active' : ''}`}
                onClick={() => openCategoryView(item.key)}
                aria-pressed={activeCategoryView === item.key}
                title={activeCategoryView === item.key ? `Click to close ${item.label}` : `Click to view ${item.label}`}
              >
                <div className="fc-category-card-left">
                  <span className="fc-category-card-title">{item.label}</span>
                  <span className="fc-category-card-sub">
                    Enabled {item.enabled} of {item.total}
                  </span>
                  <span className="fc-category-card-hint">
                    {activeCategoryView === item.key ? 'Click again to close' : 'Click to open details'}
                  </span>
                </div>
                <div className="fc-category-card-right">
                  <strong>{item.enabled}/{item.total}</strong>
                  <span className="fc-category-card-arrow" aria-hidden="true">→</span>
                </div>
              </button>
            ))}
          </div>

          {error ? (
            <div className="fc-error">
              <span>{error}</span>
              <button type="button" onClick={() => loadMergedRows(masterFeatures)}>
                Retry
              </button>
            </div>
          ) : null}

        </section>
      </main>

      {activeCategoryView ? (
        <div className="fc-category-view-overlay" role="dialog" aria-modal="true" aria-label="Category features">
          <div className="fc-category-view-panel">
            <div className="fc-category-view-head">
              <div>
                <h3>{activeCategoryMeta?.label || 'Category Features'}</h3>
                <p>
                  Showing {filteredRows.length} feature{filteredRows.length === 1 ? '' : 's'}
                  {activeCategoryMeta?.total ? ` | Enabled ${activeCategoryMeta.enabled}/${activeCategoryMeta.total}` : ''}
                </p>
              </div>
              <button type="button" className="fc-category-view-close" onClick={closeCategoryView} aria-label="Close category view">
                ×
              </button>
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
              onOpenSubScreens={handleOpenSubScreens}
            />
          </div>
        </div>
      ) : null}

      <FeatureEditModal
        key={activeEditRow ? `${activeEditRow.feature_id}-${activeEditRow.tier}` : 'feature-edit'}
        open={!!activeEditRow}
        row={activeEditRow}
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
