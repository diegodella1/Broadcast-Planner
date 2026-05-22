-- RTV Planner slide asset metadata migration.
-- Use this on existing Supabase backends before creating individualized guest plates.

alter table public.slide_assets
  add column if not exists metadata jsonb not null default '{}'::jsonb;
