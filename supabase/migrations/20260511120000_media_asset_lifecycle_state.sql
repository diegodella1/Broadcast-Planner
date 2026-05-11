alter table media_assets
  add column if not exists lifecycle_state text not null default 'reviewed'
    check (lifecycle_state in (
      'synced',
      'reviewed',
      'rejected',
      'stale',
      'expired',
      'scheduled_in_use'
    ));

update media_assets
set lifecycle_state = case
  when source_type = 'vimeo' and status = 'syncing' then 'synced'
  when status = 'archived' then 'expired'
  when status = 'failed' then 'rejected'
  else lifecycle_state
end;
