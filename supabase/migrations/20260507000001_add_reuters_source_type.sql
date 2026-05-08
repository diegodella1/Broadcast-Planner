-- Up Migration
-- Extend the source_type enum to include reuters.
-- NOTE: ALTER TYPE ... ADD VALUE cannot run inside a transaction block in PostgreSQL.
-- Supabase runs each migration file outside a transaction by default, so this is safe.
-- If your runner wraps migrations in transactions, execute this statement manually
-- via psql outside a transaction (BEGIN/COMMIT block).
ALTER TYPE source_type ADD VALUE IF NOT EXISTS 'reuters';

-- Down Migration
-- PostgreSQL does not support DROP VALUE from an enum type.
-- To revert: recreate the type without 'reuters', migrate all affected rows,
-- then swap the column type. Only do this if no rows with source_type='reuters' exist.
-- ALTER TYPE source_type RENAME TO source_type_old;
-- CREATE TYPE source_type AS ENUM ('vimeo', 'supabase_image', 'remote_image', 'remote_mp4', 'hls');
-- ALTER TABLE media_assets ALTER COLUMN source_type TYPE source_type USING source_type::text::source_type;
-- DROP TYPE source_type_old;
