-- Add Step-1 input asset columns to video_projects
-- Run in Supabase SQL editor or migration pipeline.

alter table public.video_projects
  add column if not exists logo_url text null,
  add column if not exists logo_storage_path text null,
  add column if not exists reference_images jsonb not null default '[]'::jsonb;

