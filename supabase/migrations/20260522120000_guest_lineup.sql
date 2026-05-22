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
create policy "Public reads ready guests"
  on guests for select
  using (status = 'ready');

drop policy if exists "Service role manages guests" on guests;
create policy "Service role manages guests"
  on guests for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
