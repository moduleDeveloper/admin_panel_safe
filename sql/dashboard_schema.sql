create table if not exists public.dashboard (
  id bigint generated always as identity not null,
  trust_id uuid not null,
  app_downloads integer not null default 0,
  live_app_users integer not null default 0,
  total_members integer not null default 0,
  panel_users integer not null default 0,
  live_events integer not null default 0,
  elected_members integer not null default 0,
  committee_members integer not null default 0,
  vip_patron_members integer not null default 0,
  posts_on_social_media integer not null default 0,
  gallery_uploads integer not null default 0,
  announcements_sent integer not null default 0,
  referral_activities integer not null default 0,
  updated_at timestamp with time zone not null default now(),
  constraint dashboard_pkey primary key (id),
  constraint dashboard_trust_id_unique unique (trust_id),
  constraint dashboard_trust_id_fkey foreign key (trust_id) references "Trust" (id) on delete cascade
) tablespace pg_default;

create or replace function update_dashboard_timestamp()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_dashboard_updated_at on public.dashboard;
create trigger trg_dashboard_updated_at
before update on public.dashboard
for each row
execute function update_dashboard_timestamp();
