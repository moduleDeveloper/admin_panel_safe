create table public.app_templates (
  id uuid not null default gen_random_uuid (),
  name text not null,
  description text null,
  home_layout jsonb not null default '["gallery", "quickActions", "sponsors"]'::jsonb,
  animations jsonb not null default '{"cards": "fadeUp", "navbar": "fadeSlideDown", "gallery": "zoomIn"}'::jsonb,
  custom_css text null default ''::text,
  is_active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  template_key text not null default 'mahila'::text,
  trust_id text null,
  theme_config jsonb not null default '{}'::jsonb,
  constraint app_templates_pkey primary key (id),
  constraint app_templates_name_key unique (name)
) tablespace pg_default;

create index if not exists idx_app_templates_trust_id
on public.app_templates using btree (trust_id) tablespace pg_default;

create index if not exists idx_app_templates_key
on public.app_templates using btree (template_key) tablespace pg_default;

create trigger app_templates_updated_at before
update on app_templates for each row
execute function update_updated_at ();
