create or replace function prevent_program_block_overlap()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'archived' then
    return new;
  end if;

  if new.metadata->>'live_object' = 'true' then
    return new;
  end if;

  if exists (
    select 1
    from program_blocks existing
    where existing.program_day_id = new.program_day_id
      and existing.id <> new.id
      and existing.status <> 'archived'
      and coalesce(existing.metadata->>'live_object', '') <> 'true'
      and new.start_time_seconds < existing.start_time_seconds + existing.duration_seconds
      and new.start_time_seconds + new.duration_seconds > existing.start_time_seconds
  ) then
    raise exception 'program_blocks overlap for program_day_id %', new.program_day_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;
