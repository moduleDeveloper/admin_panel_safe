create table if not exists public."Images" (
  id uuid not null default gen_random_uuid(),
  gallery_photo_id uuid null,
  "Title" text not null,
  "Hashtags" character varying null,
  "Description" text null,
  "aspectRatio" character varying null,
  "Intent" text null,
  "Approved" text null,
  created_by uuid null,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint images_pkey primary key (id),
  constraint images_created_by_fkey foreign key (created_by) references "Members" (members_id) on delete set null,
  constraint images_gallery_photo_id_fkey foreign key (gallery_photo_id) references gallery_photos (id) on delete cascade
) tablespace pg_default;

drop trigger if exists images_updated_at on public."Images";
create trigger images_updated_at before update on public."Images"
for each row execute function update_updated_at();
