create table if not exists public.social_media_accounts (
  id uuid not null default gen_random_uuid(),
  trust_id uuid not null,
  "Blotato-API" character varying null,
  "Instagram" bigint null,
  "FB-Account" bigint null,
  "FB-Page" bigint null,
  "Youtube" bigint null,
  "X" bigint null,
  "Threads" bigint null,
  "KeyWords" text null,
  region text null,
  "TimeForAutoInput" time without time zone null,
  "upload-Post-Api" character varying null,
  created_by uuid null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint social_media_accounts_pkey primary key (id),
  constraint social_media_accounts_created_by_fkey foreign key (created_by) references "Members" (members_id) on delete set null,
  constraint social_media_accounts_trust_id_fkey foreign key (trust_id) references "Trust" (id) on delete cascade
) tablespace pg_default;

drop trigger if exists social_media_accounts_updated_at on public.social_media_accounts;
create trigger social_media_accounts_updated_at before update on public.social_media_accounts
for each row execute function update_updated_at();
