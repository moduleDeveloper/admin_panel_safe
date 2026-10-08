import { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import Sidebar from '../../../core/components/Sidebar';
import PageHeader from '../../../core/components/PageHeader';
import { fetchPendingImagesByTrust, updateImageApproval } from '../../../core/services/imagesService';
import './SocialMediaApprovalPage.css';

function formatDateTime(value) {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  }).format(date);
}

export default function SocialMediaApprovalPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'company-details';
  const trustId = trust?.id || null;

  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingRowId, setSavingRowId] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  const loadRows = useCallback(async () => {
    if (!trustId) return;
    try {
      setLoading(true);
      setError('');
      const { data, error: fetchError } = await fetchPendingImagesByTrust(trustId, { limit: 200 });
      if (fetchError) {
        setError(fetchError.message || 'Unable to load pending images.');
        setRows([]);
        return;
      }
      setRows(data || []);
    } catch (err) {
      setError(err?.message || 'Unexpected error while loading pending images.');
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [trustId]);

  useEffect(() => {
    loadRows();
  }, [loadRows]);

  const pendingCountText = useMemo(() => {
    const count = rows.length;
    return `${count} pending image${count === 1 ? '' : 's'}`;
  }, [rows.length]);

  const handleDecision = async (id, status) => {
    if (!id || !status) return;
    setSavingRowId(id);
    setError('');
    setMessage('');

    const { error: updateError } = await updateImageApproval(id, status);
    if (updateError) {
      setError(updateError.message || 'Unable to update image status.');
      setSavingRowId('');
      return;
    }

    setRows((prev) => prev.filter((row) => row.id !== id));
    setMessage(`Image marked as ${status}.`);
    setSavingRowId('');
  };

  return (
    <div className="sma-root">
      <Sidebar
        trustName={trust?.name || 'Trust'}
        onDashboard={() => navigate('/dashboard', { state: { userName, trust, superuserId, sidebarNavKey: 'dashboard' } })}
        onLogout={() => navigate('/login')}
      />

      <main className="sma-main">
        <PageHeader
          title="Image Approval Queue"
          subtitle="Approve or reject pending social media posts"
          onBack={() =>
            navigate('/dashboard', {
              state: { userName, trust, superuserId, sidebarNavKey: currentSidebarNavKey },
            })
          }
          right={(
            <button
              type="button"
              className="sma-refresh-btn"
              onClick={loadRows}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
          )}
        />

        <section className="sma-content">
          {error && <div className="sma-error">{error}</div>}
          {message && <div className="sma-success">{message}</div>}

          <div className="sma-summary">
            <span>{loading ? 'Loading...' : pendingCountText}</span>
          </div>

          {loading ? (
            <div className="sma-empty">Loading pending images...</div>
          ) : rows.length === 0 ? (
            <div className="sma-empty">No pending images for this trust.</div>
          ) : (
            <div className="sma-grid">
              {rows.map((row) => {
                const isSaving = savingRowId === row.id;
                return (
                  <article key={row.id} className="sma-card">
                    <div className="sma-image-wrap">
                      {row.previewUrl ? (
                        <img src={row.previewUrl} alt={row.title || 'Pending social image'} />
                      ) : (
                        <div className="sma-image-empty">No image</div>
                      )}
                    </div>
                    <div className="sma-card-body">
                      <h3>{row.title || 'Untitled'}</h3>
                      <p><strong>Description:</strong> {row.description || 'N/A'}</p>
                      <p><strong>Hashtags:</strong> {row.hashtags || 'N/A'}</p>
                      <p><strong>Created:</strong> {formatDateTime(row.createdAt)}</p>
                    </div>
                    <div className="sma-actions">
                      <button
                        type="button"
                        className="sma-approve-btn"
                        onClick={() => handleDecision(row.id, 'approved')}
                        disabled={isSaving}
                      >
                        {isSaving ? 'Saving...' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        className="sma-reject-btn"
                        onClick={() => handleDecision(row.id, 'rejected')}
                        disabled={isSaving}
                      >
                        {isSaving ? 'Saving...' : 'Reject'}
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
