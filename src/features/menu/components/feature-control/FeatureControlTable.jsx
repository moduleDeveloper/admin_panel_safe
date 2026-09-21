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
  onOpenSubScreens,
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
        <p>Try changing search/filter or choose another trust and tier.</p>
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
            <th>Tagline</th>
            <th>Route</th>
            <th>Quick Order</th>
            <th>Display</th>
            <th>Status</th>
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
                  </div>
                </td>
                <td data-label="Feature Name">
                  <div className="fc-feature-name">{row.master_name}</div>
                  {row.master_subname ? <div className="fc-feature-sub">{row.master_subname}</div> : null}
                </td>
                <td className="fc-display-col" data-label="Display Name">{row.display_name || '-'}</td>
                <td className="fc-tagline-col" data-label="Tagline">{row.tagline || '-'}</td>
                <td className="fc-route-col" data-label="Route">{row.route || '-'}</td>
                <td className="fc-order-col" data-label="Quick Order">{row.quick_order ?? '-'}</td>
                <td className="fc-sidebar-col" data-label="Display">
                  {row.is_enabled ? (
                    <div
                      className="fc-placement-cell"
                      title={isDisplayBusy ? 'Saving...' : placementMessage}
                      onClick={() => {
                        if (isHomeOnly && !isDisplayBusy && onDisplayInAppToggle) {
                          onDisplayInAppToggle(row, false);
                        }
                      }}
                    >
                      <div
                        className={`fc-display-switch ${isDisplayBusy ? 'busy' : ''} ${placementPolicy.locked ? 'locked' : ''}`}
                        role="group"
                        aria-label={isDisplayBusy ? 'Saving display placement' : placementMessage}
                        title={isDisplayBusy ? 'Saving...' : placementMessage}
                      >
                        <button
                          type="button"
                          className={`fc-display-option ${!displaysInSidebar ? 'active' : ''}`}
                          onClick={() => {
                            if (!isHomeOnly && displaysInSidebar) onDisplayInAppToggle(row, false);
                          }}
                          disabled={isDisplayBusy || !onDisplayInAppToggle || placementPolicy.locked}
                          aria-pressed={!displaysInSidebar}
                        >
                          Home
                        </button>
                        <button
                          type="button"
                          className={`fc-display-option ${displaysInSidebar ? 'active' : ''}`}
                          onClick={() => {
                            if (!isSidebarOnly && !displaysInSidebar) onDisplayInAppToggle(row, true);
                          }}
                          disabled={isDisplayBusy || !onDisplayInAppToggle || placementPolicy.locked}
                          aria-pressed={displaysInSidebar}
                        >
                          Sidebar
                        </button>
                      </div>
                      {placementLabel ? <span className="fc-placement-note">{placementLabel}</span> : null}
                    </div>
                  ) : (
                    <span className="fc-muted-cell">-</span>
                  )}
                </td>
                <td className="fc-status-col" data-label="Status">
                  <div className="fc-status-stack">
                    <button
                      type="button"
                      className={`fc-toggle ${row.is_enabled ? 'on' : 'off'} ${isBusy ? 'busy' : ''}`}
                      onClick={() => onToggle(row, !row.is_enabled)}
                      disabled={isBusy}
                      aria-pressed={row.is_enabled}
                      aria-label={isBusy ? 'Saving status' : row.is_enabled ? 'Disable feature' : 'Enable feature'}
                      title={isBusy ? 'Saving...' : row.is_enabled ? 'Disable feature' : 'Enable feature'}
                    >
                      <span className="fc-toggle-track">
                        <span className="fc-toggle-thumb" />
                      </span>
                    </button>
                    {row.sub_feature_count > 0 && row.is_enabled ? (
                      <button
                        className="fc-btn fc-btn-subscreens fc-btn-action fc-inline-subscreens"
                        type="button"
                        onClick={() => onOpenSubScreens(row)}
                      >
                        Sub Screens
                      </button>
                    ) : null}
                  </div>
                </td>
                <td className="fc-actions-col" data-label="Actions">
                  <div className="fc-actions-cell">
                    <button className="fc-btn fc-btn-edit fc-btn-action" type="button" onClick={() => onEdit(row)}>
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
