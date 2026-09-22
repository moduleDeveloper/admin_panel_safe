-- Allow short-form duration options used by CreateVideoPage

alter table public.video_projects
  drop constraint if exists video_projects_duration_check;

alter table public.video_projects
  add constraint video_projects_duration_check
  check (
    duration = any (
      array[
        '5 sec'::text,
        '10 sec'::text,
        '15 sec'::text,
        '20 sec'::text,
        '25 sec'::text,
        '30 sec'::text
      ]
    )
  );

