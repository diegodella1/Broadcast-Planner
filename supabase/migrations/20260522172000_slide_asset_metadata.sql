alter table public.slide_assets
  add column if not exists metadata jsonb not null default '{}'::jsonb;
