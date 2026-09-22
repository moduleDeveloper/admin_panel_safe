create extension if not exists pgcrypto;

create or replace function public.update_member_profiles_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.member_profiles (
  id uuid not null default gen_random_uuid(),
  members_id uuid not null,
  profile_photo_url text null,
  gender text null,
  date_of_birth date null,
  blood_group text null,
  marital_status text null,
  nationality text null default 'Indian'::text,
  aadhaar_id text null,
  emergency_contact_name text null,
  emergency_contact_number text null,
  spouse_name text null,
  spouse_contact text null,
  no_of_children integer null default 0,
  facebook text null,
  twitter text null,
  instagram text null,
  linkedin text null,
  whatsapp text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  size numeric null,
  constraint member_profiles_pkey primary key (id),
  constraint member_profiles_person_id_unique unique (members_id),
  constraint member_profiles_members_id_fkey foreign key (members_id) references "Members" (members_id) on delete cascade,
  constraint member_profiles_blood_group_check check (
    blood_group = any (array['A+'::text, 'A-'::text, 'B+'::text, 'B-'::text, 'AB+'::text, 'AB-'::text, 'O+'::text, 'O-'::text])
  ),
  constraint member_profiles_gender_check check (
    gender = any (array['Male'::text, 'Female'::text, 'Other'::text])
  ),
  constraint member_profiles_marital_status_check check (
    marital_status = any (array['Single'::text, 'Married'::text, 'Divorced'::text, 'Widowed'::text])
  )
) tablespace pg_default;

alter table if exists public.member_profiles
add column if not exists size numeric null;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgname = 'member_profiles_updated_at'
      and tgrelid = 'public.member_profiles'::regclass
  ) then
    create trigger member_profiles_updated_at
    before update on public.member_profiles
    for each row
    execute function public.update_member_profiles_updated_at();
  end if;
end;
$$;