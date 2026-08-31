import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import PageHeader from '../../components/PageHeader';
import Sidebar from '../../components/Sidebar';
import { fetchTrustDetails } from '../../services/trustService';
import { fetchFeatureFlags } from '../../services/featuresService';
import { assignTemplateToTrust, createTemplate, fetchTemplates, updateTemplate } from '../../services/themeService';
import './ThemePage.css';

const EMPTY_FORM = {
  name: '',
  description: '',
  template_key: 'mahila',
  theme_config: {},
  home_layout: '["trustList","marquee","sponsors","gallery","quickActions"]',
  custom_css: '',
  is_active: true,
};
const DEFAULT_NEW_HOME_LAYOUT = ['trustList', 'marquee', 'sponsors', 'gallery', 'quickActions'];
const DEFAULT_HOME_LAYOUT_MODES = { gallery: 'content', sponsors: 'box' };
const HOME_LAYOUT_MODE_KEYS = new Set(['gallery', 'sponsors']);
const HOME_LAYOUT_MODE_OPTIONS = ['content', 'box'];
const supportsHomeLayoutMode = (key) => {
  const normalizedKey = normalizeFeatureLayoutName(key);
  return HOME_LAYOUT_MODE_KEYS.has(normalizedKey) || !DEFAULT_HOME_LAYOUT_KEY_SET.has(normalizedKey);
};

