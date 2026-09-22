create table if not exists public."shareApp_links" (
  id uuid not null default gen_random_uuid(),
  trust_id uuid not null,
  play_store_link text null,
  app_store_link text null,
  created_at timestamp with time zone null default now(),
  updated_at timestamp with time zone null default now(),
  constraint app_links_pkey primary key (id),
  constraint app_links_trust_id_unique unique (trust_id),
  constraint app_links_trust_id_fkey foreign key (trust_id) references "Trust" (id) on delete cascade
) tablespace pg_default;

create index if not exists app_links_trust_id_idx
on public."shareApp_links" using btree (trust_id) tablespace pg_default;

drop trigger if exists share_app_links_updated_at on public."shareApp_links";
create trigger share_app_links_updated_at before update on public."shareApp_links"
for each row execute function update_updated_at();
