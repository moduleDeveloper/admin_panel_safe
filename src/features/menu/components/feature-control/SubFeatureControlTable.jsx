function resolveIconSource(raw = '') {
  const value = String(raw || '').trim();
  if (!value) return '';

  if (/^https?:\/\//i.test(value) || /^data:image\//i.test(value)) return value;

  if (value.startsWith('/')) {
    const base = import.meta.env.BASE_URL || '/';
    const normalizedBase = base.endsWith('/') ? base.slice(0, -1) : base;
    return `${normalizedBase}${value}`;
  }

  const base = import.meta.env.BASE_URL || '/';
  return `${base}${value.replace(/^\/+/, '')}`;
}

function IconCell({ iconUrl, subFeatureName }) {
  const raw = String(iconUrl || '').trim();

  if (!raw) {
    return <span className="fc-icon-fallback">{String(subFeatureName || '?').slice(0, 1).toUpperCase()}</span>;
  }

  if (raw.includes('<svg')) {
    return <span className="fc-icon-raw-svg" dangerouslySetInnerHTML={{ __html: raw }} />;
  }

  const maybeEmoji = !/^https?:\/\//i.test(raw) && !raw.startsWith('/') && !/^data:image\//i.test(raw) && raw.length <= 8;
  if (maybeEmoji) return <span className="fc-icon-emoji">{raw}</span>;

  const src = resolveIconSource(raw);
  return (
    <img
      src={src}
      alt={subFeatureName || 'Sub feature icon'}
      className="fc-icon-img"
      onError={(event) => {
        event.currentTarget.style.display = 'none';
        const parent = event.currentTarget.parentElement;
        if (parent) {
          parent.innerHTML = `<span class="fc-icon-fallback">${String(subFeatureName || '?').slice(0, 1).toUpperCase()}</span>`;
        }
      }}
    />
  );
}

export default function SubFeatureControlTable({
  rows,
  loading,
  togglingMap,
  onToggle,
  onEdit,
}) {
  if (loading) {
    return (
      <div className="fc-state fc-loading">
        <div className="fc-spinner" />
        <p>Loading sub features...</p>
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="fc-state fc-empty">
        <div className="fc-empty-icon">SF</div>
        <h3>No sub features found</h3>
        <p>Select another main feature or try different filters.</p>
      </div>
    );
  }

  return (
    <div className="fc-table-wrap fc-table-wrap-subfeatures">
      <table className="fc-table">
        <thead>
          <tr>
            <th>Icon</th>
            <th>Sub Feature</th>
            <th>Display Name</th>
            <th>Tagline</th>
            <th>Route</th>
            <th>Tier</th>
            <th>Quick Order</th>
            <th>Status</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const isBusy = !!togglingMap[row.sub_feature_id];

            return (
              <tr key={`${row.sub_feature_id}-${row.tier}`}>
                <td data-label="Icon">
                  <div className="fc-icon-cell">
                    <div className="fc-icon-preview">
                      <IconCell iconUrl={row.icon_url} subFeatureName={row.master_name} />
                    </div>
                  </div>
                </td>
                <td data-label="Sub Feature">
                  <div className="fc-feature-name">{row.master_name}</div>
                  {row.master_subname ? <div className="fc-feature-sub">{row.master_subname}</div> : null}
                </td>
                <td data-label="Display Name">{row.display_name || '-'}</td>
                <td data-label="Tagline">{row.tagline || '-'}</td>
                <td data-label="Route">{row.route || '-'}</td>
                <td data-label="Tier">
                  <span className="fc-pill">{row.tier}</span>
                </td>
                <td data-label="Quick Order">{row.quick_order ?? '-'}</td>
                <td data-label="Status">
                  <button
                    type="button"
                    className={`fc-toggle ${row.is_enabled ? 'on' : 'off'} ${isBusy ? 'busy' : ''}`}
                    onClick={() => onToggle(row, !row.is_enabled)}
                    disabled={isBusy}
                    aria-pressed={row.is_enabled}
                    aria-label={isBusy ? 'Saving status' : row.is_enabled ? 'Disable sub feature' : 'Enable sub feature'}
                    title={isBusy ? 'Saving...' : row.is_enabled ? 'Disable sub feature' : 'Enable sub feature'}
                  >
                    <span className="fc-toggle-track">
                      <span className="fc-toggle-thumb" />
                    </span>
                  </button>
                </td>
                <td data-label="Actions">
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