const pretty = (value, fallback) => JSON.stringify(value ?? fallback, null, 2);
const DEFAULT_ANIMATIONS = { cards: 'fadeUp', navbar: 'fadeSlideDown', gallery: 'zoomIn' };
const GRADIENT_OPTIONS = ['none', 'linear', 'radial', 'conic'];
const GRADIENT_TRANSITION_OPTIONS = ['ease', 'linear', 'ease-in', 'ease-out', 'ease-in-out'];
const DEFAULT_THEME_SECTION_CONFIG = {
  footer: { bg_color_1: '#1f296f', bg_color_2: '#c81e1e', text_color: '#ffffff', gradient_type: 'linear' },
  navbar: { blur: 10, opacity: 1, bg_color_1: '#1f296f', bg_color_2: '#c81e1e', text_color: '#f7f7f7', gradient_type: 'linear' },
  marquee: { bg_color_1: '#1a1891', bg_color_2: '#c12525', text_color: '#ffffff', gradient_type: 'linear' },
  page_bg: { bg_color_1: '#f6f8fc', bg_color_2: '#eef2ff', gradient_type: 'linear', gradient_angle: 180, gradient_transition: 'ease' },
  sidebar: { blur: 12, opacity: 0.98, bg_color_1: '#a4ccea', bg_color_2: '#ebebf4', text_color: '#ffffff', button_color: '#e3e3ee', gradient_type: 'linear', button_text_color: '#ffffff' },
  app_buttons: { bg_color_1: '#4a42e8', bg_color_2: null, text_color: '#ffffff', gradient_type: 'none' },
  advertisement: {
    bg_color: '#6B0F2A',
    bg_opacity: 0,
    title_color: '#FFFFFF',
    card_bg_color: '#6B0F2A',
    badge_bg_color: '#FFFFFF',
    subtitle_color: '#FFD6E0',
    badge_dot_color: '#FF4D6D',
    badge_text_color: '#6B0F2A',
    card_border_color: '#FF6B8A',
    card_shadow_color: '#3D0015',
    description_color: '#F9A8C0',
  },
  quick_actions: { bg_color_1: '#ffffff', bg_color_2: '#aa0957', text_color: '#111827', gradient_type: 'none', icon_bg_color: '#f5d6ea' },
};
const THEME_SECTION_FIELDS = {
  footer: [
    { key: 'bg_color_1', label: 'Main Background Color', type: 'color', fallback: '#1f296f' },
    { key: 'bg_color_2', label: 'Second Background Color', type: 'color', fallback: '#c81e1e', allowNull: true },
    { key: 'text_color', label: 'Text Color', type: 'color', fallback: '#ffffff' },
    { key: 'gradient_type', label: 'Background Style', type: 'select', options: GRADIENT_OPTIONS },
  ],
  navbar: [
    { key: 'blur', label: 'Blur Strength', type: 'number', min: 0, step: 1 },
    { key: 'opacity', label: 'Transparency', type: 'number', min: 0, max: 1, step: 0.01 },
    { key: 'bg_color_1', label: 'Main Background Color', type: 'color', fallback: '#1f296f' },
    { key: 'bg_color_2', label: 'Second Background Color', type: 'color', fallback: '#c81e1e', allowNull: true },
    { key: 'text_color', label: 'Text Color', type: 'color', fallback: '#f7f7f7' },
    { key: 'gradient_type', label: 'Background Style', type: 'select', options: GRADIENT_OPTIONS },
  ],
  marquee: [
    { key: 'bg_color_1', label: 'Main Background Color', type: 'color', fallback: '#1a1891' },
    { key: 'bg_color_2', label: 'Second Background Color', type: 'color', fallback: '#c12525', allowNull: true },
    { key: 'text_color', label: 'Text Color', type: 'color', fallback: '#ffffff' },
    { key: 'gradient_type', label: 'Background Style', type: 'select', options: GRADIENT_OPTIONS },
  ],
  page_bg: [
    { key: 'bg_color_1', label: 'Main Background Color', type: 'color', fallback: '#fff5f5' },
    { key: 'bg_color_2', label: 'Second Background Color', type: 'color', fallback: '#f0f1fb' },
    { key: 'gradient_type', label: 'Background Style', type: 'select', options: GRADIENT_OPTIONS },
    { key: 'gradient_angle', label: 'Gradient Angle', type: 'number', min: 0, max: 360, step: 1 },
    { key: 'gradient_transition', label: 'Transition Feel', type: 'select', options: GRADIENT_TRANSITION_OPTIONS },
  ],
  sidebar: [
    { key: 'blur', label: 'Blur Strength', type: 'number', min: 0, step: 1 },
    { key: 'opacity', label: 'Transparency', type: 'number', min: 0, max: 1, step: 0.01 },
    { key: 'bg_color_1', label: 'Main Background Color', type: 'color', fallback: '#a4ccea' },
    { key: 'bg_color_2', label: 'Second Background Color', type: 'color', fallback: '#ebebf4', allowNull: true },
    { key: 'text_color', label: 'Text Color', type: 'color', fallback: '#ffffff' },
    { key: 'button_color', label: 'Button Color', type: 'color', fallback: '#e3e3ee' },
    { key: 'button_text_color', label: 'Button Text Color', type: 'color', fallback: '#ffffff' },
    { key: 'gradient_type', label: 'Background Style', type: 'select', options: GRADIENT_OPTIONS },
  ],
  app_buttons: [
    { key: 'bg_color_1', label: 'Main Background Color', type: 'color', fallback: '#4a42e8' },
    { key: 'bg_color_2', label: 'Second Background Color', type: 'color', fallback: '#4a42e8', allowNull: true },
    { key: 'text_color', label: 'Text Color', type: 'color', fallback: '#ffffff' },
    { key: 'icon_color', label: 'Icon Color', type: 'color', fallback: '#ffffff' },
    { key: 'gradient_type', label: 'Background Style', type: 'select', options: GRADIENT_OPTIONS },
  ],
  advertisement: [
    { key: 'bg_color', label: 'Section Background', type: 'color', fallback: '#6B0F2A' },
    { key: 'bg_opacity', label: 'Section Transparency', type: 'number', min: 0, max: 1, step: 0.01 },
    { key: 'title_color', label: 'Title Color', type: 'color', fallback: '#FFFFFF' },
    { key: 'card_bg_color', label: 'Card Background', type: 'color', fallback: '#6B0F2A' },
    { key: 'badge_bg_color', label: 'Badge Background', type: 'color', fallback: '#FFFFFF' },
    { key: 'subtitle_color', label: 'Subtitle Color', type: 'color', fallback: '#FFD6E0' },
    { key: 'badge_dot_color', label: 'Badge Dot Color', type: 'color', fallback: '#FF4D6D' },
    { key: 'badge_text_color', label: 'Badge Text Color', type: 'color', fallback: '#6B0F2A' },
    { key: 'card_border_color', label: 'Card Border Color', type: 'color', fallback: '#FF6B8A' },
    { key: 'card_shadow_color', label: 'Card Shadow Color', type: 'color', fallback: '#3D0015' },
    { key: 'description_color', label: 'Description Color', type: 'color', fallback: '#F9A8C0' },
  ],
  quick_actions: [
    { key: 'bg_color_1', label: 'Main Background Color', type: 'color', fallback: '#ffffff' },
    { key: 'bg_color_2', label: 'Second Background Color', type: 'color', fallback: '#aa0957', allowNull: true },
    { key: 'text_color', label: 'Text Color', type: 'color', fallback: '#111827' },
    { key: 'icon_bg_color', label: 'Icon Background Color', type: 'color', fallback: '#f5d6ea' },
    { key: 'gradient_type', label: 'Background Style', type: 'select', options: GRADIENT_OPTIONS },
  ],
};
const THEME_SECTION_ORDER = [
  { key: 'footer', label: 'Footer' },
  { key: 'navbar', label: 'Navbar' },
  { key: 'marquee', label: 'Marquee' },
  { key: 'page_bg', label: 'Page Background' },
  { key: 'sidebar', label: 'Sidebar' },
  { key: 'app_buttons', label: 'App Buttons' },
  { key: 'advertisement', label: 'Advertisement' },
  { key: 'quick_actions', label: 'Quick Actions' },
];
const THEME_SECTION_HELP = {
  footer: 'Colors for the bottom area of the app.',
  navbar: 'Controls the top bar look and readability.',
  marquee: 'Style for the running announcement strip.',
  page_bg: 'Overall page background appearance.',
  sidebar: 'Color theme for the left menu panel.',
  app_buttons: 'Common style for buttons and icons.',
  advertisement: 'Colors for sponsors section cards, badges, and text.',
  quick_actions: 'Appearance of quick action cards.',
};
const ANIMATION_OPTIONS = {
  cards: ['fadeUp', 'fadeIn', 'slideUp', 'zoomIn', 'none'],
  navbar: ['fadeSlideDown', 'fadeIn', 'slideDown', 'none'],
  gallery: ['zoomIn', 'fadeIn', 'slideUp', 'none'],
};
const HEX_COLOR_RE = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i;
const DEFAULT_HOME_LAYOUT_OPTIONS = [
  { key: 'gallery', label: 'Gallery' },
  { key: 'quickActions', label: 'Quick Actions' },
  { key: 'sponsors', label: 'Sponsors' },
  { key: 'marquee', label: 'Marquee' },
  { key: 'trustList', label: 'Trust List' },
];
const HOME_LAYOUT_FEATURE_RULES = [
  { key: 'gallery', label: 'Gallery', featureNames: ['feature_gallery', 'gallery'] },
  { key: 'quickActions', label: 'Quick Actions', featureNames: ['feature_quick_actions', 'feature_quickactions', 'quick_actions', 'quickactions', 'quick actions'] },
  { key: 'sponsors', label: 'Sponsors', featureNames: ['feature_sponsors', 'sponsors', 'sponsor'] },
  { key: 'marquee', label: 'Marquee', featureNames: ['feature_marquee', 'marquee'] },
  { key: 'trustList', label: 'Trust List', featureNames: ['feature_trustlist', 'feature_trust_list', 'trustlist', 'trust_list', 'trust list'] },
];
const DEFAULT_HOME_LAYOUT_KEY_SET = new Set(DEFAULT_HOME_LAYOUT_OPTIONS.map((item) => item.key));
const normalizePickerColor = (value, fallback) => (HEX_COLOR_RE.test(String(value || '').trim()) ? String(value).trim() : fallback);
const safeText = (value, fallback = '') => (typeof value === 'string' ? value : fallback);
const normalizeFeatureLayoutName = (value) => String(value || '').trim();
const normalizeFeatureNameKey = (value) => normalizeFeatureLayoutName(value).toLowerCase().replace(/[\s-]+/g, '_');
const createLayoutOrderMap = (layout = [], options = DEFAULT_HOME_LAYOUT_OPTIONS) => {
  const parsedLayout = Array.isArray(layout) ? layout : [];
  const nextMap = {};
  options.forEach((item) => {
    const index = parsedLayout.findIndex((entry) => String(entry || '').trim() === item.key);
    nextMap[item.key] = index >= 0 ? index + 1 : '';
  });
  return nextMap;
};
const buildDefaultHomeLayoutOptions = (enabledFeatures = []) => {
  const enabledNameSet = new Set((enabledFeatures || []).map((feature) => normalizeFeatureNameKey(feature.name)).filter(Boolean));
  const matchedOptions = HOME_LAYOUT_FEATURE_RULES.filter((rule) =>
    rule.featureNames.some((name) => enabledNameSet.has(normalizeFeatureNameKey(name))) ||
    (rule.key === 'quickActions' && Array.from(enabledNameSet).some((name) => name.includes('quick') && name.includes('action')))
  ).map(({ key, label }) => ({ key, label }));
  return matchedOptions.length ? matchedOptions : DEFAULT_HOME_LAYOUT_OPTIONS;
};
const buildLayoutOptions = (layout = [], orderMap = {}, defaultOptions = DEFAULT_HOME_LAYOUT_OPTIONS) => {
  const savedDefaultOptions = (Array.isArray(layout) ? layout : [])
    .map((entry) => normalizeFeatureLayoutName(entry))
    .filter((entry) => DEFAULT_HOME_LAYOUT_KEY_SET.has(entry))
    .map((key) => DEFAULT_HOME_LAYOUT_OPTIONS.find((item) => item.key === key))
    .filter(Boolean);
  const savedFeatureOptions = (Array.isArray(layout) ? layout : [])
    .map((entry) => normalizeFeatureLayoutName(entry))
    .filter((entry) => entry && !DEFAULT_HOME_LAYOUT_KEY_SET.has(entry))
    .map((name) => ({ key: name, label: name, source: 'feature' }));
  const pendingFeatureOptions = Object.entries(orderMap || {})
    .filter(([key, value]) => {
      const featureName = normalizeFeatureLayoutName(key);
      return featureName && !DEFAULT_HOME_LAYOUT_KEY_SET.has(featureName) && Number(value) > 0;
    })
    .map(([name]) => ({ key: name, label: name, source: 'feature' }));
  const optionByKey = new Map();
  [...defaultOptions, ...savedDefaultOptions, ...savedFeatureOptions, ...pendingFeatureOptions].forEach((item) => {
    if (!optionByKey.has(item.key)) optionByKey.set(item.key, item);
  });
  return Array.from(optionByKey.values());
};
const clampChannel = (value) => Math.max(0, Math.min(255, Math.round(value)));
const expandHex = (value = '') => {
  const raw = String(value || '').trim().replace('#', '');
  if (raw.length === 3) {
    return `#${raw.split('').map((char) => `${char}${char}`).join('')}`.toLowerCase();
  }
  if (raw.length === 6) {
    return `#${raw}`.toLowerCase();
  }
  return '';
};
const hexToRgb = (hex) => {
  const normalized = expandHex(hex);
  if (!HEX_COLOR_RE.test(normalized)) return null;
  const raw = normalized.replace('#', '');
  return {
    r: Number.parseInt(raw.slice(0, 2), 16),
    g: Number.parseInt(raw.slice(2, 4), 16),
    b: Number.parseInt(raw.slice(4, 6), 16),
  };
};
const rgbToHex = ({ r, g, b }) =>
  `#${clampChannel(r).toString(16).padStart(2, '0')}${clampChannel(g).toString(16).padStart(2, '0')}${clampChannel(b).toString(16).padStart(2, '0')}`;
