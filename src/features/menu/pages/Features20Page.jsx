import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

export default function Features20Page() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null } = location.state || {};
  const activeTier = location.state?.tier || 'general';
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'dashboard';

  useEffect(() => {
    if (!trust?.id) {
      navigate('/dashboard', { replace: true, state: { userName, trust } });
      return;
    }

    navigate('/feature-control', {
      replace: true,
      state: {
        userName,
        trust,
        sidebarNavKey: currentSidebarNavKey,
        fromFeatures20: true,
        tier: activeTier === 'vip' ? 'vip' : 'general',
      },
    });
  }, [navigate, trust, userName, currentSidebarNavKey, activeTier]);

  return null;
}
