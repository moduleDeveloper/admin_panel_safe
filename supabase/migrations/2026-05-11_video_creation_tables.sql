-- Video Creation: trust-scoped schema
-- Run in Supabase SQL Editor.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'video_project_status') then
    create type public.video_project_status as enum (
      'draft',
      'script_generated',
      'script_approved',
      'voiceover_ready',
      'scenes_in_progress',
      'scenes_approved',
      'processing',
      'completed',
      'failed'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'video_scene_status') then
    create type public.video_scene_status as enum (
      'pending',
      'approved',
      'regenerating'
    );
  end if;
end$$;

do $$
begin
  if not exists (select 1 from pg_type where typname = 'video_asset_kind') then
    create type public.video_asset_kind as enum (
      'voiceover',
      'scene_image',
      'scene_clip',
      'final_video'
    );
  end if;
end$$;

create table if not exists public.video_projects (
  id uuid primary key default gen_random_uuid(),
  trust_id text not null,
  user_id text null,
  title text not null,
  topic text not null,
  duration text not null check (duration in ('30 sec', '60 sec', '90 sec')),
  language text not null check (language in ('Hindi', 'English', 'Hinglish')),
  prompt_style text not null check (prompt_style in ('Energetic', 'Storytelling', 'News anchor', 'Casual')),
  custom_prompt text null,
  status public.video_project_status not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_video_projects_trust_id on public.video_projects(trust_id);
create index if not exists idx_video_projects_status on public.video_projects(status);
create index if not exists idx_video_projects_created_at on public.video_projects(created_at desc);

create table if not exists public.video_scripts (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  script_text text not null,
  word_count integer not null default 0,
  estimated_duration integer not null default 0,
  version integer not null,
  created_at timestamptz not null default now(),
  unique(project_id, version)
);

create index if not exists idx_video_scripts_project_id on public.video_scripts(project_id);

create table if not exists public.video_scenes (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  scene_number integer not null,
  scene_description text not null,
  start_sec numeric(10,2) not null,
  end_sec numeric(10,2) not null,
  image_url text null,
  clip_url text null,
  status public.video_scene_status not null default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(project_id, scene_number)
);

create index if not exists idx_video_scenes_project_id on public.video_scenes(project_id);

create table if not exists public.video_assets (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.video_projects(id) on delete cascade,
  type public.video_asset_kind not null,
  file_url text not null,
  storage_path text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_video_assets_project_id on public.video_assets(project_id);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_video_projects_updated_at on public.video_projects;
create trigger trg_video_projects_updated_at
before update on public.video_projects
for each row execute procedure public.set_updated_at();

drop trigger if exists trg_video_scenes_updated_at on public.video_scenes;
create trigger trg_video_scenes_updated_at
before update on public.video_scenes
for each row execute procedure public.set_updated_at();

-- Optional RLS: enable when Supabase Auth is used in your app.
alter table public.video_projects enable row level security;
alter table public.video_scripts enable row level security;
alter table public.video_scenes enable row level security;
alter table public.video_assets enable row level security;

-- Authenticated users can only access rows attached to projects they own by user_id.
-- If you use custom auth/user mapping, adjust this policy before production.
drop policy if exists video_projects_select_own on public.video_projects;
create policy video_projects_select_own on public.video_projects
for select to authenticated
using (user_id = auth.uid()::text);

drop policy if exists video_projects_insert_own on public.video_projects;
create policy video_projects_insert_own on public.video_projects
for insert to authenticated
with check (user_id = auth.uid()::text);

drop policy if exists video_projects_update_own on public.video_projects;
create policy video_projects_update_own on public.video_projects
for update to authenticated
using (user_id = auth.uid()::text)
with check (user_id = auth.uid()::text);

drop policy if exists video_scripts_access_by_project on public.video_scripts;
create policy video_scripts_access_by_project on public.video_scripts
for all to authenticated
using (
  exists (
    select 1
    from public.video_projects vp
    where vp.id = project_id
      and vp.user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.video_projects vp
    where vp.id = project_id
      and vp.user_id = auth.uid()::text
  )
);

drop policy if exists video_scenes_access_by_project on public.video_scenes;
create policy video_scenes_access_by_project on public.video_scenes
for all to authenticated
using (
  exists (
    select 1
    from public.video_projects vp
    where vp.id = project_id
      and vp.user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.video_projects vp
    where vp.id = project_id
      and vp.user_id = auth.uid()::text
  )
);

drop policy if exists video_assets_access_by_project on public.video_assets;
create policy video_assets_access_by_project on public.video_assets
for all to authenticated
using (
  exists (
    select 1
    from public.video_projects vp
    where vp.id = project_id
      and vp.user_id = auth.uid()::text
  )
)
with check (
  exists (
    select 1
    from public.video_projects vp
    where vp.id = project_id
      and vp.user_id = auth.uid()::text
  )
);

-- Storage bucket for video creation pipeline (voiceover, scene images/clips, final videos)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'video-creation-assets',
  'video-creation-assets',
  true,
  1048576000,
  array[
    'audio/mpeg',
    'image/png',
    'image/jpeg',
    'video/mp4',
    'application/json'
  ]::text[]
)
on conflict (id) do nothing;

-- Authenticated users can access objects in this bucket.
drop policy if exists "Video assets read" on storage.objects;
create policy "Video assets read"
on storage.objects
for select
to authenticated
using (bucket_id = 'video-creation-assets');

drop policy if exists "Video assets write" on storage.objects;
create policy "Video assets write"
on storage.objects
for insert
to authenticated
with check (bucket_id = 'video-creation-assets');

drop policy if exists "Video assets update" on storage.objects;
create policy "Video assets update"
on storage.objects
for update
to authenticated
using (bucket_id = 'video-creation-assets')
with check (bucket_id = 'video-creation-assets');

drop policy if exists "Video assets delete" on storage.objects;
create policy "Video assets delete"
on storage.objects
for delete
to authenticated
using (bucket_id = 'video-creation-assets');
