// Light / dark theme. The choice is stored in localStorage and applied as
// <html data-theme="light|dark">; the dark look itself lives in core/index.css.
const STORAGE_KEY = 'admin:theme';

export function getStoredTheme() {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

export function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme === 'dark' ? 'dark' : 'light');
}

export function setTheme(theme) {
  applyTheme(theme);
  try {
    window.localStorage.setItem(STORAGE_KEY, theme === 'dark' ? 'dark' : 'light');
  } catch {
    // storage blocked: the theme still applies for this session
  }
}
