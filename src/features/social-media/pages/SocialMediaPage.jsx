import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../../../core/components/PageHeader';
import Sidebar from '../../../core/components/Sidebar';
import { supabase } from '../../../core/lib/supabase';
import { createImage, fetchImages, fetchImagesCount } from '../../../core/services/imagesService';
import {
  fetchSocialMediaAccountByTrust,
  upsertSocialMediaAccountByTrust,
} from '../services/socialMediaAccountsService';
import './SocialMediaPage.css';

function toTitleCase(value) {
  if (!value) return '';
  return value.charAt(0).toUpperCase() + value.slice(1).toLowerCase();
}

function gcd(a, b) {
  let x = Math.abs(Number(a) || 0);
  let y = Math.abs(Number(b) || 0);
  while (y) {
    const temp = y;
    y = x % y;
    x = temp;
  }
  return x || 1;
}

function toAspectRatioText(width, height) {
  const safeWidth = Math.max(1, Number(width) || 1);
  const safeHeight = Math.max(1, Number(height) || 1);
  const divisor = gcd(safeWidth, safeHeight);
  return `${Math.round(safeWidth / divisor)}:${Math.round(safeHeight / divisor)}`;
}

function getInitialForm() {
  return {
    title: '',
    hashtags: '',
    description: '',
    prompt: '', // ✅ prompt field added
    aspectRatio: '4:5',
    postTimeMode: 'now',
    postTimeValue: '',
    platforms: { instagram: true, facebook: true },
  };
}

function getInitialAccountForm() {
  return {
    blotatoApi: '',
    instagram: '',
    fbAccount: '',
    fbPage: '',
    youtube: '',
    x: '',
    threads: '',
    keywords: '',
    region: '',
    uploadPostApi: '',
  };
}

