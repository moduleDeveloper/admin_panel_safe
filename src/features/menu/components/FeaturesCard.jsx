import { useEffect, useState } from 'react';
import { fetchFeaturesCardData } from '../services/featuresCardApi';
import './FeaturesCard.css';

function IconView({ iconUrl, fallback }) {
  const rawIcon = String(iconUrl || '').trim();

  if (rawIcon.startsWith('http://') || rawIcon.startsWith('https://') || rawIcon.startsWith('data:image') || rawIcon.startsWith('/')) {
    return <img src={rawIcon} alt="" className="features-card-icon-image" />;
  }

  if (rawIcon && rawIcon.length <= 4) {
    return <span className="features-card-icon-emoji">{rawIcon}</span>;
  }

  if (rawIcon.includes('<svg')) {
    return <span className="features-card-icon-svg" aria-hidden="true" dangerouslySetInnerHTML={{ __html: rawIcon }} />;
  }

  return <span className="features-card-icon-fallback">{String(fallback || '').slice(0, 1).toUpperCase() || 'F'}</span>;
}

function shouldOpenRoute(route) {
  return typeof route === 'string' && route.trim().length > 0;
}

export default function FeaturesCard({
  trustId,
  tier = 'general',
  onNavigate,
}) {
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    async function loadCards() {
      if (!trustId) {
        setCards([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError('');

      try {
        const response = await fetchFeaturesCardData({ trustId, tier });
        if (!mounted) return;
        setCards(response);
      } catch (err) {
        if (!mounted) return;
        const message = err?.response?.data?.message || err?.message || 'Failed to load Features 2.0 cards.';
        setError(message);
      } finally {
        if (mounted) setLoading(false);
      }
    }

    loadCards();

    return () => {
      mounted = false;
    };
  }, [trustId, tier]);

  if (loading) {
    return <div className="features-cards-loading">Loading features...</div>;
  }

  if (error) {
    return <div className="features-cards-error">{error}</div>;
  }

  if (!cards.length) {
    return <div className="features-cards-empty">No enabled features found for this trust and tier.</div>;
  }

  return (
    <div className="features-cards-grid">
      {cards.map((card, index) => (
        <article
          key={card.feature_flag_id}
          className="features-card-item"
          style={{ animationDelay: `${index * 0.06}s` }}
        >
          <button
            type="button"
            className="features-card-top"
            onClick={() => {
              if (shouldOpenRoute(card.route) && onNavigate) {
                onNavigate(card.route);
              }
            }}
            disabled={!shouldOpenRoute(card.route)}
          >
            <span className="features-card-icon-wrap">
              <IconView iconUrl={card.icon_url} fallback={card.display_name} />
            </span>
            <span className="features-card-title-wrap">
              <span className="features-card-title">{card.display_name}</span>
              <span className="features-card-tagline">{card.tagline || 'No description available'}</span>
            </span>
          </button>

          <div className="features-card-options">
            {card.sub_features.length ? (
              card.sub_features.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className="features-card-option"
                  onClick={() => {
                    if (shouldOpenRoute(option.route) && onNavigate) {
                      onNavigate(option.route);
                    }
                  }}
                  disabled={!shouldOpenRoute(option.route)}
                >
                  <span className="features-card-option-label">{option.display_name}</span>
                  {option.tagline ? (
                    <span className="features-card-option-tagline">{option.tagline}</span>
                  ) : null}
                </button>
              ))
            ) : (
              <div className="features-card-no-options">No enabled sub-features.</div>
            )}
          </div>
        </article>
      ))}
    </div>
  );
}
