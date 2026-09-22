create table public.facilities (
  id uuid not null default gen_random_uuid (),
  trust_id uuid not null,
  type public.noticeboard_type not null default 'gen'::noticeboard_type,
  name text not null,
  description text null,
  attachments text[] null default '{}'::text[],
  status public.noticeboard_status not null default 'active'::noticeboard_status,
  created_by uuid null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint facilities_pkey primary key (id),
  constraint facilities_created_by_fkey foreign key (created_by) references auth.users (id),
  constraint facilities_trust_id_fkey foreign key (trust_id) references "Trust" (id) on delete cascade
) tablespace pg_default;

create index if not exists facilities_trust_id_idx on public.facilities using btree (trust_id) tablespace pg_default;
create index if not exists facilities_status_idx on public.facilities using btree (status) tablespace pg_default;
