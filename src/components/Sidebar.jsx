import { useEffect, useState } from 'react';
import './Sidebar.css';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  fetchLinkedTrusts,
  recordAdminSessionAction,
  ADMIN_SUPERUSER_SESSION_KEY,
  ADMIN_NAME_SESSION_KEY,
  ADMIN_MOBILE_SESSION_KEY,
} from '../services/authService';

const SUPERUSER_SESSION_KEY = ADMIN_SUPERUSER_SESSION_KEY;

const navItems = [
  {
    id: 'nav-dashboard',
    label: 'Dashboard',
    route: '/dashboard',
    navKey: 'dashboard',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
        <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="currentColor" strokeWidth="1.8"/>
      </svg>
    ),
  },
  {
    id: 'nav-menu',
    label: 'Menu',
    route: '/dashboard',
    navKey: 'menu',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 7h16M4 12h16M4 17h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'nav-user-management',
    label: 'User Management',
    route: '/user-management',
    navKey: 'menu',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <circle cx="8.5" cy="8" r="2.8" stroke="currentColor" strokeWidth="1.8" />
        <path d="M4.2 18c0-2.6 2.1-4.6 4.7-4.6s4.7 2 4.7 4.6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <rect x="14.2" y="10.8" width="5.6" height="7.2" rx="1.2" stroke="currentColor" strokeWidth="1.8" />
        <line x1="17" y1="12.8" x2="17" y2="16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
        <line x1="15.4" y1="14.4" x2="18.6" y2="14.4" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'nav-company-details',
    label: 'Company Details',
    route: '/dashboard',
    navKey: 'company-details',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <polyline points="14 2 14 8 20 8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <line x1="8" y1="13" x2="16" y2="13" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'nav-app-design',
    label: 'App Design',
    route: '/dashboard',
    navKey: 'app-design',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="currentColor" strokeWidth="1.8"/>
        <circle cx="8.5" cy="8.5" r="1.5" fill="currentColor"/>
        <polyline points="21 15 16 10 5 21" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'nav-home-page',
    label: 'Home Page',
    route: '/dashboard',
    navKey: 'home-page',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-10.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'nav-quick-actions',
    label: 'Quick Actions',
    route: '/dashboard',
    navKey: 'quick-actions',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M4 6h16M4 12h10M4 18h7" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="17" cy="12" r="2" fill="currentColor"/>
        <circle cx="14" cy="18" r="2" fill="currentColor"/>
      </svg>
    ),
  },
  {
    id: 'nav-social-media',
    label: 'Social Media',
    route: '/social-media',
    navKey: 'social-media',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="5" width="17" height="14" rx="3" stroke="currentColor" strokeWidth="1.8" />
        <circle cx="8.5" cy="12" r="1.5" fill="currentColor" />
        <circle cx="12" cy="12" r="1.5" fill="currentColor" />
        <circle cx="15.5" cy="12" r="1.5" fill="currentColor" />
      </svg>
    ),
  },
  {
    id: 'nav-product',
    label: 'Product',
    route: '/social-media/product',
    navKey: 'social-media',
    icon: (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
        <path d="M3 7.5L12 3l9 4.5-9 4.5L3 7.5Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M3 7.5V16.5L12 21l9-4.5V7.5" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 12v9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function Sidebar({ trustName = 'Trust', onDashboard, onLogout }) {
  const MOBILE_BREAKPOINT = 980;
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'dashboard';
  const trusteesSearchParams = new URLSearchParams(location.search || '');
  const trusteesViewFromQuery = trusteesSearchParams.get('view');
  const currentTrusteesView =
    location.state?.trusteesView ||
    (trusteesViewFromQuery === 'logo' || trusteesViewFromQuery === 'default' ? trusteesViewFromQuery : '') ||
    '';
  const storedSuperuserId = typeof window !== 'undefined' ? window.sessionStorage.getItem(SUPERUSER_SESSION_KEY) : null;
  const resolvedSuperuserId = superuserId || trust?.superuser_id || storedSuperuserId || null;
  const [isMobile, setIsMobile] = useState(
    () => typeof window !== 'undefined' && window.innerWidth <= MOBILE_BREAKPOINT
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [switchingTrust, setSwitchingTrust] = useState(false);
  const [switchTrustError, setSwitchTrustError] = useState('');

  useEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const mediaQuery = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT}px)`);
    const handleChange = (event) => {
      setIsMobile(event.matches);
      if (!event.matches) setMenuOpen(false);
    };

    setIsMobile(mediaQuery.matches);
    if (mediaQuery.addEventListener) {
      mediaQuery.addEventListener('change', handleChange);
    } else {
      mediaQuery.addListener(handleChange);
    }

    return () => {
      if (mediaQuery.removeEventListener) {
        mediaQuery.removeEventListener('change', handleChange);
      } else {
        mediaQuery.removeListener(handleChange);
      }
    };
  }, []);

  useEffect(() => {
    setMenuOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!resolvedSuperuserId || typeof window === 'undefined') return;
    window.sessionStorage.setItem(SUPERUSER_SESSION_KEY, String(resolvedSuperuserId));
  }, [resolvedSuperuserId]);

  useEffect(() => {
    document.body.classList.toggle('sb-mobile-lock', isMobile && menuOpen);
    return () => {
      document.body.classList.remove('sb-mobile-lock');
    };
  }, [isMobile, menuOpen]);

  const closeMobileMenu = () => {
    if (isMobile) setMenuOpen(false);
  };

  const handleSwitchTrust = async () => {
    if (switchingTrust) return;
    if (!resolvedSuperuserId) {
      setSwitchTrustError('Unable to detect account. Please login again once.');
      return;
    }

    setSwitchTrustError('');
    setSwitchingTrust(true);
    const { data, error } = await fetchLinkedTrusts(resolvedSuperuserId);
    if (error) {
      setSwitchTrustError(error.message || 'Unable to load trusts.');
      setSwitchingTrust(false);
      return;
    }

    closeMobileMenu();
    navigate('/select-trust', {
      state: {
        superuserId: resolvedSuperuserId,
        userName,
        trusts: data || [],
        phone: location.state?.phone || '',
        fullMobile: location.state?.fullMobile || '',
        isNewUser: false,
      },
    });
    setSwitchingTrust(false);
  };

  const openTrustDetails = () => {
    const trustId = trust?.id || null;
    if (!trustId) {
      if (onDashboard) onDashboard();
      else navigate('/dashboard', { state: { userName, trust, superuserId: resolvedSuperuserId, sidebarNavKey: currentSidebarNavKey } });
      closeMobileMenu();
      return;
    }

    navigate('/trust-details', {
      state: {
        trustId,
        trustName,
        userName,
        trust,
        superuserId: resolvedSuperuserId,
        sidebarNavKey: currentSidebarNavKey,
        returnTo: '/dashboard',
      },
    });
    closeMobileMenu();
  };

  return (
    <>
      <button
        type="button"
        className={`sb-mobile-trigger ${menuOpen ? 'is-open' : ''}`}
        onClick={() => setMenuOpen((prev) => !prev)}
        aria-label={menuOpen ? 'Close menu' : 'Open menu'}
        aria-expanded={menuOpen}
      >
        <span />
        <span />
        <span />
      </button>

      {isMobile && (
        <button
          type="button"
          className={`sb-backdrop ${menuOpen ? 'show' : ''}`}
          onClick={closeMobileMenu}
          aria-label="Close menu overlay"
          tabIndex={menuOpen ? 0 : -1}
        />
      )}

      <aside className={`sb-sidebar ${isMobile ? 'mobile' : ''} ${menuOpen ? 'open' : ''}`}>
        <div
          className="sb-brand"
          role="button"
          tabIndex={0}
          onClick={openTrustDetails}
          onKeyDown={(event) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              openTrustDetails();
            }
          }}
        >
          <div className="sb-brand-logo">
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none">
              <path d="M16 2L29 9V23L16 30L3 23V9L16 2Z" fill="url(#sbGrad)" />
              <path d="M16 8L12 18H20L16 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              <defs>
                <linearGradient id="sbGrad" x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#6366F1" /><stop offset="1" stopColor="#8B5CF6" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="sb-brand-text">
            <span className="sb-brand-name" title={trustName}>{trustName}</span>
            <span className="sb-brand-sub">Admin Panel</span>
          </div>
          {isMobile && (
            <button
              type="button"
              className="sb-close-btn"
              onClick={(event) => {
                event.stopPropagation();
                closeMobileMenu();
              }}
              aria-label="Close menu"
            >
              ×
            </button>
          )}
        </div>

        <div className="sb-section-label">MAIN MENU</div>
        <nav className="sb-nav">
          {navItems.map((item) => {
            const isTrusteesCompanyView = item.id === 'nav-company-details' && location.pathname === '/trustees' && currentTrusteesView !== 'logo';
            const isTrusteesAppDesignView = item.id === 'nav-app-design' && location.pathname === '/trustees' && currentTrusteesView === 'logo';
            const isCompanyDetailsAccountsView =
              item.id === 'nav-company-details' && location.pathname === '/social-media/accounts-details';
            const isActive =
              isCompanyDetailsAccountsView ||
              isTrusteesCompanyView ||
              isTrusteesAppDesignView ||
              (location.pathname === item.route && (
                item.route === '/dashboard'
                  ? item.navKey === currentSidebarNavKey
                  : item.route === '/trustees'
                    ? item.navState?.trusteesView === currentTrusteesView
                    : true
              ));
            return (
              <button
                key={item.id}
                className={`sb-item ${isActive ? 'active' : ''}`}
                onClick={() => {
                  if (item.id === 'nav-dashboard' && onDashboard) {
                    onDashboard();
                    closeMobileMenu();
                    return;
                  }
                  navigate(item.route, {
                    state: {
                      userName,
                      trust,
                      superuserId: resolvedSuperuserId,
                      ...(item.navState || {}),
                      ...(item.navKey ? { sidebarNavKey: item.navKey } : {}),
                    },
                  });
                  closeMobileMenu();
                }}
              >
                <span className="sb-icon">{item.icon}</span>
                <span className="sb-label">{item.label}</span>
                <span className="sb-indicator" />
              </button>
            );
          })}
        </nav>

        <div className="sb-bottom">
          <button
            className="sb-switch-trust"
            onClick={handleSwitchTrust}
            disabled={switchingTrust}
            title="Switch Trust"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M7 4h10a3 3 0 0 1 3 3v3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <polyline points="17 4 20 7 17 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M17 20H7a3 3 0 0 1-3-3v-3" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
              <polyline points="7 20 4 17 7 14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>{switchingTrust ? 'Switching...' : 'Switch Trust'}</span>
          </button>
          {switchTrustError && <div className="sb-bottom-error">{switchTrustError}</div>}
          <button
            className="sb-logout"
            onClick={async () => {
              const storedName = typeof window !== 'undefined' ? window.sessionStorage.getItem(ADMIN_NAME_SESSION_KEY) : null;
              const storedMobile = typeof window !== 'undefined' ? window.sessionStorage.getItem(ADMIN_MOBILE_SESSION_KEY) : null;
              if (resolvedSuperuserId) {
                await recordAdminSessionAction({
                  superuserId: resolvedSuperuserId,
                  name: userName || storedName || null,
                  mobile: location.state?.fullMobile || location.state?.phone || storedMobile || null,
                  actionType: 'logout',
                  metadata: await (async () => {
  try {
    const geo = await fetch('https://ipapi.co/json/').then(r => r.json());
    return {
      source: 'sidebar_logout',
      country: geo.country_code || null,
      city: geo.city || null,
      ip: geo.ip || null,
      device: navigator.platform || null,
    };
  } catch {
    return { source: 'sidebar_logout' };
  }
})(),
                });
              }
              if (onLogout) onLogout();
              else navigate('/login');
              closeMobileMenu();
            }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <polyline points="16 17 21 12 16 7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="21" y1="12" x2="9" y2="12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </aside>
    </>
  );
}
