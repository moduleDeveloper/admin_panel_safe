import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './LoginPage.css';
import { findSuperuserByMobile, fetchLinkedTrusts, sendOtp } from '../services/authService';
import CountryPicker from '../components/CountryPicker';
import { DEFAULT_COUNTRY, normalizePhoneInput } from '../constants/countries';

const WELCOME_TEXT = 'Welcome back';

// Types "Welcome back" once, then stops; only the "W" and the hand keep animating.
// Untyped letters stay in the layout (invisible) so the centered title never shifts.
function WelcomeTitle() {
  const [typed, setTyped] = useState(() =>
    typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
      ? WELCOME_TEXT.length
      : 0,
  );
  const done = typed >= WELCOME_TEXT.length;

  useEffect(() => {
    if (done) return undefined;
    const timer = setTimeout(() => setTyped((count) => count + 1), typed === 0 ? 500 : 150);
    return () => clearTimeout(timer);
  }, [typed, done]);

  return (
    <span className={`lp-type ${done ? 'done' : ''}`} aria-label={WELCOME_TEXT}>
      <span aria-hidden="true">
        <span className={`lp-type-w ${typed > 0 ? 'shown' : ''}`}>{WELCOME_TEXT[0]}</span>
        {WELCOME_TEXT.slice(1, typed)}
        <span className="lp-type-rest">{WELCOME_TEXT.slice(Math.max(typed, 1))}</span>
      </span>
    </span>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [phone,   setPhone]   = useState('');
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState('');
  const [shake,   setShake]   = useState(false);
  const [country, setCountry] = useState(DEFAULT_COUNTRY);
  const countryCode = country.code;
  const isPhoneValid = phone.length >= country.min && phone.length <= country.max;
  const digitsHint = country.min === country.max ? `${country.min}` : `${country.min}-${country.max}`;

  // Accepts typed, pasted or autofilled numbers; a leading "+code" switches the country.
  const handlePhoneChange = (e) => {
    const next = normalizePhoneInput(e.target.value, country);
    if (next.country.iso !== country.iso) setCountry(next.country);
    setPhone(next.phone);
    if (error) setError('');
  };

  const handleCountryChange = (next) => {
    setCountry(next);
    // Hand focus to the number field so the user can type right away.
    requestAnimationFrame(() => document.getElementById('phone-input')?.focus());
    setPhone((prev) => prev.slice(0, next.max));
    if (error) setError('');
  };

  const triggerError = (msg) => {
    setError(msg);
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!isPhoneValid) { triggerError(`Please enter a valid ${digitsHint}-digit mobile number.`); return; }
    setLoading(true); setError('');
    try {
      const fullMobile = `${countryCode}${phone}`;
      const { data: superuser, error: superuserError } = await findSuperuserByMobile(phone, countryCode);
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
        state: { phone, countryCode, fullMobile, superuserId: superuser?.id || null, userName: superuser?.name || 'User', trusts, isNewUser },
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
              <img src="/setu-logo.png" alt="Setu AI" className="lp-logo-img" />
            </div>
            <span className="lp-logo-text">Setu AI</span>
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
            <h2 className="lp-form-title">
              <WelcomeTitle />
              <span className="lp-wave" aria-hidden="true">
                <svg className="lp-wave-svg" width="38" height="38" viewBox="0 0 32 32" fill="none">
                  <defs>
                    <linearGradient id="lpWaveGrad" x1="4" y1="2" x2="26" y2="30" gradientUnits="userSpaceOnUse">
                      <stop stopColor="#6366F1" /><stop offset="1" stopColor="#A855F7" />
                    </linearGradient>
                  </defs>
                  {/* motion lines that flash while the hand waves */}
                  <path className="lp-wave-line lp-wave-line-1" d="M25.5 4.5c1.6.9 2.8 2.3 3.4 4" stroke="#A855F7" strokeWidth="1.8" strokeLinecap="round" />
                  <path className="lp-wave-line lp-wave-line-2" d="M2.8 21.5c.5 1.9 1.6 3.5 3.1 4.6" stroke="#6366F1" strokeWidth="1.8" strokeLinecap="round" />
                  <g transform="translate(4 5) scale(0.95)">
                    <g className="lp-wave-hand">
                    <path
                      d="M18 11V6a2 2 0 0 0-4 0M14 10V4a2 2 0 0 0-4 0v2M10 10.5V6a2 2 0 0 0-4 0v8M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"
                      stroke="url(#lpWaveGrad)"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="rgba(139,92,246,0.10)"
                    />
                    </g>
                  </g>
                </svg>
              </span>
            </h2>
            <p className="lp-form-sub">Enter your mobile number to sign in</p>
          </div>

          <form className="lp-form" onSubmit={handleSendOtp}>
            <div className="lp-field">
              <label className="lp-label" htmlFor="phone-input">Mobile Number</label>
              <div className={`lp-phone-wrap ${error ? 'has-error' : ''} ${shake ? 'shake' : ''}`}>
                <CountryPicker value={country} onChange={handleCountryChange} disabled={loading} />
                <input
                  id="phone-input"
                  type="tel"
                  inputMode="numeric"
                  className="lp-phone-input"
                  placeholder={country.iso === 'IN' ? '98765 43210' : `${digitsHint} digit number`}
                  value={phone}
                  onChange={handlePhoneChange}
                  autoComplete="tel"
                  autoFocus
                />
                {isPhoneValid && (
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
              className={`lp-btn ${loading ? 'loading' : ''} ${isPhoneValid && !loading ? 'ready' : ''}`}
              disabled={loading}
            >
              {loading ? (
                <span className="lp-btn-inner"><span className="lp-spinner"/>Sending OTP...</span>
              ) : (
                <span className="lp-btn-inner">
                  Get OTP
                  <svg className="lp-btn-arrow" width="18" height="18" viewBox="0 0 24 24" fill="none">
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
