insert into media_assets (id, title, source_type, media_kind, asset_type, url, duration_seconds, status, vimeo_id, vimeo_uri)
values
  ('00000000-0000-0000-0000-000000000101', 'Vimeo Program Placeholder', 'vimeo', 'video', 'video', 'https://vimeo.com/76979871', 7200, 'ready', '76979871', '/videos/76979871'),
  ('00000000-0000-0000-0000-000000000102', 'Sponsor Image 30s', 'remote_image', 'image', 'ad', 'https://images.unsplash.com/photo-1639322537504-6427a16b0a28', 30, 'ready', null, null),
  ('00000000-0000-0000-0000-000000000103', 'Roxom Fallback Slate', 'remote_image', 'image', 'fallback', null, null, 'ready', null, null)
on conflict (id) do nothing;

insert into slide_assets (id, title, slide_type, html_content, default_duration_seconds, status)
values
  ('00000000-0000-0000-0000-000000000201', 'Market Open', 'html', '<strong>Market Open</strong><span>Agenda del dia</span>', 30, 'ready')
on conflict (id) do nothing;

insert into program_days (id, air_date, timezone, status, title, fallback_asset_id)
values
  ('00000000-0000-0000-0000-000000000301', current_date, 'America/Argentina/Buenos_Aires', 'active', 'Roxom Daily', '00000000-0000-0000-0000-000000000103')
on conflict (air_date) do nothing;

insert into program_blocks (id, program_day_id, title, block_type, asset_id, start_time, start_time_seconds, duration_seconds, status, hide_overlays, fallback_asset_id)
values
  ('00000000-0000-0000-0000-000000000401', '00000000-0000-0000-0000-000000000301', 'Programa central', 'video', '00000000-0000-0000-0000-000000000101', '00:00:00', 0, 7200, 'active', false, '00000000-0000-0000-0000-000000000103'),
  ('00000000-0000-0000-0000-000000000402', '00000000-0000-0000-0000-000000000301', 'Sponsor 30s', 'ad', '00000000-0000-0000-0000-000000000102', '00:15:00', 900, 30, 'ready', true, '00000000-0000-0000-0000-000000000103')
on conflict (id) do nothing;

insert into scheduled_layers (id, program_block_id, title, layer_type, slide_id, start_time_seconds, duration_seconds, z_index, position, enabled)
values
  ('00000000-0000-0000-0000-000000000501', '00000000-0000-0000-0000-000000000401', 'Title slide', 'slide', '00000000-0000-0000-0000-000000000201', 120, 30, 10, 'lower_third', true)
on conflict (id) do nothing;
