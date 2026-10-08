import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
  fetchFeatureFlags,
  fetchAllFeatures,
  toggleFeatureFlag,
  updateFeatureFlag,
  addFeatureFlag,
  deleteFeatureFlag,
} from '../services/featuresService';
import { getAllowedImageFormatsMessage, prepareImageFileForUpload } from '../../../core/utils/imageUpload';
import './FeaturesManager.css';

// ── Inline icon renderer (same logic as Dashboard's FeatureIcon) ───────────────
function FeatureIcon({ flag }) {
  const route = flag.route || '';
  const label = (flag.display_name || flag.features?.name || '').toLowerCase().trim();

  const routeSVGs = {
    '/directory': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <g stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          <line x1="18" y1="5" x2="22" y2="5"/>
          <line x1="20" y1="3" x2="20" y2="7"/>
        </g>
      </svg>
    ),
    '/appointments': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="18" rx="3" stroke="white" strokeWidth="1.8"/>
        <line x1="3" y1="9" x2="21" y2="9" stroke="white" strokeWidth="1.8"/>
        <line x1="8" y1="2" x2="8" y2="6" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="16" y1="2" x2="16" y2="6" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M8 14l2.5 2.5L16 12" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    '/referrals': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    '/gallery': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="white" strokeWidth="1.8"/>
        <circle cx="8.5" cy="8.5" r="1.5" stroke="white" strokeWidth="1.8"/>
        <polyline points="21 15 16 10 5 21" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    '/members': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3" stroke="white" strokeWidth="1.8"/>
        <path d="M4 19c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="17.5" cy="9" r="2.2" stroke="white" strokeWidth="1.8"/>
        <path d="M15.5 18c.41-1.64 1.7-2.83 3.9-3" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    '/profiles': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="8" r="4" stroke="white" strokeWidth="1.8"/>
        <path d="M4 20c0-4 3.58-7 8-7s8 3 8 7" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    '/messages': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="9" cy="12" r="1.5" fill="white"/>
        <circle cx="15" cy="12" r="1.5" fill="white"/>
      </svg>
    ),
    '/slots': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/>
        <polyline points="12 6 12 12 16 14" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    '/trustees': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="9" cy="7" r="4" stroke="white" strokeWidth="1.8"/>
        <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    '/noticeboard': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="5" width="16" height="12" rx="1.5" stroke="white" strokeWidth="1.8"/>
        <line x1="8" y1="9" x2="16" y2="9" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="8" y1="12" x2="14" y2="12" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="10" y1="17" x2="10" y2="20" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="14" y1="17" x2="14" y2="20" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    '/facilities': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="4" width="16" height="16" rx="2.5" stroke="white" strokeWidth="1.8" />
        <path d="M8 16v-3h8v3M10 10h4M12 7v6" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    '/contact-us': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M22 16.92v2a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6A19.79 19.79 0 0 1 2.12 3.18 2 2 0 0 1 4.11 1h2a2 2 0 0 1 2 1.72c.12.9.33 1.78.63 2.62a2 2 0 0 1-.45 2.11L7.1 8.9a16 16 0 0 0 8 8l1.45-1.19a2 2 0 0 1 2.11-.45c.84.3 1.72.51 2.62.63A2 2 0 0 1 22 16.92Z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    '/reports': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <line x1="18" y1="20" x2="18" y2="10" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="12" y1="20" x2="12" y2="4" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="6" y1="20" x2="6" y2="14" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <path d="M3 20h18" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  };

  if (route && routeSVGs[route]) return routeSVGs[route];

  const nameSVGs = {
    'vip login': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="11" width="18" height="11" rx="2" stroke="white" strokeWidth="1.8"/>
        <path d="M7 11V7a5 5 0 0 1 10 0v4" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="12" cy="16" r="1.5" fill="white"/>
      </svg>
    ),
    'opd schedule': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="4" width="18" height="18" rx="2" stroke="white" strokeWidth="1.8"/>
        <line x1="3" y1="9" x2="21" y2="9" stroke="white" strokeWidth="1.8"/>
        <line x1="9" y1="2" x2="9" y2="6" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="15" y1="2" x2="15" y2="6" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="9" cy="13" r="1.5" fill="white"/>
        <circle cx="15" cy="13" r="1.5" fill="white"/>
        <path d="M9 17l2.5 2.5L17 15" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    'medical reports': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="5" y="2" width="14" height="20" rx="2" stroke="white" strokeWidth="1.8"/>
        <line x1="9" y1="7" x2="15" y2="7" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="9" y1="11" x2="15" y2="11" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="9" y1="15" x2="12" y2="15" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    'patient referral': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="12" cy="12" r="2.5" fill="white"/>
      </svg>
    ),
    'directory': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <g stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="8" r="4"/>
          <path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>
          <line x1="18" y1="5" x2="22" y2="5"/>
          <line x1="20" y1="3" x2="20" y2="7"/>
        </g>
      </svg>
    ),
    'members': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3" stroke="white" strokeWidth="1.8"/>
        <path d="M4 19c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="17.5" cy="9" r="2.2" stroke="white" strokeWidth="1.8"/>
        <path d="M15.5 18c.41-1.64 1.7-2.83 3.9-3" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    'noticeboard': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="5" width="16" height="12" rx="1.5" stroke="white" strokeWidth="1.8"/>
        <line x1="8" y1="9" x2="16" y2="9" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="8" y1="12" x2="14" y2="12" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="10" y1="17" x2="10" y2="20" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="14" y1="17" x2="14" y2="20" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
    'gallery': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="2" stroke="white" strokeWidth="1.8"/>
        <circle cx="8.5" cy="8.5" r="1.5" fill="white"/>
        <polyline points="21 15 16 10 5 21" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
    'messages': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="9" cy="12" r="1.5" fill="white"/>
        <circle cx="15" cy="12" r="1.5" fill="white"/>
      </svg>
    ),
    'birthday wishes': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M9 4c0 1 1 2 1 3M15 4c0 1-1 2-1 3" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <rect x="4" y="9" width="16" height="10" rx="2" stroke="white" strokeWidth="1.8"/>
        <path d="M4 12h16" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="8" cy="15" r="1" fill="white"/>
        <circle cx="12" cy="15" r="1" fill="white"/>
        <circle cx="16" cy="15" r="1" fill="white"/>
      </svg>
    ),
    'notifications': (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M13.73 21a2 2 0 0 1-3.46 0" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="19" cy="5" r="3" fill="white"/>
      </svg>
    ),
  };

  // partial name match
  const matchedName = Object.keys(nameSVGs).find(k => label.includes(k) || k.includes(label));
  if (matchedName) return nameSVGs[matchedName];

  // Generic fallback
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <rect x="3" y="3" width="7" height="7" rx="1.5" stroke="white" strokeWidth="1.8"/>
      <rect x="14" y="3" width="7" height="7" rx="1.5" stroke="white" strokeWidth="1.8"/>
      <rect x="3" y="14" width="7" height="7" rx="1.5" stroke="white" strokeWidth="1.8"/>
      <rect x="14" y="14" width="7" height="7" rx="1.5" stroke="white" strokeWidth="1.8"/>
    </svg>
  );
}