function toNullableText(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function toNullableBigint(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

export default function SocialMediaPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'dashboard';
  const currentMemberId = location.state?.selectedMemberId || null;
  const isCreateRoute = location.pathname === '/social-media/create';
  const isAccountsDetailsRoute = location.pathname === '/social-media/accounts-details';
  const searchParams = useMemo(() => new URLSearchParams(location.search), [location.search]);

  const selectedPlatform = toTitleCase(searchParams.get('platform')) || '';
  const selectedPhotoId = searchParams.get('photoId') || '';
  const selectedPhotoUrl = searchParams.get('photoUrl') || '';
  const selectedFolderId = searchParams.get('folderId') || '';
  const selectedFolder = searchParams.get('folder') || '';

  const [activeSection, setActiveSection] = useState(() => {
    if (isAccountsDetailsRoute) return 'accounts-details';
    if (isCreateRoute) return '';
    return 'media-details';
  });
  const [mediaRows, setMediaRows] = useState([]);
  const [mediaCount, setMediaCount] = useState(0);
  const [loadingCount, setLoadingCount] = useState(true);
  const [loadingMediaRows, setLoadingMediaRows] = useState(false);
  const [selectedMediaId, setSelectedMediaId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState('');
  const [form, setForm] = useState(() => getInitialForm());
  const [accountForm, setAccountForm] = useState(() => getInitialAccountForm());
  const [accountRecordId, setAccountRecordId] = useState('');
  const [accountCreatedAt, setAccountCreatedAt] = useState('');
  const [accountUpdatedAt, setAccountUpdatedAt] = useState('');
  const [loadingAccount, setLoadingAccount] = useState(false);
  const [savingAccount, setSavingAccount] = useState(false);
  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);
  const [generateStatus, setGenerateStatus] = useState('');
  const aiCaptionCacheRef = useRef(new Map());
  const selectedDetailsRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    const loadCount = async () => {
      setLoadingCount(true);
      const { count, error: countError } = await fetchImagesCount();
      if (cancelled) return;
      if (countError) {
        setError(countError.message || 'Unable to fetch media count.');
      } else {
        setMediaCount(count || 0);
      }
      setLoadingCount(false);
    };
    loadCount();
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!selectedPhotoUrl) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (cancelled) return;
      const ratioText = toAspectRatioText(image.naturalWidth, image.naturalHeight);
      setForm((prev) => ({ ...prev, aspectRatio: ratioText }));
    };
    image.onerror = () => {
      if (cancelled) return;
      setForm((prev) => ({ ...prev, aspectRatio: prev.aspectRatio || '4:5' }));
    };
    image.src = selectedPhotoUrl;
    return () => { cancelled = true; };
  }, [selectedPhotoUrl]);

  const loadMediaDetails = useCallback(async () => {
    setLoadingMediaRows(true);
    setError('');
    const { data, error: fetchError } = await fetchImages({ limit: 30 });
    if (fetchError) {
      setError(fetchError.message || 'Unable to load media details.');
      setMediaRows([]);
      setLoadingMediaRows(false);
      return;
    }
    setMediaRows(data || []);
    setSelectedMediaId('');
    setLoadingMediaRows(false);
  }, []);

  const loadAccountDetails = useCallback(async () => {
    if (!trust?.id) return;
    setLoadingAccount(true);
    setError('');
    const { data, error: fetchError } = await fetchSocialMediaAccountByTrust(trust.id);
    if (fetchError) {
      setError(fetchError.message || 'Unable to load account details.');
      setLoadingAccount(false);
      return;
    }
    if (!data) {
      setAccountRecordId('');
      setAccountCreatedAt('');
      setAccountUpdatedAt('');
      setAccountForm(getInitialAccountForm());
      setLoadingAccount(false);
      return;
    }
    setAccountRecordId(data.id || '');
    setAccountCreatedAt(data.createdAt || '');
    setAccountUpdatedAt(data.updatedAt || '');
    setAccountForm({
      blotatoApi: data.blotatoApi || '',
      instagram: data.instagram ?? '',
      fbAccount: data.fbAccount ?? '',
      fbPage: data.fbPage ?? '',
      youtube: data.youtube ?? '',
      x: data.x ?? '',
      threads: data.threads ?? '',
      keywords: data.keywords || '',
      region: data.region || '',
      uploadPostApi: data.uploadPostApi || '',
    });
    setLoadingAccount(false);
  }, [trust?.id]);

  const handleOpenSection = async (sectionId) => {
    if (sectionId === 'accounts-details' && !isAccountsDetailsRoute) return;
    setActiveSection(sectionId);
    if (sectionId === 'media-details') {
      await loadMediaDetails();
    } else if (sectionId === 'accounts-details') {
      await loadAccountDetails();
    }
  };

  const handleFormChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handlePlatformChange = (platform, checked) => {
    setForm((prev) => ({
      ...prev,
      platforms: { ...prev.platforms, [platform]: checked },
    }));
  };

  const handleAccountFormChange = (field, value) => {
    setAccountForm((prev) => ({ ...prev, [field]: value }));
  };

  // ✅ AI Generate Caption — image + prompt dono bhejta hai
  const handleGenerateCaption = async () => {
    if (!selectedPhotoUrl) {
      setError('No photo selected.');
      return;
    }
    setGenerating(true);
    setGenerateStatus('Analyzing image and preparing summary...');
    setError('');
    try {
      const promptValue = form.prompt.trim();
      const cacheKey = `${selectedPhotoUrl}__${promptValue.toLowerCase()}`;
      const cached = aiCaptionCacheRef.current.get(cacheKey);
      if (cached) {
        setForm((prev) => ({
          ...prev,
          title: cached.title || prev.title,
          hashtags: cached.hashtags || prev.hashtags,
          description: cached.description || prev.description,
        }));
        setGenerateStatus('Summary ready (quick cache).');
        window.setTimeout(() => setGenerateStatus(''), 1800);
        setGenerating(false);
        return;
      }

      const { data, error: invokeError } = await supabase.functions.invoke(
        'generate-image-caption',
        {
          body: {
            imageUrl: selectedPhotoUrl,
            prompt: promptValue || null, // ✅ prompt bhi bhej rahe hain
          },
        }
      );
      if (invokeError) throw invokeError;
      if (data?.error) throw new Error(data.error);
      aiCaptionCacheRef.current.set(cacheKey, {
        title: data.title || '',
        hashtags: data.hashtags || '',
        description: data.description || '',
      });
      setForm((prev) => ({
        ...prev,
        title: data.title || prev.title,
        hashtags: data.hashtags || prev.hashtags,
        description: data.description || prev.description,
      }));
      setGenerateStatus('Summary generated successfully.');
      window.setTimeout(() => setGenerateStatus(''), 1800);
    } catch (err) {
      const message =
        err?.message || 'Unauthorized request. Please login again and retry.';
      setError('AI generation failed: ' + message);
      setGenerateStatus('');
    }
    setGenerating(false);
  };

  const handleCreateImage = async (event) => {
    event.preventDefault();
    const titleValue = form.title.trim();
    if (!titleValue) {
      setError('Title is required.');
      return;
    }
    if (!selectedPhotoId) {
      setError('Selected photo is missing. Please open this page from gallery.');
      return;
    }
    if (form.postTimeMode === 'set-time' && !form.postTimeValue) {
      setError('Please select a scheduled date and time.');
      return;
    }
    if (!form.platforms.instagram && !form.platforms.facebook) {
      setError('Please select at least one platform.');
      return;
    }

    setSaving(true);
    setError('');
    setSaveMessage('');

    const payload = {
      gallery_photo_id: selectedPhotoId,
      Title: titleValue,
      Hashtags: form.hashtags.trim() || null,
      Description: form.description.trim() || null,
      aspectRatio: form.aspectRatio.trim() || null,
      postType: form.postTimeMode,
      Approved: 'approved',
      postTime:
        form.postTimeMode === 'set-time'
          ? new Date(form.postTimeValue).toISOString()
          : new Date(Date.now() + 60 * 1000).toISOString(),
      platforms: JSON.stringify(form.platforms),
      prompt: form.prompt.trim() || null, // ✅ DB mein bhi save ho raha hai
      created_by: superuserId || null,
    };

    const { error: createError } = await createImage(payload);
    if (createError) {
      setError(createError.message || 'Unable to save image details.');
      setSaving(false);
      return;
    }

    setSaving(false);
    navigate('/social-media', {
      replace: true,
      state: {
        userName,
        trust,
        superuserId,
        sidebarNavKey: currentSidebarNavKey,
        socialMediaSection: 'media-details',
        flashMessage: 'Image scheduled successfully.',
      },
    });
  };

  const handleSaveAccountDetails = async (event) => {
    event.preventDefault();
    if (!trust?.id) {
      setError('Trust not found. Please re-open from dashboard.');
      return;
    }
    setSavingAccount(true);
    setError('');
    setSaveMessage('');

    const payload = {
      trust_id: trust.id,
      'Blotato-API': toNullableText(accountForm.blotatoApi),
      Instagram: toNullableBigint(accountForm.instagram),
      'FB-Account': toNullableBigint(accountForm.fbAccount),
      'FB-Page': toNullableBigint(accountForm.fbPage),
      Youtube: toNullableBigint(accountForm.youtube),
      X: toNullableBigint(accountForm.x),
      Threads: toNullableBigint(accountForm.threads),
      KeyWords: toNullableText(accountForm.keywords),
      region: toNullableText(accountForm.region),
      'upload-Post-Api': toNullableText(accountForm.uploadPostApi),
    };

    if (!accountRecordId && currentMemberId) {
      payload.created_by = currentMemberId;
    }

    const response = await upsertSocialMediaAccountByTrust(payload);
    if (response.error) {
      setError(response.error.message || 'Unable to save account details.');
      setSavingAccount(false);
      return;
    }

    const saved = response.data;
    setAccountRecordId(saved?.id || '');
    setAccountCreatedAt(saved?.createdAt || '');
    setAccountUpdatedAt(saved?.updatedAt || '');
    setAccountForm({
      blotatoApi: saved?.blotatoApi || '',
      instagram: saved?.instagram ?? '',
      fbAccount: saved?.fbAccount ?? '',
      fbPage: saved?.fbPage ?? '',
      youtube: saved?.youtube ?? '',
      x: saved?.x ?? '',
      threads: saved?.threads ?? '',
      keywords: saved?.keywords || '',
      region: saved?.region || '',
      uploadPostApi: saved?.uploadPostApi || '',
    });
    setSaveMessage('Social media account details saved.');
    setSavingAccount(false);
  };

  const mediaSubtitle = useMemo(() => {
    if (loadingCount) return 'Loading media count...';
    return `${mediaCount} media record${mediaCount === 1 ? '' : 's'} connected`;
  }, [mediaCount, loadingCount]);

  const pageTitle = isAccountsDetailsRoute ? 'Social Media Account Details' : 'Social Media';
  const pageSubtitle = isCreateRoute
    ? 'Create media details for selected photo'
    : isAccountsDetailsRoute
      ? 'Manage social media account information'
      : 'Manage media and account information';

  useEffect(() => {
    const flashMessage = String(location.state?.flashMessage || '').trim();
    if (!flashMessage) return;
    setSaveMessage(flashMessage);
    const timer = window.setTimeout(() => setSaveMessage(''), 4000);
    return () => window.clearTimeout(timer);
  }, [location.state?.flashMessage]);

  useEffect(() => {
    if (isCreateRoute) return;
    if (isAccountsDetailsRoute) {
      handleOpenSection('accounts-details');
      return;
    }
    const requestedSection = location.state?.socialMediaSection || '';
    if (requestedSection && requestedSection !== 'accounts-details') {
      handleOpenSection(requestedSection);
      return;
    }
    handleOpenSection('media-details');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isCreateRoute, isAccountsDetailsRoute]);

  const selectedMediaRow = useMemo(
    () => mediaRows.find((row) => row.id === selectedMediaId) || null,
    [mediaRows, selectedMediaId]
  );

  const handleOpenMedia = (rowId) => {
    const safeId = rowId || '';
    setSelectedMediaId(safeId);
    if (!safeId) return;
    window.requestAnimationFrame(() => {
      const target = document.getElementById(`sm-media-item-${safeId}`);
      target?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  const formatDateTime = (value) => {
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
  };

  return (
    <div className="sm-root">
      <Sidebar
        trustName={trust?.name || 'Trust'}
        onDashboard={() => navigate('/dashboard', { state: { userName, trust, superuserId, sidebarNavKey: 'dashboard' } })}
        onLogout={() => navigate('/login')}
      />

      <main className="sm-main">
        <PageHeader
          title={pageTitle}
          subtitle={pageSubtitle}
          onBack={() => {
            if (isAccountsDetailsRoute) {
              navigate('/dashboard', {
                state: { userName, trust, superuserId, sidebarNavKey: 'company-details' },
              });
              return;
            }
            navigate('/social-media', {
              state: { userName, trust, superuserId, sidebarNavKey: currentSidebarNavKey },
            });
          }}
        />

        <section className="sm-content">
          {error && <div className="sm-error">{error}</div>}
          {saveMessage && <div className="sm-success">{saveMessage}</div>}

          {isCreateRoute ? (
            <div className="sm-section-card sm-create-card">
              <div className="sm-section-head">
                <h4>Create Image Details</h4>
                <span>{selectedPlatform || 'Social'}</span>
              </div>

              <div className="sm-create-layout">
                <div>
                  <div className="sm-create-meta">
                    <div><strong>Folder:</strong> {selectedFolder || 'N/A'}</div>
                  </div>

                  <form className={`sm-form-grid ${generating ? 'is-generating' : ''}`} onSubmit={handleCreateImage} aria-busy={generating ? 'true' : 'false'}>

                    {/* ✅ Prompt Field */}
                    <label className="sm-field sm-field-full">
                      <span>AI Prompt (optional)</span>
                      <textarea
                        value={form.prompt}
                        onChange={(e) => handleFormChange('prompt', e.target.value)}
                        placeholder="e.g. Write in Hindi, focus on spiritual theme, keep it short..."
                        rows={2}
                        disabled={generating}
                      />
                    </label>

                    {/* ✅ AI Generate Button */}
                    {selectedPhotoUrl && (
                      <div className="sm-field-full sm-ai-btn-wrap">
                        <button
                          type="button"
                          className="sm-ai-generate-btn"
                          onClick={handleGenerateCaption}
                          disabled={generating}
                        >
                          {generating ? 'Generating Summary...' : 'Generate with AI'}
                        </button>
                        {generating && (
                          <div className="sm-ai-loading-note" role="status" aria-live="polite">
                            <span className="sm-spinner" aria-hidden="true" />
                            <span>{generateStatus || 'Generating summary...'}</span>
                          </div>
                        )}
                        {!generating && generateStatus && (
                          <div className="sm-ai-done-note" role="status" aria-live="polite">{generateStatus}</div>
                        )}
                      </div>
                    )}

                    <label className="sm-field">
                      <span>Title *</span>
                      <input
                        type="text"
                        value={form.title}
                        onChange={(e) => handleFormChange('title', e.target.value)}
                        placeholder="Enter title"
                        required
                        disabled={generating}
                      />
                    </label>

                    <label className="sm-field">
                      <span>Hashtags</span>
                      <input
                        type="text"
                        value={form.hashtags}
                        onChange={(e) => handleFormChange('hashtags', e.target.value)}
                        placeholder="#event #trust"
                        disabled={generating}
                      />
                    </label>

                    <label className="sm-field sm-field-full">
                      <span>Description</span>
                      <textarea
                        value={form.description}
                        onChange={(e) => handleFormChange('description', e.target.value)}
                        placeholder="Write description"
                        rows={4}
                        disabled={generating}
                      />
                    </label>

                    <label className="sm-field">
                      <span>Aspect Ratio</span>
                      <input
                        type="text"
                        value={form.aspectRatio}
                        onChange={(e) => handleFormChange('aspectRatio', e.target.value)}
                        placeholder="4:5 / 1:1 / 16:9"
                        disabled={generating}
                      />
                    </label>

                    <div className="sm-field sm-field-full">
                      <span>Post To</span>
                      <div className="sm-post-time-row">
                        <label className="sm-post-time-option">
                          <input
                            type="checkbox"
                            checked={form.platforms.instagram}
                            onChange={(e) => handlePlatformChange('instagram', e.target.checked)}
                            disabled={generating}
                          />
                          <span>Instagram</span>
                        </label>
                        <label className="sm-post-time-option">
                          <input
                            type="checkbox"
                            checked={form.platforms.facebook}
                            onChange={(e) => handlePlatformChange('facebook', e.target.checked)}
                            disabled={generating}
                          />
                          <span>Facebook</span>
                        </label>
                      </div>
                    </div>

                    <div className="sm-field sm-field-full">
                      <span>Post Time</span>
                      <div className="sm-post-time-row">
                        <label className="sm-post-time-option">
                          <input
                            type="radio"
                            name="postTimeMode"
                            value="now"
                            checked={form.postTimeMode === 'now'}
                            onChange={(e) => handleFormChange('postTimeMode', e.target.value)}
                            disabled={generating}
                          />
                          <span>Now (+1 min)</span>
                        </label>
                        <label className="sm-post-time-option">
                          <input
                            type="radio"
                            name="postTimeMode"
                            value="set-time"
                            checked={form.postTimeMode === 'set-time'}
                            onChange={(e) => handleFormChange('postTimeMode', e.target.value)}
                            disabled={generating}
                          />
                          <span>Set Time</span>
                        </label>
                        {form.postTimeMode === 'set-time' && (
                          <input
                            type="datetime-local"
                            value={form.postTimeValue}
                            onChange={(e) => handleFormChange('postTimeValue', e.target.value)}
                            className="sm-post-time-input"
                            disabled={generating}
                          />
                        )}
                      </div>
                    </div>

                    <div className="sm-form-actions sm-field-full">
                      <button type="submit" disabled={saving || generating}>
                        {saving ? 'Sending...' : 'Send to Social Media'}
                      </button>
                    </div>
                  </form>
                </div>

                <aside className="sm-preview-card">
                  <div className="sm-preview-label">Selected Photo Preview</div>
                  {selectedPhotoUrl ? (
                    <img src={selectedPhotoUrl} alt="Selected for social media" />
                  ) : (
                    <div className="sm-preview-empty">Photo preview not available.</div>
                  )}
                </aside>
              </div>
            </div>
          ) : (
            <>
              {activeSection === 'media-details' && (
                <div className="sm-section-card">
                  <div className="sm-section-head">
                    <h4>Media Details</h4>
                    <span>{loadingMediaRows ? 'Loading...' : mediaSubtitle}</span>
                  </div>

                  {loadingMediaRows ? (
                    <div className="sm-empty">Loading media details...</div>
                  ) : mediaRows.length === 0 ? (
                    <div className="sm-empty">No media records found.</div>
                  ) : (
                    <div className="sm-media-layout">
                      <div className="sm-media-list">
                        {mediaRows.map((row, index) => (
                          <div
                            key={row.id || `${row.title}-${index}`}
                            id={row.id ? `sm-media-item-${row.id}` : undefined}
                            className={`sm-media-item ${selectedMediaId === row.id ? 'active' : ''}`}
                          >
                            <div className="sm-media-title">{row.title || 'Untitled'}</div>
                            <div className="sm-media-meta">
                              <span>{row.hashtags || 'No hashtags'}</span>
                              <span>{row.approved || 'Pending'}</span>
                              <span>{row.aspectRatio || 'N/A'}</span>
                              <span>Post: {formatDateTime(row.postTime)}</span>
                            </div>
                            <button
                              type="button"
                              className="sm-media-open-btn"
                              onClick={() => handleOpenMedia(row.id)}
                            >
                              Open
                            </button>
                          </div>
                        ))}
                      </div>

                      {selectedMediaRow ? (
                        <div ref={selectedDetailsRef} className="sm-media-details-card">
                          <div className="sm-media-details-head">
                            <h5>{selectedMediaRow.title || 'Untitled'}</h5>
                            <button
                              type="button"
                              className="sm-media-close-btn"
                              onClick={() => setSelectedMediaId('')}
                            >
                              Close
                            </button>
                          </div>
                          <div className="sm-media-preview-short">
                            {selectedMediaRow.previewUrl ? (
                              <img src={selectedMediaRow.previewUrl} alt={selectedMediaRow.title || 'Preview'} />
                            ) : (
                              <div className="sm-media-preview-empty">No preview</div>
                            )}
                          </div>
                          <div className="sm-media-details-grid">
                            <div><strong>Hashtags:</strong> {selectedMediaRow.hashtags || 'N/A'}</div>
                            <div><strong>Aspect Ratio:</strong> {selectedMediaRow.aspectRatio || 'N/A'}</div>
                            <div><strong>Status:</strong> {selectedMediaRow.approved || 'N/A'}</div>
                            <div><strong>Post Type:</strong> {selectedMediaRow.postType || 'N/A'}</div>
                            <div><strong>Post Status:</strong> {selectedMediaRow.postStatus || 'N/A'}</div>
                            <div><strong>Post Time:</strong> {formatDateTime(selectedMediaRow.postTime)}</div>
                            <div><strong>Created At:</strong> {formatDateTime(selectedMediaRow.createdAt)}</div>
                            <div><strong>Platforms:</strong> {selectedMediaRow.platforms
                              ? (() => {
                                  try {
                                    const p = JSON.parse(selectedMediaRow.platforms);
                                    return [p.instagram && 'Instagram', p.facebook && 'Facebook']
                                      .filter(Boolean).join(', ') || 'N/A';
                                  } catch { return 'N/A'; }
                                })()
                              : 'N/A'}
                            </div>
                            {selectedMediaRow.errorMessage && (
                              <div><strong>Error:</strong> {selectedMediaRow.errorMessage}</div>
                            )}
                          </div>
                          {selectedMediaRow.publicUrl && (
                            <div className="sm-media-view-post-wrap">
                              <a
                                href={selectedMediaRow.publicUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="sm-media-view-post-btn"
                              >
                                View Post
                              </a>
                            </div>
                          )}
                          <div className="sm-media-details-desc">
                            <strong>Description:</strong> {selectedMediaRow.description || 'N/A'}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  )}
                </div>
              )}

              {isAccountsDetailsRoute && activeSection === 'accounts-details' && (
                <div className="sm-section-card">
                  <div className="sm-section-head">
                    <h4>Accounts Details</h4>
                  </div>
                  {loadingAccount ? (
                    <div className="sm-empty">Loading account details...</div>
                  ) : (
                    <form className="sm-form-grid sm-accounts-form" onSubmit={handleSaveAccountDetails}>
                      <label className="sm-field">
                        <span>Blotato API</span>
                        <input
                          type="text"
                          value={accountForm.blotatoApi}
                          onChange={(e) => handleAccountFormChange('blotatoApi', e.target.value)}
                          placeholder="Enter Blotato API key"
                        />
                      </label>
                      <label className="sm-field">
                        <span>Upload Post API</span>
                        <input
                          type="text"
                          value={accountForm.uploadPostApi}
                          onChange={(e) => handleAccountFormChange('uploadPostApi', e.target.value)}
                          placeholder="Enter upload post API"
                        />
                      </label>
                      <label className="sm-field">
                        <span>Instagram</span>
                        <input
                          type="text"
                          value={accountForm.instagram}
                          onChange={(e) => handleAccountFormChange('instagram', e.target.value)}
                          placeholder="Instagram account id"
                        />
                      </label>
                      <label className="sm-field">
                        <span>FB Account</span>
                        <input
                          type="text"
                          value={accountForm.fbAccount}
                          onChange={(e) => handleAccountFormChange('fbAccount', e.target.value)}
                          placeholder="Facebook account id"
                        />
                      </label>
                      <label className="sm-field">
                        <span>FB Page</span>
                        <input
                          type="text"
                          value={accountForm.fbPage}
                          onChange={(e) => handleAccountFormChange('fbPage', e.target.value)}
                          placeholder="Facebook page id"
                        />
                      </label>
                      <label className="sm-field">
                        <span>Youtube</span>
                        <input
                          type="text"
                          value={accountForm.youtube}
                          onChange={(e) => handleAccountFormChange('youtube', e.target.value)}
                          placeholder="Youtube channel id"
                        />
                      </label>
                      <label className="sm-field">
                        <span>X</span>
                        <input
                          type="text"
                          value={accountForm.x}
                          onChange={(e) => handleAccountFormChange('x', e.target.value)}
                          placeholder="X account id"
                        />
                      </label>
                      <label className="sm-field">
                        <span>Threads</span>
                        <input
                          type="text"
                          value={accountForm.threads}
                          onChange={(e) => handleAccountFormChange('threads', e.target.value)}
                          placeholder="Threads account id"
                        />
                      </label>
                      <label className="sm-field">
                        <span>Region</span>
                        <input
                          type="text"
                          value={accountForm.region}
                          onChange={(e) => handleAccountFormChange('region', e.target.value)}
                          placeholder="e.g. India"
                        />
                      </label>
                      <label className="sm-field sm-field-full">
                        <span>KeyWords</span>
                        <textarea
                          value={accountForm.keywords}
                          onChange={(e) => handleAccountFormChange('keywords', e.target.value)}
                          placeholder="Enter keywords"
                          rows={3}
                        />
                      </label>
                      {(accountCreatedAt || accountUpdatedAt) && (
                        <div className="sm-account-meta sm-field-full">
                          <span><strong>Created At:</strong> {formatDateTime(accountCreatedAt)}</span>
                          <span><strong>Updated At:</strong> {formatDateTime(accountUpdatedAt)}</span>
                        </div>
                      )}
                      <div className="sm-form-actions sm-field-full">
                        <button type="submit" disabled={savingAccount}>
                          {savingAccount ? 'Saving...' : 'Save Account Details'}
                        </button>
                        {generating && (
                          <div className="sm-ai-loading-note" role="status" aria-live="polite">
                            <span className="sm-spinner" aria-hidden="true" />
                            <span>{generateStatus || 'Generating summary...'}</span>
                          </div>
                        )}
                        {!generating && generateStatus && (
                          <div className="sm-ai-done-note" role="status" aria-live="polite">{generateStatus}</div>
                        )}
                      </div>
                    </form>
                  )}
                </div>
              )}
            </>
          )}
        </section>
      </main>
    </div>
  );
}

