create extension if not exists pgcrypto;

create or replace function public.update_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'noticeboard_type'
      and n.nspname = 'public'
  ) then
    create type public.noticeboard_type as enum ('gen', 'announcement', 'urgent', 'meeting');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from storage.buckets
    where id = 'noticeboard'
  ) then
    insert into storage.buckets (id, name, public)
    values ('noticeboard', 'noticeboard', true);
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'noticeboard_public_read'
  ) then
    create policy noticeboard_public_read
    on storage.objects
    for select
    to public
    using (bucket_id = 'noticeboard');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'noticeboard_auth_insert'
  ) then
    create policy noticeboard_auth_insert
    on storage.objects
    for insert
    to authenticated
    with check (bucket_id = 'noticeboard');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'noticeboard_auth_update'
  ) then
    create policy noticeboard_auth_update
    on storage.objects
    for update
    to authenticated
    using (bucket_id = 'noticeboard')
    with check (bucket_id = 'noticeboard');
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname = 'noticeboard_auth_delete'
  ) then
    create policy noticeboard_auth_delete
    on storage.objects
    for delete
    to authenticated
    using (bucket_id = 'noticeboard');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'noticeboard_status'
      and n.nspname = 'public'
  ) then
    create type public.noticeboard_status as enum ('active', 'inactive', 'archived');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'event_type'
      and n.nspname = 'public'
  ) then
    create type public.event_type as enum ('general', 'social', 'religious', 'health', 'education');
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_type t
    join pg_namespace n on n.oid = t.typnamespace
    where t.typname = 'event_status'
      and n.nspname = 'public'
  ) then
    create type public.event_status as enum ('active', 'inactive', 'cancelled', 'completed');
  end if;
end;
$$;

create table if not exists public.noticeboard (
  id uuid not null default gen_random_uuid(),
  trust_id uuid not null,
  type public.noticeboard_type not null default 'gen'::noticeboard_type,
  name text not null,
  description text null,
  attachments text[] null default '{}'::text[],
  start_date date null,
  end_date date null,
  status public.noticeboard_status not null default 'active'::noticeboard_status,
  created_by uuid null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  size numeric null,
  constraint noticeboard_pkey primary key (id),
  constraint noticeboard_created_by_fkey foreign key (created_by) references auth.users (id),
  constraint noticeboard_trust_id_fkey foreign key (trust_id) references public."Trust" (id) on delete cascade
) tablespace pg_default;

alter table if exists public.noticeboard
add column if not exists size numeric null;

create index if not exists idx_noticeboard_trust on public.noticeboard using btree (trust_id) tablespace pg_default;
create index if not exists idx_noticeboard_status on public.noticeboard using btree (status) tablespace pg_default;
create index if not exists idx_noticeboard_dates on public.noticeboard using btree (start_date, end_date) tablespace pg_default;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'noticeboard_updated_at'
      and tgrelid = 'public.noticeboard'::regclass
  ) then
    create trigger noticeboard_updated_at
    before update on public.noticeboard
    for each row
    execute function public.update_updated_at();
  end if;
end;
$$;

create table if not exists public.events (
  id uuid not null default gen_random_uuid(),
  trust_id uuid not null,
  type public.event_type not null default 'general'::event_type,
  title text not null,
  description text null,
  attachments text[] null default '{}'::text[],
  location text null,
  "startEventDate" date not null,
  "startTime" time without time zone null,
  "endTime" time without time zone null,
  status public.event_status not null default 'active'::event_status,
  created_by uuid null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  "endEventDate" date null,
  constraint events_pkey primary key (id),
  constraint events_created_by_fkey foreign key (created_by) references auth.users (id),
  constraint events_trust_id_fkey foreign key (trust_id) references public."Trust" (id) on delete cascade
) tablespace pg_default;

create index if not exists idx_events_trust on public.events using btree (trust_id) tablespace pg_default;
create index if not exists idx_events_status on public.events using btree (status) tablespace pg_default;
create index if not exists idx_events_date on public.events using btree ("startEventDate") tablespace pg_default;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'events_updated_at'
      and tgrelid = 'public.events'::regclass
  ) then
    create trigger events_updated_at
    before update on public.events
    for each row
    execute function public.update_updated_at();
  end if;
end;
$$;