// ── Default gradient map per route ───────────────────────────────────────────
const ROUTE_GRADIENTS = {
  '/directory':    'linear-gradient(135deg, #4F63D2 0%, #6366F1 100%)',
  '/appointments': 'linear-gradient(135deg, #059669 0%, #10B981 100%)',
  '/referrals':    'linear-gradient(135deg, #DB2777 0%, #F43F5E 100%)',
  '/gallery':      'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)',
  '/members':      'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
  '/profiles':     'linear-gradient(135deg, #9333EA 0%, #A855F7 100%)',
  '/messages':     'linear-gradient(135deg, #D97706 0%, #F59E0B 100%)',
  '/slots':        'linear-gradient(135deg, #0891B2 0%, #06B6D4 100%)',
  '/trustees':     'linear-gradient(135deg, #DC2626 0%, #EF4444 100%)',
  '/facilities':   'linear-gradient(135deg, #14B8A6 0%, #0EA5E9 100%)',
  '/contact-us':   'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
  '/reports':      'linear-gradient(135deg, #0EA5E9 0%, #38BDF8 100%)',
};
const DEFAULT_GRADIENT = 'linear-gradient(135deg, #6366F1 0%, #8B5CF6 100%)';

function cardGradient(flag) {
  if (flag.route && ROUTE_GRADIENTS[flag.route]) return ROUTE_GRADIENTS[flag.route];
  return DEFAULT_GRADIENT;
}

