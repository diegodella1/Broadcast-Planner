# Supabase Backup and Restore Drill

## Schedule

- Database: daily managed Supabase backup before programming changes.
- Storage buckets: weekly export of `video-assets`, `small-media-assets`, `slide-assets`, and `graphics`.
- Drill cadence: restore into a non-production Supabase project monthly.
- Evidence owner: whoever runs the drill records the timestamp, target project and result before closing the P1 hardening item.

## Restore Drill

1. Create or select a non-production Supabase project.
2. Restore latest database backup into the test project.
3. Copy storage bucket objects from the matching backup window.
4. Point a local RTVTime instance at the restored project.
5. Verify `/admin/prepare`, `/admin/program`, `/admin/operate`, `/admin/output`, and `/output/live`.
6. Confirm one active day can render a block with fallback coverage.
7. Run `npm run smoke:staging-write` against the restored project if it is isolated from production.
8. Confirm sandbox rows from the write smoke are archived after cleanup.

## Rollback

- If a migration breaks production, stop deploys, snapshot the current broken state, then restore the last verified database backup.
- If media deletion breaks output, restore affected bucket objects first, then refresh or unarchive matching asset rows.
- If app deploy breaks output while data is healthy, rollback the app service first and leave Supabase untouched.
- Keep `ADMIN_BOOTSTRAP_TOKEN`, `OUTPUT_CAPTURE_TOKEN`, and Vimeo credentials unchanged during restore unless rotating secrets is part of the incident.

## Storage Recovery

1. Identify missing bucket/path from `media_assets.storage_bucket` and `media_assets.storage_path`.
2. Restore object into the same bucket and path.
3. Keep the public URL stable where possible; otherwise update the asset row URL.
4. Open `/admin/prepare`, verify thumbnail/duration metadata through the asset detail route, then
   preview one scheduled block using the restored asset.

## Evidence

Record each drill with:

- backup timestamp
- restore target project
- bucket names restored
- verification date/time
- operator
- failures and follow-up actions
- smoke command output or screenshot
- rollback decision if any step failed
