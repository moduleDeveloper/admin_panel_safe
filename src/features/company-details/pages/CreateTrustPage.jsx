import { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './CreateTrustPage.css';
import { createTrust } from '../services/trustService';

export default function CreateTrustPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { superuserId = null, userName = 'User' } = location.state || {};

  const [formData, setFormData] = useState({
    name: '',
    legalName: '',
    iconUrl: '',
    remark: '',
  });

  const [errors, setErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [generalError, setGeneralError] = useState('');

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value,
    }));
    if (errors[name]) {
      setErrors(prev => ({
        ...prev,
        [name]: '',
      }));
    }
  };

  const validateForm = () => {
    const newErrors = {};
    if (!formData.name.trim()) {
      newErrors.name = 'Trust name is required';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateForm()) return;
    if (!superuserId) {
      setGeneralError('User ID not found. Please login again.');
      return;
    }

    setSaving(true);
    setGeneralError('');

    const { data, error } = await createTrust(superuserId, {
      name: formData.name,
      legalName: formData.legalName,
      iconUrl: formData.iconUrl,
      remark: formData.remark,
    });

    if (error) {
      setGeneralError(error.message || 'Failed to create trust. Please try again.');
      setSaving(false);
      return;
    }

    if (data) {
      // Navigate to dashboard with the newly created trust
      navigate('/dashboard', {
        state: {
          superuserId,
          userName,
          trust: data,
        },
      });
    }
  };

  return (
    <div className="ct-root">
      <div className="ct-left">
        <div className="ct-left-inner">
          <div className="ct-brand">
            <div className="ct-logo">
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <path d="M16 2L29 9V23L16 30L3 23V9L16 2Z" fill="url(#ctG1)"/>
                <path d="M16 8L12 18H20L16 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                <defs>
                  <linearGradient id="ctG1" x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#818CF8"/><stop offset="1" stopColor="#C4B5FD"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="ct-logo-text">AdminX</span>
          </div>
          <h1 className="ct-left-title">Create your<br/>trust app 🏗️</h1>
          <p className="ct-left-sub">Set up your trust's name and basic details to get started.</p>
          <div className="ct-left-steps">
            {['Enter trust details', 'Configure settings', 'Start managing'].map((s, i) => (
              <div className="ct-step" key={i}>
                <div className="ct-step-num">{i + 1}</div>
                <span>{s}</span>
              </div>
            ))}
          </div>
        </div>
        <div className="ct-deco-1"/><div className="ct-deco-2"/>
      </div>

      <div className="ct-right">
        <div className="ct-form-wrap">
          <div className="ct-user-chip">
            <div className="ct-chip-avatar">{userName.charAt(0).toUpperCase()}</div>
            <span className="ct-chip-label">Creating as {userName}</span>
          </div>

          <div className="ct-form-header">
            <h2 className="ct-form-title">Create Your Trust</h2>
            <p className="ct-form-sub">Fill in the basic information about your trust.</p>
          </div>

          {generalError && (
            <div className="ct-alert ct-alert-error">
              {generalError}
            </div>
          )}

          <form onSubmit={handleSubmit} className="ct-form">
            {/* Trust Name - Required */}
            <div className="ct-field">
              <label className="ct-label">
                Trust Name <span className="ct-required">*</span>
              </label>
              <input
                type="text"
                name="name"
                className={`ct-input ${errors.name ? 'has-error' : ''}`}
                placeholder="e.g. Sunrise Healthcare"
                value={formData.name}
                onChange={handleChange}
                autoFocus
                autoComplete="off"
              />
              {errors.name && <p className="ct-field-error">{errors.name}</p>}
            </div>

            {/* Legal Name - Optional */}
            <div className="ct-field">
              <label className="ct-label">Legal Name (Optional)</label>
              <input
                type="text"
                name="legalName"
                className="ct-input"
                placeholder="e.g. Sunrise Healthcare Trust Foundation"
                value={formData.legalName}
                onChange={handleChange}
                autoComplete="off"
              />
            </div>

            {/* Icon URL - Optional */}
            <div className="ct-field">
              <label className="ct-label">Icon/Logo URL (Optional)</label>
              <input
                type="text"
                name="iconUrl"
                className="ct-input"
                placeholder="e.g. https://example.com/logo.png or emoji like 🏥"
                value={formData.iconUrl}
                onChange={handleChange}
                autoComplete="off"
              />
              <p className="ct-field-hint">You can use emoji, URL, or SVG markup</p>
            </div>

            {/* Remark - Optional */}
            <div className="ct-field">
              <label className="ct-label">Description (Optional)</label>
              <textarea
                name="remark"
                className="ct-input ct-textarea"
                placeholder="e.g. A non-profit organization focused on healthcare..."
                value={formData.remark}
                onChange={handleChange}
                rows="3"
              />
            </div>

            <button
              type="submit"
              className={`ct-btn ${saving ? 'loading' : ''}`}
              disabled={saving}
            >
              {saving ? (
                <span className="ct-btn-inner">
                  <span className="ct-spinner"/>
                  Creating Trust...
                </span>
              ) : (
                <span className="ct-btn-inner">
                  Create Trust
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              )}
            </button>
          </form>

          <button className="ct-back-btn" onClick={() => navigate(-1)}>
            ← Back
          </button>
        </div>
      </div>
    </div>
  );
}