const STATIC_CONTAINERS = [
  {
    id: 'trust',
    label: 'Trust',
    gradient: 'linear-gradient(135deg, #0EA5E9 0%, #38BDF8 100%)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <path d="M12 3l7 3v6c0 4.5-3 8.5-7 10-4-1.5-7-5.5-7-10V6l7-3z" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
        <path d="M9 12l2 2 4-4" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'sponsor',
    label: 'Sponsor',
    gradient: 'linear-gradient(135deg, #F59E0B 0%, #F97316 100%)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="12" cy="12" r="9" stroke="white" strokeWidth="1.8"/>
        <path d="M12 7.2l1.6 3.2 3.5.5-2.6 2.5.6 3.5L12 15.4 8.9 16.9l.6-3.5-2.6-2.5 3.5-.5L12 7.2z" stroke="white" strokeWidth="1.6" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'members',
    label: 'Members',
    gradient: 'linear-gradient(135deg, #06B6D4 0%, #3B82F6 100%)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <circle cx="9" cy="8" r="3" stroke="white" strokeWidth="1.8"/>
        <path d="M4 19c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <circle cx="17.5" cy="9" r="2.2" stroke="white" strokeWidth="1.8"/>
        <path d="M15.5 18c.41-1.64 1.7-2.83 3.9-3" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
  {
    id: 'gallery',
    label: 'Gallery',
    gradient: 'linear-gradient(135deg, #7C3AED 0%, #8B5CF6 100%)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="3" y="3" width="18" height="18" rx="3" stroke="white" strokeWidth="1.8"/>
        <circle cx="8.5" cy="8.5" r="1.5" stroke="white" strokeWidth="1.8"/>
        <polyline points="21 15 16 10 5 21" stroke="white" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    ),
  },
  {
    id: 'marquee',
    label: 'Marquee',
    gradient: 'linear-gradient(135deg, #10B981 0%, #22C55E 100%)',
    icon: (
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
        <rect x="4" y="7" width="16" height="10" rx="2" stroke="white" strokeWidth="1.8"/>
        <line x1="7" y1="11" x2="17" y2="11" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
        <line x1="7" y1="14" x2="14" y2="14" stroke="white" strokeWidth="1.8" strokeLinecap="round"/>
      </svg>
    ),
  },
];

// ── Empty edit form state ─────────────────────────────────────────────────────
const EMPTY_EDIT = {
  display_name: '',
  tagline: '',
  icon_url: '',
  route: '',
  quick_order: '',
  description: '',
};

