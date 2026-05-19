# RTV TL Manager Operator Guide

Short guide for running the current production workflow.

## Login

Open:

```txt
https://rtvtime.diegodella.ar/admin/login
```

Use the configured admin token or named operator handle/token.

## Daily Workflow

1. **Prepare content**
   - Vimeo: `/admin/vimeo`
   - uploads/remote URLs/fallbacks: `/admin/assets`
   - graphics: `/admin/slides`

2. **Build the schedule**
   - Open `/admin/calendar`.
   - Create or open the day.
   - Add blocks in `/admin/schedule/[date]`.
   - Assign ready media, slides, overlays, and fallback assets.

3. **Check readiness**
   - Fix schedule health errors.
   - Open `/admin/runbook/[date]`.
   - Complete critical preflight checks.

4. **Go live**
   - Set the program day `active`.
   - Open `/admin/output`.
   - Launch Live Browser Output.
   - Click `Start Output` once to unlock audio.
   - Capture that browser window in OBS/vMix.

5. **During live**
   - Watch `/admin/output` monitor.
   - Check active block, next block, fallback reason, clock skew, and drift.
   - Use the runbook for incidents and handoff notes.

6. **Stop**
   - Use `/admin/output` -> Stop broadcast.
   - Complete shutdown checks.

## Output Behavior

`/output/live` renders the active schedule for browser capture. It supports Vimeo, direct HLS, MP4, images, slides, and fallback states.

After reload, output resolves the active block again and seeks video to the correct scheduled offset. Browser audio still requires one operator click because autoplay with sound is blocked by browser policy.

Use `/output/preview/[blockId]` to test one block before air.

## Go Live Drill

Run this before trusting a machine for broadcast:

1. Open `/admin/health`.
2. Confirm environment, Supabase, storage, Vimeo, output token, and static assets are OK.
3. Open `/admin/output`.
4. Launch Live Browser Output.
5. Click `Start Output`.
6. Reload the output page mid-video.
7. Confirm video resumes at the current show time.
8. Confirm OBS/vMix receives both video and audio.

## Operator Notes

- Use Library -> Schedule -> Browser Output. That is the primary path.
- Do not schedule draft/failed media.
- Every active day should have a fallback asset.
- Reuters URLs are dynamic. Refresh the block or live override if the endpoint expires.
- Secrets belong in `.env` or encrypted settings, not docs or chat.

## Useful Pages

- `/manual` - public manual
- `/pending` - backlog
- `/admin/health` - readiness checks
- `/api/health` - machine-readable health
