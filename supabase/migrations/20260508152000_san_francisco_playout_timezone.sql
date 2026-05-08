alter table program_days
  alter column timezone set default 'America/Los_Angeles';

update program_days
set timezone = 'America/Los_Angeles',
    updated_at = now()
where timezone = 'America/Argentina/Buenos_Aires';

update integration_settings
set public_config = jsonb_set(
      coalesce(public_config, '{}'::jsonb),
      '{timezone}',
      '"America/Los_Angeles"'::jsonb,
      true
    ),
    updated_at = now()
where provider = 'vimeo'
  and coalesce(public_config->>'timezone', 'America/Argentina/Buenos_Aires') = 'America/Argentina/Buenos_Aires';
