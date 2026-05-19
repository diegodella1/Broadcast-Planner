# RTV TL Manager Roadmap

Current roadmap only.

## Now

| Work                        | Status | Exit Criteria                                                         |
| --------------------------- | ------ | --------------------------------------------------------------------- |
| Browser output for OBS/vMix | Live   | Production output plays Vimeo, MP4/HLS, images, slides, and fallback. |
| Reload time sync            | Live   | Reload mid-show resumes at current scheduled offset.                  |
| Go Live Drill               | Live   | Admin Health lists the drill and operators can run it before capture. |
| Current-day live test       | Live   | Active day exists with playable block and fallback asset.             |

## Next

| Work                                     | Priority | Why                                                                              |
| ---------------------------------------- | -------- | -------------------------------------------------------------------------------- |
| Certify OBS/vMix on real capture machine | P0       | Headless Chromium passed; actual capture runtime must prove video/audio/reload.  |
| Persist smoke status                     | P1       | `/api/health` currently reports degraded when no recent smoke status is written. |
| Improve output drift/stall alerting      | P1       | Current data attrs exist; need operator-facing alert and threshold tuning.       |
| Multi-operator roles                     | P1       | Needed for real audit identity and safer handoff.                                |
| Asset preview modal                      | P2       | Faster QA before scheduling.                                                     |
| Recurring/copy schedule tools            | P2       | Speeds daily programming once core workflow is stable.                           |

## Future Capability Ideas

- direct vMix/OBS automation
- captions/subtitles
- backup output failover
- DVR/recording
- visual regression screenshots
- alerting/pager integration
