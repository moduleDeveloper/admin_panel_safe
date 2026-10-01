-- Create user registration details table.
create table public.users_reg (
  id uuid not null default gen_random_uuid (),
  name text not null,
  email text null,
  mobile text null,
  secret_code text null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint users_reg_pkey primary key (id)
) TABLESPACE pg_default;

-- Create users table. User details are stored in users_reg and linked here.
create table public.users (
  id uuid not null default gen_random_uuid (),
  trust_id uuid not null,
  user_reg_id uuid not null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint users_pkey primary key (id),
  constraint users_trust_id_fkey foreign key (trust_id) references "Trust" (id) on delete cascade,
  constraint users_user_reg_id_fkey foreign key (user_reg_id) references users_reg (id) on delete cascade
) TABLESPACE pg_default;

-- Create trigger for updated_at column
create trigger users_reg_updated_at before
update on users_reg for each row
execute function update_updated_at ();

create trigger users_updated_at before
update on users for each row
execute function update_updated_at ();
