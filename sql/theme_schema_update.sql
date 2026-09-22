alter table public.app_templates
  add column if not exists theme_config jsonb not null default '{}'::jsonb;

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'app_templates'
      and column_name = 'primary_color'
  ) then
    execute $sql$
      update public.app_templates
      set theme_config = coalesce(theme_config, '{}'::jsonb) ||
        jsonb_build_object(
          'primary_color', coalesce(primary_color, '#C0241A'),
          'secondary_color', coalesce(secondary_color, '#2B2F7E'),
          'accent_color', coalesce(accent_color, '#FDECEA'),
          'accent_bg', coalesce(accent_bg, '#EAEBF8'),
          'navbar_bg', coalesce(navbar_bg, 'rgba(234,235,248,0.88)'),
          'page_bg', coalesce(page_bg, 'linear-gradient(160deg,#fff5f5 0%,#ffffff 50%,#f0f1fb 100%)')
        )
    $sql$;
  end if;
end $$;

create index if not exists idx_app_templates_trust_id
on public.app_templates using btree (trust_id) tablespace pg_default;

create index if not exists idx_app_templates_key
on public.app_templates using btree (template_key) tablespace pg_default;
