import { useNavigate, useLocation } from 'react-router-dom';
import './ComingSoon.css';

export default function ComingSoon({ title = 'Coming Soon' }) {
  const navigate = useNavigate();
  const location = useLocation();

  const { userName = 'Admin', trust = null } = location.state || {};

  return (
    <div className="cs-root">
      <div className="cs-card">
        <div className="cs-badge">Module</div>
        <h1 className="cs-title">{title}</h1>
        <p className="cs-subtitle">This section is being prepared. Please check back soon.</p>
        <div className="cs-actions">
          <button
            className="cs-btn secondary"
            onClick={() => navigate('/dashboard', { state: { userName, trust } })}
          >
            Back to Dashboard
          </button>
          <button
            className="cs-btn primary"
            onClick={() => navigate('/trustees', { state: { userName, trust } })}
          >
            Go to Trust
          </button>
        </div>
      </div>
    </div>
  );
}
