# Supabase Backup and Restore Drill

## Schedule

- Database: daily managed Supabase backup before programming changes.
- Storage buckets: weekly export of `video-assets`, `small-media-assets`, `slide-assets`, and `graphics`.
- Drill cadence: restore into a non-production Supabase project monthly.

## Restore Drill

1. Create or select a non-production Supabase project.
2. Restore latest database backup into the test project.
3. Copy storage bucket objects from the matching backup window.
4. Point a local RTVTime instance at the restored project.
5. Verify `/admin/calendar`, `/admin/assets`, `/admin/vimeo`, `/admin/output`, and `/output/live`.
6. Confirm one active day can render a block with fallback coverage.

## Rollback

- If a migration breaks production, restore the last verified database backup.
- If media deletion breaks output, restore affected bucket objects first, then refresh asset rows.
- Keep `ADMIN_BOOTSTRAP_TOKEN`, `OUTPUT_CAPTURE_TOKEN`, and Vimeo credentials unchanged during restore unless rotating secrets is part of the incident.

## Evidence

Record each drill with:

- backup timestamp
- restore target project
- bucket names restored
- verification date/time
- operator
- failures and follow-up actions
