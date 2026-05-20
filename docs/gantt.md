# RTV Planner Roadmap

Current roadmap only. The product is in controlled production: useful now, still improving toward safer unattended broadcast operations.

## Live Now

| Work                         | Status | What It Delivers                                                                             |
| ---------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| Browser playout for OBS/vMix | Live   | Fullscreen output plays Vimeo, MP4/HLS, images, slides, audio-backed blocks and fallbacks.   |
| Daily schedule workflow      | Live   | Operators can create a day, add timed blocks, assign assets and activate the broadcast day.  |
| Runbook and health checks    | Live   | Preflight, live notes, incident handling, shutdown, Admin Health and Go Live Drill.          |
| Reload time sync             | Live   | Reload mid-show resumes near the current scheduled video offset.                             |
| OBS/vMix capture validation  | Live   | Browser output was confirmed through web player, vMix and OBS.                               |
| Supabase migration kit       | Live   | Fresh-project SQL creates schema, RLS policies, buckets and operational tables.              |
| Security baseline            | Live   | Named operators, sessions, roles, CSRF, output token flow, rate limiting and audit logging.  |
| Schedule UX feedback         | Live   | Newly-created blocks are announced, highlighted and shown with clear start/end time ranges.  |
| OpenNext/Cloudflare path     | Ready  | Worker deploy scripts and config exist; use as alternate deploy path after smoke validation. |

## Next

| Work                          | Priority | Why                                                                                           |
| ----------------------------- | -------- | --------------------------------------------------------------------------------------------- |
| Real plate inputs             | P0       | Replace remaining placeholder/static plate data with real feeds or editable operator inputs.  |
| Remodel on-air plate design   | P0       | Make cards, slides and output surfaces look broadcast-ready, not just technically functional. |
| Persist smoke status          | P1       | `/api/health` can show degraded when no recent smoke status is written.                       |
| Improve output alerting       | P1       | Turn drift, stalled, waiting, silence and media errors into operator-facing alerts.           |
| Named operator rollout        | P1       | Move day-to-day work off bootstrap access and improve audit identity.                         |
| Cloudflare Workers smoke      | P1       | Prove the OpenNext deploy path in Workers before treating it as production-primary.           |
| Asset preview/review polish   | P2       | Faster QA before scheduling media into a live day.                                            |
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

RTV Planner is valuable because it reduces live broadcast risk. It gives operators one source of truth for content, schedule, fallbacks, health, output and audit. That means fewer manual handoffs, fewer last-minute surprises and a clearer path from "today's plan" to "signal is on air."