const mixRgb = (left, right, ratio = 0.5) => ({
  r: left.r + (right.r - left.r) * ratio,
  g: left.g + (right.g - left.g) * ratio,
  b: left.b + (right.b - left.b) * ratio,
});
const deriveSecondBackgroundColor = (primaryColor, fallback = '#dbeafe') => {
  const rgb = hexToRgb(primaryColor);
  if (!rgb) return fallback;
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  const target = luminance < 0.55 ? { r: 255, g: 255, b: 255 } : { r: 17, g: 24, b: 39 };
  const ratio = luminance < 0.55 ? 0.22 : 0.14;
  return rgbToHex(mixRgb(rgb, target, ratio));
};
const normalizeSectionAutoColors = (section = {}) => {
  if (!section || typeof section !== 'object') return section;
  const backgroundA = safeText(section.bg_color_1, '').trim();
  if (!backgroundA || !HEX_COLOR_RE.test(backgroundA)) return section;
  const backgroundB = safeText(section.bg_color_2, '').trim();
  if (backgroundB) return section;
  return {
    ...section,
    bg_color_2: deriveSecondBackgroundColor(backgroundA),
  };
};
const previewBg = (theme) => {
  const config = theme?.theme_config && typeof theme.theme_config === 'object' ? theme.theme_config : {};
  const colorA = safeText(config?.app_buttons?.bg_color_1, '') || safeText(theme?.primary_color, '') || '#C0241A';
  const colorB = safeText(config?.quick_actions?.bg_color_1, '') || safeText(theme?.secondary_color, '') || '#2B2F7E';
  return `linear-gradient(135deg, ${colorA} 0%, ${colorB} 100%)`;
};
const sectionPreviewBackground = (section = {}, fallback = '#ffffff') => {
  const colorA = safeText(section?.bg_color_1, '') || safeText(section?.bg_color, '') || fallback;
  const colorB = safeText(section?.bg_color_2, '') || deriveSecondBackgroundColor(colorA, colorA);
  const gradientType = safeText(section?.gradient_type, 'none') || 'none';
  const gradientAngle = Number(section?.gradient_angle);
  const angle = Number.isFinite(gradientAngle) ? gradientAngle : 135;
  return gradientType !== 'none'
    ? `${gradientType}-gradient(${angle}deg, ${colorA} 0%, ${colorB} 100%)`
    : colorA;
};
const buildTemplateMobilePreview = (theme) => {
  const config = buildThemeConfigForm(theme?.theme_config || {});
  const navbar = config?.navbar || {};
  const pageBg = config?.page_bg || {};
  const marquee = config?.marquee || {};
  const quickActions = config?.quick_actions || {};
  const appButtons = config?.app_buttons || {};
  const footer = config?.footer || {};

  return {
    navbarBg: sectionPreviewBackground(navbar, '#1f296f'),
    navbarText: safeText(navbar.text_color, '#f7f7f7') || '#f7f7f7',
    pageBg: sectionPreviewBackground(pageBg, '#f6f8fc'),
    marqueeBg: sectionPreviewBackground(marquee, '#1a1891'),
    marqueeText: safeText(marquee.text_color, '#ffffff') || '#ffffff',
    quickBg: sectionPreviewBackground(quickActions, '#ffffff'),
    quickText: safeText(quickActions.text_color, '#111827') || '#111827',
    buttonBg: sectionPreviewBackground(appButtons, '#4a42e8'),
    buttonText: safeText(appButtons.text_color, '#ffffff') || '#ffffff',
    footerBg: sectionPreviewBackground(footer, '#1f296f'),
    footerText: safeText(footer.text_color, '#ffffff') || '#ffffff',
  };
};

const getNestedValue = (obj, keyPath) =>
  String(keyPath)
    .split('.')
    .reduce((acc, part) => (acc && typeof acc === 'object' ? acc[part] : undefined), obj);

const setNestedValue = (obj, keyPath, value) => {
  const parts = String(keyPath).split('.');
  const nextObj = { ...(obj && typeof obj === 'object' ? obj : {}) };
  let cursor = nextObj;
  for (let index = 0; index < parts.length - 1; index += 1) {
    const part = parts[index];
    cursor[part] = cursor[part] && typeof cursor[part] === 'object' ? { ...cursor[part] } : {};
    cursor = cursor[part];
  }
  cursor[parts[parts.length - 1]] = value;
  return nextObj;
};

const buildThemeConfigForm = (source = {}) => {
  const sourceConfig = source && typeof source === 'object' ? source : {};
  const nextConfig = {};

  THEME_SECTION_ORDER.forEach(({ key }) => {
    const defaults = DEFAULT_THEME_SECTION_CONFIG[key] || {};
    const sourceSection = sourceConfig[key] && typeof sourceConfig[key] === 'object' ? sourceConfig[key] : {};
    nextConfig[key] = { ...defaults, ...sourceSection };
    if (defaults.component_overrides && typeof defaults.component_overrides === 'object') {
      nextConfig[key].component_overrides = {
        ...defaults.component_overrides,
        ...(sourceSection.component_overrides && typeof sourceSection.component_overrides === 'object' ? sourceSection.component_overrides : {}),
      };
    }
  });

  return nextConfig;
};

const buildLegacyColorFields = (themeConfig) => {
  const config = buildThemeConfigForm(themeConfig);
  const pageBg = config.page_bg || {};
  const gradientType = safeText(pageBg.gradient_type, 'linear') || 'linear';
  const angle = Number(pageBg.gradient_angle);
  const gradientAngle = Number.isFinite(angle) ? angle : 160;
  const bgOne = safeText(pageBg.bg_color_1, '#f6f8fc') || '#f6f8fc';
  const bgTwo = safeText(pageBg.bg_color_2, '') || deriveSecondBackgroundColor(bgOne, '#eef2ff');
  const fallbackPageBg = gradientType === 'none' ? bgOne : `${gradientType}-gradient(${gradientAngle}deg, ${bgOne} 0%, ${bgTwo} 100%)`;

  return {
    primary_color: safeText(config?.app_buttons?.bg_color_1, '#4a42e8') || '#4a42e8',
    secondary_color: safeText(config?.quick_actions?.bg_color_1, '#fff') || '#fff',
    accent_color: safeText(config?.advertisement?.title_color, '#FFFFFF') || '#FFFFFF',
    accent_bg: safeText(config?.advertisement?.bg_color, '#6B0F2A') || '#6B0F2A',
    navbar_bg: safeText(config?.navbar?.bg_color_1, '#1f296f') || '#1f296f',
    page_bg: fallbackPageBg,
  };
};

