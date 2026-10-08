ALTER TABLE public.video_projects
ADD COLUMN IF NOT EXISTS scene_plan_json jsonb;

