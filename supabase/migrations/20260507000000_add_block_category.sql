-- add block_category column to program_blocks
-- backfill existing rows with 'mercados', then drop the default to enforce explicit assignment

alter table program_blocks
  add column category text not null default 'mercados'
  check (category in (
    'mercados','earthcam','clima','calendario',
    'trending','deuda','reuters','broadcast'
  ));

alter table program_blocks
  alter column category drop default;

-- down migration (forward-only by Supabase convention; documented for ops)
-- alter table program_blocks drop column category;
