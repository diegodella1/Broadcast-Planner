-- Broadcast Planner Supabase bootstrap.
-- Run this in a new Supabase project's SQL editor before pointing the app at it.
-- It creates schema, RLS policies, trigger checks, storage buckets, and the optional
-- calendar events table used by slide templates.

create extension if not exists pgcrypto;

do $$ begin
  create type program_status as enum ('draft', 'ready', 'active', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type asset_status as enum ('draft', 'syncing', 'ready', 'needs_review', 'failed', 'archived');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type source_type as enum (
    'uploaded',
    'public_url',
    'legacy_external'
  );
exception when duplicate_object then null;
end $$;

do $$ begin
  create type media_kind as enum ('video', 'image', 'graphic', 'audio');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type block_type as enum ('video', 'image', 'slide', 'ad', 'promo', 'fallback');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type layer_type as enum ('overlay', 'image', 'slide', 'logo_bug', 'lower_third', 'promo');
exception when duplicate_object then null;
end $$;

do $$ begin
  create type layer_position as enum ('fullscreen', 'lower_third', 'sidebar', 'top_right', 'bottom_bar', 'custom');
exception when duplicate_object then null;
end $$;

create table if not exists integration_settings (
  provider text primary key,
  public_config jsonb not null default '{}'::jsonb,
  encrypted_secret text,
  status text not null default 'unknown',
  last_checked_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists media_assets (
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
  canonical_url text unique,
  playback_kind text check (playback_kind in ('video_file', 'hls', 'embed', 'image', 'audio')),
  content_type text,
  file_size_bytes bigint,
  width integer,
  height integer,
  video_codec text,
  audio_codec text,
  bit_rate bigint,
  frame_rate numeric,
  quality_label text,
  etag text,
  last_modified text,
  metadata_status text not null default 'pending'
    check (metadata_status in ('pending', 'ready', 'partial', 'stale', 'failed')),
  metadata_checked_at timestamptz,
  metadata_failures integer not null default 0,
  metadata_error text,
  metadata jsonb not null default '{}'::jsonb,
  playback_readiness_status text not null default 'unchecked'
    check (playback_readiness_status in ('unchecked', 'ready', 'review', 'failed')),
  playback_checked_at timestamptz,
  playback_error text,
  lifecycle_state text not null default 'reviewed'
    check (lifecycle_state in ('synced', 'reviewed', 'rejected', 'stale', 'expired', 'scheduled_in_use')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positive_media_duration check (duration_seconds is null or duration_seconds > 0),
  constraint ad_duration_limit check (asset_type <> 'ad' or duration_seconds is null or duration_seconds <= 300)
);

create table if not exists slide_assets (
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

create table if not exists program_days (
  id uuid primary key default gen_random_uuid(),
  air_date date not null unique,
  timezone text not null default 'America/Los_Angeles',
  status program_status not null default 'draft',
  title text,
  notes text,
  fallback_asset_id uuid references media_assets(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists program_blocks (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references program_days(id) on delete cascade,
  title text not null,
  block_type block_type not null,
  category text not null check (category in (
    'mercados','earthcam','clima','calendario','trending','deuda','reuters','broadcast'
  )),
  asset_id uuid references media_assets(id) on delete set null,
  slide_id uuid references slide_assets(id) on delete set null,
  start_time time not null,
  start_time_seconds integer not null,
  duration_seconds integer not null,
  status program_status not null default 'draft',
  hide_overlays boolean not null default false,
  fallback_asset_id uuid references media_assets(id) on delete set null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint positive_block_duration check (duration_seconds > 0),
  constraint seconds_in_day check (start_time_seconds >= 0 and start_time_seconds < 86400),
  constraint ad_block_duration_limit check (block_type <> 'ad' or duration_seconds <= 300)
);

create table if not exists scheduled_layers (
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

create table if not exists audit_log (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'system',
  action text not null,
  entity_type text not null,
  entity_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists operator_runbook_checks (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references program_days(id) on delete cascade,
  section text not null check (section in ('preflight', 'live', 'incident', 'shutdown')),
  item_key text not null,
  checked boolean not null default false,
  notes text,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_day_id, section, item_key)
);

create table if not exists admin_operators (
  id uuid primary key default gen_random_uuid(),
  handle text not null unique,
  display_name text not null,
  role text not null check (role in ('admin', 'operator')),
  token_hash text not null,
  status text not null default 'active' check (status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists admin_sessions (
  id uuid primary key default gen_random_uuid(),
  operator_id uuid not null references admin_operators(id) on delete cascade,
  session_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists api_rate_limits (
  bucket_key text primary key,
  hits integer not null default 0,
  reset_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table if not exists operator_preferences (
  operator_id uuid not null references admin_operators(id) on delete cascade,
  key text not null,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (operator_id, key)
);

create table if not exists output_overrides (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references program_days(id) on delete cascade,
  enabled boolean not null default true,
  source_type text not null check (
    source_type in ('scheduled_block', 'public_url', 'reuters', 'slide', 'hls', 'remote_image')
  ),
  block_id uuid references program_blocks(id) on delete set null,
  asset_id uuid references media_assets(id) on delete set null,
  slide_id uuid references slide_assets(id) on delete set null,
  stream_url text,
  stream_protocol text check (stream_protocol is null or stream_protocol in ('hls', 'rtmp')),
  label text,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references admin_operators(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  image_url text,
  start_date date not null,
  end_date date,
  start_time time,
  end_time time,
  is_active boolean not null default true,
  order_index integer not null default 0,
  color text not null default '#1ae784',
  title_font text,
  title_size text check (title_size is null or title_size in ('small', 'medium', 'large', 'xlarge')),
  title_color text,
  text_color text,
  overlay_opacity numeric check (overlay_opacity is null or (overlay_opacity >= 0 and overlay_opacity <= 1)),
  show_date_badge boolean not null default true,
  location text,
  schedule_times jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_operator_runbook_checks_day on operator_runbook_checks(program_day_id, section, item_key);
create index if not exists idx_admin_sessions_operator on admin_sessions(operator_id, expires_at);
create unique index if not exists idx_output_overrides_one_active on output_overrides(program_day_id) where enabled;
create index if not exists idx_events_calendar on events(is_active, start_date, order_index);

create or replace function prevent_program_block_overlap()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'archived' or new.metadata ->> 'live_object' = 'true' then
    return new;
  end if;

  if exists (
    select 1
    from program_blocks existing
    where existing.program_day_id = new.program_day_id
      and existing.id <> new.id
      and existing.status <> 'archived'
      and coalesce(existing.metadata ->> 'live_object', 'false') <> 'true'
      and new.start_time_seconds < existing.start_time_seconds + existing.duration_seconds
      and new.start_time_seconds + new.duration_seconds > existing.start_time_seconds
  ) then
    raise exception 'program_blocks overlap for program_day_id %', new.program_day_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists prevent_program_block_overlap_trigger on program_blocks;
create trigger prevent_program_block_overlap_trigger
  before insert or update of program_day_id, start_time_seconds, duration_seconds
  on program_blocks
  for each row
  execute function prevent_program_block_overlap();

alter table integration_settings enable row level security;
alter table media_assets enable row level security;
alter table slide_assets enable row level security;
alter table program_days enable row level security;
alter table program_blocks enable row level security;
alter table scheduled_layers enable row level security;
alter table audit_log enable row level security;
alter table operator_runbook_checks enable row level security;
alter table admin_operators enable row level security;
alter table admin_sessions enable row level security;
alter table api_rate_limits enable row level security;
alter table operator_preferences enable row level security;
alter table output_overrides enable row level security;
alter table events enable row level security;

drop policy if exists "service role manages integration settings" on integration_settings;
create policy "service role manages integration settings" on integration_settings for all using (auth.role() = 'service_role');

drop policy if exists "public reads ready media" on media_assets;
create policy "public reads ready media" on media_assets for select using (status = 'ready');
drop policy if exists "service role manages media" on media_assets;
create policy "service role manages media" on media_assets for all using (auth.role() = 'service_role');

drop policy if exists "public reads ready slides" on slide_assets;
create policy "public reads ready slides" on slide_assets for select using (status = 'ready');
drop policy if exists "service role manages slides" on slide_assets;
create policy "service role manages slides" on slide_assets for all using (auth.role() = 'service_role');

drop policy if exists "public reads active program days" on program_days;
create policy "public reads active program days" on program_days for select using (status in ('ready', 'active'));
drop policy if exists "service role manages program days" on program_days;
create policy "service role manages program days" on program_days for all using (auth.role() = 'service_role');

drop policy if exists "public reads ready program blocks" on program_blocks;
create policy "public reads ready program blocks" on program_blocks for select using (status in ('ready', 'active'));
drop policy if exists "service role manages program blocks" on program_blocks;
create policy "service role manages program blocks" on program_blocks for all using (auth.role() = 'service_role');

drop policy if exists "public reads scheduled layers" on scheduled_layers;
create policy "public reads scheduled layers" on scheduled_layers for select using (enabled = true);
drop policy if exists "service role manages scheduled layers" on scheduled_layers;
create policy "service role manages scheduled layers" on scheduled_layers for all using (auth.role() = 'service_role');

drop policy if exists "service role manages audit log" on audit_log;
create policy "service role manages audit log" on audit_log for all using (auth.role() = 'service_role');

drop policy if exists "service role manages operator runbook checks" on operator_runbook_checks;
create policy "service role manages operator runbook checks" on operator_runbook_checks for all using (auth.role() = 'service_role');

drop policy if exists "service role manages admin operators" on admin_operators;
create policy "service role manages admin operators" on admin_operators for all using (auth.role() = 'service_role');
drop policy if exists "service role manages admin sessions" on admin_sessions;
create policy "service role manages admin sessions" on admin_sessions for all using (auth.role() = 'service_role');
drop policy if exists "service role manages api rate limits" on api_rate_limits;
create policy "service role manages api rate limits" on api_rate_limits for all using (auth.role() = 'service_role');
drop policy if exists "service role manages operator preferences" on operator_preferences;
create policy "service role manages operator preferences" on operator_preferences for all using (auth.role() = 'service_role');
drop policy if exists "service role manages output overrides" on output_overrides;
create policy "service role manages output overrides" on output_overrides for all using (auth.role() = 'service_role');

create or replace function public.increment_rate_limit(
  p_bucket_key text,
  p_reset_at timestamptz
)
returns table(hits integer, reset_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.api_rate_limits(bucket_key, hits, reset_at, updated_at)
  values (p_bucket_key, 1, p_reset_at, now())
  on conflict (bucket_key) do update
    set hits = case
      when public.api_rate_limits.reset_at <= now() then 1
      else public.api_rate_limits.hits + 1
    end,
    reset_at = case
      when public.api_rate_limits.reset_at <= now() then excluded.reset_at
      else public.api_rate_limits.reset_at
    end,
    updated_at = now()
  returning public.api_rate_limits.hits, public.api_rate_limits.reset_at
  into hits, reset_at;

  return next;
end;
$$;

grant execute on function public.increment_rate_limit(text, timestamptz) to service_role;

drop policy if exists "public reads active events" on events;
create policy "public reads active events" on events for select using (is_active = true);
drop policy if exists "service role manages events" on events;
create policy "service role manages events" on events for all using (auth.role() = 'service_role');

do $$
begin
  if not exists (select 1 from pg_type where typname = 'guest_status') then
    create type guest_status as enum ('draft', 'ready', 'archived');
  end if;
end $$;

create table if not exists guests (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  company text,
  host text,
  program text,
  category text not null default 'markets',
  appearance_at timestamptz,
  photo_url text,
  photo_asset_id uuid references media_assets(id) on delete set null,
  video_url text,
  video_asset_id uuid references media_assets(id) on delete set null,
  color text not null default '#f7931a',
  sort_order integer not null default 0,
  status guest_status not null default 'ready',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists guests_status_appearance_idx
  on guests (status, appearance_at, sort_order);
create index if not exists guests_category_idx
  on guests (category);
create index if not exists guests_photo_asset_idx
  on guests (photo_asset_id);
create index if not exists guests_video_asset_idx
  on guests (video_asset_id);

alter table guests enable row level security;

drop policy if exists "Public reads ready guests" on guests;
create policy "Public reads ready guests" on guests for select using (status = 'ready');
drop policy if exists "Service role manages guests" on guests;
create policy "Service role manages guests" on guests for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('slide-assets', 'slide-assets', true, 52428800, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('graphics', 'graphics', true, 52428800, array['image/png', 'image/jpeg', 'image/webp', 'image/gif']),
  ('video-assets', 'video-assets', true, 524288000, array['video/mp4', 'video/webm', 'application/vnd.apple.mpegurl', 'application/x-mpegURL']),
  ('small-media-assets', 'small-media-assets', true, 524288000, array['video/mp4', 'video/webm', 'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'audio/mpeg', 'audio/mp3'])
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
