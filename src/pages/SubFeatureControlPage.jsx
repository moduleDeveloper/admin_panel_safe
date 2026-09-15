import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import Sidebar from '../components/Sidebar';
import SubFeatureControlTable from '../components/feature-control/SubFeatureControlTable';
import SubFeatureEditModal from '../components/feature-control/SubFeatureEditModal';
import { fetchLinkedTrusts } from '../services/authService';
import {
  fetchMasterFeaturesForSubFeatures,
  fetchSubFeaturesByFeature,
  fetchSubFeatureFlagsByTrustTierAndFeature,
  mergeSubFeaturesWithFlags,
  mergeSingleSubFeatureWithFlag,
  saveSubFeatureCustomization,
  toggleSubFeatureEnabled,
} from '../services/subFeatureControlService';
import './FeatureControlPage.css';

function normalizeQuickOrder(value) {
  if (value === null || value === undefined || value === '') return Number.MAX_SAFE_INTEGER;
  return Number(value);
}

export default function SubFeatureControlPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};
  const openedFromFeatures20 = !!location.state?.fromFeatures20;
  const openedFromFeatureControl = !!location.state?.featureId;
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'dashboard';

  const [trustOptions, setTrustOptions] = useState(trust ? [trust] : []);
  const [selectedTrustId, setSelectedTrustId] = useState(trust?.id || '');
  const [selectedTier, setSelectedTier] = useState(
    location.state?.tier === 'vip' ? 'vip' : 'gen',
  );
  const [masterFeatures, setMasterFeatures] = useState([]);
  const [selectedFeatureId, setSelectedFeatureId] = useState(location.state?.featureId || '');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [quickOrderSort, setQuickOrderSort] = useState('asc');

  const [togglingMap, setTogglingMap] = useState({});
  const [activeEditRow, setActiveEditRow] = useState(null);
  const [editSession, setEditSession] = useState(0);
  const [savingEdit, setSavingEdit] = useState(false);
  const [saveError, setSaveError] = useState('');

  const [flash, setFlash] = useState(null);

  const selectedTrust = useMemo(
    () => trustOptions.find((item) => String(item.id) === String(selectedTrustId)) || null,
    [trustOptions, selectedTrustId]
  );

  const selectedFeature = useMemo(
    () => masterFeatures.find((item) => String(item.id) === String(selectedFeatureId)) || null,
    [masterFeatures, selectedFeatureId]
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
    const { data, error: masterError } = await fetchMasterFeaturesForSubFeatures();
    if (masterError) {
      setError(masterError.message || 'Unable to load features list.');
      return [];
    }

    const list = data || [];
    setMasterFeatures(list);
    setSelectedFeatureId((prev) => {
      if (prev && list.some((item) => String(item.id) === String(prev))) return prev;
      return list[0]?.id || '';
    });
    return list;
  }, []);

  const loadMergedRows = useCallback(async (featureIdInput) => {
    const featureId = featureIdInput || selectedFeatureId;
    if (!selectedTrustId || !featureId) {
      setRows([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError('');

    const [{ data: subFeatures, error: subFeaturesError }, { data: flags, error: flagsError }] = await Promise.all([
      fetchSubFeaturesByFeature(featureId),
      fetchSubFeatureFlagsByTrustTierAndFeature(selectedTrustId, selectedTier, featureId),
    ]);

    if (subFeaturesError) {
      setError(subFeaturesError.message || 'Unable to load sub features.');
      setLoading(false);
      return;
    }

    if (flagsError) {
      setError(flagsError.message || 'Unable to load sub feature flags.');
      setLoading(false);
      return;
    }

    const merged = mergeSubFeaturesWithFlags(subFeatures || [], flags || [], selectedTrustId, selectedTier);
    setRows(merged);
    setLoading(false);
  }, [selectedFeatureId, selectedTier, selectedTrustId]);

  useEffect(() => {
    if (!trust?.id) {
      navigate('/dashboard', { replace: true, state: { userName, trust } });
    }
  }, [navigate, trust, userName]);

  useEffect(() => {
    const run = async () => {
      await loadTrusts();
    };
    run();
  }, [loadTrusts]);

  useEffect(() => {
    const run = async () => {
      await loadMasterFeatures();
    };
    run();
  }, [loadMasterFeatures]);

  useEffect(() => {
    const run = async () => {
      await loadMergedRows(selectedFeatureId);
    };
    run();
  }, [selectedTrustId, selectedTier, selectedFeatureId, loadMergedRows]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 2600);
    return () => clearTimeout(timer);
  }, [flash]);

  const filteredRows = useMemo(() => {
    const normalizedSearch = searchTerm.trim().toLowerCase();

    const searched = rows.filter((row) => {
      if (!normalizedSearch) return true;
      const fields = [row.master_name, row.master_subname, row.display_name, row.tagline, row.route];
      return fields.some((value) => String(value || '').toLowerCase().includes(normalizedSearch));
    });

    const byStatus = searched.filter((row) => {
      if (statusFilter === 'enabled') return !!row.is_enabled;
      if (statusFilter === 'disabled') return !row.is_enabled;
      return true;
    });

    return [...byStatus].sort((left, right) => {
      const leftOrder = normalizeQuickOrder(left.quick_order);
      const rightOrder = normalizeQuickOrder(right.quick_order);
      const direction = quickOrderSort === 'desc' ? -1 : 1;
      if (leftOrder !== rightOrder) return (leftOrder - rightOrder) * direction;
      return String(left.master_name || '').localeCompare(String(right.master_name || ''), undefined, {
        sensitivity: 'base',
      });
    });
  }, [rows, searchTerm, statusFilter, quickOrderSort]);

  const applyUpdatedFlag = (subFeatureId, updatedFlag) => {
    setRows((prev) =>
      prev.map((row) => (row.sub_feature_id === subFeatureId ? mergeSingleSubFeatureWithFlag(row, updatedFlag) : row))
    );
  };

  const handleToggle = async (row, nextEnabled) => {
    const key = row.sub_feature_id;
    setTogglingMap((prev) => ({ ...prev, [key]: true }));

    const { data, error: toggleError } = await toggleSubFeatureEnabled({
      mergedSubFeature: row,
      trustId: selectedTrustId,
      tier: selectedTier,
      isEnabled: nextEnabled,
    });

    setTogglingMap((prev) => ({ ...prev, [key]: false }));

    if (toggleError) {
      setFlash({ type: 'error', text: toggleError.message || 'Unable to update status.' });
      return;
    }

    applyUpdatedFlag(row.sub_feature_id, data);
    setFlash({ type: 'success', text: `Sub feature ${nextEnabled ? 'enabled' : 'disabled'} successfully.` });
  };

  const handleOpenEdit = (row) => {
    setSaveError('');
    setEditSession((prev) => prev + 1);
    setActiveEditRow(row);
  };

  const handleSaveEdit = async (payload) => {
    if (!activeEditRow) return;

    setSavingEdit(true);
    setSaveError('');

    const { data, error: updateError } = await saveSubFeatureCustomization({
      mergedSubFeature: activeEditRow,
      trustId: selectedTrustId,
      tier: selectedTier,
      updates: payload,
    });

    setSavingEdit(false);

    if (updateError) {
      setSaveError(updateError.message || 'Unable to save sub feature details.');
      return;
    }

    applyUpdatedFlag(activeEditRow.sub_feature_id, data);
    setActiveEditRow(null);
    setFlash({ type: 'success', text: 'Sub feature updated successfully.' });
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
          title="Sub Feature Control"
          subtitle="Master sub features are read-only; this page edits sub_feature_flags only"
          onBack={() => {
            if (openedFromFeatureControl) {
              navigate('/feature-control', {
                state: {
                  userName,
                  trust: selectedTrust || trust,
                  sidebarNavKey: currentSidebarNavKey,
                  fromFeatures20: openedFromFeatures20,
                  tier: selectedTier === 'vip' ? 'vip' : 'general',
                },
              });
              return;
            }

            navigate(
              openedFromFeatures20 ? '/feature-control' : '/dashboard',
              {
                state: {
                  userName,
                  trust: selectedTrust || trust,
                  sidebarNavKey: currentSidebarNavKey,
                  fromFeatures20: openedFromFeatures20,
                  tier: selectedTier === 'vip' ? 'vip' : 'general',
                },
              },
            );
          }}
        />

        <section className="fc-panel">
          <div className="fc-controls">
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
                <option value="gen">gen</option>
                <option value="vip">vip</option>
              </select>
            </label>

            <label>
              <span>Main Feature</span>
              <select value={selectedFeatureId} onChange={(event) => setSelectedFeatureId(event.target.value)}>
                {masterFeatures.map((item) => (
                  <option key={item.id} value={item.id}>{item.name}</option>
                ))}
              </select>
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
              <span>Sort by Quick Order</span>
              <select value={quickOrderSort} onChange={(event) => setQuickOrderSort(event.target.value)}>
                <option value="asc">ascending</option>
                <option value="desc">descending</option>
              </select>
            </label>

            <label className="fc-search">
              <span>Search</span>
              <input
                type="text"
                placeholder="Search sub feature, display name, tagline..."
                value={searchTerm}
                onChange={(event) => setSearchTerm(event.target.value)}
              />
            </label>
          </div>

          {error ? (
            <div className="fc-error">
              <span>{error}</span>
              <button type="button" onClick={() => loadMergedRows(selectedFeatureId)}>
                Retry
              </button>
            </div>
          ) : null}

          <SubFeatureControlTable
            rows={filteredRows}
            loading={loading}
            togglingMap={togglingMap}
            onToggle={handleToggle}
            onEdit={handleOpenEdit}
          />
        </section>
      </main>

      <SubFeatureEditModal
        key={activeEditRow ? `${activeEditRow.sub_feature_id}-${activeEditRow.tier}-${editSession}` : 'sub-feature-edit'}
        open={!!activeEditRow}
        row={activeEditRow}
        trustId={selectedTrustId}
        parentFeatureName={selectedFeature?.name || ''}
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
