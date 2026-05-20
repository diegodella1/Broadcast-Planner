# RTV Planner Roadmap

Current roadmap only. The product is in controlled production: useful now, still improving toward safer unattended broadcast operations.

## Live Now

| Work                         | Status | What It Delivers                                                                            |
| ---------------------------- | ------ | ------------------------------------------------------------------------------------------- |
| Browser playout for OBS/vMix | Live   | Fullscreen output plays Vimeo, MP4/HLS, images, slides, audio-backed blocks and fallbacks.  |
| Daily schedule workflow      | Live   | Operators can create a day, add timed blocks, assign assets and activate the broadcast day. |
| Runbook and health checks    | Live   | Preflight, live notes, incident handling, shutdown, Admin Health and Go Live Drill.         |
| Reload time sync             | Live   | Reload mid-show resumes near the current scheduled video offset.                            |
| Supabase migration kit       | Live   | Fresh-project SQL creates schema, RLS policies, buckets and operational tables.             |
| Security baseline            | Live   | Named operators, sessions, roles, CSRF, output token flow, rate limiting and audit logging. |
| Schedule UX feedback         | Live   | Newly-created blocks are announced, highlighted and shown with clear start/end time ranges. |

## Next

| Work                                     | Priority | Why                                                                                                   |
| ---------------------------------------- | -------- | ----------------------------------------------------------------------------------------------------- |
| Certify OBS/vMix on real capture machine | P0       | Headless and local checks passed; actual capture runtime must prove video, audio and reload behavior. |
| Persist smoke status                     | P1       | `/api/health` can show degraded when no recent smoke status is written.                               |
| Improve output alerting                  | P1       | Turn drift, stalled, waiting, silence and media errors into operator-facing alerts.                   |
| Real plate inputs                        | P1       | Replace remaining placeholder/static plate data with real feeds or editable operator inputs.          |
| Remodel on-air plate design              | P1       | Make cards, slides and output surfaces look broadcast-ready, not just technically functional.         |
| Named operator rollout                   | P1       | Move day-to-day work off bootstrap access and improve audit identity.                                 |
| Asset preview/review polish              | P2       | Faster QA before scheduling media into a live day.                                                    |
| Recurring/copy schedule tools            | P2       | Speeds daily programming once the core workflow is stable.                                            |

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
