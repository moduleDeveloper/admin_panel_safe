import { useEffect, useState } from 'react';
import { fetchSocialAccounts, postToSocial } from '../services/videoCreationService';

const PLATFORM_ROWS = [
  {
    key: 'instagram',
    label: 'Instagram',
    field: 'instagram',
    icon: '📸',
    tint: '#fff1f6',
    border: '#f9a8d4',
    accent: '#be185d',
  },
  {
    key: 'facebook_page',
    label: 'FB Page',
    field: 'facebook_page',
    icon: '📘',
    tint: '#eff6ff',
    border: '#93c5fd',
    accent: '#1d4ed8',
  },
  {
    key: 'facebook_account',
    label: 'FB Account',
    field: 'facebook_account',
    icon: '👤',
    tint: '#ecfeff',
    border: '#67e8f9',
    accent: '#0e7490',
  },
  {
    key: 'youtube',
    label: 'YouTube',
    field: 'youtube',
    icon: '▶️',
    tint: '#fff7ed',
    border: '#fdba74',
    accent: '#c2410c',
  },
];

export default function ShareToSocialModal({
  isOpen,
  onClose,
  mediaUrl,
  mediaType = 'video',
  trustId,
  projectTitle = '',
  mediaAssetId = '',
}) {
  const [loading, setLoading] = useState(false);
  const [posting, setPosting] = useState(false);
  const [accounts, setAccounts] = useState(null);
  const [loadError, setLoadError] = useState('');
  const [selectedPlatforms, setSelectedPlatforms] = useState([]);
  const [caption, setCaption] = useState('');
  const [postType, setPostType] = useState('post');
  const [results, setResults] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    setLoadError('');
    setResults(null);
    setSelectedPlatforms([]);
    setCaption('');
    setPostType('post');

    (async () => {
      const { data, error } = await fetchSocialAccounts({ trustId });
      if (error) {
        setLoadError(error.message || 'Failed to load social accounts.');
        setAccounts(null);
      } else {
        setAccounts(data?.account || null);
      }
      setLoading(false);
    })();
  }, [isOpen, trustId]);

  const canUseSocial = Boolean(accounts?.hasBlotatoKey);
  const effectivePostType = mediaType === 'image' ? 'post' : postType;
  if (!isOpen) return null;

  const togglePlatform = (platformKey, isEnabled) => {
    if (!isEnabled) return;
    setSelectedPlatforms((prev) => (
      prev.includes(platformKey)
        ? prev.filter((item) => item !== platformKey)
        : [...prev, platformKey]
    ));
  };

  const submit = async () => {
    if (!selectedPlatforms.length || posting) return;
    setPosting(true);
    const { data, error } = await postToSocial({
      trustId,
      mediaUrl,
      mediaType,
      caption,
      platforms: selectedPlatforms,
      postType: effectivePostType,
      mediaAssetId,
    });
    if (error) {
      setResults([{ platform: 'system', status: 'failed', error: error.message || 'Failed to post.' }]);
    } else {
      setResults(Array.isArray(data?.results) ? data.results : []);
    }
    setPosting(false);
  };

  return (
    <div className="cvp-modal-overlay" onClick={onClose}>
      <div className="cvp-modal cvp-modal-wide" style={{ maxWidth: 960, borderRadius: 18, overflow: 'hidden' }} onClick={(event) => event.stopPropagation()}>
        <div
          className="cvp-modal-head"
          style={{
            background: 'linear-gradient(135deg, #eef2ff 0%, #f8fafc 60%)',
            borderBottom: '1px solid #dbeafe',
            padding: '16px 22px',
          }}
        >
          <h3 style={{ margin: 0 }}>Share To Social Media</h3>
          <button type="button" className="cvp-modal-close-icon" aria-label="Close Share Modal" onClick={onClose}>
            X
          </button>
        </div>
        <div style={{ padding: '16px 22px 18px' }}>
          <div className="cvp-meta-row" style={{ marginBottom: 14, gap: 10 }}>
            <span style={{ background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 999, padding: '5px 10px', fontWeight: 700 }}>
              {mediaType === 'image' ? 'Image Post' : 'Video'}
            </span>
            {projectTitle ? (
              <span style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 999, padding: '5px 10px', fontWeight: 600 }}>
                Project: {projectTitle}
              </span>
            ) : null}
          </div>

          {loading ? (
            <div className="cvp-empty" style={{ padding: 18, borderRadius: 12, border: '1px solid #dbeafe', background: '#f8fbff' }}>
              Loading social accounts...
            </div>
          ) : loadError ? (
            <div className="cvp-empty" style={{ color: '#b91c1c', padding: 16, borderRadius: 12, border: '1px solid #fecaca', background: '#fef2f2' }}>{loadError}</div>
          ) : !canUseSocial ? (
            <div className="cvp-empty" style={{ color: '#b45309', padding: 16, borderRadius: 12, border: '1px solid #fde68a', background: '#fffbeb' }}>
              Social media not configured. Please add Blotato API key in Admin Settings.
            </div>
          ) : results ? (
            <div>
              <div style={{ display: 'grid', gap: 10, marginBottom: 14 }}>
                {results.map((row, idx) => {
                  const isOk = row.status === 'success';
                  const isSkip = row.status === 'skipped';
                  return (
                    <div
                      key={`${row.platform}-${idx}`}
                      style={{
                        borderRadius: 12,
                        border: `1px solid ${isOk ? '#86efac' : isSkip ? '#fde68a' : '#fecaca'}`,
                        background: isOk ? '#f0fdf4' : isSkip ? '#fffbeb' : '#fef2f2',
                        color: '#0f172a',
                        padding: '12px 14px',
                        fontSize: 14,
                      }}
                    >
                      <div style={{ fontWeight: 800, marginBottom: row.error ? 4 : 0 }}>
                        {isOk ? 'Posted' : isSkip ? 'Skipped' : 'Failed'}: {row.platform}
                      </div>
                      {row.error ? <div style={{ color: '#475569' }}>{row.error}</div> : null}
                    </div>
                  );
                })}
              </div>
              <div className="cvp-action-row" style={{ justifyContent: 'flex-end', marginTop: 8 }}>
                <button type="button" className="cvp-primary-btn" onClick={onClose}>Close</button>
              </div>
            </div>
          ) : (
            <div>
              <div style={{ marginBottom: 14 }}>
                <div style={{ fontWeight: 800, marginBottom: 10, color: '#1e293b' }}>Select Platforms</div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                  {PLATFORM_ROWS.map((platform) => {
                    const accountId = accounts?.[platform.field];
                    const enabled = Boolean(accountId);
                    const selected = selectedPlatforms.includes(platform.key);
                    return (
                      <button
                        key={platform.key}
                        type="button"
                        onClick={() => togglePlatform(platform.key, enabled)}
                        disabled={!enabled}
                      style={{
                          border: selected ? `1px solid ${platform.accent}` : `1px solid ${platform.border}`,
                          background: !enabled ? '#f8fafc' : platform.tint,
                          color: !enabled ? '#94a3b8' : platform.accent,
                          borderRadius: 12,
                          padding: '10px 12px',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: enabled ? 'pointer' : 'not-allowed',
                          textAlign: 'left',
                          boxShadow: selected ? `0 0 0 2px ${platform.border}` : 'none',
                          transition: 'all 0.18s ease',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span>{platform.icon}</span>
                          <span>{platform.label}</span>
                        </div>
                        <div style={{ marginTop: 6, fontSize: 12, fontWeight: 600, color: !enabled ? '#94a3b8' : '#64748b' }}>
                          {enabled ? (selected ? 'Selected' : 'Ready to post') : 'Not configured'}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {mediaType === 'video' && (
                <div style={{ marginBottom: 14 }}>
                  <div style={{ fontWeight: 800, marginBottom: 8, color: '#1e293b' }}>Post Type</div>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {['post', 'reel', 'story'].map((type) => (
                      <button
                        key={type}
                        type="button"
                        onClick={() => setPostType(type)}
                        style={{
                          border: postType === type ? '1px solid #2563eb' : '1px solid #cbd5e1',
                          background: postType === type ? '#eff6ff' : '#fff',
                          color: '#1e293b',
                          borderRadius: 999,
                          padding: '8px 12px',
                          fontSize: 13,
                          fontWeight: 700,
                          cursor: 'pointer',
                          textTransform: 'capitalize',
                        }}
                      >
                        {type}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <label className="cvp-field" style={{ marginBottom: 10 }}>
                <span>Caption (optional)</span>
                <textarea
                  rows={3}
                  value={caption}
                  onChange={(event) => setCaption(event.target.value)}
                  placeholder="Write a caption for this post"
                  style={{ background: '#f8fafc' }}
                />
              </label>

              <div className="cvp-action-row" style={{ justifyContent: 'space-between', marginTop: 12 }}>
                <div style={{ color: '#64748b', fontWeight: 600, fontSize: 13 }}>
                  {selectedPlatforms.length > 0 ? `${selectedPlatforms.length} platform selected` : 'Select at least one platform'}
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button type="button" className="cvp-secondary-btn" onClick={onClose}>Cancel</button>
                  <button
                    type="button"
                    className="cvp-primary-btn"
                    onClick={submit}
                    disabled={!selectedPlatforms.length || posting}
                    style={{ minWidth: 170 }}
                  >
                    {posting ? 'Posting...' : `Post to ${selectedPlatforms.length} Platform(s)`}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
