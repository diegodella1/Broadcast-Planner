create table if not exists operator_runbook_checks (
  id uuid primary key default gen_random_uuid(),
  program_day_id uuid not null references program_days(id) on delete cascade,
  section text not null check (section in ('preflight', 'live', 'incident', 'shutdown')),
  item_key text not null,
  checked boolean not null default false,
  notes text,
  checked_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (program_day_id, section, item_key)
);

create index if not exists idx_operator_runbook_checks_day
  on operator_runbook_checks(program_day_id, section, item_key);

create or replace function prevent_program_block_overlap()
returns trigger
language plpgsql
as $$
begin
  if new.status = 'archived' then
    return new;
  end if;

  if exists (
    select 1
    from program_blocks existing
    where existing.program_day_id = new.program_day_id
      and existing.id <> new.id
      and existing.status <> 'archived'
      and new.start_time_seconds < existing.start_time_seconds + existing.duration_seconds
      and new.start_time_seconds + new.duration_seconds > existing.start_time_seconds
  ) then
    raise exception 'program_blocks overlap for program_day_id %', new.program_day_id
      using errcode = '23514';
  end if;

  return new;
end;
$$;
