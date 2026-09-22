-- 1) Required for upsertSocialMediaAccountByTrust(..., { onConflict: 'trust_id' })
create unique index if not exists social_media_accounts_trust_id_unique_idx
on public.social_media_accounts (trust_id);

-- 2) Required for scheduled edge-function triggers
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- 3) Remove existing job with same name (safe re-run)
do $$
declare
  existing_job_id bigint;
begin
  select jobid into existing_job_id
  from cron.job
  where jobname = 'social_auto_poster_every_minute'
  limit 1;

  if existing_job_id is not null then
    perform cron.unschedule(existing_job_id);
  end if;
end
$$;

-- 4) Schedule every minute.
-- Replace YOUR_PROJECT_REF with your actual Supabase project ref.
select cron.schedule(
  'social_auto_poster_every_minute',
  '* * * * *',
  $$
  select net.http_post(
    url := 'https://lqdmefugrhluzlfabmuy.supabase.co/functions/v1/social-auto-poster',
    headers := '{"Content-Type":"application/json"}'::jsonb,
    body := '{}'::jsonb
  );
  $$
);

-- Optional: if you keep verify_jwt=true in function config, include Authorization header:
-- headers := '{"Content-Type":"application/json","Authorization":"Bearer YOUR_SUPABASE_ANON_OR_SERVICE_KEY"}'::jsonb