export default function ThemePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { userName = 'Admin', trust = null } = location.state || {};
  const currentSidebarNavKey = location.state?.sidebarNavKey || 'dashboard';
  const trustId = trust?.id || null;
  const [currentTrust, setCurrentTrust] = useState(trust);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [isViewMode, setIsViewMode] = useState(false);
  const [showPicker, setShowPicker] = useState(false);
  const [showFeaturePicker, setShowFeaturePicker] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  const [detailId, setDetailId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [assigningId, setAssigningId] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [themeConfigForm, setThemeConfigForm] = useState(buildThemeConfigForm(DEFAULT_THEME_SECTION_CONFIG));
  const [animationConfig, setAnimationConfig] = useState(DEFAULT_ANIMATIONS);
  const [homeLayoutOrder, setHomeLayoutOrder] = useState(createLayoutOrderMap(DEFAULT_NEW_HOME_LAYOUT));
  const [homeLayoutModes, setHomeLayoutModes] = useState(DEFAULT_HOME_LAYOUT_MODES);
  const [enabledFeatures, setEnabledFeatures] = useState([]);

  useEffect(() => {
    if (!trustId) navigate('/dashboard', { replace: true, state: { userName, trust } });
  }, [trustId, userName, trust, navigate]);

  useEffect(() => {
    const load = async () => {
      if (!trustId) return;
      setLoading(true);
      setError('');
      const [{ data: templateData, error: templateErr }, { data: trustData, error: trustErr }] = await Promise.all([
        fetchTemplates(),
        fetchTrustDetails(trustId),
      ]);
      if (templateErr) setError(templateErr.message || 'Unable to load templates.');
      if (trustErr) setError(trustErr.message || 'Unable to load trust theme.');
      setTemplates(templateData || []);
      setCurrentTrust(trustData || trust);
      setLoading(false);
    };
    load();
  }, [trustId, trust]);

  useEffect(() => {
    const loadEnabledFeatures = async () => {
      if (!trustId) return;
      const { data, error: featuresErr } = await fetchFeatureFlags(trustId);
      if (featuresErr) {
        setError(featuresErr.message || 'Unable to load enabled features.');
        return;
      }
      const nextFeatures = (data || [])
        .filter((flag) => flag.is_enabled)
        .map((flag) => ({
          id: flag.features_id || flag.features?.id || flag.id,
          name: normalizeFeatureLayoutName(flag.features?.name || flag.name),
          route: flag.route || '',
        }))
        .filter((feature) => feature.name);
      setEnabledFeatures(nextFeatures);
    };
    loadEnabledFeatures();
  }, [trustId]);



  const filtered = useMemo(() => {
    const term = searchTerm.trim().toLowerCase();
    if (!term) return templates;
    return templates.filter((item) =>
      [item.name, item.description, item.template_key].some((v) => String(v || '').toLowerCase().includes(term))
    );
  }, [templates, searchTerm]);

  const myTemplates = useMemo(
    () => filtered.filter((item) => String(item.trust_id || '') === String(trustId || '')),
    [filtered, trustId]
  );
  const otherTemplates = useMemo(
    () => filtered.filter((item) => String(item.trust_id || '') !== String(trustId || '')),
    [filtered, trustId]
  );
  const activeTemplateId = currentTrust?.template_id || null;
  const selectedTemplate = useMemo(() => templates.find((item) => item.id === selectedId) || null, [templates, selectedId]);
  const detailTemplate = useMemo(() => templates.find((item) => item.id === detailId) || null, [templates, detailId]);
  const canEdit = (item) => String(item?.trust_id || '') === String(trustId || '');
  const defaultHomeLayoutOptions = useMemo(
    () => buildDefaultHomeLayoutOptions(enabledFeatures),
    [enabledFeatures]
  );
  const currentHomeLayout = useMemo(() => {
    try {
      const parsed = JSON.parse(form.home_layout || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }, [form.home_layout]);
  const layoutOptions = useMemo(
    () => buildLayoutOptions(currentHomeLayout, homeLayoutOrder, defaultHomeLayoutOptions),
    [currentHomeLayout, defaultHomeLayoutOptions, homeLayoutOrder]
  );
  const featureOptionsToAdd = useMemo(() => {
    const layoutSet = new Set(currentHomeLayout.map((entry) => normalizeFeatureLayoutName(entry)).filter(Boolean));
    return enabledFeatures.filter((feature) => feature.name && !layoutSet.has(feature.name));
  }, [currentHomeLayout, enabledFeatures]);

  useEffect(() => {
    if (!selectedTemplate) {
      setForm(EMPTY_FORM);
      setThemeConfigForm(buildThemeConfigForm(DEFAULT_THEME_SECTION_CONFIG));
      setAnimationConfig(DEFAULT_ANIMATIONS);
      setHomeLayoutOrder(createLayoutOrderMap(
        DEFAULT_NEW_HOME_LAYOUT,
        buildLayoutOptions(DEFAULT_NEW_HOME_LAYOUT, {}, defaultHomeLayoutOptions)
      ));
      setHomeLayoutModes(DEFAULT_HOME_LAYOUT_MODES);
      return;
    }
    const nextHomeLayout = Array.isArray(selectedTemplate.home_layout)
      ? selectedTemplate.home_layout
      : DEFAULT_NEW_HOME_LAYOUT;
    setForm({
      name: selectedTemplate.name || '',
      description: selectedTemplate.description || '',
      template_key: selectedTemplate.template_key || 'mahila',
      home_layout: pretty(nextHomeLayout, DEFAULT_NEW_HOME_LAYOUT),
      custom_css: selectedTemplate.custom_css || '',
      is_active: selectedTemplate.is_active !== false,
    });
    setThemeConfigForm(buildThemeConfigForm(selectedTemplate.theme_config));
    setAnimationConfig({
      cards: safeText(selectedTemplate?.animations?.cards, DEFAULT_ANIMATIONS.cards) || DEFAULT_ANIMATIONS.cards,
      navbar: safeText(selectedTemplate?.animations?.navbar, DEFAULT_ANIMATIONS.navbar) || DEFAULT_ANIMATIONS.navbar,
      gallery: safeText(selectedTemplate?.animations?.gallery, DEFAULT_ANIMATIONS.gallery) || DEFAULT_ANIMATIONS.gallery,
    });
    setHomeLayoutOrder(createLayoutOrderMap(nextHomeLayout, buildLayoutOptions(nextHomeLayout, {}, defaultHomeLayoutOptions)));
    setHomeLayoutModes({
      ...DEFAULT_HOME_LAYOUT_MODES,
      ...(selectedTemplate?.home_layout_modes && typeof selectedTemplate.home_layout_modes === 'object' ? selectedTemplate.home_layout_modes : {}),
    });
  }, [defaultHomeLayoutOptions, selectedTemplate]);

  const openCreate = () => {
    setSelectedId(null);
    setIsViewMode(false);
    setForm(EMPTY_FORM);
    setThemeConfigForm(buildThemeConfigForm(DEFAULT_THEME_SECTION_CONFIG));
    setAnimationConfig(DEFAULT_ANIMATIONS);
    setHomeLayoutOrder(createLayoutOrderMap(
      DEFAULT_NEW_HOME_LAYOUT,
      buildLayoutOptions(DEFAULT_NEW_HOME_LAYOUT, {}, defaultHomeLayoutOptions)
    ));
    setHomeLayoutModes(DEFAULT_HOME_LAYOUT_MODES);
    setSaveError('');
    setShowFeaturePicker(false);
    setShowForm(true);
    setShowPicker(false);
  };

  const openEdit = (id) => {
    setSelectedId(id);
    setIsViewMode(false);
    setSaveError('');
    setShowForm(true);
    setShowPicker(false);
    setShowDetail(false);
  };

  const openView = (id) => {
    setSelectedId(id);
    setIsViewMode(true);
    setSaveError('');
    setShowForm(true);
    setShowPicker(false);
    setShowDetail(false);
  };

  const openDetail = (id) => {
    setDetailId(id);
    setShowDetail(true);
  };

  const closeThemeForm = () => {
    setShowForm(false);
    setSelectedId(null);
    setSaveError('');
    setIsViewMode(false);
    setShowFeaturePicker(false);
  };

  const handleAssign = async (template) => {
    if (!template?.id || !trustId) return;
    setSaveError('');
    setAssigningId(template.id);
    const { data, error: assignErr } = await assignTemplateToTrust(trustId, template.id);
    if (assignErr) {
      setSaveError(assignErr.message || 'Unable to apply template.');
    } else {
      setCurrentTrust((prev) => ({ ...(prev || {}), ...(data || {}), template_id: template.id }));
      setShowPicker(false);
      setShowDetail(false);
    }
    setAssigningId(null);
  };



  const handleSave = async () => {
    if (isViewMode) return;
    setSaveError('');
    if (!form.name.trim()) {
      setSaveError('Theme name is required.');
      return;
    }
    let homeLayout;
    homeLayout = layoutOptions
      .map((item) => ({
        key: item.key,
        order: Number(homeLayoutOrder[item.key]) || 0,
      }))
      .filter((item) => item.order > 0)
      .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
      .map((item) => item.key);
    if (!homeLayout.length) {
      setSaveError('Home layout mein kam se kam ek section order dena zaroori hai.');
      return;
    }
    const homeLayoutSet = new Set(homeLayout);
    const homeLayoutModesPayload = Object.fromEntries(
      Object.entries(homeLayoutModes)
        .filter(([key, value]) => homeLayoutSet.has(key) && supportsHomeLayoutMode(key) && HOME_LAYOUT_MODE_OPTIONS.includes(value))
    );
    const animations = {
      cards: animationConfig.cards || DEFAULT_ANIMATIONS.cards,
      navbar: animationConfig.navbar || DEFAULT_ANIMATIONS.navbar,
      gallery: animationConfig.gallery || DEFAULT_ANIMATIONS.gallery,
    };
    const normalizedThemeConfig = buildThemeConfigForm(themeConfigForm);
    const autoNormalizedThemeConfig = Object.fromEntries(
      Object.entries(normalizedThemeConfig).map(([sectionKey, sectionValue]) => [
        sectionKey,
        normalizeSectionAutoColors(sectionValue),
      ])
    );
    const legacyThemeColors = buildLegacyColorFields(autoNormalizedThemeConfig);

    const payload = {
      name: form.name.trim(),
      description: form.description.trim() || null,
      template_key: form.template_key.trim() || 'mahila',
      ...legacyThemeColors,
      theme_config: autoNormalizedThemeConfig,
      home_layout: homeLayout,
      home_layout_modes: homeLayoutModesPayload,
      animations,
      custom_css: form.custom_css || '',
      is_active: !!form.is_active,
      trust_id: trustId,
    };

    setSaving(true);
    if (selectedId) {
      if (!canEdit(selectedTemplate)) {
        setSaveError('You can only edit themes linked to your trust.');
        setSaving(false);
        return;
      }
      const { data, error: updateErr } = await updateTemplate(selectedId, payload);
      if (updateErr) setSaveError(updateErr.message || 'Unable to update theme.');
      else if (data) {
        setTemplates((prev) => prev.map((item) => item.id === selectedId ? data : item));
        setShowForm(false);
      }
    } else {
      const { data, error: createErr } = await createTemplate(payload);
      if (createErr) setSaveError(createErr.message || 'Unable to create theme.');
      else if (data) {
        setTemplates((prev) => [data, ...prev]);
        setSelectedId(data.id);
        setShowForm(false);
        setShowPicker(true);
      }
    }
    setSaving(false);
  };

  const updateThemeConfigField = (sectionKey, fieldKey, value) => {
    setThemeConfigForm((prev) => {
      const nextSection = setNestedValue(prev[sectionKey] || {}, fieldKey, value);
      return { ...prev, [sectionKey]: nextSection };
    });
  };

  const handleAddFeatureToLayout = (feature) => {
    const featureName = normalizeFeatureLayoutName(feature?.name);
    if (!featureName) return;
    const maxOrder = Math.max(
      0,
      ...Object.values(homeLayoutOrder).map((value) => Number(value) || 0)
    );
    setHomeLayoutOrder((prev) => ({
      ...prev,
      [featureName]: maxOrder + 1,
    }));
    setHomeLayoutModes((prev) => ({
      ...prev,
      [featureName]: prev[featureName] || 'content',
    }));
    setShowFeaturePicker(false);
  };

  const handleRemoveFeatureFromLayout = (featureName) => {
    const normalizedName = normalizeFeatureLayoutName(featureName);
    if (!normalizedName || DEFAULT_HOME_LAYOUT_KEY_SET.has(normalizedName)) return;
    setHomeLayoutOrder((prev) => {
      const next = { ...prev };
      delete next[normalizedName];
      return next;
    });
    setHomeLayoutModes((prev) => {
      const next = { ...prev };
      delete next[normalizedName];
      return next;
    });
  };

  const updateHomeLayoutMode = (key, mode) => {
    if (!supportsHomeLayoutMode(key) || !HOME_LAYOUT_MODE_OPTIONS.includes(mode)) return;
    setHomeLayoutModes((prev) => ({ ...prev, [key]: mode }));
  };

  const renderThemeField = (sectionKey, field) => {
    const sectionValue = themeConfigForm[sectionKey] || {};
    const currentValue = getNestedValue(sectionValue, field.key);
    const fieldId = `theme-config-${sectionKey}-${field.key.replaceAll('.', '-')}`;

    if (field.type === 'color') {
      const fallback = field.fallback || '#000000';
      const displayValue = currentValue ?? '';
      const sectionMainColor = safeText(getNestedValue(sectionValue, 'bg_color_1'), fallback) || fallback;
      const autoDerived = field.key === 'bg_color_2'
        ? deriveSecondBackgroundColor(sectionMainColor, fallback)
        : '';
      const nativeValue = field.key === 'bg_color_2'
        ? normalizePickerColor(displayValue || autoDerived, fallback)
        : normalizePickerColor(displayValue, fallback);
      return (
        <label className="theme-field theme-color-field" key={fieldId}>
          <span>{field.label}</span>
          <div className="theme-color-input-shell">
            <input
              className="theme-color-text"
              value={displayValue}
              placeholder={field.key === 'bg_color_2' ? 'auto from main color' : (field.allowNull ? 'null' : fallback)}
              disabled={isViewMode}
              onChange={(e) => updateThemeConfigField(sectionKey, field.key, e.target.value || (field.allowNull ? null : fallback))}
            />
            <input
              className="theme-color-native"
              id={fieldId}
              type="color"
              aria-label={`${field.label} picker`}
              value={nativeValue}
              disabled={isViewMode}
              onChange={(e) => updateThemeConfigField(sectionKey, field.key, e.target.value)}
            />
            {field.key === 'bg_color_2' && (
              <button
                type="button"
                className="theme-color-auto-btn"
                disabled={isViewMode}
                onClick={() => updateThemeConfigField(sectionKey, field.key, null)}
                title="Auto derive from main background color"
              >
                Auto
              </button>
            )}
          </div>
        </label>
      );
    }

    if (field.type === 'select') {
      return (
        <label className="theme-field" key={fieldId}>
          <span>{field.label}</span>
          <select
            value={currentValue ?? ''}
            disabled={isViewMode}
            onChange={(e) => updateThemeConfigField(sectionKey, field.key, e.target.value)}
          >
            {(field.options || []).map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </select>
        </label>
      );
    }

    if (field.type === 'number') {
      return (
        <label className="theme-field" key={fieldId}>
          <span>{field.label}</span>
          <input
            type="number"
            min={field.min}
            max={field.max}
            step={field.step || 1}
            value={currentValue ?? ''}
            disabled={isViewMode}
            onChange={(e) => updateThemeConfigField(sectionKey, field.key, e.target.value === '' ? null : Number(e.target.value))}
          />
        </label>
      );
    }

    return (
      <label className="theme-field" key={fieldId}>
        <span>{field.label}</span>
        <input
          value={currentValue ?? ''}
          disabled={isViewMode}
          onChange={(e) => updateThemeConfigField(sectionKey, field.key, e.target.value)}
        />
      </label>
    );
  };

  const renderSectionPreview = (sectionKey) => {
    const section = themeConfigForm?.[sectionKey] || {};
    const backgroundA = safeText(section.bg_color_1, '') || safeText(section.bg_color, '') || '#ffffff';
    const backgroundB = safeText(section.bg_color_2, '') || deriveSecondBackgroundColor(backgroundA, backgroundA);
    const textColor = safeText(section.text_color, '') || '#111827';
    const gradientType = safeText(section.gradient_type, 'none') || 'none';
    const gradientAngle = Number(section.gradient_angle);
    const angle = Number.isFinite(gradientAngle) ? gradientAngle : 135;
    const previewBackground = gradientType !== 'none'
      ? `${gradientType}-gradient(${angle}deg, ${backgroundA} 0%, ${backgroundB} 100%)`
      : backgroundA;
    const iconBg = safeText(section.icon_bg_color, '#e5e7eb') || '#e5e7eb';

    if (sectionKey === 'navbar') {
      return (
        <div className="theme-config-preview theme-config-preview-app">
          <div className="theme-config-preview-navbar" style={{ background: previewBackground, color: textColor }}>
            <span>☰</span>
            <strong>Home</strong>
            <span>🔔</span>
          </div>
          <div className="theme-config-preview-body">Navbar top area preview</div>
        </div>
      );
    }

    if (sectionKey === 'footer') {
      return (
        <div className="theme-config-preview theme-config-preview-app">
          <div className="theme-config-preview-body">Page Content</div>
          <div className="theme-config-preview-footer" style={{ background: previewBackground, color: textColor }}>
            <span>Home</span>
            <span>Profile</span>
            <span>More</span>
          </div>
        </div>
      );
    }

    if (sectionKey === 'sidebar') {
      const buttonColor = safeText(section.button_color, '#C0241A') || '#C0241A';
      const buttonText = safeText(section.button_text_color, '#ffffff') || '#ffffff';
      return (
        <div className="theme-config-preview theme-config-preview-sidebar" style={{ background: previewBackground, color: textColor }}>
          <div className="theme-config-preview-side-item">Dashboard</div>
          <div className="theme-config-preview-side-item">Members</div>
          <button type="button" className="theme-config-preview-btn" style={{ background: buttonColor, color: buttonText }}>
            Action Button
          </button>
        </div>
      );
    }

    if (sectionKey === 'marquee') {
      return (
        <div className="theme-config-preview theme-config-preview-app">
          <div className="theme-config-preview-marquee" style={{ background: previewBackground, color: textColor }}>
            Emergency services available | New updates
          </div>
        </div>
      );
    }

    if (sectionKey === 'page_bg') {
      return (
        <div className="theme-config-preview theme-config-preview-pagebg" style={{ background: previewBackground }}>
          <div className="theme-config-preview-phone-card" />
          <div className="theme-config-preview-phone-card short" />
        </div>
      );
    }

    if (sectionKey === 'app_buttons') {
      return (
        <div className="theme-config-preview">
          <button type="button" className="theme-config-preview-btn" style={{ background: previewBackground, color: textColor }}>
            Primary Button
          </button>
          <button type="button" className="theme-config-preview-btn" style={{ background: previewBackground, color: textColor }}>
            Secondary Button
          </button>
        </div>
      );
    }

    if (sectionKey === 'quick_actions') {
      return (
        <div className="theme-config-preview theme-config-preview-quick-actions">
          <div className="theme-config-preview-action-card" style={{ background: previewBackground, color: textColor }}>
            <span className="theme-config-preview-action-icon" style={{ background: iconBg }} />
            <strong>Directory</strong>
          </div>
          <div className="theme-config-preview-action-card" style={{ background: previewBackground, color: textColor }}>
            <span className="theme-config-preview-action-icon" style={{ background: iconBg }} />
            <strong>Reports</strong>
          </div>
        </div>
      );
    }

    if (sectionKey === 'advertisement') {
      return (
        <div className="theme-config-preview" style={{ background: previewBackground, color: textColor }}>
          <div style={{ fontWeight: 800 }}>Special Offer / Notice</div>
          <div style={{ fontSize: '12px', opacity: 0.9 }}>Short message preview</div>
        </div>
      );
    }

    return (
      <div className="theme-config-preview" style={{ background: previewBackground, color: textColor }}>
        <div className="theme-config-preview-line" />
        <div className="theme-config-preview-line short" />
        <div style={{ fontSize: '12px', fontWeight: 700 }}>Sample Text</div>
      </div>
    );
  };

  const renderHomeLayoutField = () => (
    <div className="theme-field theme-span-2" key="home_layout_order">
      <div className="theme-layout-order-title">
        <span>Home Layout Order</span>
        {!isViewMode && (
          <button
            type="button"
            className="theme-icon-btn"
            onClick={() => setShowFeaturePicker(true)}
            disabled={!featureOptionsToAdd.length}
            title={featureOptionsToAdd.length ? 'Add enabled feature' : 'No enabled features available to add'}
          >
            Add
          </button>
        )}
      </div>
      <div className="theme-layout-order-card theme-home-layout-card">
        <div className="theme-layout-order-list">
          {layoutOptions.map((item) => (
            <label className="theme-layout-order-row" key={item.key}>
              <div className="theme-layout-order-copy">
                <strong>{item.label}</strong>
                <small>{item.source === 'feature' ? 'feature' : item.key}</small>
              </div>
              <div className="theme-layout-order-controls">
                {supportsHomeLayoutMode(item.key) && (
                  <div className="theme-layout-mode-toggle" aria-label={`${item.label} layout mode`}>
                    {HOME_LAYOUT_MODE_OPTIONS.map((mode) => (
                      <button
                        key={`${item.key}-${mode}`}
                        type="button"
                        className={homeLayoutModes[item.key] === mode ? 'active' : ''}
                        disabled={isViewMode}
                        onClick={() => updateHomeLayoutMode(item.key, mode)}
                      >
                        {mode === 'content' ? 'Content' : 'Box'}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  type="number"
                  min="0"
                  placeholder="-"
                  value={homeLayoutOrder[item.key]}
                  disabled={isViewMode}
                  onChange={(e) => {
                    const rawValue = e.target.value;
                    setHomeLayoutOrder((prev) => ({ ...prev, [item.key]: rawValue === '' ? '' : Math.max(0, Number(rawValue) || 0) }));
                  }}
                />
                {item.source === 'feature' && !isViewMode && (
                  <button
                    type="button"
                    className="theme-layout-remove-btn"
                    onClick={() => handleRemoveFeatureFromLayout(item.key)}
                    title={`Remove ${item.label}`}
                    aria-label={`Remove ${item.label}`}
                  >
                    Delete
                  </button>
                )}
              </div>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  const renderAnimationsField = () => (
    <div className="theme-field theme-span-2" key="animations_ui">
      <span>Animation Settings</span>
      <div className="theme-layout-order-card">
        <div className="theme-layout-order-list">
          {[
            { key: 'cards', label: 'Cards Animation' },
            { key: 'navbar', label: 'Navbar Animation' },
            { key: 'gallery', label: 'Gallery Animation' },
          ].map((item) => (
            <label className="theme-layout-order-row" key={item.key}>
              <div className="theme-layout-order-copy">
                <strong>{item.label}</strong>
                <small>{item.key}</small>
              </div>
              <select
                value={animationConfig[item.key] || DEFAULT_ANIMATIONS[item.key]}
                disabled={isViewMode}
                onChange={(e) =>
                  setAnimationConfig((prev) => ({
                    ...prev,
                    [item.key]: e.target.value,
                  }))
                }
              >
                {(ANIMATION_OPTIONS[item.key] || []).map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </label>
          ))}
        </div>
      </div>
    </div>
  );

  useEffect(() => {
    const generatedLayout = layoutOptions
      .map((item) => ({
        key: item.key,
        order: Number(homeLayoutOrder[item.key]) || 0,
      }))
      .filter((item) => item.order > 0)
      .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key))
      .map((item) => item.key);
    setForm((prev) => {
      const nextHomeLayout = pretty(generatedLayout, []);
      if (prev.home_layout === nextHomeLayout) return prev;
      return { ...prev, home_layout: nextHomeLayout };
    });
  }, [homeLayoutOrder, layoutOptions]);

  const combinedPreview = useMemo(
    () => buildTemplateMobilePreview({ theme_config: themeConfigForm }),
    [themeConfigForm]
  );
  const sidebarPreview = useMemo(() => {
    const sidebar = themeConfigForm?.sidebar || {};
    return {
      bg: sectionPreviewBackground(sidebar, '#a4ccea'),
      text: safeText(sidebar.text_color, '#ffffff') || '#ffffff',
      buttonBg: safeText(sidebar.button_color, '#e3e3ee') || '#e3e3ee',
      buttonText: safeText(sidebar.button_text_color, '#ffffff') || '#ffffff',
    };
  }, [themeConfigForm]);
  const advertisementPreview = useMemo(() => {
    const ad = themeConfigForm?.advertisement || {};
    return {
      bg: safeText(ad.bg_color, '#eef2ff') || '#eef2ff',
      text: safeText(ad.text_color, '#4a42e8') || '#4a42e8',
      opacity: Number.isFinite(Number(ad.bg_opacity)) ? Number(ad.bg_opacity) : 1,
    };
  }, [themeConfigForm]);
  const previewHomeLayoutCards = useMemo(
    () =>
      layoutOptions
        .map((item) => ({
          key: item.key,
          label: item.label,
          order: Number(homeLayoutOrder[item.key]) || 0,
        }))
        .filter((item) => item.order > 0)
        .sort((a, b) => a.order - b.order || a.key.localeCompare(b.key)),
    [homeLayoutOrder]
  );

  if (!trustId) return null;

  return (
    <div className="theme-root">
      <Sidebar
        trustName={currentTrust?.name || trust?.name || 'Trust'}
        onDashboard={() => navigate('/dashboard', { state: { userName, trust: currentTrust || trust, sidebarNavKey: currentSidebarNavKey } })}
        onLogout={() => navigate('/login')}
      />
      <main className="theme-main">
        <PageHeader
          title="Theme"
          subtitle="Manage templates and trust theme selection"
          onBack={() => navigate('/dashboard', { state: { userName, trust: currentTrust || trust, sidebarNavKey: currentSidebarNavKey } })}
          right={<button className="theme-add-btn" onClick={() => setShowPicker(true)}>Select Theme</button>}
        />

        {error && <div className="theme-error">{error}</div>}
        {saveError && <div className="theme-error">{saveError}</div>}

        <div className={`theme-content ${showForm ? 'form-only' : ''}`}>
          {!showForm && (
            <>
          <section className="theme-list-shell">
            <div className="theme-list-head">
              <div>
                <h3>Theme Templates</h3>
                <p>Pick, edit and apply templates for {currentTrust?.name || trust?.name || 'this trust'}.</p>
              </div>
              <div className="theme-list-meta">
                <span>Templates: {templates.length}</span>
                <button className="theme-add-btn" onClick={openCreate} type="button">Create Theme</button>
              </div>
            </div>

          <div className="theme-list">
            {loading && <div className="theme-loading">Loading themes...</div>}
            {!loading && templates.filter((item) => item.is_active !== false).length === 0 && (
              <div className="theme-empty">
                <div className="theme-empty-icon">T</div>
                <h3>No themes yet</h3>
                <p>Create your first theme template to get started.</p>
                <button className="theme-add-btn" onClick={openCreate}>Create Theme</button>
              </div>
            )}
            {!loading && templates.filter((item) => item.is_active !== false).map((theme) => {
              const previewData = buildTemplateMobilePreview(theme);
              return (
                <div key={theme.id} className={`theme-card ${activeTemplateId === theme.id ? 'active' : ''} ${canEdit(theme) ? 'my' : 'other'}`} onClick={() => openDetail(theme.id)}>
                  <div className="theme-card-preview" style={{ background: previewBg(theme) }}>
                    <div className="theme-preview-phone" style={{ background: previewData.pageBg }}>
                      <div className="theme-preview-phone-navbar" style={{ background: previewData.navbarBg, color: previewData.navbarText }}>
                        <span>Ek Udaan</span>
                        <span>Menu</span>
                      </div>
                      <div className="theme-preview-phone-body">
                        <div className="theme-preview-phone-quick" style={{ background: previewData.quickBg, color: previewData.quickText }}>
                          Sample quick action
                        </div>
                        <button className="theme-preview-phone-btn" type="button" style={{ background: previewData.buttonBg, color: previewData.buttonText }}>
                          Donate Now
                        </button>
                        <div className="theme-preview-phone-marquee" style={{ background: previewData.marqueeBg, color: previewData.marqueeText }}>
                          Emergency update running...
                        </div>
                      </div>
                      <div className="theme-preview-phone-footer" style={{ background: previewData.footerBg, color: previewData.footerText }}>
                        Home  |  Profile
                      </div>
                    </div>
                  </div>
                  <div className="theme-card-body">
                    <div className="theme-card-title-row">
                      <div className="theme-card-title">{theme.name}</div>
                      <span className={`theme-card-badge ${canEdit(theme) ? 'my' : 'other'}`}>{canEdit(theme) ? 'My' : 'Other'}</span>
                    </div>
                    <div className="theme-card-sub">{theme.template_key || 'template'}</div>
                    {theme.description && <div className="theme-card-tag">{theme.description}</div>}
                  </div>
                  <div className="theme-card-actions">
                    <button className={`theme-status-btn ${activeTemplateId === theme.id ? 'active' : 'inactive'}`} type="button" onClick={(e) => { e.stopPropagation(); handleAssign(theme); }}>
                      {assigningId === theme.id ? 'Applying...' : activeTemplateId === theme.id ? 'Applied' : 'Apply'}
                    </button>
                    {canEdit(theme) && <button className="theme-icon-btn" type="button" onClick={(e) => { e.stopPropagation(); openEdit(theme.id); }}>Edit</button>}
                    {!canEdit(theme) && <button className="theme-icon-btn" type="button" onClick={(e) => { e.stopPropagation(); openView(theme.id); }}>View</button>}
                  </div>
                </div>
              );
            })}
          </div>
          </section>
            </>
          )}

          {showForm && (
            <>
              {isViewMode && (
                <button
                  className="theme-view-floating-close"
                  type="button"
                  onClick={closeThemeForm}
                  aria-label="Close view"
                  title="Close view"
                >
                  X
                </button>
              )}
              <section className="theme-form">
                <div className="theme-form-card">
                  <div className="theme-form-head">
                    <div className="theme-form-title">{isViewMode ? 'View Theme' : selectedId ? 'Edit Theme' : 'Create Theme'}</div>
                  </div>
                  <div className="theme-live-preview-wrap">
                    <div className="theme-live-preview-head">
                      <strong>Live Mobile Preview</strong>
                      <small>{form.template_key || 'template'}</small>
                    </div>
                    <div className="theme-live-preview-shell">
                      <div className="theme-live-preview-sidebar" style={{ background: sidebarPreview.bg, color: sidebarPreview.text }}>
                        <span>Dashboard</span>
                        <span>Menu</span>
                        <span>Quick Actions</span>
                        <button type="button" style={{ background: sidebarPreview.buttonBg, color: sidebarPreview.buttonText }}>
                          Switch Trust
                        </button>
                      </div>
                      <div className="theme-live-preview-phone" style={{ background: combinedPreview.pageBg }}>
                        <div className="theme-live-preview-navbar" style={{ background: combinedPreview.navbarBg, color: combinedPreview.navbarText }}>
                          <span>Ek Udaan</span>
                          <span>Menu</span>
                        </div>
                        <div className="theme-live-preview-body">
                          <div className="theme-live-preview-quick" style={{ background: combinedPreview.quickBg, color: combinedPreview.quickText }}>
                            Sample quick action
                          </div>
                          <button
                            type="button"
                            className="theme-live-preview-btn"
                            style={{ background: combinedPreview.buttonBg, color: combinedPreview.buttonText }}
                          >
                            Donate Now
                          </button>
                          <div className="theme-live-preview-marquee" style={{ background: combinedPreview.marqueeBg, color: combinedPreview.marqueeText }}>
                            Emergency update running...
                          </div>
                          <div className="theme-live-preview-ad" style={{ background: advertisementPreview.bg, color: advertisementPreview.text, opacity: advertisementPreview.opacity }}>
                            Special offer / notice area
                          </div>
                          <div className="theme-live-preview-layout">
                            {previewHomeLayoutCards.length ? (
                              previewHomeLayoutCards.map((item) => (
                                <span key={`${item.key}-${item.order}`}>{item.order}. {item.label}</span>
                              ))
                            ) : (
                              <span>Set home layout order to preview</span>
                            )}
                          </div>
                        </div>
                        <div className="theme-live-preview-footer" style={{ background: combinedPreview.footerBg, color: combinedPreview.footerText }}>
                          Home | Profile | More
                        </div>
                      </div>
                    </div>
                  </div>
                <div className="theme-grid">
                  <label className="theme-field"><span>Name *</span><input value={form.name} disabled={isViewMode} onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))} /></label>
                  <label className="theme-field"><span>Template Key</span><input value={form.template_key} disabled={isViewMode} onChange={(e) => setForm((p) => ({ ...p, template_key: e.target.value }))} /></label>
                  <label className="theme-field theme-span-2"><span>Description</span><textarea rows="3" value={form.description} disabled={isViewMode} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} /></label>
                  <div className="theme-field theme-span-2">
                    <span>Colors</span>
                  </div>
                  <div className="theme-span-2 theme-config-groups">
                    {THEME_SECTION_ORDER.map((section) => (
                      <div className="theme-config-group" key={section.key}>
                        <div className="theme-config-group-head-row">
                          <div>
                            <div className="theme-config-group-head">{section.label}</div>
                            <div className="theme-config-group-help">{THEME_SECTION_HELP[section.key] || ''}</div>
                          </div>
                          {renderSectionPreview(section.key)}
                        </div>
                        <div className="theme-config-group-grid">
                          {(THEME_SECTION_FIELDS[section.key] || []).map((field) => renderThemeField(section.key, field))}
                        </div>
                      </div>
                    ))}
                  </div>
                  {renderHomeLayoutField()}
                  {renderAnimationsField()}
                  <label className="theme-field theme-span-2"><span>Custom CSS</span><textarea rows="5" value={form.custom_css} disabled={isViewMode} onChange={(e) => setForm((p) => ({ ...p, custom_css: e.target.value }))} /></label>
                  <label className="theme-check"><input type="checkbox" checked={form.is_active} disabled={isViewMode} onChange={(e) => setForm((p) => ({ ...p, is_active: e.target.checked }))} /><span>Template is active</span></label>
                </div>
                <div className="theme-form-actions">
                  <button className="theme-secondary-btn" type="button" onClick={closeThemeForm}>Close</button>
                  {!isViewMode && <button className="theme-primary-btn" type="button" onClick={handleSave} disabled={saving}>{saving ? 'Saving...' : 'Save Theme'}</button>}
                </div>
              </div>
              </section>
            </>
          )}

          {showPicker && (
            <div className="theme-modal-overlay" onClick={() => setShowPicker(false)}>
              <div className="theme-modal" onClick={(e) => e.stopPropagation()}>
                <div className="theme-modal-head">
                  <div><h3>Select Theme</h3><p>Search by name, description, or template key.</p></div>
                  <button className="theme-modal-close" onClick={() => setShowPicker(false)} type="button">x</button>
                </div>
                <div className="theme-modal-search">
                  <input placeholder="Search themes..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
                  <button className="theme-add-btn" onClick={openCreate} type="button">Create Theme</button>
                </div>
                <div className="theme-modal-list">
                  {myTemplates.length > 0 && <div className="theme-modal-section my"><div className="theme-modal-section-title">My Themes</div>{myTemplates.map((item) => (
                    <div key={item.id} className="theme-modal-item" onClick={() => openDetail(item.id)}>
                      <div><div className="theme-modal-title-row"><div className="theme-modal-title">{item.name}</div><span className="theme-modal-badge my">My</span></div><div className="theme-modal-sub">{item.template_key || 'template'}</div><div className="theme-modal-sub">{item.description || 'No description'}</div></div>
                      <div className="theme-modal-actions"><button className="theme-icon-btn" type="button" onClick={(e) => { e.stopPropagation(); handleAssign(item); }}>{activeTemplateId === item.id ? 'Applied' : 'Apply'}</button><button className="theme-icon-btn" type="button" onClick={(e) => { e.stopPropagation(); openEdit(item.id); }}>Edit</button></div>
                    </div>
                  ))}</div>}
                  {otherTemplates.length > 0 && <div className="theme-modal-section other"><div className="theme-modal-section-title">Other Themes</div>{otherTemplates.map((item) => (
                    <div key={item.id} className="theme-modal-item" onClick={() => openDetail(item.id)}>
                      <div><div className="theme-modal-title-row"><div className="theme-modal-title">{item.name}</div><span className="theme-modal-badge other">Other</span></div><div className="theme-modal-sub">{item.template_key || 'template'}</div><div className="theme-modal-sub">{item.description || 'No description'}</div></div>
                      <div className="theme-modal-actions"><button className="theme-icon-btn" type="button" onClick={(e) => { e.stopPropagation(); handleAssign(item); }}>{activeTemplateId === item.id ? 'Applied' : 'Apply'}</button><button className="theme-icon-btn" type="button" onClick={(e) => { e.stopPropagation(); openView(item.id); }}>View</button></div>
                    </div>
                  ))}</div>}
                  {filtered.length === 0 && <div className="theme-modal-empty">No themes found.</div>}
                </div>
              </div>
            </div>
          )}

          {showFeaturePicker && (
            <div className="theme-modal-overlay" onClick={() => setShowFeaturePicker(false)}>
              <div className="theme-modal theme-feature-picker-modal" onClick={(e) => e.stopPropagation()}>
                <div className="theme-modal-head">
                  <div>
                    <h3>Add Feature</h3>
                    <p>Enabled feature flags for this trust.</p>
                  </div>
                  <button className="theme-modal-close" onClick={() => setShowFeaturePicker(false)} type="button">x</button>
                </div>
                <div className="theme-modal-list">
                  {featureOptionsToAdd.length ? featureOptionsToAdd.map((feature) => (
                    <button
                      key={feature.id || feature.name}
                      type="button"
                      className="theme-modal-item theme-feature-picker-item"
                      onClick={() => handleAddFeatureToLayout(feature)}
                    >
                      <div>
                        <div className="theme-modal-title">{feature.name}</div>
                        <div className="theme-modal-sub">{feature.route || 'No route'}</div>
                      </div>
                      <span className="theme-modal-badge my">Add</span>
                    </button>
                  )) : (
                    <div className="theme-modal-empty">No enabled features available to add.</div>
                  )}
                </div>
              </div>
            </div>
          )}

          {showDetail && detailTemplate && (
            <div className="theme-modal-overlay" onClick={() => setShowDetail(false)}>
              <div className="theme-modal theme-detail-modal" onClick={(e) => e.stopPropagation()}>
                <div className="theme-modal-head">
                  <div><h3>{detailTemplate.name}</h3><p>{detailTemplate.description || detailTemplate.template_key || 'Theme template'}</p></div>
                  <button className="theme-modal-close" onClick={() => setShowDetail(false)} type="button">x</button>
                </div>
                <div className="theme-detail-preview" style={{ background: previewBg(detailTemplate) }}>
                  <div className="theme-detail-chip-row"><span /><span /><span /></div>
                  <div className="theme-detail-panel" />
                  <div className="theme-detail-grid"><div /><div /><div /></div>
                </div>
                <div className="theme-detail-info">
                  <div><strong>Template key:</strong> {detailTemplate.template_key || '-'}</div>
                  <div><strong>Assigned:</strong> {activeTemplateId === detailTemplate.id ? 'Yes' : 'No'}</div>
                </div>
                <div className="theme-detail-actions">
                  <button className="theme-icon-btn" type="button" onClick={() => handleAssign(detailTemplate)}>{activeTemplateId === detailTemplate.id ? 'Applied' : 'Apply Theme'}</button>
                  {canEdit(detailTemplate) && <button className="theme-icon-btn" type="button" onClick={() => openEdit(detailTemplate.id)}>Edit Theme</button>}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
