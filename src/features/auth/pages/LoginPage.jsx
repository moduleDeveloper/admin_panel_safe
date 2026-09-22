import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';
import { findSuperuserByMobile, fetchLinkedTrusts, sendOtp } from '../services/authService';

const COUNTRY_CODE = '+91';

export default function LoginPage() {
  const navigate = useNavigate();
  const [phone,   setPhone]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [shake,   setShake]   = useState(false);

  const handlePhoneChange = (e) => {
    const val = e.target.value.replace(/\D/g, '').slice(0, 10);
    setPhone(val);
    if (error) setError('');
  };

  const triggerError = (msg) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (phone.length < 10) { triggerError('Please enter a valid 10-digit mobile number.'); return; }
    setLoading(true); setError('');
    try {
      const fullMobile = `${COUNTRY_CODE}${phone}`;
      const { data: superuser, error: superuserError } = await findSuperuserByMobile(phone, COUNTRY_CODE);
      if (superuserError) throw superuserError;

      const isNewUser = !superuser;
      let trusts = [];
      if (!isNewUser) {
        if (superuser.is_active === false) { triggerError('This account is inactive. Contact support.'); return; }
        const { data: fetchedTrusts, error: trustsError } = await fetchLinkedTrusts(superuser.id);
        if (trustsError) {
          triggerError(`Trust load failed: ${trustsError.message || 'Unknown error'}`);
          return;
        }
        trusts = fetchedTrusts || [];
      }
      if (isNewUser) { await sendOtp(fullMobile); }

      navigate('/verify-otp', {
        state: { phone, countryCode: COUNTRY_CODE, fullMobile, superuserId: superuser?.id || null, userName: superuser?.name || 'User', trusts, isNewUser },
      });
    } catch (err) {
      triggerError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="lp-root">
      {/* Left panel — branding */}
      <div className="lp-left">
        <div className="lp-left-inner">
          <div className="lp-brand">
            <div className="lp-logo">
              <svg width="28" height="28" viewBox="0 0 32 32" fill="none">
                <path d="M16 2L29 9V23L16 30L3 23V9L16 2Z" fill="url(#lpGrad)"/>
                <path d="M16 8L12 18H20L16 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
                <defs>
                  <linearGradient id="lpGrad" x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#818CF8"/><stop offset="1" stopColor="#C4B5FD"/>
                  </linearGradient>
                </defs>
              </svg>
            </div>
            <span className="lp-logo-text">Thermal Engineers and Insulators Private Limited (TEI)</span>
          </div>

          <div className="lp-hero">
            <h1 className="lp-hero-title">Manage your<br/>trust with ease.</h1>
            <p className="lp-hero-sub">
              A powerful admin panel to manage members, appointments, features, and more — all in one place.
            </p>
          </div>

          <div className="lp-features">
            {[
              { icon: '🔐', text: 'Secure OTP login' },
              { icon: '🏥', text: 'Multi-trust management' },
              { icon: '⚡', text: 'Real-time updates' },
            ].map((f, i) => (
              <div className="lp-feature-row" key={i}>
                <span className="lp-feature-icon">{f.icon}</span>
                <span className="lp-feature-text">{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Decorative circles */}
        <div className="lp-deco-circle lp-deco-1" />
        <div className="lp-deco-circle lp-deco-2" />
        <div className="lp-deco-circle lp-deco-3" />
      </div>

      {/* Right panel — form */}
      <div className="lp-right">
        <div className="lp-form-wrap">
          <div className="lp-form-header">
            <h2 className="lp-form-title">Welcome back 👋</h2>
            <p className="lp-form-sub">Enter your mobile number to sign in</p>
          </div>

          <form className="lp-form" onSubmit={handleSendOtp}>
            <div className="lp-field">
              <label className="lp-label">Mobile Number</label>
              <div className={`lp-phone-wrap ${error ? 'has-error' : ''} ${shake ? 'shake' : ''}`}>
                <div className="lp-cc">
                  <span className="lp-flag">🇮🇳</span>
                  <span className="lp-cc-text">+91</span>
                </div>
                <input
                  id="phone-input"
                  type="tel"
                  inputMode="numeric"
                  className="lp-phone-input"
                  placeholder="98765 43210"
                  value={phone}
                  onChange={handlePhoneChange}
                  autoComplete="tel"
                  autoFocus
                />
                {phone.length === 10 && (
                  <span className="lp-check">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M5 12l4 4L19 8" stroke="#10B981" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  </span>
                )}
              </div>
              {error && (
                <p className="lp-error">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
                  </svg>
                  {error}
                </p>
              )}
            </div>

            <button
              id="send-otp-btn"
              type="submit"
              className={`lp-btn ${loading ? 'loading' : ''}`}
              disabled={loading}
            >
              {loading ? (
                <span className="lp-btn-inner"><span className="lp-spinner"/>Sending OTP...</span>
              ) : (
                <span className="lp-btn-inner">
                  Get OTP
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              )}
            </button>
          </form>

          <div className="lp-badges">
            <span className="lp-badge">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <path d="M8 2L13 4.5V9C13 12 10.5 14.5 8 15C5.5 14.5 3 12 3 9V4.5L8 2Z" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M6 8l1.5 1.5L10.5 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              Encrypted & Secure
            </span>
            <span className="lp-badge">
              <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
                <rect x="3" y="7" width="10" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
                <path d="M5.5 7V5C5.5 3.6 6.6 2.5 8 2.5C9.4 2.5 10.5 3.6 10.5 5V7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              </svg>
              OTP Verified
            </span>
          </div>

          <p className="lp-footer">© 2026 Thermal Engineers and Insulators Private Limited (TEI) · All rights reserved</p>
        </div>
      </div>
    </div>
  );
}
