insert into media_assets (id, title, source_type, media_kind, asset_type, url, canonical_url, playback_kind, duration_seconds, status, metadata_status)
values
  ('00000000-0000-0000-0000-000000000101', 'Public Program Placeholder', 'public_url', 'video', 'video', 'https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'embed', 7200, 'ready', 'partial'),
  ('00000000-0000-0000-0000-000000000102', 'Sponsor Image 30s', 'public_url', 'image', 'ad', 'https://images.unsplash.com/photo-1639322537504-6427a16b0a28', 'https://images.unsplash.com/photo-1639322537504-6427a16b0a28', 'image', 30, 'ready', 'ready'),
  ('00000000-0000-0000-0000-000000000103', 'Broadcast Planner Fallback Slate', 'uploaded', 'image', 'fallback', null, null, 'image', null, 'ready', 'ready'),
  ('00000000-0000-0000-0000-000000000104', 'Reuters Live Feed', 'public_url', 'video', 'video', 'https://example.com/reuters/live', 'https://example.com/reuters/live', 'hls', null, 'ready', 'ready')
on conflict (id) do nothing;

insert into slide_assets (id, title, slide_type, content, template_id, default_duration_seconds, status)
values
  ('00000000-0000-0000-0000-000000000201', 'Market Open', 'template', 'Market Open', 'us-market-open', 30, 'ready')
on conflict (id) do nothing;

insert into program_days (id, air_date, timezone, status, title, fallback_asset_id)
values
  ('00000000-0000-0000-0000-000000000301', current_date, 'America/Los_Angeles', 'active', 'Broadcast Planner Daily', '00000000-0000-0000-0000-000000000103')
on conflict (air_date) do nothing;

insert into program_blocks (id, program_day_id, title, block_type, category, asset_id, start_time, start_time_seconds, duration_seconds, status, hide_overlays, fallback_asset_id)
values
  -- 00:00 – mercados: early morning markets program
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000301', 'Programa central', 'video', 'mercados', '00000000-0000-0000-0000-000000000101', '00:00:00', 0, 7200, 'active', false, '00000000-0000-0000-0000-000000000103'),
  -- 00:15 – deuda: mid-morning debt markets sponsor break
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000301', 'Sponsor 30s', 'ad', 'deuda', '00000000-0000-0000-0000-000000000102', '00:15:00', 900, 30, 'ready', true, '00000000-0000-0000-0000-000000000103'),
  -- 02:15 – reuters: live feed segment mid-morning
  ('00000000-0000-0000-0000-000000000403', '00000000-0000-0000-0000-000000000301', 'Reuters Live', 'video', 'reuters', '00000000-0000-0000-0000-000000000104', '02:15:00', 8100, 1800, 'ready', false, '00000000-0000-0000-0000-000000000103'),
  -- 02:45 – clima: weather at noon
  ('00000000-0000-0000-0000-000000000404', '00000000-0000-0000-0000-000000000301', 'Clima del dia', 'video', 'clima', '00000000-0000-0000-0000-000000000101', '02:45:00', 9900, 1800, 'ready', false, '00000000-0000-0000-0000-000000000103'),
  -- 03:15 – earthcam: earthcam feed at noon
  ('00000000-0000-0000-0000-000000000405', '00000000-0000-0000-0000-000000000301', 'EarthCam Feed', 'video', 'earthcam', '00000000-0000-0000-0000-000000000101', '03:15:00', 11700, 1800, 'ready', false, '00000000-0000-0000-0000-000000000103'),
  -- 03:45 – calendario: afternoon calendar/agenda
  ('00000000-0000-0000-0000-000000000406', '00000000-0000-0000-0000-000000000301', 'Agenda de mercados', 'video', 'calendario', '00000000-0000-0000-0000-000000000101', '03:45:00', 13500, 1800, 'ready', false, '00000000-0000-0000-0000-000000000103'),
  -- 04:15 – trending: afternoon trending topics
  ('00000000-0000-0000-0000-000000000407', '00000000-0000-0000-0000-000000000301', 'Lo mas visto', 'video', 'trending', '00000000-0000-0000-0000-000000000101', '04:15:00', 15300, 1800, 'ready', false, '00000000-0000-0000-0000-000000000103'),
  -- 04:45 – broadcast: evening broadcast block
  ('00000000-0000-0000-0000-000000000408', '00000000-0000-0000-0000-000000000301', 'Cierre de mercados', 'video', 'broadcast', '00000000-0000-0000-0000-000000000101', '04:45:00', 17100, 3600, 'ready', false, '00000000-0000-0000-0000-000000000103')
on conflict (id) do nothing;

insert into scheduled_layers (id, program_block_id, title, layer_type, slide_id, start_time_seconds, duration_seconds, z_index, position, enabled)
values
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000401', 'Title slide', 'slide', '00000000-0000-0000-0000-000000000201', 120, 30, 10, 'lower_third', true)
on conflict (id) do nothing;

insert into events (id, title, description, start_date, start_time, end_time, is_active, order_index, color, location)
values
  (
    '00000000-0000-0000-0000-000000000601',
    'Market Open Briefing',
    'Daily market open agenda for the Broadcast Planner desk.',
    current_date + 1,
    '09:30:00',
    '10:00:00',
    true,
    1,
    '#1ae784',
    'New York'
  ),
  (
    '00000000-0000-0000-0000-000000000602',
    'Macro Calendar Watch',
    'Upcoming macro events and release windows.',
    current_date + 2,
    '14:00:00',
    '14:30:00',
    true,
    2,
    '#60a5fa',
    'Global'
  )
on conflict (id) do nothing;
