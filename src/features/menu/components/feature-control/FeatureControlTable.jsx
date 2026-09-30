function resolveIconSource(raw = '') {
  const value = String(raw || '').trim();
  if (!value) return '';

  if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) return value;

  if (value.startsWith('/')) {
    const base = import.meta.env.BASE_URL || '/';
    const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${normalizedBase}${value}`;
  }

  // treat relative storage path as public path
  const base = import.meta.env.BASE_URL || '/';
  return `${base}${value.replace(/^\/+/, '')}`;
}

function FeatureIconCell({ iconUrl, featureName }) {
  const raw = String(iconUrl || '').trim();

  if (!raw) {
    return <span className="fc-icon-fallback">{String(featureName || '?').slice(0, 1).toUpperCase()}</span>;
  }

  if (raw.includes('<svg')) {
    return <span className="fc-icon-raw-svg" dangerouslySetInnerHTML={{ __html: raw }} />;
  }

  const maybeEmoji = !/^https?:\/\//i.test(raw) && !raw.startsWith('/') && !/^data:image\//i.test(raw) && raw.length <= 8;
  if (maybeEmoji) {
    return <span className="fc-icon-emoji">{raw}</span>;
  }

  const src = resolveIconSource(raw);
  return (
    <img
      src={src}
      alt={featureName || 'Feature icon'}
      className="fc-icon-img"
      onError={(event) => {
        event.currentTarget.style.display = 'none';
        const parent = event.currentTarget.parentElement;
        if (parent) {
          parent.innerHTML = `<span class="fc-icon-fallback">${String(featureName || '?').slice(0, 1).toUpperCase()}</span>`;
        }
      }}
    />
  );
}

export default function FeatureControlTable({
  rows,
  loading,
  togglingMap,
  displayTogglingMap = {},
  onToggle,
  onDisplayInAppToggle,
  onEdit,
  onView,
}) {
  if (loading) {
    return (
      <div className="fc-state fc-loading">
        <div className="fc-spinner" />
        <p>Loading features...</p>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="fc-state fc-empty">
        <div className="fc-empty-icon">FC</div>
        <h3>No features found</h3>
        <p>Try a different search, or set Status to All.</p>
      </div>
    );
  }

  return (
    <div className="fc-table-wrap">
      <table className="fc-table fc-feature-table">
        <thead>
          <tr>
            <th>Icon</th>
            <th>Feature Name</th>
            <th>Display Name</th>
            <th>Display</th>
            <th>Status</th>
            <th>View</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isBusy = !!togglingMap[row.feature_id];
            const isDisplayBusy = !!displayTogglingMap[row.feature_id];
            const placementPolicy = row.display_placement_policy || {};
            const displaysInSidebar = placementPolicy.locked
              ? !!placementPolicy.displaysInSidebar
              : String(row.display_in_app || 'home').trim().toLowerCase() === 'sidebar';
            const isHomeOnly = placementPolicy.type === 'home-only';
            const isSidebarOnly = placementPolicy.type === 'sidebar-only';
            const placementLabel = isHomeOnly ? 'Home only' : isSidebarOnly ? 'Sidebar only' : '';
            const placementMessage = placementPolicy.message || (
              displaysInSidebar ? 'Display on home' : 'Display in sidebar'
            );
            return (
              <tr key={`${row.feature_id}-${row.tier}`}>
                <td data-label="Icon">
                  <div className="fc-icon-cell">
                    <div className="fc-icon-preview">
                      <FeatureIconCell iconUrl={row.icon_url} featureName={row.master_name} />
                    </div>
                    <div className="fc-icon-name-mobile">
                      <div className="fc-feature-name">{row.master_name}</div>
                      {row.master_subname ? <div className="fc-feature-sub">{row.master_subname}</div> : null}
                    </div>
                  </div>
                </td>
                <td data-label="Feature Name">
                  <div className="fc-feature-name">{row.master_name}</div>
                  {row.master_subname ? <div className="fc-feature-sub">{row.master_subname}</div> : null}
                </td>
                <td className="fc-display-col" data-label="Display Name">{row.display_name || '-'}</td>
                <td className="fc-sidebar-col" data-label="Display">
                  {row.is_enabled && placementPolicy.type !== 'none' ? (
                    placementLabel ? (
                      <span className={`fc-placement-badge ${isSidebarOnly ? 'sidebar' : 'home'}`}>
                        {isDisplayBusy ? 'Saving...' : placementLabel}
                      </span>
                    ) : (
                      <div
                        className={`fc-display-switch ${isDisplayBusy ? 'busy' : ''} ${placementPolicy.locked ? 'locked' : ''}`}
                        role="group"
                        title={isDisplayBusy ? 'Saving...' : placementMessage}
                      >
                        <button type="button" className={`fc-display-option ${!displaysInSidebar ? 'active' : ''}`}
                          onClick={() => { if (!isHomeOnly && displaysInSidebar) onDisplayInAppToggle(row, false); }}
                          disabled={isDisplayBusy || !onDisplayInAppToggle || placementPolicy.locked}
                          aria-pressed={!displaysInSidebar}>Home</button>
                        <button type="button" className={`fc-display-option ${displaysInSidebar ? 'active' : ''}`}
                          onClick={() => { if (!isSidebarOnly && !displaysInSidebar) onDisplayInAppToggle(row, true); }}
                          disabled={isDisplayBusy || !onDisplayInAppToggle || placementPolicy.locked}
                          aria-pressed={displaysInSidebar}>Sidebar</button>
                      </div>
                    )
                  ) : (
                    <span className="fc-muted-cell">-</span>
                  )}
                </td>
                <td className="fc-status-col" data-label="Status">
                  <button type="button" className={`fc-toggle ${row.is_enabled ? 'on' : 'off'} ${isBusy ? 'busy' : ''}`}
                    onClick={() => onToggle(row, !row.is_enabled)} disabled={isBusy}
                    aria-pressed={row.is_enabled}
                    title={isBusy ? 'Saving...' : row.is_enabled ? 'Disable feature' : 'Enable feature'}>
                    <span className="fc-toggle-track"><span className="fc-toggle-thumb" /></span>
                  </button>
                </td>
                <td className="fc-view-col" data-label="View">
                  <div className="fc-actions-cell">
                    <button className="fc-btn fc-btn-view fc-btn-action" type="button" onClick={() => onView?.(row)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="2.2" />
                      </svg>
                      View
                    </button>
                  </div>
                </td>
                <td className="fc-actions-col" data-label="Actions">
                  <div className="fc-actions-cell">
                    <button className="fc-btn fc-btn-edit fc-btn-action" type="button" onClick={() => onEdit(row)}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                        <path d="M12 20h9" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
                        <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                      Edit
                    </button>
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
