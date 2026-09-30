import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { FeatureIconRenderer } from '../../../dashboard/pages/Dashboard';

function Badge({ on, label }) {
  return (
    <span className="fvm-badge" data-on={on ? 'true' : 'false'}>
      {label}
    </span>
  );
}

function Row({ label, value }) {
  if (value === null || value === undefined || value === '') return null;
  return (
    <div className="fvm-row">
      <span className="fvm-label">{label}</span>
      <span className="fvm-value">{value}</span>
    </div>
  );
}

export default function FeatureViewModal({ open, row, onClose }) {
  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open || !row) return null;

  const placementPolicy = row.display_placement_policy || {};
  const isHomeOnly = placementPolicy.type === 'home-only';
  const isSidebarOnly = placementPolicy.type === 'sidebar-only';
  const displayLocation = isHomeOnly ? 'Home only' : isSidebarOnly ? 'Sidebar only'
    : String(row.display_in_app || 'home').toLowerCase() === 'sidebar' ? 'Sidebar' : 'Home';

  return createPortal(
    <div className="fvm-overlay" onClick={onClose}>
      <div className="fvm-modal" onClick={(e) => e.stopPropagation()}>

        {/* Header */}
        <div className="fvm-head">
          <div className="fvm-head-icon">
            {row.icon_url ? (
              <FeatureIconRenderer icon_url={row.icon_url} route={row.route} size={36} />
            ) : (
              <span>{String(row.master_name || '?').trim().slice(0, 1).toUpperCase()}</span>
            )}
          </div>
          <div className="fvm-head-text">
            <h3>{row.master_name || '—'}</h3>
            {row.master_subname ? <p>{row.master_subname}</p> : null}
          </div>
          <button type="button" className="fvm-close" onClick={onClose} aria-label="Close">✕</button>
        </div>

        {/* Status badges */}
        <div className="fvm-badges">
          <Badge on={row.is_enabled} label={row.is_enabled ? 'Enabled' : 'Disabled'} />
          <span className="fvm-badge fvm-badge-neutral">{row.tier || '—'}</span>
          {row.app_category_label ? <span className="fvm-badge fvm-badge-neutral">{row.app_category_label}</span> : null}
          <span className="fvm-badge fvm-badge-neutral">{displayLocation}</span>
          {row.sub_feature_count > 0
            ? <span className="fvm-badge fvm-badge-neutral">{row.sub_feature_count} sub-feature{row.sub_feature_count > 1 ? 's' : ''}</span>
            : null}
        </div>

        {/* Details */}
        <div className="fvm-body">
          <div className="fvm-section">
            <div className="fvm-section-title">Basic Info</div>
            <Row label="Display Name"   value={row.display_name} />
            <Row label="Tagline"        value={row.tagline} />
            <Row label="Route"          value={row.route} />
            <Row label="Quick Order"    value={row.quick_order ?? '—'} />
          </div>

          <div className="fvm-section">
            <div className="fvm-section-title">Visibility</div>
            <Row label="Status"              value={row.is_enabled ? 'Enabled' : 'Disabled'} />
            <Row label="Display Location"    value={displayLocation} />
            <Row label="Placement Locked"    value={placementPolicy.locked ? 'Yes' : 'No'} />
            {placementPolicy.message ? <Row label="Placement Note" value={placementPolicy.message} /> : null}
          </div>

          {row.icon_url ? (
            <div className="fvm-section">
              <div className="fvm-section-title">Icon</div>
              <div className="fvm-icon-preview">
                <FeatureIconRenderer icon_url={row.icon_url} route={row.route} size={48} />
                <span className="fvm-icon-url">{row.icon_url}</span>
              </div>
            </div>
          ) : null}
        </div>

        <div className="fvm-footer">
          <button type="button" className="fc-btn fc-btn-primary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>,
    document.body
  );
}