// ─────────────────────────────────────────────────────────────────────────────
export default function FeaturesManager({ trustId, trustName, onFeaturesChange }) {
  const [flags,        setFlags]        = useState([]);
  const [allFeatures,  setAllFeatures]  = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState(null);

  // Edit modal
  const [editFlag,     setEditFlag]     = useState(null);
  const [editForm,     setEditForm]     = useState(EMPTY_EDIT);
  const [saving,       setSaving]       = useState(false);
  const [saveMsg,      setSaveMsg]      = useState('');
  const [iconTab,      setIconTab]      = useState('upload'); // 'upload' | 'emoji' | 'url'
  const [iconPreview,  setIconPreview]  = useState('');

  // Add modal
  const [showAdd,      setShowAdd]      = useState(false);
  const [addMode,      setAddMode]      = useState('new');
  const [addForm,      setAddForm]      = useState({
    feature_name: '',
    parent_name: '',
    sub_feature_name: '',
    display_name: '',
    tagline: '',
    route: '',
    quick_order: '',
    tier: 'general'
  });
  const [addSaving,    setAddSaving]    = useState(false);
  const [addError,     setAddError]     = useState('');
  const [addIconTab,   setAddIconTab]   = useState('emoji');
  const [addIconPreview, setAddIconPreview] = useState('');

  // Delete confirm
  const [deleteId,     setDeleteId]     = useState(null);
  const [deleting,     setDeleting]     = useState(false);

  // Toggle loading per-card
  const [toggling,     setToggling]     = useState({});

  // ── Load flags ─────────────────────────────────────────────────────────────
  const loadFlags = useCallback(async () => {
    if (!trustId) return;
    setLoading(true);
    setError(null);
    const { data, error: err } = await fetchFeatureFlags(trustId);
    if (err) setError(err.message);
    else setFlags(data || []);
    setLoading(false);
  }, [trustId]);

  useEffect(() => { loadFlags(); }, [loadFlags]);

  // Load master feature list for "Add" dropdown
  useEffect(() => {
    fetchAllFeatures().then(({ data }) => setAllFeatures(data || []));
  }, []);

  // ── Toggle ─────────────────────────────────────────────────────────────────
  const handleToggle = async (flag) => {
    setToggling(p => ({ ...p, [flag.id]: true }));
    const newVal = !flag.is_enabled;
    const { data, error: err } = await toggleFeatureFlag(flag.id, newVal);
    if (!err && data) {
      setFlags(prev => prev.map(f => f.id === flag.id ? { ...f, is_enabled: newVal } : f));
      if (onFeaturesChange) onFeaturesChange();
    }
    setToggling(p => ({ ...p, [flag.id]: false }));
  };

  // ── Edit ───────────────────────────────────────────────────────────────────
  const openEdit = (flag) => {
    setEditFlag(flag);
    const existingIcon = flag.icon_url || '';
    setEditForm({
      display_name: flag.display_name || '',
      tagline:      flag.tagline      || '',
      icon_url:     existingIcon,
      route:        flag.route        || '',
      quick_order:  flag.quick_order  != null ? String(flag.quick_order) : '',
      description:  flag.description  || '',
    });
    // Determine starting icon tab based on existing icon type
    if (existingIcon.startsWith('data:image')) {
      setIconTab('upload');
      setIconPreview(existingIcon);
    } else if (existingIcon && existingIcon.length <= 4 && !existingIcon.startsWith('http')) {
      setIconTab('emoji');
      setIconPreview('');
    } else if (existingIcon.startsWith('http') || existingIcon.startsWith('/')) {
      setIconTab('url');
      setIconPreview('');
    } else {
      setIconTab('upload');
      setIconPreview('');
    }
    setSaveMsg('');
  };

  const handleIconFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const prepared = await prepareImageFileForUpload(file);
    if (prepared.error || !prepared.file) {
      setSaveMsg(prepared.error?.message || getAllowedImageFormatsMessage());
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result;
      setIconPreview(base64);
      setEditForm(p => ({ ...p, icon_url: base64 }));
      setSaveMsg(prepared.warning || '');
    };
    reader.readAsDataURL(prepared.file);
  };

  const handleEditSave = async () => {
    if (!editFlag) return;
    setSaving(true);
    setSaveMsg('');
    const updates = {
      ...editForm,
      quick_order: editForm.quick_order !== '' ? Number(editForm.quick_order) : null,
    };
    const { data, error: err } = await updateFeatureFlag(editFlag.id, updates);
    if (err) {
      setSaveMsg('❌ ' + err.message);
    } else {
      setSaveMsg('✅ Saved!');
      setFlags(prev => prev.map(f => f.id === editFlag.id ? { ...f, ...data } : f));
      setTimeout(() => { setEditFlag(null); setSaveMsg(''); }, 800);
    }
    setSaving(false);
  };

  // ── Add ────────────────────────────────────────────────────────────────────
  const handleAdd = async () => {
    if (!addForm.display_name.trim()) { setAddError('Display name is required.'); return; }
    setAddSaving(true);
    setAddError('');
    const firstFeature = allFeatures[0];
    const { data, error: err } = await addFeatureFlag({
      featuresId:  firstFeature?.id || '',
      trustId,
      displayName: addForm.display_name.trim(),
      tagline:     addForm.tagline.trim(),
      route:       addForm.route.trim(),
      quickOrder:  addForm.quick_order !== '' ? Number(addForm.quick_order) : null,
      tier:        addForm.tier,
    });
    if (err) {
      setAddError(err.message);
    } else {
      setFlags(prev => [...prev, data]);
      setShowAdd(false);
      setAddForm({
        feature_name: '',
        parent_name: '',
        sub_feature_name: '',
        display_name: '',
        tagline: '',
        route: '',
        quick_order: '',
        tier: 'general'
      });
      if (onFeaturesChange) onFeaturesChange();
    }
    setAddSaving(false);
  };

  const handleAddIconFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const prepared = await prepareImageFileForUpload(file);
    if (prepared.error || !prepared.file) {
      setAddError(prepared.error?.message || getAllowedImageFormatsMessage());
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      const base64 = ev.target.result;
      setAddIconPreview(base64);
      setAddForm(p => ({ ...p, icon_url: base64 }));
      setAddError(prepared.warning || '');
    };
    reader.readAsDataURL(prepared.file);
  };

  // ── Delete ─────────────────────────────────────────────────────────────────
  const handleDelete = async () => {
    if (!deleteId) return;
    setDeleting(true);
    const { error: err } = await deleteFeatureFlag(deleteId);
    if (!err) {
      setFlags(prev => prev.filter(f => f.id !== deleteId));
      if (onFeaturesChange) onFeaturesChange();
    }
    setDeleteId(null);
    setDeleting(false);
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  const enabledCount  = flags.filter(f => f.is_enabled).length;
  const disabledCount = flags.length - enabledCount;

  return (
    <div className="fm-root">

      {/* ── Header ── */}
      <div className="fm-header">
        <div className="fm-header-left">
          <h2 className="fm-title">Feature Manager</h2>
          <p className="fm-subtitle">
            Manage features for <strong>{trustName || 'this trust'}</strong>
          </p>
          <div className="fm-badges">
            <span className="fm-badge enabled">{enabledCount} Active</span>
            <span className="fm-badge disabled">{disabledCount} Inactive</span>
            <span className="fm-badge total">{flags.length} Total</span>
          </div>
        </div>
        <button className="fm-add-btn" onClick={() => setShowAdd(true)}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
            <line x1="12" y1="5" x2="12" y2="19" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
            <line x1="5" y1="12" x2="19" y2="12" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"/>
          </svg>
          Add Feature
        </button>
      </div>

      {/* ── Loading / Error ── */}
      {loading && (
        <div className="fm-loading">
          <div className="fm-spinner" />
          <p>Loading features...</p>
        </div>
      )}

      {!loading && error && (
        <div className="fm-error-box">
          <span>⚠️ {error}</span>
          <button onClick={loadFlags}>Retry</button>
        </div>
      )}

      {/* ── Cards Grid ── */}
      {!loading && !error && (
        <>
          {flags.length === 0 ? (
            <div className="fm-empty">
              <div className="fm-empty-icon">📭</div>
              <p className="fm-empty-text">No features linked to this trust yet.</p>
              <button className="fm-add-btn" onClick={() => setShowAdd(true)}>Add First Feature</button>
            </div>
          ) : (
            <div className="fm-grid">
              {flags.map((flag, i) => (
                <div
                  key={flag.id}
                  className={`fm-card ${flag.is_enabled ? '' : 'fm-card--disabled'}`}
                  style={{ animationDelay: `${i * 0.06}s` }}
                >
                  {/* Order badge */}
                  {flag.quick_order != null && (
                    <span className="fm-order-badge">#{flag.quick_order}</span>
                  )}

                  {/* Icon */}
                  <div className="fm-card-icon" style={{ background: cardGradient(flag) }}>
                    <FeatureIcon flag={flag} />
                  </div>

                  {/* Info */}
                  <div className="fm-card-info">
                    <h3 className="fm-card-name">{flag.display_name || flag.features?.name || 'Unnamed'}</h3>
                    <p className="fm-card-tagline">{flag.tagline || flag.features?.subname || '—'}</p>
                    {flag.route && <span className="fm-card-route">{flag.route}</span>}
                  </div>

                  {/* Status */}
                  <div className="fm-card-status">
                    <span className={`fm-status-dot ${flag.is_enabled ? 'on' : 'off'}`} />
                    <span className="fm-status-label">{flag.is_enabled ? 'Active' : 'Inactive'}</span>
                  </div>

                  {/* Actions */}
                  <div className="fm-card-actions">
                    {/* Toggle switch */}
                    <button
                      className={`fm-toggle ${flag.is_enabled ? 'fm-toggle--on' : ''}`}
                      onClick={() => handleToggle(flag)}
                      disabled={toggling[flag.id]}
                      title={flag.is_enabled ? 'Disable' : 'Enable'}
                    >
                      <span className="fm-toggle-knob" />
                    </button>

                    {/* Edit */}
                    <button className="fm-action-btn edit" onClick={() => openEdit(flag)} title="Edit">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>

                    {/* Delete */}
                    <button className="fm-action-btn delete" onClick={() => setDeleteId(flag.id)} title="Remove">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <polyline points="3 6 5 6 21 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M19 6l-1 14H6L5 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M10 11v6M14 11v6" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                        <path d="M9 6V4h6v2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ══════════════════════════════════════════════════════════════
          EDIT MODAL
      ══════════════════════════════════════════════════════════════ */}
      {editFlag && createPortal(
        <div className="fm-modal-overlay" onClick={() => setEditFlag(null)}>
          <div className="fm-modal" onClick={e => e.stopPropagation()}>
            <div className="fm-modal-header">
              <h3 className="fm-modal-title">Edit Feature</h3>
              <button className="fm-modal-close" onClick={() => setEditFlag(null)}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="fm-modal-body">
              <div className="fm-field">
                <label className="fm-label">Display Name *</label>
                <input
                  className="fm-input"
                  value={editForm.display_name}
                  onChange={e => setEditForm(p => ({ ...p, display_name: e.target.value }))}
                  placeholder="e.g. Directory"
                />
              </div>

              <div className="fm-field">
                <label className="fm-label">Tagline / Subtitle</label>
                <input
                  className="fm-input"
                  value={editForm.tagline}
                  onChange={e => setEditForm(p => ({ ...p, tagline: e.target.value }))}
                  placeholder="e.g. Members, Hospitals, Doctors"
                />
              </div>

              <div className="fm-field">
                <label className="fm-label">Route / Path</label>
                <input
                  className="fm-input"
                  value={editForm.route}
                  onChange={e => setEditForm(p => ({ ...p, route: e.target.value }))}
                  placeholder="e.g. /directory"
                />
              </div>

              {/* ── Icon Picker ── */}
              <div className="fm-field">
                <label className="fm-label">Feature Icon</label>
                <div className="fm-icon-tabs">
                  <button type="button" className={`fm-icon-tab ${iconTab==='upload'?'active':''}`} onClick={()=>setIconTab('upload')}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    Upload
                  </button>
                  <button type="button" className={`fm-icon-tab ${iconTab==='emoji'?'active':''}`} onClick={()=>setIconTab('emoji')}>😀 Emoji</button>
                  <button type="button" className={`fm-icon-tab ${iconTab==='url'?'active':''}`} onClick={()=>setIconTab('url')}>🔗 URL</button>
                </div>

                {iconTab === 'upload' && (
                  <div className="fm-upload-zone">
                    {iconPreview ? (
                      <div className="fm-upload-preview">
                        <img src={iconPreview} alt="Icon preview" className="fm-upload-img" />
                        <button
                          type="button"
                          className="fm-upload-clear"
                          onClick={() => { setIconPreview(''); setEditForm(p => ({ ...p, icon_url: '' })); }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                        </button>
                        <span className="fm-upload-name">Image selected ✓</span>
                      </div>
                    ) : (
                      <label className="fm-upload-label">
                        <input type="file" accept="image/*" style={{display:'none'}} onChange={handleIconFileChange} />
                        <div className="fm-upload-placeholder">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="17 8 12 3 7 8" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="3" x2="12" y2="15" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round"/></svg>
                          <span>Click to upload image</span>
                          <span className="fm-upload-hint">JPG, JPEG, PNG (other image formats auto-convert to JPEG)</span>
                        </div>
                      </label>
                    )}
                  </div>
                )}

                {iconTab === 'emoji' && (
                  <div className="fm-emoji-zone">
                    <input
                      className="fm-input fm-emoji-input"
                      value={editForm.icon_url}
                      onChange={e => setEditForm(p => ({ ...p, icon_url: e.target.value }))}
                      placeholder="Type or paste an emoji, e.g. 🏥"
                      maxLength={8}
                    />
                    <div className="fm-emoji-quick">
                      {['🏥','👨‍⚕️','📋','💊','🩺','🩻','📅','🔬','💉','🏃','📞','👥','🔔','📊','⚕️','🛏️'].map(em => (
                        <button key={em} type="button" className="fm-emoji-chip"
                          onClick={() => setEditForm(p => ({ ...p, icon_url: em }))}
                        >{em}</button>
                      ))}
                    </div>
                  </div>
                )}

                {iconTab === 'url' && (
                  <input
                    className="fm-input"
                    value={editForm.icon_url}
                    onChange={e => setEditForm(p => ({ ...p, icon_url: e.target.value }))}
                    placeholder="https://example.com/icon.png"
                  />
                )}
              </div>

              <div className="fm-field" style={{ maxWidth: 120 }}>
                <label className="fm-label">Order #</label>
                <input
                  className="fm-input"
                  type="number"
                  min="1"
                  value={editForm.quick_order}
                  onChange={e => setEditForm(p => ({ ...p, quick_order: e.target.value }))}
                  placeholder="1"
                />
              </div>

              <div className="fm-field">
                <label className="fm-label">Description</label>
                <textarea
                  className="fm-input fm-textarea"
                  rows={2}
                  value={editForm.description}
                  onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Optional internal notes..."
                />
              </div>

              {saveMsg && (
                <p className={`fm-save-msg ${saveMsg.startsWith('✅') ? 'success' : 'error'}`}>{saveMsg}</p>
              )}
            </div>

            <div className="fm-modal-footer">
              <button className="fm-btn secondary" onClick={() => setEditFlag(null)}>Cancel</button>
              <button className="fm-btn primary" onClick={handleEditSave} disabled={saving}>
                {saving ? 'Saving...' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ══════════════════════════════════════════════════════════════
          ADD MODAL
      ══════════════════════════════════════════════════════════════ */}
      {showAdd && createPortal(
        <div className="fm-modal-overlay" onClick={() => { setShowAdd(false); setAddError(''); setAddIconPreview(''); }}>
          <div className="fm-modal fm-modal--add" onClick={e => e.stopPropagation()}>

            {/* Gradient top strip */}
            <div className="fm-modal-banner">
              <div className="fm-modal-banner-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none">
                  <line x1="12" y1="5" x2="12" y2="19" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                  <line x1="5" y1="12" x2="19" y2="12" stroke="white" strokeWidth="2.2" strokeLinecap="round"/>
                </svg>
              </div>
              <div>
                <h3 className="fm-modal-banner-title">Add Feature</h3>
                <p className="fm-modal-banner-sub">Link a new feature to this trust</p>
              </div>
              <button className="fm-modal-close fm-modal-close--light" onClick={() => { setShowAdd(false); setAddError(''); setAddIconPreview(''); }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
                  <path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                </svg>
              </button>
            </div>

            <div className="fm-modal-body">
              {/* Mode tabs */}
              <div className="fm-mode-switch">
                <button className={`fm-mode-btn ${addMode==='new'?'active':''}`} onClick={() => setAddMode('new')} type="button">
                  ✨ Create New
                </button>
                <button className={`fm-mode-btn ${addMode==='sub'?'active':''}`} onClick={() => setAddMode('sub')} type="button">
                  🔗 Sub Feature
                </button>
              </div>

              {addMode === 'new' ? (
                <div className="fm-field">
                  <label className="fm-label">Feature Name *</label>
                  <input
                    className="fm-input"
                    value={addForm.feature_name}
                    onChange={e => setAddForm(p => ({ ...p, feature_name: e.target.value }))}
                    placeholder="e.g. OPD Schedule"
                  />
                </div>
              ) : (
                <div className="fm-field-row">
                  <div className="fm-field">
                    <label className="fm-label">Parent Feature *</label>
                    <input
                      className="fm-input"
                      value={addForm.parent_name}
                      onChange={e => setAddForm(p => ({ ...p, parent_name: e.target.value }))}
                      placeholder="e.g. Medical Reports"
                    />
                  </div>
                  <div className="fm-field">
                    <label className="fm-label">Sub Feature *</label>
                    <input
                      className="fm-input"
                      value={addForm.sub_feature_name}
                      onChange={e => setAddForm(p => ({ ...p, sub_feature_name: e.target.value }))}
                      placeholder="e.g. Blood Test"
                    />
                  </div>
                </div>
              )}

              <div className="fm-field">
                <label className="fm-label">Display Name *</label>
                <input
                  className="fm-input"
                  value={addForm.display_name}
                  onChange={e => setAddForm(p => ({ ...p, display_name: e.target.value }))}
                  placeholder="Shown on dashboard card"
                />
              </div>

              <div className="fm-field">
                <label className="fm-label">Tagline</label>
                <input
                  className="fm-input"
                  value={addForm.tagline}
                  onChange={e => setAddForm(p => ({ ...p, tagline: e.target.value }))}
                  placeholder="Short description"
                />
              </div>

              {/* Icon picker */}
              <div className="fm-field">
                <label className="fm-label">Feature Icon</label>
                <div className="fm-icon-tabs">
                  <button type="button" className={`fm-icon-tab ${addIconTab==='emoji'?'active':''}`} onClick={()=>setAddIconTab('emoji')}>😀 Emoji</button>
                  <button type="button" className={`fm-icon-tab ${addIconTab==='upload'?'active':''}`} onClick={()=>setAddIconTab('upload')}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><polyline points="17 8 12 3 7 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="3" x2="12" y2="15" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg>
                    Upload
                  </button>
                  <button type="button" className={`fm-icon-tab ${addIconTab==='url'?'active':''}`} onClick={()=>setAddIconTab('url')}>🔗 URL</button>
                </div>

                {addIconTab === 'emoji' && (
                  <div className="fm-emoji-zone">
                    <input
                      className="fm-input fm-emoji-input"
                      value={addForm.icon_url || ''}
                      onChange={e => setAddForm(p => ({ ...p, icon_url: e.target.value }))}
                      placeholder="🏥"
                      maxLength={8}
                    />
                    <div className="fm-emoji-quick">
                      {['🏥','👨‍⚕️','📋','💊','🩺','🩻','📅','🔬','💉','🏃','📞','👥','🔔','📊','⚕️','🛏️'].map(em => (
                        <button key={em} type="button" className="fm-emoji-chip"
                          onClick={() => setAddForm(p => ({ ...p, icon_url: em }))}
                        >{em}</button>
                      ))}
                    </div>
                  </div>
                )}

                {addIconTab === 'upload' && (
                  <div className="fm-upload-zone">
                    {addIconPreview ? (
                      <div className="fm-upload-preview">
                        <img src={addIconPreview} alt="preview" className="fm-upload-img" />
                        <button type="button" className="fm-upload-clear"
                          onClick={() => { setAddIconPreview(''); setAddForm(p => ({ ...p, icon_url: '' })); }}
                        >
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none"><path d="M18 6L6 18M6 6l12 12" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"/></svg>
                        </button>
                        <span className="fm-upload-name">Image selected ✓</span>
                      </div>
                    ) : (
                      <label className="fm-upload-label">
                        <input type="file" accept="image/*" style={{display:'none'}} onChange={handleAddIconFileChange} />
                        <div className="fm-upload-placeholder">
                          <svg width="28" height="28" viewBox="0 0 24 24" fill="none"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><polyline points="17 8 12 3 7 8" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/><line x1="12" y1="3" x2="12" y2="15" stroke="#9CA3AF" strokeWidth="1.8" strokeLinecap="round"/></svg>
                          <span>Click to upload image</span>
                          <span className="fm-upload-hint">JPG, JPEG, PNG (other image formats auto-convert to JPEG)</span>
                        </div>
                      </label>
                    )}
                  </div>
                )}

                {addIconTab === 'url' && (
                  <input
                    className="fm-input"
                    value={addForm.icon_url || ''}
                    onChange={e => setAddForm(p => ({ ...p, icon_url: e.target.value }))}
                    placeholder="https://example.com/icon.png"
                  />
                )}
              </div>

              <div className="fm-field-row">
                <div className="fm-field">
                  <label className="fm-label">Route / Path</label>
                  <input
                    className="fm-input"
                    value={addForm.route}
                    onChange={e => setAddForm(p => ({ ...p, route: e.target.value }))}
                    placeholder="/directory"
                  />
                </div>
                <div className="fm-field" style={{ maxWidth: 100 }}>
                  <label className="fm-label">Order #</label>
                  <input
                    className="fm-input"
                    type="number"
                    min="1"
                    value={addForm.quick_order}
                    onChange={e => setAddForm(p => ({ ...p, quick_order: e.target.value }))}
                    placeholder="1"
                  />
                </div>
              </div>

              <div className="fm-field">
                <label className="fm-label">Tier</label>
                <select
                  className="fm-input fm-select"
                  value={addForm.tier}
                  onChange={e => setAddForm(p => ({ ...p, tier: e.target.value }))}
                >
                  <option value="general">General</option>
                  <option value="vip">VIP</option>
                </select>
              </div>

              {addError && <p className="fm-save-msg error">{addError}</p>}
            </div>

            <div className="fm-modal-footer">
              <button className="fm-btn secondary" onClick={() => { setShowAdd(false); setAddError(''); setAddIconPreview(''); }}>Cancel</button>
              <button className="fm-btn primary" onClick={handleAdd} disabled={addSaving}>
                {addSaving ? 'Adding...' : 'Add Feature'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}

      {/* ══════════════════════════════════════════════════════════════
          DELETE CONFIRM
      ══════════════════════════════════════════════════════════════ */}
      {deleteId && createPortal(
        <div className="fm-modal-overlay" onClick={() => setDeleteId(null)}>
          <div className="fm-modal" onClick={e => e.stopPropagation()}>
            <div className="fm-modal-header">
              <h3 className="fm-modal-title">Remove Feature</h3>
            </div>
            <div className="fm-modal-body">
              <p>Are you sure you want to remove this feature from the trust?</p>
            </div>
            <div className="fm-modal-footer">
              <button className="fm-btn secondary" onClick={() => setDeleteId(null)}>Cancel</button>
              <button className="fm-btn danger" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Removing...' : 'Remove'}
              </button>
            </div>
          </div>
        </div>
      , document.body)}
    </div>
  );
}
