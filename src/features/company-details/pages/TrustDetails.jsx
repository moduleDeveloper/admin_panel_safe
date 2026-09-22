import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchTrustDetails, updateTrustContent, updateTrustInfo } from '../services/trustService';
import './TrustDetails.css';

function normalizeRichContent(content = '') {
  return String(content || '')
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, '')
    .replace(/<p>\s*<strong>\s*Heading\s*:?\s*<\/strong>\s*/gi, '<p>')
    .replace(/<p>\s*<strong>\s*Description\s*:?\s*<\/strong>\s*/gi, '<p>')
    .replace(/<strong>\s*Heading\s*:?\s*<\/strong>\s*/gi, '')
    .replace(/<strong>\s*Description\s*:?\s*<\/strong>\s*/gi, '')
    .replace(/(^|>|\n)\s*Heading\s*:\s*/gi, '$1')
    .replace(/(^|>|\n)\s*Description\s*:\s*/gi, '$1')
    .trim();
}

function TrustDetails() {
  const navigate = useNavigate();
  const location = useLocation();

  const trustId = location.state?.trustId || location.state?.trust?.id;
  const userName = location.state?.userName || 'Admin';
  const trustFromState = location.state?.trust || null;
  const sidebarNavKey = location.state?.sidebarNavKey || 'dashboard';
  const returnTo = location.state?.returnTo || '/dashboard';
  // State
  const [trust, setTrust] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [saving, setSaving] = useState(false);

  // Edit states
  const [editingField, setEditingField] = useState(null);
  const [editValues, setEditValues] = useState({});

  // Load trust details
  useEffect(() => {
    loadTrustDetails();
  }, [trustId]);

  const loadTrustDetails = useCallback(async () => {
    if (!trustId) {
      setError('No trust selected');
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchTrustDetails(trustId);

    if (err) {
      setError(err.message || 'Failed to load trust details');
    } else {
      setTrust(data);
    }
    setLoading(false);
  }, [trustId]);

  const handleEditClick = (field) => {
    setEditingField(field);
    setEditValues({
      ...editValues,
      [field]: trust?.[field] || '',
    });
  };

  const handleSaveContent = async (field) => {
    setSaving(true);
    setError(null);

    const payload = field === 'terms_content'
      ? { termsContent: editValues.terms_content, privacyContent: trust?.privacy_content }
      : { termsContent: trust?.terms_content, privacyContent: editValues.privacy_content };

    const { data, error: err } = await updateTrustContent(trustId, payload);

    if (err) {
      setError(err.message || 'Failed to save content');
    } else {
      setTrust(data);
      setEditingField(null);
    }
    setSaving(false);
  };

  const handleSaveInfo = async (field) => {
    setSaving(true);
    setError(null);

    const { data, error: err } = await updateTrustInfo(trustId, {
      [field]: editValues[field],
    });

    if (err) {
      setError(err.message || 'Failed to save info');
    } else {
      setTrust(data);
      setEditingField(null);
    }
    setSaving(false);
  };

  const handleCancel = () => {
    setEditingField(null);
    setEditValues({});
  };

  const goBackToDashboard = () => {
    navigate(returnTo, {
      state: {
        userName,
        trust: trustFromState || trust || null,
        sidebarNavKey,
      },
    });
  };

  const renderEditableField = ({
    field,
    label,
    multiline = false,
    rows = 3,
    type = 'text',
    emptyText = 'Not set',
  }) => (
    <div className="info-item">
      <label className="info-label">{label}</label>
      {editingField === field ? (
        <div className="edit-input-group">
          {multiline ? (
            <textarea
              value={editValues[field] || ''}
              onChange={(e) => setEditValues({ ...editValues, [field]: e.target.value })}
              className="edit-input"
              rows={rows}
            />
          ) : (
            <input
              type={type}
              value={editValues[field] || ''}
              onChange={(e) => setEditValues({ ...editValues, [field]: e.target.value })}
              className="edit-input"
            />
          )}
          <div className="edit-actions">
            <button
              onClick={() => handleSaveInfo(field)}
              disabled={saving}
              className="btn btn-primary"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button onClick={handleCancel} className="btn btn-secondary">
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div className="info-content">
          <p className="info-value">{trust?.[field] || emptyText}</p>
          <button onClick={() => handleEditClick(field)} className="btn-edit">
            Edit
          </button>
        </div>
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="trust-details-container">
        <div className="loading">Loading trust details...</div>
      </div>
    );
  }

  if (!trust) {
    return (
      <div className="trust-details-container">
        <div className="error">{error || 'Trust not found'}</div>
        <button onClick={goBackToDashboard} className="back-btn">Back to Dashboard</button>
      </div>
    );
  }

  return (
    <div className="trust-details-wrapper">
      {/* Header */}
      <div className="trust-details-header">
        <div className="trust-details-hero-left">
          <button onClick={goBackToDashboard} className="back-btn">
            &larr; Back
          </button>
          <div className="trust-details-title-group">
            <h1 className="page-title">Trust Details</h1>
            <p className="page-subtitle">View and manage your trust information</p>
          </div>
        </div>
      </div>

      <div className="trust-details-container">
        {error && <div className="alert alert-error">{error}</div>}

        {/* Trust Banner */}
        <div className="trust-banner">
          {trust.icon_url && (
            <img src={trust.icon_url} alt={trust.name} className="trust-banner-icon" />
          )}
          <div className="trust-banner-info">
            <h2 className="trust-banner-name">{trust.name}</h2>
            <p className="trust-banner-remark">{trust.remark}</p>
          </div>
        </div>

        {/* Trust Info Section */}
        <div className="info-section">
          <div className="info-row">
            {renderEditableField({ field: 'name', label: 'APP NAME', emptyText: '-' })}
            {renderEditableField({ field: 'legal_name', label: 'LEGAL NAME' })}
          </div>

          <div className="info-row">
            {renderEditableField({ field: 'remark', label: 'SUBHEADING / REMARK', multiline: true })}
            {renderEditableField({ field: 'website', label: 'WEBSITE', type: 'url' })}
          </div>

          <div className="info-row">
            {renderEditableField({ field: 'email_id', label: 'EMAIL ID', type: 'email' })}
            {renderEditableField({ field: 'gst_number', label: 'GST NUMBER' })}
          </div>

          <div className="info-row">
            {renderEditableField({ field: 'pan_number', label: 'PAN NUMBER' })}
            {renderEditableField({ field: 'remark1', label: 'REMARK 1', multiline: true })}
          </div>

          <div className="info-row">
            {renderEditableField({ field: 'remark2', label: 'REMARK 2', multiline: true })}
            {renderEditableField({ field: 'remark3', label: 'REMARK 3', multiline: true })}
          </div>
        </div>

        {/* Terms & Conditions Section */}
        <div className="content-section">
          <div className="content-item">
            <div className="content-header">
              <h3 className="content-title">Terms & Conditions</h3>
              {editingField === 'terms_content' ? (
                <div className="edit-actions">
                  <button
                    onClick={() => handleSaveContent('terms_content')}
                    disabled={saving}
                    className="btn btn-sm btn-primary"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={handleCancel} className="btn btn-sm btn-secondary">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleEditClick('terms_content')}
                  className="btn-edit-header"
                >
                  Edit
                </button>
              )}
            </div>

            {editingField === 'terms_content' ? (
              <textarea
                value={editValues.terms_content || ''}
                onChange={(e) => setEditValues({ ...editValues, terms_content: e.target.value })}
                className="edit-textarea"
                rows="8"
                placeholder="Enter Terms & Conditions content..."
              />
            ) : (
              <div className="content-display">
                {trust.terms_content ? (
                  <div
                    className="content-rich-text"
                    dangerouslySetInnerHTML={{ __html: normalizeRichContent(trust.terms_content) }}
                  />
                ) : (
                  <p className="text-not-set">Not set</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Privacy Policy Section */}
        <div className="content-section">
          <div className="content-item">
            <div className="content-header">
              <h3 className="content-title">Privacy Policy</h3>
              {editingField === 'privacy_content' ? (
                <div className="edit-actions">
                  <button
                    onClick={() => handleSaveContent('privacy_content')}
                    disabled={saving}
                    className="btn btn-sm btn-primary"
                  >
                    {saving ? 'Saving...' : 'Save'}
                  </button>
                  <button onClick={handleCancel} className="btn btn-sm btn-secondary">
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => handleEditClick('privacy_content')}
                  className="btn-edit-header"
                >
                  Edit
                </button>
              )}
            </div>

            {editingField === 'privacy_content' ? (
              <textarea
                value={editValues.privacy_content || ''}
                onChange={(e) =>
                  setEditValues({ ...editValues, privacy_content: e.target.value })
                }
                className="edit-textarea"
                rows="8"
                placeholder="Enter Privacy Policy content..."
              />
            ) : (
              <div className="content-display">
                {trust.privacy_content ? (
                  <div
                    className="content-rich-text"
                    dangerouslySetInnerHTML={{ __html: normalizeRichContent(trust.privacy_content) }}
                  />
                ) : (
                  <p className="text-not-set">Not set</p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default TrustDetails;


