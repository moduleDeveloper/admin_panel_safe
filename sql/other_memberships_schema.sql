create table if not exists public.other_memberships (
  id uuid not null default gen_random_uuid(),
  member_id uuid null,
  member_name text null,
  member_phone text null,
  trust_id uuid null,
  organisation_name text null,
  membership_no text not null,
  membership_type text null,
  is_active boolean null default true,
  remark text null,
  created_at timestamp with time zone null default now(),
  constraint other_memberships_pkey primary key (id),
  -- If your DB uses public."Members"(members_id), update this FK target accordingly.
  constraint other_memberships_member_fkey foreign key (member_id) references public.members (member_id) on delete set null,
  constraint other_memberships_trust_fkey foreign key (trust_id) references public."Trust" (id) on delete set null
) tablespace pg_default;
