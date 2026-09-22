import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { fetchTrustDetails, updateTrustDetails } from '../../auth/services/authService';
import { uploadTrustIcon } from '../services/trustService';
import Sidebar from '../../../core/components/Sidebar';
import { getAllowedImageFormatsMessage, prepareImageFileForUpload } from '../../../core/utils/imageUpload';
import './TrusteesPage.css';

// ── Helpers ──────────────────────────────────────────────────────────────────
const initials = (name = '') =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || 'T';

function normalizeSearchText(value = '') {
  return String(value || '').toLowerCase();
}

function stripHtmlTags(value = '') {
  return String(value || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

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

// ── Collapsible rich-text section ────────────────────────────────────────────
function ContentSection({
  title,
  content,
  icon,
  accentColor = '#6366F1',
  isEditing = false,
  draftValue = '',
  onDraftChange,
  onEdit,
  onCancel,
  onSave,
  saving = false,
  error = '',
}) {
  const [expanded, setExpanded] = useState(false);
  const hasContent = content && content.trim().length > 0;

  useEffect(() => {
    if (isEditing) setExpanded(true);
  }, [isEditing]);

  useEffect(() => {
    if (!isEditing && !hasContent) setExpanded(false);
  }, [isEditing, hasContent]);

  return (
    <div className={`tp-content-section ${expanded ? 'expanded' : ''}`}>
      <div className="tp-section-header">
        <button
          className="tp-section-toggle"
          onClick={() => setExpanded(p => !p)}
          style={{ '--accent': accentColor }}
          disabled={!hasContent && !isEditing}
          title={
            hasContent
              ? (expanded ? 'Collapse' : 'Expand')
              : (isEditing ? 'Editing' : 'No content added yet')
          }
          type="button"
        >
          <div
            className="tp-section-icon"
            style={{ background: accentColor + '18', color: accentColor }}
          >
            {icon}
          </div>
          <span className="tp-section-title">{title}</span>
          {hasContent && (
            <span
              className="tp-section-badge"
              style={{
                background: accentColor + '20',
                color: accentColor,
              }}
            >
              Available
            </span>
          )}
          {hasContent && (
            <svg
              className={`tp-chevron ${expanded ? 'open' : ''}`}
              width="18" height="18" viewBox="0 0 24 24" fill="none"
            >
              <path d="M6 9l6 6 6-6" stroke={accentColor} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          )}
        </button>

        <div className="tp-section-actions">
          {isEditing ? (
            <>
              <button className="tp-edit-btn ghost" type="button" onClick={onCancel}>
                Cancel
              </button>
              <button
                className="tp-edit-btn primary"
                type="button"
                onClick={onSave}
                disabled={saving}
              >
                {saving ? 'Saving...' : 'Save'}
              </button>
            </>
          ) : (
            <button className="tp-edit-btn" type="button" onClick={onEdit}>
              Edit
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div className="tp-section-body">
          {isEditing ? (
            <>
              <textarea
                className="tp-content-input"
                rows={8}
                value={draftValue}
                onChange={(e) => onDraftChange?.(e.target.value)}
                placeholder={`Enter ${title}...`}
              />
              {error && <div className="tp-save-error">{error}</div>}
            </>
          ) : (
            hasContent ? (
              <div className="tp-rich-content">
                <div
                  className="tp-rich-text"
                  dangerouslySetInnerHTML={{ __html: normalizeRichContent(content) }}
                />
              </div>
            ) : null
          )}
        </div>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
export default function TrusteesPage() {
  const navigate = useNavigate();
  const location = useLocation();

  const { userName = 'Admin', trust: trustFromState = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'dashboard';
  const fallbackTrustId =
    typeof window !== 'undefined' ? window.sessionStorage.getItem('admin:activeTrustId') : null;
  const searchParams = new URLSearchParams(location.search || '');
  const viewFromQuery = searchParams.get('view');
  const trustId = location.state?.trustId || trustFromState?.id || fallbackTrustId || null;
  const derivedTrusteesView = (
    location.state?.trusteesView
    || (viewFromQuery === 'logo' || viewFromQuery === 'default' ? viewFromQuery : '')
    || (location.state?.dashboardCardId === 'card-logo' ? 'logo' : '')
    || 'default'
  );
  const isLogoCardView = derivedTrusteesView === 'logo';

  // Redirect safety
  useEffect(() => {
    if (!trustId) navigate('/dashboard', { replace: true });
  }, [trustId, navigate]);

  if (!trustId) return null;

  const [searchFocused, setSearchFocused] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [trust,         setTrust]         = useState(null);
  const [loading,       setLoading]       = useState(true);
  const [error,         setError]         = useState(null);
  const [editMode,      setEditMode]      = useState({
    name: false,
    legal: false,
    remark: false,
    logo: false,
    gst: false,
    pan: false,
    website: false,
    email: false,
    remark1: false,
    remark2: false,
    remark3: false,
  });
  const [draft,         setDraft]         = useState({
    name: '',
    legal_name: '',
    remark: '',
    icon_url: '',
    gst_number: '',
    pan_number: '',
    website: '',
    email_id: '',
    remark1: '',
    remark2: '',
    remark3: '',
  });
  const [savingField,   setSavingField]   = useState('');
  const [saveError,     setSaveError]     = useState('');
  const [dragOver,      setDragOver]      = useState(false);
  const [logoFile,      setLogoFile]      = useState(null);
  const [editingContent, setEditingContent] = useState(null);
  const [contentDraft,   setContentDraft]   = useState({ terms_content: '', privacy_content: '' });
  const [contentSaving,  setContentSaving]  = useState(false);
  const [contentError,   setContentError]   = useState('');
  const logoPreviewObjectUrlRef = useRef('');


  // ── Fetch full trust details ─────────────────────────────────────────────
  const loadTrust = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchTrustDetails(trustId);
    if (err) {
      setError(err.message || 'Unable to load trust details.');
      setTrust(null);
    } else {
      setTrust(data || null);
    }
    setLoading(false);
  }, [trustId]);

  useEffect(() => { loadTrust(); }, [loadTrust]);

  const trustName = trust?.name || trustFromState?.name || 'Trust';
  const userInitials = initials(userName);
  const searchQuery = searchTerm.trim().toLowerCase();
  const hasSearchQuery = searchQuery.length > 0;
  const matchesQuery = (...values) => {
    if (!hasSearchQuery) return true;
    return values.some((value) => normalizeSearchText(value).includes(searchQuery));
  };

  const showLogoNameCard = isLogoCardView && matchesQuery('app name', 'trust name', trust?.name);
  const showLogoRemarkCard = isLogoCardView && matchesQuery('subheading', 'remark', trust?.remark);
  const showLogoIconCard = isLogoCardView && matchesQuery('logo', 'icon', 'image', trust?.icon_url);
  const showLegalCard = !isLogoCardView && matchesQuery('legal name', 'company', trust?.legal_name);
  const showGstCard = !isLogoCardView && matchesQuery('gst', 'gst number', trust?.gst_number);
  const showPanCard = !isLogoCardView && matchesQuery('pan', 'pan number', trust?.pan_number);
  const showWebsiteCard = !isLogoCardView && matchesQuery('website', 'web', trust?.website);
  const showEmailCard = !isLogoCardView && matchesQuery('email', 'email id', trust?.email_id);
  const showRemark1Card = !isLogoCardView && matchesQuery('remark 1', 'business remark', trust?.remark1);
  const showRemark2Card = !isLogoCardView && matchesQuery('remark 2', 'business remark', trust?.remark2);
  const showRemark3Card = !isLogoCardView && matchesQuery('remark 3', 'business remark', trust?.remark3);
  const showTermsSection = !isLogoCardView && matchesQuery('terms', 'conditions', stripHtmlTags(trust?.terms_content));
  const showPrivacySection = !isLogoCardView && matchesQuery('privacy', 'policy', stripHtmlTags(trust?.privacy_content));
  const hasSearchResults = isLogoCardView
    ? (showLogoNameCard || showLogoRemarkCard || showLogoIconCard)
    : (
      showLegalCard ||
      showGstCard ||
      showPanCard ||
      showWebsiteCard ||
      showEmailCard ||
      showRemark1Card ||
      showRemark2Card ||
      showRemark3Card ||
      showTermsSection ||
      showPrivacySection
    );

  const startEdit = (field) => {
    setSaveError('');
    if (field === 'logo') setLogoFile(null);
    setEditMode({
      name: false,
      legal: false,
      remark: false,
      logo: false,
      gst: false,
      pan: false,
      website: false,
      email: false,
      remark1: false,
      remark2: false,
      remark3: false,
      [field]: true,
    });
    setDraft({
      name: trust?.name || '',
      legal_name: trust?.legal_name || '',
      remark: trust?.remark || '',
      icon_url: trust?.icon_url || '',
      gst_number: trust?.gst_number || '',
      pan_number: trust?.pan_number || '',
      website: trust?.website || '',
      email_id: trust?.email_id || '',
      remark1: trust?.remark1 || '',
      remark2: trust?.remark2 || '',
      remark3: trust?.remark3 || '',
    });
  };

  const cancelEdit = () => {
    if (logoPreviewObjectUrlRef.current) {
      URL.revokeObjectURL(logoPreviewObjectUrlRef.current);
      logoPreviewObjectUrlRef.current = '';
    }
    setEditMode({
      name: false,
      legal: false,
      remark: false,
      logo: false,
      gst: false,
      pan: false,
      website: false,
      email: false,
      remark1: false,
      remark2: false,
      remark3: false,
    });
    setSaveError('');
    setDragOver(false);
    setLogoFile(null);
  };

  const handleLogoFile = async (file) => {
    if (!file) return;
    const prepared = await prepareImageFileForUpload(file);
    if (prepared.error || !prepared.file) {
      setSaveError(prepared.error?.message || getAllowedImageFormatsMessage());
      return;
    }
    if (logoPreviewObjectUrlRef.current) URL.revokeObjectURL(logoPreviewObjectUrlRef.current);
    const previewUrl = URL.createObjectURL(prepared.file);
    logoPreviewObjectUrlRef.current = previewUrl;
    setDraft(prev => ({ ...prev, icon_url: previewUrl }));
    setLogoFile(prepared.file);
    setSaveError(prepared.warning || '');
  };

  useEffect(() => {
    return () => {
      if (logoPreviewObjectUrlRef.current) {
        URL.revokeObjectURL(logoPreviewObjectUrlRef.current);
      }
    };
  }, []);

  const saveField = async (field) => {
    if (!trustId) return;
    setSavingField(field);
    setSaveError('');

    const updates = {};
    if (field === 'name') updates.name = draft.name.trim();
    if (field === 'legal') updates.legal_name = draft.legal_name.trim();
    if (field === 'remark') updates.remark = draft.remark.trim();
    if (field === 'gst') updates.gst_number = draft.gst_number.trim();
    if (field === 'pan') updates.pan_number = draft.pan_number.trim();
    if (field === 'website') updates.website = draft.website.trim();
    if (field === 'email') updates.email_id = draft.email_id.trim();
    if (field === 'remark1') updates.remark1 = draft.remark1.trim();
    if (field === 'remark2') updates.remark2 = draft.remark2.trim();
    if (field === 'remark3') updates.remark3 = draft.remark3.trim();
    if (field === 'logo') {
      if (logoFile) {
        const { data: uploadData, error: uploadError } = await uploadTrustIcon(logoFile, { ownerId: trustId });
        if (uploadError) {
          setSaveError(uploadError.message || 'Unable to upload trust icon.');
          setSavingField('');
          return;
        }
        if (uploadData?.warning) setSaveError(uploadData.warning);
        updates.icon_url = uploadData?.publicUrl || '';
      } else {
        updates.icon_url = draft.icon_url || '';
      }
    }

    const { data, error: err } = await updateTrustDetails(trustId, updates);
    if (err) {
      setSaveError(err.message || 'Unable to save changes.');
    } else {
      setTrust(data || null);
      cancelEdit();
    }
    setSavingField('');
  };

  const startContentEdit = (field) => {
    setContentError('');
    setEditingContent(field);
    setContentDraft(prev => ({
      ...prev,
      [field]: trust?.[field] || '',
    }));
  };

  const cancelContentEdit = () => {
    setEditingContent(null);
    setContentError('');
  };

  const saveContent = async (field) => {
    if (!trustId) return;
    setContentSaving(true);
    setContentError('');

    const updates = {
      [field]: contentDraft[field] || '',
    };

    const { data, error: err } = await updateTrustDetails(trustId, updates);
    if (err) {
      setContentError(err.message || 'Unable to save content.');
    } else {
      setTrust(data || null);
      setEditingContent(null);
    }
    setContentSaving(false);
  };

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="tp-root">
      <Sidebar
        trustName={trustName}
        onDashboard={() => navigate('/dashboard', { state: { userName, trust: trust || trustFromState, sidebarNavKey: currentSidebarNavKey } })}
        onLogout={() => navigate('/login')}
      />

      {/* ═════════════ MAIN ═════════════ */}
      <main className="dash-main">

        {/* Topbar */}
        <header className="dash-topbar">
          <div className="tp-topbar-left">
            <button
              className="tp-back-btn"
              onClick={() => navigate('/dashboard', { state: { userName, trust: trust || trustFromState, sidebarNavKey: currentSidebarNavKey } })}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M19 12H5M12 5l-7 7 7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Back
            </button>
            <div className="tp-topbar-titles">
              <h1 className="tp-page-title">Trust Details</h1>
              <p className="tp-page-subtitle">View and manage your trust information</p>
            </div>
          </div>

          <div className="tp-topbar-right">
            <div className={`tp-search-box ${searchFocused ? 'focused' : ''}`}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none">
                <circle cx="7" cy="7" r="5" stroke="currentColor" strokeWidth="1.6"/>
                <path d="M11 11l2.5 2.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round"/>
              </svg>
              <input
                type="text"
                placeholder="Search..."
                className="tp-search-input"
                id="tp-search"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
              />
            </div>
            <div className="tp-avatar-wrap">
              <div className="tp-avatar-btn">{userInitials}</div>
              <div className="tp-avatar-online"/>
            </div>
          </div>
        </header>

        {/* ─── Content ─── */}
        <div className="dash-content">

          {/* ── Loading ── */}
          {loading && (
            <div className="tp-full-skeleton">
              <div className="tp-skel-hero"/>
              <div className="tp-skel-row">
                <div className="tp-skel-card"/>
                <div className="tp-skel-card"/>
              </div>
              <div className="tp-skel-section"/>
              <div className="tp-skel-section"/>
            </div>
          )}

          {/* ── Error ── */}
          {!loading && error && (
            <div className="tp-error">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span>{error}</span>
              <button onClick={loadTrust}>Retry</button>
            </div>
          )}

          {/* ── Trust Details ── */}
          {!loading && !error && trust && (
            <>
              {/* ── HERO CARD ── */}
              <div className="tp-hero-card">
                {/* Background orbs */}
                <div className="tp-hero-orb tp-hero-orb-1"/>
                <div className="tp-hero-orb tp-hero-orb-2"/>

                {/* Logo / Icon */}
                <div className="tp-hero-left">
                  <div className="tp-logo-wrap">
                    {trust.icon_url ? (
                      <img
                        src={trust.icon_url}
                        alt={trust.name}
                        className="tp-logo-img"
                        onError={e => { e.target.onerror = null; e.target.style.display = 'none'; }}
                      />
                    ) : (
                      <span className="tp-logo-initials">{initials(trust.name)}</span>
                    )}
                  </div>

                  <div className="tp-hero-info">
                    <h2 className="tp-hero-name">{trust.name}</h2>
                    {trust.remark && (
                      <p className="tp-hero-remark">{trust.remark}</p>
                    )}
                  </div>
                </div>

              </div>

              {/* ── INFO GRID ── */}
              <div className="tp-info-grid">
                {isLogoCardView && (
                <section className="tp-info-group">
                  <div className="tp-info-group-head">
                    <h3>App Design</h3>
                    <p>App name, subheading and logo/icon settings</p>
                  </div>
                  <div className="tp-info-group-cards">
                    {/* App Name */}
                    {showLogoNameCard && (
                    <div className="tp-info-card tp-info-card-remark">
                  <div className="tp-info-icon" style={{ background: '#EEF2FF', color: '#6366F1' }}>
                    <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
                      <path d="M16 2L29 9V23L16 30L3 23V9L16 2Z" stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round"/>
                      <path d="M16 9L13 17H19L16 23" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="tp-info-body">
                    <span className="tp-info-label">App Name</span>
                    {!editMode.name ? (
                      <span className="tp-info-value">{trust.name || '—'}</span>
                    ) : (
                      <input
                        className="tp-edit-input"
                        value={draft.name}
                        onChange={e => setDraft(p => ({ ...p, name: e.target.value }))}
                        placeholder="Enter app name"
                      />
                    )}
                  </div>
                  <div className="tp-info-actions">
                    {!editMode.name ? (
                      <button className="tp-edit-btn" onClick={() => startEdit('name')}>Edit</button>
                    ) : (
                      <div className="tp-edit-actions">
                        <button className="tp-edit-btn ghost" onClick={cancelEdit}>Cancel</button>
                        <button
                          className="tp-edit-btn primary"
                          onClick={() => saveField('name')}
                          disabled={savingField === 'name'}
                        >
                          {savingField === 'name' ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>
                    </div>
                    )}

                    {/* Subheading / Remark */}
                    {showLogoRemarkCard && (
                    <div className="tp-info-card">
                  <div className="tp-info-icon" style={{ background: '#ECFDF5', color: '#059669' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <line x1="17" y1="10" x2="3" y2="10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      <line x1="21" y1="6" x2="3" y2="6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      <line x1="21" y1="14" x2="3" y2="14" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                      <line x1="17" y1="18" x2="3" y2="18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  </div>
                  <div className="tp-info-body">
                    <span className="tp-info-label">Subheading / Remark</span>
                    {!editMode.remark ? (
                      <span className="tp-info-value tp-remark-value">{trust.remark || '—'}</span>
                    ) : (
                      <textarea
                        className="tp-edit-textarea"
                        rows={2}
                        value={draft.remark}
                        onChange={e => setDraft(p => ({ ...p, remark: e.target.value }))}
                        placeholder="Enter remark"
                      />
                    )}
                  </div>
                  <div className="tp-info-actions">
                    {!editMode.remark ? (
                      <button className="tp-edit-btn" onClick={() => startEdit('remark')}>Edit</button>
                    ) : (
                      <div className="tp-edit-actions">
                        <button className="tp-edit-btn ghost" onClick={cancelEdit}>Cancel</button>
                        <button
                          className="tp-edit-btn primary"
                          onClick={() => saveField('remark')}
                          disabled={savingField === 'remark'}
                        >
                          {savingField === 'remark' ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>
                    </div>
                    )}

                    {/* Icon */}
                    {showLogoIconCard && (
                    <div className="tp-info-card">
                  <div className="tp-info-icon" style={{ background: '#FFF7ED', color: '#EA580C' }}>
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                      <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8"/>
                      <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
                      <polyline points="21 15 16 10 5 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </div>
                  <div className="tp-info-body">
                    <span className="tp-info-label">Logo / Icon</span>
                    {!editMode.logo ? (
                      <div className="tp-logo-preview">
                        {trust.icon_url ? (
                          <img
                            src={trust.icon_url}
                            alt="Trust Logo"
                            className="tp-logo-preview-img"
                            onError={e => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <span className="tp-logo-fallback">{initials(trust.name)}</span>
                        )}
                      </div>
                    ) : (
                      <div className="tp-logo-edit">
                        <label
                          className={`tp-logo-drop ${dragOver ? 'drag' : ''}`}
                          onDragOver={e => { e.preventDefault(); setDragOver(true); }}
                          onDragLeave={() => setDragOver(false)}
                          onDrop={e => { e.preventDefault(); setDragOver(false); handleLogoFile(e.dataTransfer.files[0]); }}
                        >
                          <input
                            className="tp-logo-input"
                            type="file"
                            accept="image/*"
                            onChange={e => handleLogoFile(e.target.files?.[0])}
                          />
                          <div className="tp-logo-drop-inner">
                            <span>Drag & drop logo here</span>
                            <span className="tp-logo-drop-sub">or click to upload</span>
                          </div>
                        </label>
                        {draft.icon_url && (
                          <div className="tp-logo-preview sm">
                            <img src={draft.icon_url} alt="Preview" className="tp-logo-preview-img" />
                            <button
                              type="button"
                              className="tp-logo-clear"
                              onClick={() => {
                                setDraft(p => ({ ...p, icon_url: '' }));
                                setLogoFile(null);
                              }}
                            >
                              Remove
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                  <div className="tp-info-actions">
                    {!editMode.logo ? (
                      <button className="tp-edit-btn" onClick={() => startEdit('logo')}>Edit</button>
                    ) : (
                      <div className="tp-edit-actions">
                        <button className="tp-edit-btn ghost" onClick={cancelEdit}>Cancel</button>
                        <button
                          className="tp-edit-btn primary"
                          onClick={() => saveField('logo')}
                          disabled={savingField === 'logo'}
                        >
                          {savingField === 'logo' ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    )}
                  </div>
                    </div>
                    )}
                  </div>
                </section>
                )}
                {!isLogoCardView && (
                <section className="tp-info-group">
                  <div className="tp-info-group-head">
                    <h3>Company Details</h3>
                    <p>Manage legal and business related details</p>
                  </div>
                  <div className="tp-info-group-cards">
                    {/* Legal Name */}
                    {showLegalCard && (
                    <div className="tp-info-card tp-info-card-legal">
                      <div className="tp-info-icon" style={{ background: '#FDF4FF', color: '#9333EA' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                          <line x1="8" y1="17" x2="14" y2="17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="tp-info-body">
                        <span className="tp-info-label">Legal Name</span>
                        {!editMode.legal ? (
                          <span className="tp-info-value tp-legal-value">{trust.legal_name || '—'}</span>
                        ) : (
                          <input
                            className="tp-edit-input"
                            value={draft.legal_name}
                            onChange={e => setDraft(p => ({ ...p, legal_name: e.target.value }))}
                            placeholder="Enter legal name"
                          />
                        )}
                      </div>
                      <div className="tp-info-actions">
                        {!editMode.legal ? (
                          <button className="tp-edit-btn" onClick={() => startEdit('legal')}>Edit</button>
                        ) : (
                          <div className="tp-edit-actions">
                            <button className="tp-edit-btn ghost" onClick={cancelEdit}>Cancel</button>
                            <button
                              className="tp-edit-btn primary"
                              onClick={() => saveField('legal')}
                              disabled={savingField === 'legal'}
                            >
                              {savingField === 'legal' ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    )}

                    {showGstCard && (
                    <div className="tp-info-card">
                      <div className="tp-info-icon" style={{ background: '#EEF2FF', color: '#4F46E5' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <rect x="3.5" y="4" width="17" height="16" rx="2.2" stroke="currentColor" strokeWidth="1.8"/>
                          <path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="tp-info-body">
                        <span className="tp-info-label">GST Number</span>
                        {!editMode.gst ? (
                          <span className="tp-info-value">{trust.gst_number || '—'}</span>
                        ) : (
                          <input
                            className="tp-edit-input"
                            value={draft.gst_number}
                            onChange={e => setDraft(p => ({ ...p, gst_number: e.target.value }))}
                            placeholder="Enter GST number"
                          />
                        )}
                      </div>
                      <div className="tp-info-actions">
                        {!editMode.gst ? (
                          <button className="tp-edit-btn" onClick={() => startEdit('gst')}>Edit</button>
                        ) : (
                          <div className="tp-edit-actions">
                            <button className="tp-edit-btn ghost" onClick={cancelEdit}>Cancel</button>
                            <button className="tp-edit-btn primary" onClick={() => saveField('gst')} disabled={savingField === 'gst'}>
                              {savingField === 'gst' ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    )}

                    {showPanCard && (
                    <div className="tp-info-card">
                      <div className="tp-info-icon" style={{ background: '#ECFDF5', color: '#059669' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <rect x="3.5" y="4" width="17" height="16" rx="2.2" stroke="currentColor" strokeWidth="1.8"/>
                          <path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="tp-info-body">
                        <span className="tp-info-label">PAN Number</span>
                        {!editMode.pan ? (
                          <span className="tp-info-value">{trust.pan_number || '—'}</span>
                        ) : (
                          <input
                            className="tp-edit-input"
                            value={draft.pan_number}
                            onChange={e => setDraft(p => ({ ...p, pan_number: e.target.value }))}
                            placeholder="Enter PAN number"
                          />
                        )}
                      </div>
                      <div className="tp-info-actions">
                        {!editMode.pan ? (
                          <button className="tp-edit-btn" onClick={() => startEdit('pan')}>Edit</button>
                        ) : (
                          <div className="tp-edit-actions">
                            <button className="tp-edit-btn ghost" onClick={cancelEdit}>Cancel</button>
                            <button className="tp-edit-btn primary" onClick={() => saveField('pan')} disabled={savingField === 'pan'}>
                              {savingField === 'pan' ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    )}

                    {showWebsiteCard && (
                    <div className="tp-info-card">
                      <div className="tp-info-icon" style={{ background: '#FFF7ED', color: '#EA580C' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
                          <path d="M3 12h18M12 3c2.8 3 2.8 15 0 18M12 3c-2.8 3-2.8 15 0 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="tp-info-body">
                        <span className="tp-info-label">Website</span>
                        {!editMode.website ? (
                          <span className="tp-info-value">{trust.website || '—'}</span>
                        ) : (
                          <input
                            className="tp-edit-input"
                            value={draft.website}
                            onChange={e => setDraft(p => ({ ...p, website: e.target.value }))}
                            placeholder="Enter website URL"
                          />
                        )}
                      </div>
                      <div className="tp-info-actions">
                        {!editMode.website ? (
                          <button className="tp-edit-btn" onClick={() => startEdit('website')}>Edit</button>
                        ) : (
                          <div className="tp-edit-actions">
                            <button className="tp-edit-btn ghost" onClick={cancelEdit}>Cancel</button>
                            <button className="tp-edit-btn primary" onClick={() => saveField('website')} disabled={savingField === 'website'}>
                              {savingField === 'website' ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    )}

                    {showEmailCard && (
                    <div className="tp-info-card">
                      <div className="tp-info-icon" style={{ background: '#FDF4FF', color: '#9333EA' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" strokeWidth="1.8"/>
                          <path d="M3 7l9 6 9-6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                        </svg>
                      </div>
                      <div className="tp-info-body">
                        <span className="tp-info-label">Email ID</span>
                        {!editMode.email ? (
                          <span className="tp-info-value">{trust.email_id || '—'}</span>
                        ) : (
                          <input
                            className="tp-edit-input"
                            value={draft.email_id}
                            onChange={e => setDraft(p => ({ ...p, email_id: e.target.value }))}
                            placeholder="Enter email ID"
                          />
                        )}
                      </div>
                      <div className="tp-info-actions">
                        {!editMode.email ? (
                          <button className="tp-edit-btn" onClick={() => startEdit('email')}>Edit</button>
                        ) : (
                          <div className="tp-edit-actions">
                            <button className="tp-edit-btn ghost" onClick={cancelEdit}>Cancel</button>
                            <button className="tp-edit-btn primary" onClick={() => saveField('email')} disabled={savingField === 'email'}>
                              {savingField === 'email' ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    )}

                    {showRemark1Card && (
                    <div className="tp-info-card">
                      <div className="tp-info-icon" style={{ background: '#EEF2FF', color: '#4F46E5' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M4 5h16v14H4z" stroke="currentColor" strokeWidth="1.8"/>
                          <path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="tp-info-body">
                        <span className="tp-info-label">Remark 1</span>
                        {!editMode.remark1 ? (
                          <span className="tp-info-value">{trust.remark1 || '—'}</span>
                        ) : (
                          <textarea
                            className="tp-edit-textarea"
                            rows={2}
                            value={draft.remark1}
                            onChange={e => setDraft(p => ({ ...p, remark1: e.target.value }))}
                            placeholder="Enter remark 1"
                          />
                        )}
                      </div>
                      <div className="tp-info-actions">
                        {!editMode.remark1 ? (
                          <button className="tp-edit-btn" onClick={() => startEdit('remark1')}>Edit</button>
                        ) : (
                          <div className="tp-edit-actions">
                            <button className="tp-edit-btn ghost" onClick={cancelEdit}>Cancel</button>
                            <button className="tp-edit-btn primary" onClick={() => saveField('remark1')} disabled={savingField === 'remark1'}>
                              {savingField === 'remark1' ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    )}

                    {showRemark2Card && (
                    <div className="tp-info-card">
                      <div className="tp-info-icon" style={{ background: '#ECFDF5', color: '#059669' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M4 5h16v14H4z" stroke="currentColor" strokeWidth="1.8"/>
                          <path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="tp-info-body">
                        <span className="tp-info-label">Remark 2</span>
                        {!editMode.remark2 ? (
                          <span className="tp-info-value">{trust.remark2 || '—'}</span>
                        ) : (
                          <textarea
                            className="tp-edit-textarea"
                            rows={2}
                            value={draft.remark2}
                            onChange={e => setDraft(p => ({ ...p, remark2: e.target.value }))}
                            placeholder="Enter remark 2"
                          />
                        )}
                      </div>
                      <div className="tp-info-actions">
                        {!editMode.remark2 ? (
                          <button className="tp-edit-btn" onClick={() => startEdit('remark2')}>Edit</button>
                        ) : (
                          <div className="tp-edit-actions">
                            <button className="tp-edit-btn ghost" onClick={cancelEdit}>Cancel</button>
                            <button className="tp-edit-btn primary" onClick={() => saveField('remark2')} disabled={savingField === 'remark2'}>
                              {savingField === 'remark2' ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    )}

                    {showRemark3Card && (
                    <div className="tp-info-card">
                      <div className="tp-info-icon" style={{ background: '#FFF7ED', color: '#EA580C' }}>
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                          <path d="M4 5h16v14H4z" stroke="currentColor" strokeWidth="1.8"/>
                          <path d="M8 9h8M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                        </svg>
                      </div>
                      <div className="tp-info-body">
                        <span className="tp-info-label">Remark 3</span>
                        {!editMode.remark3 ? (
                          <span className="tp-info-value">{trust.remark3 || '—'}</span>
                        ) : (
                          <textarea
                            className="tp-edit-textarea"
                            rows={2}
                            value={draft.remark3}
                            onChange={e => setDraft(p => ({ ...p, remark3: e.target.value }))}
                            placeholder="Enter remark 3"
                          />
                        )}
                      </div>
                      <div className="tp-info-actions">
                        {!editMode.remark3 ? (
                          <button className="tp-edit-btn" onClick={() => startEdit('remark3')}>Edit</button>
                        ) : (
                          <div className="tp-edit-actions">
                            <button className="tp-edit-btn ghost" onClick={cancelEdit}>Cancel</button>
                            <button className="tp-edit-btn primary" onClick={() => saveField('remark3')} disabled={savingField === 'remark3'}>
                              {savingField === 'remark3' ? 'Saving...' : 'Save'}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                    )}
                  </div>
                </section>
                )}

                {saveError && (
                  <div className="tp-save-error">{saveError}</div>
                )}
              </div>

              {/* ── CONTENT SECTIONS (Terms & Privacy) ── */}
              {!isLogoCardView && (
              <div className="tp-sections-wrap">
                {showTermsSection && (
                <ContentSection
                  title="Terms & Conditions"
                  content={trust.terms_content}
                  accentColor="#6366F1"
                  isEditing={editingContent === 'terms_content'}
                  draftValue={contentDraft.terms_content}
                  onDraftChange={(value) =>
                    setContentDraft(prev => ({ ...prev, terms_content: value }))
                  }
                  onEdit={() => startContentEdit('terms_content')}
                  onCancel={cancelContentEdit}
                  onSave={() => saveContent('terms_content')}
                  saving={contentSaving && editingContent === 'terms_content'}
                  error={editingContent === 'terms_content' ? contentError : ''}
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M8 13h8M8 17h5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
                    </svg>
                  }
                />
                )}

                {showPrivacySection && (
                <ContentSection
                  title="Privacy Policy"
                  content={trust.privacy_content}
                  accentColor="#8B5CF6"
                  isEditing={editingContent === 'privacy_content'}
                  draftValue={contentDraft.privacy_content}
                  onDraftChange={(value) =>
                    setContentDraft(prev => ({ ...prev, privacy_content: value }))
                  }
                  onEdit={() => startContentEdit('privacy_content')}
                  onCancel={cancelContentEdit}
                  onSave={() => saveContent('privacy_content')}
                  saving={contentSaving && editingContent === 'privacy_content'}
                  error={editingContent === 'privacy_content' ? contentError : ''}
                  icon={
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                      <path d="M9 12l2 2 4-4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  }
                />
                )}
              </div>
              )}

              {hasSearchQuery && !hasSearchResults && (
                <div className="tp-search-empty">
                  No matching details found for "{searchTerm}".
                </div>
              )}
            </>
          )}

          {/* ── No data ── */}
          {!loading && !error && !trust && (
            <div className="tp-error">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.8"/>
                <path d="M12 8v4M12 16h.01" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
              </svg>
              <span>Trust details not found.</span>
              <button onClick={loadTrust}>Retry</button>
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
