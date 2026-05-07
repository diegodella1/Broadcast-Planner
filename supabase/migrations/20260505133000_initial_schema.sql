create extension if not exists pgcrypto;

create type program_status as enum ('draft', 'ready', 'active', 'archived');
create type asset_status as enum ('draft', 'syncing', 'ready', 'failed', 'archived');
create type source_type as enum ('vimeo', 'supabase_image', 'remote_image', 'remote_mp4', 'hls');
create type media_kind as enum ('video', 'image', 'graphic');
create type block_type as enum ('video', 'image', 'slide', 'ad', 'promo', 'fallback');
create type layer_type as enum ('overlay', 'image', 'slide', 'logo_bug', 'lower_third', 'promo');
create type layer_position as enum ('fullscreen', 'lower_third', 'sidebar', 'top_right', 'bottom_bar', 'custom');

create table integration_settings (
  provider text primary key,
  public_config jsonb not null default '{}'::jsonb,
  encrypted_secret text,
  status text not null default 'unknown',
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table media_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  source_type source_type not null,
  media_kind media_kind not null,
  asset_type text not null,
  url text,
  storage_bucket text,
  storage_path text,
  thumbnail_url text,
  duration_seconds integer,
  status asset_status not null default 'draft',
  vimeo_id text unique,
  vimeo_uri text,
  vimeo_privacy text,
  vimeo_embed_status text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positive_media_duration check (duration_seconds is null or duration_seconds > 0),
  constraint ad_duration_limit check (asset_type <> 'ad' or duration_seconds is null or duration_seconds <= 300)
);

create table slide_assets (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slide_type text not null check (slide_type in ('image', 'html', 'template', 'markdown')),
  content text,
  image_url text,
  html_content text,
  template_id text,
  default_duration_seconds integer,
  status text not null default 'draft' check (status in ('draft', 'ready', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positive_slide_duration check (default_duration_seconds is null or default_duration_seconds > 0)
);

create table program_days (
  id uuid primary key default gen_random_uuid(),
  air_date date not null unique,
  timezone text not null default 'America/Argentina/Buenos_Aires',
  status program_status not null default 'draft',
  title text,
  notes text,
  fallback_asset_id uuid references media_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table program_blocks (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references program_days(id) on delete cascade,
  title text not null,
  block_type block_type not null,
  asset_id uuid references media_assets(id) on delete set null,
  slide_id uuid references slide_assets(id) on delete set null,
  start_time time not null,
  start_time_seconds integer not null,
  duration_seconds integer not null,
  status program_status not null default 'draft',
  hide_overlays boolean not null default false,
  fallback_asset_id uuid references media_assets(id) on delete set null,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positive_block_duration check (duration_seconds > 0),
  constraint seconds_in_day check (start_time_seconds >= 0 and start_time_seconds < 86400),
  constraint ad_block_duration_limit check (block_type <> 'ad' or duration_seconds <= 300)
);

create table scheduled_layers (
  id uuid primary key default gen_random_uuid(),
  program_block_id uuid not null references program_blocks(id) on delete cascade,
  title text not null,
  layer_type layer_type not null,
  asset_id uuid references media_assets(id) on delete set null,
  slide_id uuid references slide_assets(id) on delete set null,
  start_time_seconds integer not null default 0,
  duration_seconds integer not null,
  z_index integer not null default 10,
  position layer_position not null default 'lower_third',
  enabled boolean not null default true,
  locked boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positive_layer_duration check (duration_seconds > 0),
  constraint positive_layer_start check (start_time_seconds >= 0)
);

create table audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'system',
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table integration_settings enable row level security;
alter table media_assets enable row level security;
alter table slide_assets enable row level security;
alter table program_days enable row level security;
alter table program_blocks enable row level security;
alter table scheduled_layers enable row level security;
alter table audit_log enable row level security;

create policy "service role manages integration settings" on integration_settings for all using (auth.role() = 'service_role');
create policy "public reads ready media" on media_assets for select using (status = 'ready');
create policy "service role manages media" on media_assets for all using (auth.role() = 'service_role');
create policy "public reads ready slides" on slide_assets for select using (status = 'ready');
create policy "service role manages slides" on slide_assets for all using (auth.role() = 'service_role');
create policy "public reads active program days" on program_days for select using (status in ('ready', 'active'));
create policy "service role manages program days" on program_days for all using (auth.role() = 'service_role');
create policy "public reads ready program blocks" on program_blocks for select using (status in ('ready', 'active'));
create policy "service role manages program blocks" on program_blocks for all using (auth.role() = 'service_role');
create policy "public reads scheduled layers" on scheduled_layers for select using (enabled = true);
create policy "service role manages scheduled layers" on scheduled_layers for all using (auth.role() = 'service_role');
create policy "service role manages audit log" on audit_log for all using (auth.role() = 'service_role');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('slide-assets', 'slide-assets', true, 52428800, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('graphics', 'graphics', true, 52428800, array['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
on conflict (id) do nothing;
