import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../components/Sidebar';
import './WhatsappPage.css';

const WHATSAPP_MODULES = [
  {
    id: 'wa-module-service-provider',
    label: 'Service Provider',
    description: 'Manage WhatsApp service provider settings',
    route: '/whatsapp/service-provider',
    gradient: 'linear-gradient(135deg, #0F766E 0%, #2563EB 100%)',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <path d="M3 7.5L12 3l9 4.5-9 4.5L3 7.5Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M3 7.5V16.5L12 21l9-4.5V7.5" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M12 12v9" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'wa-module-media',
    label: 'Whatsapp Media',
    description: 'Manage WhatsApp media library',
    route: '/whatsapp/media',
    gradient: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <rect x="3.5" y="4.5" width="17" height="15" rx="2.4" stroke="white" strokeWidth="1.8" />
        <circle cx="8.5" cy="9.5" r="1.6" stroke="white" strokeWidth="1.8" />
        <path d="M4.5 16.5 9 12l3 3 3.5-4L20 16.5" stroke="white" strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'wa-module-template',
    label: 'Whatsapp Template',
    description: 'Manage WhatsApp message templates',
    route: '/whatsapp/template',
    gradient: 'linear-gradient(135deg, #7C3AED 0%, #4F46E5 100%)',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="3.5" width="14" height="17" rx="2.2" stroke="white" strokeWidth="1.8" />
        <path d="M8.2 8h7.6M8.2 11.5h7.6M8.2 15h4.8" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

export default function WhatsappPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null, superuserId = null } = location.state || {};

  return (
    <div className="wa-root">
      <Sidebar
        trustName={trust?.name || 'Trust'}
        onDashboard={() =>
          navigate('/dashboard', { state: { userName, trust, superuserId, sidebarNavKey: 'dashboard' } })
        }
        onLogout={() => navigate('/login')}
      />

      <main className="wa-main">
        <div className="wa-header">
          <div className="wa-header-titles">
            <h1 className="wa-header-title">Whatsapp</h1>
            <p className="wa-header-subtitle">Manage WhatsApp media and account information</p>
          </div>
        </div>

        <section className="wa-container">
          <div className="wa-section-header">
            <h1 className="wa-title">Modules</h1>
            <p className="wa-subtitle">Select a module to manage</p>
          </div>

          <div className="wa-modules-grid">
            {WHATSAPP_MODULES.map((card, i) => (
              <button
                key={card.id}
                className="wa-module-card"
                style={{ background: card.gradient, animationDelay: `${i * 0.08}s` }}
                onClick={() =>
                  navigate(card.route, { state: { userName, trust, superuserId, sidebarNavKey: 'whatsapp' } })
                }
                title={card.label}
              >
                <div className="wa-module-card-shine" />
                <div className="wa-module-icon-wrap">{card.icon}</div>
                <div className="wa-module-card-body">
                  <span className="wa-module-card-label">{card.label}</span>
                  <span className="wa-module-card-desc">{card.description}</span>
                </div>
                <div className="wa-module-card-arrow">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                    <path d="M5 12h14M12 5l7 7-7 7" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </button>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
