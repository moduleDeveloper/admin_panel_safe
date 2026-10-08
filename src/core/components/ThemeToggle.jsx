import { useState } from 'react';
import './ThemeToggle.css';
import { getStoredTheme, setTheme } from '../utils/theme';

// Light / Dark pill switch. Saved by core/utils/theme.js; the dark look itself is in core/index.css.
export default function ThemeToggle() {
  const [theme, setThemeState] = useState(getStoredTheme);
  const isDark = theme === 'dark';

  const toggle = () => {
    const next = isDark ? 'light' : 'dark';
    setTheme(next);
    setThemeState(next);
  };

  return (
    <div className="theme-toggle">
      <span className={`theme-toggle-label ${isDark ? '' : 'is-active'}`}>Light</span>
      <button
        type="button"
        className={`theme-toggle-track ${isDark ? 'is-dark' : ''}`}
        role="switch"
        aria-checked={isDark}
        aria-label="Dark theme"
        title={isDark ? 'Switch to light theme' : 'Switch to dark theme'}
        onClick={toggle}
      >
        <span className="theme-toggle-knob" />
        <span className="theme-toggle-dot theme-toggle-dot-lg" />
        <span className="theme-toggle-dot theme-toggle-dot-sm" />
      </button>
      <span className={`theme-toggle-label ${isDark ? 'is-active' : ''}`}>Dark</span>
    </div>
  );
}
