alter table program_blocks
  add column if not exists metadata jsonb not null default '{}'::jsonb;

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

create index if not exists idx_admin_sessions_operator
  on admin_sessions(operator_id, expires_at);

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
    source_type in ('scheduled_block', 'vimeo', 'reuters', 'slide', 'hls', 'remote_image')
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

create unique index if not exists idx_output_overrides_one_active
  on output_overrides(program_day_id)
  where enabled;

alter table admin_operators enable row level security;
alter table admin_sessions enable row level security;
alter table api_rate_limits enable row level security;
alter table operator_preferences enable row level security;
alter table output_overrides enable row level security;

create policy "service role manages admin operators" on admin_operators for all using (auth.role() = 'service_role');
create policy "service role manages admin sessions" on admin_sessions for all using (auth.role() = 'service_role');
create policy "service role manages api rate limits" on api_rate_limits for all using (auth.role() = 'service_role');
create policy "service role manages operator preferences" on operator_preferences for all using (auth.role() = 'service_role');
create policy "service role manages output overrides" on output_overrides for all using (auth.role() = 'service_role');
