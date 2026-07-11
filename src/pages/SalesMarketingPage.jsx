import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import '../pages/Dashboard.css';
import './SalesMarketingPage.css';

export default function SalesMarketingPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};
  const trustName = trust?.name || 'Trust';

  return (
    <div className="dash-root">
      <Sidebar
        trustName={trustName}
        onDashboard={() =>
          navigate('/dashboard', {
            state: { userName, trust, superuserId, sidebarNavKey: 'dashboard' },
          })
        }
        onLogout={() => navigate('/login')}
      />

      <main className="dash-main">
        <header className="dash-topbar">
          <div className="topbar-left">
            <h1 className="page-title">Sales and Marketing</h1>
            <p className="page-subtitle">
              Hi, <strong>{userName}</strong> 👋
            </p>
          </div>
        </header>

        <div className="dash-content">
          <div className="trust-badge-container">
            <div className="trust-badge">
              <svg width="24" height="24" viewBox="0 0 32 32" fill="none">
                <path d="M16 2L29 9V23L16 30L3 23V9L16 2Z" fill="url(#trustGradBadgeSM)" />
                <path d="M16 8L12 18H20L16 24" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                <defs>
                  <linearGradient id="trustGradBadgeSM" x1="3" y1="2" x2="29" y2="30" gradientUnits="userSpaceOnUse">
                    <stop stopColor="#6366F1" /><stop offset="1" stopColor="#8B5CF6" />
                  </linearGradient>
                </defs>
              </svg>
              <span className="trust-badge-text">{trustName}</span>
            </div>
          </div>

          <div className="features-section-header">
            <h1 className="features-title">Modules</h1>
            <p className="features-subtitle">Select a module to manage</p>
          </div>

          <div className="modules-grid">
            <button
              className="module-card"
              style={{ background: 'linear-gradient(135deg, #EC4899 0%, #F59E0B 100%)' }}
              title="Lead Management System"
              onClick={() =>
                navigate('/sales-marketing/leads', {
                  state: { userName, trust, superuserId, sidebarNavKey: 'sales-marketing' },
                })
              }
            >
              <div className="module-card-shine" />
              <div className="module-icon-wrap">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                  <path d="M3 17l5-5 4 4 8-8" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M15 8h5v5" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="module-card-body">
                <span className="module-card-label">Lead Management System</span>
                <span className="module-card-desc">Manage sales leads and pipeline</span>
              </div>
              <div className="module-card-arrow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            <button
              className="module-card"
              style={{ background: 'linear-gradient(135deg, #2563EB 0%, #14B8A6 100%)' }}
              title="Campaign"
              onClick={() =>
                navigate('/sales-marketing/campaign', {
                  state: { userName, trust, superuserId, sidebarNavKey: 'sales-marketing' },
                })
              }
            >
              <div className="module-card-shine" />
              <div className="module-icon-wrap">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                  <path d="M4 12h7l2-6 3 12 2-6h2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="module-card-body">
                <span className="module-card-label">Campaign</span>
                <span className="module-card-desc">Ready for API integration</span>
              </div>
              <div className="module-card-arrow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>

            <button
              className="module-card"
              style={{ background: 'linear-gradient(135deg, #7C3AED 0%, #06B6D4 100%)' }}
              title="Add Leads"
              onClick={() =>
                navigate('/sales-marketing/add-leads', {
                  state: { userName, trust, superuserId, sidebarNavKey: 'sales-marketing' },
                })
              }
            >
              <div className="module-card-shine" />
              <div className="module-icon-wrap">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none">
                  <path d="M12 5v14M5 12h14" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <div className="module-card-body">
                <span className="module-card-label">Add Leads</span>
                <span className="module-card-desc">Ready for API integration</span>
              </div>
              <div className="module-card-arrow">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                  <path d="M5 12h14M12 5l7 7-7 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
