import { useNavigate, useLocation } from 'react-router-dom';
import Sidebar from '../../components/Sidebar';
import './WhatsappPage.css';

const WHATSAPP_MODULES = [
  {
    id: 'wa-module-service-provider',
    label: 'Service Provider',
    description: 'Manage from Whatsapp Template',
    route: '/whatsapp/service-provider',
    gradient: 'linear-gradient(135deg, #0F766E 0%, #2563EB 100%)',
    disabled: true,
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
    description: 'Manage from Whatsapp Template',
    route: '/whatsapp/media',
    gradient: 'linear-gradient(135deg, #25D366 0%, #128C7E 100%)',
    disabled: true,
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
  {
    id: 'wa-module-campaign',
    label: 'Whatsapp Campaign',
    description: 'Manage campaigning & scheduling',
    route: '/whatsapp/campaign',
    gradient: 'linear-gradient(135deg, #EA580C 0%, #DB2777 100%)',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <path d="M3.5 4.5v6l16 1.5-16 1.5v6L21 12 3.5 4.5Z" stroke="white" strokeWidth="1.8" strokeLinejoin="round" />
        <path d="M16 5v3M16 16v3M20 8.5h3M20 15.5h3" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
  {
    id: 'wa-module-audience',
    label: 'Whatsapp Audience',
    description: 'View campaign recipients & delivery status',
    route: '/whatsapp/audience',
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #6366F1 100%)',
    icon: (
      <svg width="32" height="32" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3.2" stroke="white" strokeWidth="1.8" />
        <path d="M3.5 20c0-3.5 2.5-6 5.5-6s5.5 2.5 5.5 6" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
        <circle cx="17.5" cy="9" r="2.4" stroke="white" strokeWidth="1.8" />
        <path d="M14.5 20c0-2.8 1.6-5 3.5-5s3.5 2.2 3.5 5" stroke="white" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    ),
  },
];

const WHATSAPP_MODULES_ORDERED = WHATSAPP_MODULES.filter((module) => !module.disabled);

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
            {WHATSAPP_MODULES_ORDERED.map((card, i) => (
              <button
                key={card.id}
                className={`wa-module-card ${card.disabled ? 'wa-module-card-disabled' : ''}`}
                style={{ background: card.gradient, animationDelay: `${i * 0.08}s` }}
                onClick={() => {
                  if (card.disabled) return;
                  navigate(card.route, { state: { userName, trust, superuserId, sidebarNavKey: 'whatsapp' } });
                }}
                disabled={card.disabled}
                aria-disabled={card.disabled}
                title={card.disabled ? `${card.label} (managed from Whatsapp Template)` : card.label}
              >
                {card.disabled && <span className="wa-module-card-badge">Deactivated</span>}
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
