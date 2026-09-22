import { supabaseAdmin } from '../lib/supabaseAdmin.js';

const TABLE_NAME = 'prompt';

export async function getPromptTemplate({
  pageName,
  pageNames,
  promptType,
  fallbackPrompt = '',
}) {
  try {
    const names = [
      ...((Array.isArray(pageNames) ? pageNames : []).map((item) => String(item || '').trim())),
      String(pageName || '').trim(),
    ].filter(Boolean);
    if (!names.length) return String(fallbackPrompt || '').trim();

    const { data, error } = await supabaseAdmin
      .from(TABLE_NAME)
      .select('base_prompt, version')
      .in('page_name', names)
      .eq('prompt_type', String(promptType || '').trim())
      .eq('is_active', true)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) return String(fallbackPrompt || '').trim();
    const fromDb = String(data?.base_prompt || '').trim();
    return fromDb || String(fallbackPrompt || '').trim();
  } catch {
    return String(fallbackPrompt || '').trim();
  }
}

export function renderPromptTemplate(template, variables = {}) {
  let output = String(template || '');
  Object.entries(variables).forEach(([key, value]) => {
    const token = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    output = output.replace(token, String(value ?? ''));
  });
  return output.trim();
}
