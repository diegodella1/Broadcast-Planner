alter table media_assets
  add column if not exists playback_readiness_status text not null default 'unchecked'
    check (playback_readiness_status in ('unchecked', 'ready', 'failed')),
  add column if not exists playback_checked_at timestamptz,
  add column if not exists playback_error text;

update media_assets
set playback_readiness_status = 'unchecked'
where playback_readiness_status is null;
