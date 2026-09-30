import { useState, useRef, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import './LoginPage.css';
import './OtpPage.css';
import {
  verifyOtp,
  sendOtp,
  recordAdminSessionAction,
  ADMIN_SUPERUSER_SESSION_KEY,
  ADMIN_NAME_SESSION_KEY,
  ADMIN_MOBILE_SESSION_KEY,
} from '../services/authService';

const OTP_LENGTH = 6;
const RESEND_COUNTDOWN = 30;

export default function OtpPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const {
    phone = '',
    countryCode = '+91',
    fullMobile = '',
    superuserId = null,
    userName = 'User',
    trusts = [],
    isNewUser = false,
  } = location.state || {};

  useEffect(() => {
    if (!phone) {
      navigate('/login', { replace: true });
    }
  }, [phone, navigate]);

  const [otp, setOtp] = useState(Array(OTP_LENGTH).fill(''));
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(isNewUser ? RESEND_COUNTDOWN : 0);
  const [resending, setResending] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const [showOtp, setShowOtp] = useState(false);
  const inputsRef = useRef([]);

  useEffect(() => { inputsRef.current[0]?.focus(); }, []);

  useEffect(() => {
    if (!isNewUser || countdown <= 0) return;
    const id = setInterval(() => setCountdown(c => c - 1), 1000);
    return () => clearInterval(id);
  }, [countdown, isNewUser]);

  const handleChange = (e, idx) => {
    const val = e.target.value.replace(/\D/g, '').slice(-1);
    const next = [...otp];
    next[idx] = val;
    setOtp(next);
    if (error) setError('');
    if (val && idx < OTP_LENGTH - 1) inputsRef.current[idx + 1]?.focus();
  };

  const handleKeyDown = (e, idx) => {
    if (e.key === 'Backspace' && !otp[idx] && idx > 0) inputsRef.current[idx - 1]?.focus();
    if (e.key === 'ArrowLeft'  && idx > 0)              inputsRef.current[idx - 1]?.focus();
    if (e.key === 'ArrowRight' && idx < OTP_LENGTH - 1) inputsRef.current[idx + 1]?.focus();
  };

  const handlePaste = (e) => {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, OTP_LENGTH);
    if (!text) return;
    e.preventDefault();
    const next = Array(OTP_LENGTH).fill('');
    text.split('').forEach((ch, i) => { next[i] = ch; });
    setOtp(next);
    inputsRef.current[Math.min(text.length, OTP_LENGTH - 1)]?.focus();
  };

  const handleVerify = async (e) => {
    e.preventDefault();
    const code = otp.join('');
    if (code.length < OTP_LENGTH) {
      setError('Please enter the complete 6-digit OTP.');
      setShakeKey(k => k + 1);
      return;
    }
    setLoading(true);
    const { valid, reason } = await verifyOtp(fullMobile || phone, code);

    if (valid) {
      setLoading(false);
      setSuccess(true);
      if (typeof window !== 'undefined' && superuserId) {
        window.sessionStorage.setItem(ADMIN_SUPERUSER_SESSION_KEY, String(superuserId));
        window.sessionStorage.setItem(ADMIN_NAME_SESSION_KEY, String(userName || 'Admin'));
        window.sessionStorage.setItem(ADMIN_MOBILE_SESSION_KEY, String(fullMobile || phone || ''));
      }
      if (superuserId) {
        await recordAdminSessionAction({
          superuserId,
          name: userName || null,
          mobile: fullMobile || phone || null,
          actionType: 'login',
          metadata: { source: 'otp_verify' },
        });
      }
      await new Promise(res => setTimeout(res, 700));

      navigate('/select-trust', {
        state: {
          superuserId,
          userName,
          trusts,
          phone,
          countryCode,
          fullMobile,
          isNewUser,
        },
      });
    } else {
      setLoading(false);
      if (reason === 'secretcode_missing') {
        setError('Secret code not set for this account. Please contact support.');
      } else if (reason === 'secretcode_mismatch') {
        setError('Invalid secret code. Please try again.');
      } else {
        setError('Invalid OTP. Please try again.');
      }
      setShakeKey(k => k + 1);
      setOtp(Array(OTP_LENGTH).fill(''));
      inputsRef.current[0]?.focus();
    }
  };

  const handleResend = async () => {
    if (!isNewUser || countdown > 0) return;
    setResending(true);
    setOtp(Array(OTP_LENGTH).fill(''));
    setError('');
    await sendOtp(fullMobile || `${countryCode}${phone}`);
    setResending(false);
    setCountdown(RESEND_COUNTDOWN);
    inputsRef.current[0]?.focus();
  };

  const maskedPhone = phone ? `${phone.slice(0, 2)}****${phone.slice(-2)}` : '**********';

  return (
    <div className="lp-root">
      <div className="lp-left">
        <div className="lp-left-inner">
          <div className="lp-brand">
            <div className="lp-logo">
              <img src="/setu-logo.png" alt="Setu AI" className="lp-logo-img" />
            </div>
            <span className="lp-logo-text">Setu AI</span>
          </div>

          <div className="lp-hero">
            <h1 className="lp-hero-title">Secure access<br/>to your portal.</h1>
            <p className="lp-hero-sub">
              Verify your identity to continue to the management dashboard.
            </p>
          </div>
        </div>

        <div className="lp-deco-circle lp-deco-1" />
        <div className="lp-deco-circle lp-deco-2" />
        <div className="lp-deco-circle lp-deco-3" />
      </div>

      <div className="lp-right">
        <div className="lp-form-wrap">
          <div className="lp-form-header">
            <h2 className="lp-form-title">Enter OTP</h2>
            <p className="lp-form-sub">Enter the 6-digit OTP to continue<span className="lp-highlight">{countryCode} {maskedPhone}</span></p>
          </div>

          <form className="lp-form" onSubmit={handleVerify}>
            <div className="lp-field">
              <div className="lp-otp-label-row">
                <label className="lp-label">Enter OTP</label>
                <button
                  type="button"
                  className="lp-otp-toggle"
                  onClick={() => setShowOtp(v => !v)}
                  aria-label={showOtp ? 'Hide OTP' : 'Show OTP'}
                  aria-pressed={showOtp}
                >
                  {showOtp ? (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M3 3l18 18M10.6 10.6a2 2 0 002.8 2.8M9.9 5.1A9.8 9.8 0 0112 5c5 0 9 4.5 10 7-.4 1-1.3 2.4-2.6 3.7M6.6 6.6C4.4 8 2.9 10.1 2 12c1 2.5 5 7 10 7 1.8 0 3.4-.5 4.8-1.3" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                  ) : (
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                      <path d="M2 12c1-2.5 5-7 10-7s9 4.5 10 7c-1 2.5-5 7-10 7S3 14.5 2 12z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round"/>
                      <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8"/>
                    </svg>
                  )}
                  {showOtp ? 'Hide' : 'Show'}
                </button>
              </div>
              <div className={`lp-otp-wrap ${error ? 'has-error shake' : ''}`} key={shakeKey}>
                <div className="lp-otp-boxes">
                  {otp.map((digit, i) => (
                    <input key={i} ref={el => inputsRef.current[i] = el} id={`otp-input-${i}`}
                      type={showOtp ? 'text' : 'password'} inputMode="numeric" maxLength={1} value={digit}
                      onChange={e => handleChange(e, i)} onKeyDown={e => handleKeyDown(e, i)}
                      onPaste={handlePaste}
                      className={`lp-otp-box ${digit ? 'filled' : ''} ${success ? 'success' : ''}`}
                      autoComplete="one-time-code" />
                  ))}
                </div>
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
              {success && (
                <p className="lp-success">
                  <svg width="13" height="13" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5"/>
                    <path d="M5 8l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Verified! Redirecting...
                </p>
              )}
            </div>

            <button
              id="verify-otp-btn"
              type="submit"
              className={`lp-btn ${loading ? 'loading' : ''} ${success ? 'success' : ''}`}
              disabled={loading || success}
            >
              {success ? (
                <span className="lp-btn-inner">
                  <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
                    <path d="M4 9l3.5 3.5L14 6" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                  Verified!
                </span>
              ) : loading ? (
                <span className="lp-btn-inner"><span className="lp-spinner"/>Verifying...</span>
              ) : (
                <span className="lp-btn-inner">
                  Verify OTP
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M12 5l7 7-7 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </span>
              )}
            </button>
          </form>

          {isNewUser && (
            <div className="lp-resend">
              <span>Didn't receive the code?</span>
              {countdown > 0
                ? <span className="lp-resend-count">Resend in <strong>{countdown}s</strong></span>
                : <button type="button" className="lp-resend-btn" onClick={handleResend} disabled={resending}>
                    {resending ? 'Sending...' : 'Resend OTP'}
                  </button>}
            </div>
          )}

          <button className="lp-back" onClick={() => navigate('/login')}>
            <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
              <path d="M10 12L6 8L10 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            Change mobile number
          </button>

          <p className="lp-footer">© 2026 Thermal Engineers and Insulators Private Limited (TEI) · All rights reserved</p>
        </div>
      </div>
    </div>
  );
}

