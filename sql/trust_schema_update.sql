alter table public."Trust"
  add column if not exists gst_number text null,
  add column if not exists pan_number text null,
  add column if not exists website text null,
  add column if not exists email_id text null,
  add column if not exists remark1 text null,
  add column if not exists remark2 text null,
  add column if not exists remark3 text null,
  add column if not exists version numeric not null default 1,
  add column if not exists secret_code numeric null,
  add column if not exists developer_mobile text null,
  add column if not exists developer_secret_code text null;

alter table public."Trust"
  drop column if exists theme_overrides;

alter table public."Trust"
  drop constraint if exists trust_version_positive;

alter table public."Trust"
  add constraint trust_version_positive check ((version >= (1)::numeric));
