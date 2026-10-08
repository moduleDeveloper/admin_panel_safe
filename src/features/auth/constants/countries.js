// Countries offered on the login screen. India is the default.
// min/max are the allowed local mobile-number lengths (without the country code).
export const COUNTRIES = [
  { iso: 'IN', name: 'India', code: '+91', flag: '🇮🇳', min: 10, max: 10 },
  { iso: 'US', name: 'United States', code: '+1', flag: '🇺🇸', min: 10, max: 10 },
  { iso: 'CA', name: 'Canada', code: '+1', flag: '🇨🇦', min: 10, max: 10 },
  { iso: 'GB', name: 'United Kingdom', code: '+44', flag: '🇬🇧', min: 10, max: 10 },
  { iso: 'AE', name: 'United Arab Emirates', code: '+971', flag: '🇦🇪', min: 9, max: 9 },
  { iso: 'SA', name: 'Saudi Arabia', code: '+966', flag: '🇸🇦', min: 9, max: 9 },
  { iso: 'QA', name: 'Qatar', code: '+974', flag: '🇶🇦', min: 8, max: 8 },
  { iso: 'KW', name: 'Kuwait', code: '+965', flag: '🇰🇼', min: 8, max: 8 },
  { iso: 'OM', name: 'Oman', code: '+968', flag: '🇴🇲', min: 8, max: 8 },
  { iso: 'BH', name: 'Bahrain', code: '+973', flag: '🇧🇭', min: 8, max: 8 },
  { iso: 'SG', name: 'Singapore', code: '+65', flag: '🇸🇬', min: 8, max: 8 },
  { iso: 'AU', name: 'Australia', code: '+61', flag: '🇦🇺', min: 9, max: 9 },
  { iso: 'NP', name: 'Nepal', code: '+977', flag: '🇳🇵', min: 10, max: 10 },
  { iso: 'BD', name: 'Bangladesh', code: '+880', flag: '🇧🇩', min: 10, max: 10 },
  { iso: 'LK', name: 'Sri Lanka', code: '+94', flag: '🇱🇰', min: 9, max: 9 },
];

export const DEFAULT_COUNTRY = COUNTRIES[0];

const digitsOnly = (value = '') => String(value).replace(/\D/g, '');

/**
 * Turns whatever the user typed/pasted/autofilled into a local number for a country.
 * Handles "+91 98765 43210", "919876543210", "09876543210" and plain "9876543210".
 * If the input starts with "+" and a different country code, that country is returned.
 */
export function normalizePhoneInput(raw, currentCountry = DEFAULT_COUNTRY) {
  const text = String(raw || '').trim();
  let country = currentCountry;
  let digits = digitsOnly(text);

  if (text.startsWith('+')) {
    // Longest code first so "+971" isn't read as "+97" etc.; keep the current
    // country when several share a code (US/Canada both use +1).
    const matches = COUNTRIES
      .filter((item) => digits.startsWith(digitsOnly(item.code)))
      .sort((a, b) => digitsOnly(b.code).length - digitsOnly(a.code).length);
    if (matches.length) {
      const longest = digitsOnly(matches[0].code).length;
      const best = matches.filter((item) => digitsOnly(item.code).length === longest);
      country = best.find((item) => item.iso === currentCountry.iso) || best[0];
      digits = digits.slice(longest);
    }
  } else if (digits.length > country.max) {
    // Only strip when the length is exactly "prefix + a full local number", so typing one
    // digit too many never silently eats the start of a real number.
    const cc = digitsOnly(country.code);
    const fits = (length) => length >= country.min && length <= country.max;
    if (digits.startsWith(cc) && fits(digits.length - cc.length)) {
      digits = digits.slice(cc.length);
    } else if (digits.startsWith('0') && fits(digits.length - 1)) {
      digits = digits.slice(1);
    }
  }

  return { country, phone: digits.slice(0, country.max) };
}
