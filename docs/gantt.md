# Broadcast Planner Roadmap

Current roadmap only. The product is in controlled production: useful now, still improving toward safer unattended broadcast operations.

## Live Now

| Work                         | Status | What It Delivers                                                                                        |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------------------- |
| Browser playout for OBS/vMix | Live   | Fullscreen output plays Vimeo, MP4/HLS, images, slides, audio-backed blocks and fallbacks.              |
| Daily schedule workflow      | Live   | Operators can create a day, add timed blocks, assign assets and activate the broadcast day.             |
| Runbook and health checks    | Live   | Preflight, live notes, incident handling, shutdown, Admin Health and Go Live Drill.                     |
| Reload time sync             | Live   | Reload mid-show resumes near the current scheduled video offset.                                        |
| OBS/vMix capture validation  | Live   | Browser output was confirmed through web player, vMix and OBS.                                          |
| Public upload playback       | Live   | Uploaded ads/promos stored in local Supabase play through the public app media proxy.                   |
| Media URL backfill           | Live   | Existing local media URLs were rewritten to app proxy URLs.                                             |
| Persisted smoke status       | Live   | Deploy/read-only smoke scripts write the latest smoke result for `/api/health`.                         |
| Supabase migration kit       | Live   | Fresh-project SQL creates schema, RLS policies, buckets and operational tables.                         |
| Security baseline            | Live   | Named operators, sessions, roles, CSRF, output auth, sanitized health, rate limiting and audit logging. |
| Unified operator hubs        | Live   | Prepare, Program and Operate reduce visible choices while keeping direct routes available.              |
| Schedule UX feedback         | Live   | Newly-created blocks are announced, highlighted and shown with clear start/end time ranges.             |
| Loop Builder                 | Live   | Operators can create scheduled slide loops, visual fallback carousels, or both from one flow.           |
| Guest lineup plates          | Live   | Operators can create guests with URL/uploaded media and build individualized guest plates.              |
| Real-data plate inputs       | Live   | Metals, weather, debt and calendar/event plates now use real data paths or resilient fallbacks.         |
| Previously Recorded bug      | Live   | Normal video programs can show a four-corner broadcast disclosure bug.                                  |
| OpenNext/Cloudflare path     | Ready  | Worker deploy scripts and config exist; use as alternate deploy path after smoke validation.            |

## Next

| Work                          | Priority | Why                                                                                           |
| ----------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| Remodel on-air plate design   | P0       | Make cards, slides and output surfaces look broadcast-ready, not just technically functional. |
| Improve output alerting       | P1       | Turn drift, stalled, waiting, silence and media errors into operator-facing alerts.           |
| Dependency audit cleanup      | P1       | Resolve current moderate upstream advisories without unsafe downgrades or forced fixes.       |
| Named operator rollout        | P1       | Move day-to-day work off bootstrap access and improve audit identity.                         |
| Cloudflare Workers smoke      | P1       | Prove the OpenNext deploy path in Workers before treating it as production-primary.           |
| Asset preview/review polish   | P2       | Faster QA inside Prepare before scheduling media into a live day.                             |
| Recurring/copy schedule tools | P2       | Speeds daily programming once the core workflow is stable.                                    |

## Future Capability Ideas

- direct vMix/OBS automation
- captions/subtitles
- backup output failover
- DVR/recording
- richer visual regression screenshots
- design system pass for all public/admin/output surfaces
- alerting/pager integration
- multi-channel scheduling
- reusable rundown templates

## Selling Point

Broadcast Planner is valuable because it reduces live broadcast risk. It gives operators one source of truth for Prepare, Program and Operate: content, schedule, fallbacks, health, output and audit. That means fewer manual handoffs, fewer last-minute surprises and a clearer path from "today's plan" to "signal is on air."
