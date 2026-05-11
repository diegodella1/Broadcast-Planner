create or replace function prevent_program_block_overlap()
returns trigger
language plpgsql
as $$
begin
  if exists (
    select 1
    from program_blocks existing
    where existing.program_day_id = new.program_day_id
      and existing.id <> new.id
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
