import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './SelectTrustPage.css';
import {
  fetchLinkedTrusts,
  insertSuperuser,
  recordAdminSessionAction,
  ADMIN_MOBILE_SESSION_KEY,
  ADMIN_NAME_SESSION_KEY,
} from '../services/authService';

const GRADIENTS = [
  'linear-gradient(135deg,#6366F1,#8B5CF6)',
  'linear-gradient(135deg,#EC4899,#F43F5E)',
  'linear-gradient(135deg,#10B981,#059669)',
  'linear-gradient(135deg,#F59E0B,#EF4444)',
  'linear-gradient(135deg,#0891B2,#06B6D4)',
  'linear-gradient(135deg,#8B5CF6,#EC4899)',
];

const initials = (name = '') =>
  name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase() || '?';

export default function SelectTrustPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    superuserId: superuserIdFromState = null,
    userName: userNameFromState       = 'User',
    trusts: trustsFromState           = [],
    phone      = '',
    countryCode = '+91',
    fullMobile = '',
    isNewUser  = false,
  } = location.state || {};

  // Ensure fullMobile is always constructed with country code
  const constructedFullMobile = fullMobile || (phone && countryCode ? `${countryCode}${phone}` : '');

  const [superuserId,   setSuperuserId]   = useState(superuserIdFromState);
  const [userName,      setUserName]      = useState(userNameFromState);
  const [search,        setSearch]        = useState('');
  const [selected,      setSelected]      = useState(null);
  const [entering,      setEntering]      = useState(false);
  const [trusts,        setTrusts]        = useState(trustsFromState);
  const [loadingTrusts, setLoadingTrusts] = useState(false);

  // New-user
  const [newName,     setNewName]     = useState('');
  const [nameError,   setNameError]   = useState('');
  const [saving,      setSaving]      = useState(false);
  const [registered,  setRegistered]  = useState(false);

  useEffect(() => {
    if (!phone && !superuserId) navigate('/login', { replace: true });
  }, [phone, superuserId, navigate]);

  useEffect(() => {
    if (isNewUser || !superuserId || trustsFromState.length) return;
    let mounted = true;
    (async () => {
      setLoadingTrusts(true);
      const { data } = await fetchLinkedTrusts(superuserId);
      if (mounted) { setTrusts(data || []); setLoadingTrusts(false); }
    })();
    return () => { mounted = false; };
  }, [superuserId, trustsFromState.length, isNewUser]);

  const handleRegister = async (e) => {
    e.preventDefault();
    if (!newName.trim()) { setNameError('Please enter your name.'); return; }
    setSaving(true); setNameError('');
    const { data, error } = await insertSuperuser(constructedFullMobile, newName.trim());
    if (error) { setNameError('Could not register. Try again.'); setSaving(false); return; }
    setSuperuserId(data.id); setUserName(data.name); setRegistered(true); setSaving(false);
    await new Promise(r => setTimeout(r, 500));
    navigate('/dashboard', { state: { superuserId: data.id, userName: data.name, trust: null } });
  };

  const handleSelect = async (trust) => {
    if (entering) return;
    setSelected(trust.id); setEntering(true);
    await new Promise(r => setTimeout(r, 500));
    navigate('/dashboard', { state: { superuserId, userName, trust } });
  };

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return trusts;
    return trusts.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.legal_name?.toLowerCase().includes(q) ||
      t.remark?.toLowerCase().includes(q)
    );
  }, [search, trusts]);

  const handleSignOut = async () => {
    const storedName = typeof window !== 'undefined' ? window.sessionStorage.getItem(ADMIN_NAME_SESSION_KEY) : null;
    const storedMobile = typeof window !== 'undefined' ? window.sessionStorage.getItem(ADMIN_MOBILE_SESSION_KEY) : null;
    if (superuserId) {
      await recordAdminSessionAction({
        superuserId,
        name: userName || storedName || null,
        mobile: constructedFullMobile || storedMobile || null,
        actionType: 'logout',
        metadata: { source: 'select_trust_signout' },
      });
    }
    navigate('/login');
  };

  // ── NEW USER VIEW ────────────────────────────────────────────────────────
  if (isNewUser && !registered) {
    return (
      <div className="st-root">
        <div className="st-left">
          <div className="st-left-inner">
            <div className="st-brand">
              <div className="st-logo">
                <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                  <path d="M16 2L29 9V23L16 30L3 23V9L16 2Z" fill="url(#stG1)"/>
                  <path d="M16 8L12 18H20L16 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <defs>
                    <linearGradient id="stG1" x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#818CF8"/><stop offset="1" stopColor="#C4B5FD"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <span className="st-logo-text">AdminX</span>
            </div>
            <h1 className="st-left-title">Create your<br/>account 🚀</h1>
            <p className="st-left-sub">You're just one step away from managing your trust like a pro.</p>
            <div className="st-left-steps">
              {['Enter your name', 'System creates your account', 'Start managing'].map((s, i) => (
                <div className="st-step" key={i}>
                  <div className="st-step-num">{i + 1}</div>
                  <span>{s}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="st-deco-1"/><div className="st-deco-2"/>
        </div>

        <div className="st-right">
          <div className="st-form-wrap">
            <div className="st-user-chip">
              <div className="st-chip-avatar">{(fullMobile || phone).slice(-4)}</div>
              <span className="st-chip-label">Logged in as {fullMobile || phone}</span>
            </div>

            <div className="st-form-header">
              <h2 className="st-form-title">What's your name?</h2>
              <p className="st-form-sub">This will be used across your admin panel.</p>
            </div>

            <form onSubmit={handleRegister} className="st-form">
              <div className="st-field">
                <label className="st-label">Full Name</label>
                <input
                  id="new-user-name"
                  type="text"
                  className={`st-input ${nameError ? 'has-error' : ''}`}
                  placeholder="e.g. Rahul Sharma"
                  value={newName}
                  onChange={e => { setNewName(e.target.value); setNameError(''); }}
                  autoFocus
                  autoComplete="name"
                />
                {nameError && <p className="st-field-error">{nameError}</p>}
              </div>

              <button
                id="register-btn"
                type="submit"
                className={`st-btn ${saving ? 'loading' : ''} ${registered ? 'success' : ''}`}
                disabled={saving || registered}
              >
                {saving ? (
                  <span className="st-btn-inner"><span className="st-spinner"/>Creating Account...</span>
                ) : registered ? (
                  <span className="st-btn-inner">✅ Done! Redirecting...</span>
                ) : (
                  <span className="st-btn-inner">
                    Get Started
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                )}
              </button>
            </form>

            <button className="st-back-btn" onClick={handleSignOut}>
              ← Back to login
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── EXISTING USER — NO TRUST VIEW ────────────────────────────────────────
  if (!isNewUser && !loadingTrusts && trusts.length === 0) {
    return (
      <div className="st-root">
        <div className="st-left">
          <div className="st-left-inner">
            <div className="st-brand">
              <div className="st-logo">
                <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                  <path d="M16 2L29 9V23L16 30L3 23V9L16 2Z" fill="url(#stG2)"/>
                  <path d="M16 8L12 18H20L16 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                  <defs>
                    <linearGradient id="stG2" x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#818CF8"/><stop offset="1" stopColor="#C4B5FD"/>
                    </linearGradient>
                  </defs>
                </svg>
              </div>
              <span className="st-logo-text">AdminX</span>
            </div>
            <h1 className="st-left-title">No trust<br/>linked yet 🏗️</h1>
            <p className="st-left-sub">Create your first customizable trust app and start managing from day one.</p>
          </div>
          <div className="st-deco-1"/><div className="st-deco-2"/>
        </div>

        <div className="st-right">
          <div className="st-form-wrap">
            <div className="st-notrust-avatar">
              <div className="st-nt-icon">🏢</div>
            </div>
            <h2 className="st-form-title" style={{ textAlign: 'center' }}>No trust found</h2>
            <p className="st-form-sub" style={{ textAlign: 'center', marginBottom: 8 }}>
              Your account <strong>{userName}</strong> isn't linked to any trust yet.
              Contact your administrator or create a new app below.
            </p>

            <button 
              className="st-create-card"
              onClick={() => navigate('/create-trust', { state: { superuserId, userName } })}
            >
              <div className="st-create-icon">🚀</div>
              <div className="st-create-info">
                <p className="st-create-title">Create Your Own App</p>
                <p className="st-create-sub">Build your trust's digital presence from scratch</p>
              </div>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                <path d="M5 12h14M12 5l7 7-7 7" stroke="#6366F1" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>

            <button className="st-back-btn" onClick={handleSignOut}>← Sign out</button>
          </div>
        </div>
      </div>
    );
  }

  // ── EXISTING USER — TRUST SELECTOR ──────────────────────────────────────
  return (
    <div className="st-root">
      <div className="st-left">
        <div className="st-left-inner">
          <div className="st-brand">
            <div className="st-logo">
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <path d="M16 2L29 9V23L16 30L3 23V9L16 2Z" fill="url(#stG3)"/>
                <path d="M16 8L12 18H20L16 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                <defs>
                  <linearGradient id="stG3" x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#818CF8"/><stop offset="1" stopColor="#C4B5FD"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="st-logo-text">AdminX</span>
          </div>

          <div className="st-user-info">
            <div className="st-user-avatar">{initials(userName)}</div>
            <div>
              <p className="st-user-name">{userName}</p>
              <p className="st-user-label">Admin Account</p>
            </div>
          </div>

          <h1 className="st-left-title">Select your<br/>trust 🏥</h1>
          <p className="st-left-sub">
            {trusts.length} trust{trusts.length !== 1 ? 's' : ''} linked to your account.
          </p>

          <div className="st-left-steps">
            <div className="st-stat">
              <span className="st-stat-val">{trusts.length}</span>
              <span className="st-stat-label">Trusts</span>
            </div>
            <div className="st-stat-div"/>
            <div className="st-stat">
              <span className="st-stat-val">∞</span>
              <span className="st-stat-label">Features</span>
            </div>
          </div>
        </div>
        <div className="st-deco-1"/><div className="st-deco-2"/>
      </div>

      <div className="st-right">
        <div className="st-trust-wrap">
          <div className="st-trust-header">
            <h2 className="st-form-title">Choose a Trust</h2>
            <p className="st-form-sub">Click on a trust to enter its admin panel</p>
          </div>

          {/* Search */}
          <div className="st-search-wrap">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8"/>
              <path d="M16 16l4 4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
            </svg>
            <input
              id="trust-search"
              type="text"
              className="st-search-input"
              placeholder="Search trust..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              autoComplete="off"
            />
            {search && (
              <button className="st-search-clear" onClick={() => setSearch('')} type="button">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            )}
          </div>

          {/* Trust list */}
          <div className="st-trust-list">
            {loadingTrusts ? (
              [...Array(3)].map((_, i) => <div key={i} className="st-skeleton" style={{ animationDelay: `${i * 0.1}s` }}/>)
            ) : filtered.length === 0 ? (
              <div className="st-empty">
                <span>🔍</span>
                <p>No trusts found{search ? ` for "${search}"` : '.'}</p>
              </div>
            ) : (
              filtered.map((trust, i) => (
                <button
                  key={trust.id}
                  id={`trust-${trust.id}`}
                  className={`st-trust-card ${selected === trust.id ? 'selected' : ''}`}
                  onClick={() => handleSelect(trust)}
                  disabled={entering}
                  style={{ animationDelay: `${i * 0.07}s` }}
                >
                  <div
                    className="st-trust-avatar"
                    style={{
                      background: trust.icon_url
                        ? `url(${trust.icon_url}) center/cover no-repeat`
                        : GRADIENTS[i % GRADIENTS.length],
                    }}
                  >
                    {!trust.icon_url && initials(trust.name)}
                  </div>
                  <div className="st-trust-info">
                    <p className="st-trust-name">{trust.name}</p>
                    {trust.legal_name && trust.legal_name !== trust.name && (
                      <p className="st-trust-legal">{trust.legal_name}</p>
                    )}
                    {trust.remark && <p className="st-trust-remark">{trust.remark}</p>}
                  </div>
                  <div className="st-trust-arrow">
                    {selected === trust.id ? (
                      <span className="st-spinner"/>
                    ) : (
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                        <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    )}
                  </div>
                </button>
              ))
            )}
          </div>

          <button 
            className="st-create-new-app-btn" 
            onClick={() => navigate('/create-trust', { state: { superuserId, userName } })}
            title="Create a new trust app"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Create New App
          </button>

          <button className="st-back-btn" onClick={handleSignOut}>← Sign out</button>
        </div>
      </div>
    </div>
  );
}
