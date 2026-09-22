-- Create users table
create table public.users (
  id uuid not null default gen_random_uuid (),
  trust_id uuid not null,
  name text not null,
  email text null,
  secret_code numeric null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  mobile_no numeric null,
  constraint users_pkey primary key (id),
  constraint users_trust_id_fkey foreign key (trust_id) references "Trust" (id) on delete cascade
) TABLESPACE pg_default;

-- Create trigger for updated_at column
create trigger users_updated_at before
update on users for each row
execute function update_updated_at ();
