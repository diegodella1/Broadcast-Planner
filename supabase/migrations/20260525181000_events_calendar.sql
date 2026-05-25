create table if not exists public.events (
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

create index if not exists idx_events_calendar
  on public.events(is_active, start_date, order_index);

alter table public.events enable row level security;

drop policy if exists "public reads active events" on public.events;
create policy "public reads active events" on public.events
  for select using (is_active = true);

drop policy if exists "service role manages events" on public.events;
create policy "service role manages events" on public.events
  for all using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');
