create extension if not exists pgcrypto;

create or replace function public.update_updated_at_column()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.sponsors (
  id uuid not null default gen_random_uuid(),
  name text not null,
  position text null,
  about text null,
  photo_url text null,
  company_name text not null,
  ref_no numeric not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  "ContactNumber1" text null,
  badge_label text not null default 'OFFICIAL SPONSOR'::text,
  email_id1 text null,
  address text null,
  city text null,
  state text null,
  whatsapp_number numeric null,
  website_url text null,
  catalog_url text null,
  trust_id text null,
  "coPartner" text null,
  "contactNumber2" numeric null,
  "contactNumber3" numeric null,
  "emailId2" text null,
  "emailId3" text null,
  facebook text null,
  instagram text null,
  "X" text null,
  linkedin text null,
  address2 text null,
  address3 text null,
  position2 text null,
  constraint sponsors_pkey primary key (id)
) tablespace pg_default;

create index if not exists idx_sponsors_active_priority
on public.sponsors using btree (company_name, ref_no) tablespace pg_default;

create index if not exists idx_sponsors_created_at
on public.sponsors using btree (created_at) tablespace pg_default;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'update_sponsors_updated_at'
      and tgrelid = 'public.sponsors'::regclass
  ) then
    create trigger update_sponsors_updated_at
    before update on public.sponsors
    for each row
    execute function public.update_updated_at_column();
  end if;
end;
$$;
