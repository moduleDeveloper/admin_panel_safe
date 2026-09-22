create table public."ContactTrust" (
  id uuid not null default gen_random_uuid (),
  trust_id uuid null,
  facility_name text not null,
  contact_number text null,
  email_id text null,
  contact_person text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint contacttrust_pkey primary key (id),
  constraint contacttrust_trust_id_fkey foreign key (trust_id) references "Trust" (id) on delete cascade
) tablespace pg_default;

create index if not exists contacttrust_trust_id_idx
on public."ContactTrust" using btree (trust_id) tablespace pg_default;

create trigger set_contacttrust_updated_at
before update on "ContactTrust" for each row
execute function update_updated_at_column ();
