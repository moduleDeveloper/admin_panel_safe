-- Prompt templates for Create Video pipeline (DB-driven base prompts)

create table if not exists public.video_prompt_templates (
  id uuid primary key default gen_random_uuid(),
  page_name text not null,
  prompt_type text not null check (prompt_type in ('scene_plan', 'scene_image', 'motion')),
  base_prompt text not null,
  is_active boolean not null default true,
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists uq_video_prompt_templates_page_type_version
  on public.video_prompt_templates(page_name, prompt_type, version);

create unique index if not exists uq_video_prompt_templates_active
  on public.video_prompt_templates(page_name, prompt_type)
  where is_active = true;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_video_prompt_templates_updated_at on public.video_prompt_templates;
create trigger trg_video_prompt_templates_updated_at
before update on public.video_prompt_templates
for each row execute procedure public.set_updated_at();

insert into public.video_prompt_templates (page_name, prompt_type, base_prompt, is_active, version)
values
(
  'Scene Script',
  'scene_plan',
  'You are an AI cinematic scene planner for short marketing videos. Return strict JSON only. Generate scene-by-scene script, image prompts, motion prompts, camera direction, and transitions. Each scene must include scene_number, start_sec, end_sec, duration_sec, narration, visual_description, image_prompt, motion_prompt, camera_direction, transition, logo_placement. Use exactly {{computedSceneCount}} scenes. Each scene duration must be <= {{sceneWindowSec}} seconds. Distribute timeline based on total voiceover duration ({{normalizedDuration}}s). Every scene must be at least {{minSceneSec}} second. Keep scene continuity and avoid repetitive visuals.',
  true,
  1
),
(
  'Scene Approval',
  'scene_image',
  'Create exactly one cinematic frame for this scene.
Narration is the primary source of truth for subject and action.
Scene Narration (must be respected): {{sceneNarration}}
Visual Direction (style/composition guide): {{sceneDescription}}
Do not introduce unrelated hero objects.
Keep composition coherent with narration and preserve cultural context.
No text, no watermark.',
  true,
  1
),
(
  'Motion Generation',
  'motion',
  'You are an AI cinematic motion director. Generate only one motion prompt line for a single scene. Keep it practical for image-to-video animation. Include camera movement, subject movement, pacing, and transition feel. Do not include markdown or numbering. Keep output concise, premium, and non-repetitive.',
  true,
  1
)
on conflict (page_name, prompt_type, version) do nothing;
