import { supabase } from '../lib/supabase';
import { cachedQuery, invalidateCache } from './requestCache';

const DEFAULT_HOME_LAYOUT = ['trustList', 'sponsors', 'marquee', 'gallery', 'quickActions'];
const DEFAULT_ANIMATIONS = {
  cards: 'fadeUp',
  navbar: 'fadeSlideDown',
  gallery: 'zoomIn',
};
const DEFAULT_THEME_CONFIG = {
  primary_color: '#4a42e8',
  secondary_color: '#a4ccea',
  accent_color: '#4a42e8',
  accent_bg: '#eef2ff',
  navbar_bg: '#1f296f',
  page_bg: 'linear-gradient(180deg,#f6f8fc 0%,#eef2ff 100%)',
};

function normalizeTemplateRow(row = {}) {
  const themeConfig =
    row?.theme_config && typeof row.theme_config === 'object'
      ? { ...DEFAULT_THEME_CONFIG, ...row.theme_config }
      : { ...DEFAULT_THEME_CONFIG };

  return {
    ...row,
    theme_config: themeConfig,
    primary_color: themeConfig.primary_color,
    secondary_color: themeConfig.secondary_color,
    accent_color: themeConfig.accent_color,
    accent_bg: themeConfig.accent_bg,
    navbar_bg: themeConfig.navbar_bg,
    page_bg: themeConfig.page_bg,
  };
}

function sanitizeTemplatePayload(payload = {}, existingThemeConfig = {}) {
  const mergedThemeConfig = {
    ...DEFAULT_THEME_CONFIG,
    ...(existingThemeConfig && typeof existingThemeConfig === 'object' ? existingThemeConfig : {}),
    ...(payload.theme_config && typeof payload.theme_config === 'object' ? payload.theme_config : {}),
    ...(payload.primary_color !== undefined ? { primary_color: payload.primary_color } : {}),
    ...(payload.secondary_color !== undefined ? { secondary_color: payload.secondary_color } : {}),
    ...(payload.accent_color !== undefined ? { accent_color: payload.accent_color } : {}),
    ...(payload.accent_bg !== undefined ? { accent_bg: payload.accent_bg } : {}),
    ...(payload.navbar_bg !== undefined ? { navbar_bg: payload.navbar_bg } : {}),
    ...(payload.page_bg !== undefined ? { page_bg: payload.page_bg } : {}),
  };

  return {
    ...(payload.name !== undefined ? { name: payload.name } : {}),
    ...(payload.description !== undefined ? { description: payload.description } : {}),
    ...(payload.home_layout !== undefined ? { home_layout: payload.home_layout || DEFAULT_HOME_LAYOUT } : {}),
    ...(payload.home_layout_modes !== undefined ? { home_layout_modes: payload.home_layout_modes || {} } : {}),
    ...(payload.animations !== undefined ? { animations: payload.animations || DEFAULT_ANIMATIONS } : {}),
    ...(payload.custom_css !== undefined ? { custom_css: payload.custom_css || '' } : {}),
    ...(payload.template_key !== undefined ? { template_key: payload.template_key || 'mahila' } : {}),
    ...(payload.trust_id !== undefined ? { trust_id: payload.trust_id ? String(payload.trust_id) : null } : {}),
    theme_config: mergedThemeConfig,
  };
}

export async function fetchTemplates() {
  return cachedQuery('theme:templates', async () => {
    const { data, error } = await supabase
      .from('app_templates')
      .select('*')
      .order('created_at', { ascending: false });

    return { data: (data || []).map(normalizeTemplateRow), error };
  }, 30000);
}

export async function createTemplate(payload) {
  const normalized = sanitizeTemplatePayload({
    ...payload,
    home_layout: payload.home_layout || DEFAULT_HOME_LAYOUT,
    animations: payload.animations || DEFAULT_ANIMATIONS,
  });

  const { data, error } = await supabase
    .from('app_templates')
    .insert([normalized])
    .select('*')
    .single();

  if (!error) invalidateCache('theme:');
  return { data: data ? normalizeTemplateRow(data) : null, error };
}

export async function updateTemplate(id, updates) {
  const normalized = sanitizeTemplatePayload(updates);
  const { data, error } = await supabase
    .from('app_templates')
    .update(normalized)
    .eq('id', id)
    .select('*')
    .single();

  if (!error) invalidateCache('theme:');
  return { data: data ? normalizeTemplateRow(data) : null, error };
}

export async function assignTemplateToTrust(trustId, templateId) {
  if (!trustId) return { data: null, error: { message: 'No trust ID provided' } };

  const { data, error } = await supabase
    .from('Trust')
    .update({
      template_id: templateId,
    })
    .eq('id', trustId)
    .select('*')
    .single();

  if (!error) invalidateCache('theme:');
  return { data, error };
}
