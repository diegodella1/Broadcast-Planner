# Browser Playout Product Red Team — 2026-05-19

## Context

RTV TL Manager was changed from ffmpeg/VLC-first output to browser playout captured by OBS/vMix.
Current tested behavior:

- `/output/live` renders a browser output surface with `Start Output` audio unlock.
- Vimeo HLS plays in system Chromium.
- Playwright bundled headless shell fails Vimeo playback with codec incompatibility.
- Slides render.
- Preview reload resumes at scheduled offset.
- Live route currently has no active day, so live output shows fallback.

Success means an operator can run scheduled Roxom TV output with Vimeo episodes, uploaded/public ads, slides, and fallback media without ffmpeg.

## Synthesis

Most likely failure: operators think the app is production-ready because preview video works, but the real live-day workflow is still unproven end to end.

Most dangerous failure: output silently falls behind schedule or stalls during a live block and no one notices until the broadcast is wrong.

Hidden assumption: OBS/vMix browser capture will behave like the tested system Chromium session. It may not, especially around autoplay, codec support, reloads, and memory over long runtime.

Single most important revision: build a real "Go Live Drill" that creates/uses today's active day, opens browser output in the actual capture environment, verifies audio/video/slide/fallback/reload, and records pass/fail in Admin Health.

## Raw Failure Reasons

1. Preview works, live fails.
2. Audio unlock becomes operational trap.
3. Browser capture codec/runtime differs from test browser.
4. Schedule truth and media truth drift apart.
5. Fallback is present in theory, weak in practice.
6. Operators do not know what to do when output is wrong.
7. Product copy and legacy VLC/ffmpeg surfaces create split-brain workflow.
8. No measurable "on air is healthy" signal.
9. Long-running browser playout degrades.
10. External video providers become hidden dependency.

## Deep Dives

### 1. Preview Works, Live Fails

Failure story: The team tests a preview block and sees Vimeo play. They assume `/output/live` is ready. On air day arrives, but health still says no live day, or the active block does not line up with the current playout timezone. Output shows fallback, wrong block, or nothing useful. Everyone debates whether the app, the schedule, or OBS is wrong.

The failure is product-level: preview success is not same as live workflow success. The tool lacks a hard distinction between "component works" and "today can air."

Underlying assumption: a working preview route proves the live route is operational.

Early warning signs: `/api/health` reports degraded output; no active current-day block exists during testing.

Severity: high. Likelihood: high.

### 2. Audio Unlock Becomes Trap

Failure story: Browser autoplay policy requires click for audio. Operator clicks Start Output during setup, but later OBS browser source reloads, browser crashes, or capture machine restarts. Video returns visually, but audio is muted or paused until another click. Because the output may look visually correct, silence is discovered late.

The product currently relies on human memory for a browser policy constraint. That is fragile under pressure.

Underlying assumption: one operator click is acceptable and will not be lost mid-broadcast.

Early warning signs: reload returns Start Output overlay; OBS source settings reload browser on scene switch.

Severity: high. Likelihood: medium-high.

### 3. Browser Capture Differs From Tested Browser

Failure story: System Chromium plays Vimeo HLS. Playwright headless shell fails due codec support. OBS Browser Source uses CEF, vMix uses its own browser stack, and deployed capture machines may have different codec support or autoplay settings. A source that plays in dev Chromium may fail in production capture.

This is not a code bug only; it is environment certification. Product promise depends on the exact browser runtime.

Underlying assumption: all Chromium-like browsers can play Vimeo HLS through hls.js.

Early warning signs: `manifestIncompatibleCodecsError`; playback differs between Playwright, Chrome, OBS, and vMix.

Severity: high. Likelihood: medium.

### 4. Schedule Truth And Media Truth Drift

Failure story: On reload, app seeks based on block elapsed time. That works only when media duration, scheduled duration, and actual playable asset align. If Vimeo duration differs, a public MP4 lacks range support, or an ad URL starts slowly, output can resume wrong or fail near boundaries.

The schedule says one thing, media does another. Operator sees a plausible screen, but it is off by seconds or minutes.

Underlying assumption: scheduled duration and source playback behavior are accurate enough.

Early warning signs: missing duration; MP4 without HTTP range support; drift between `currentTime` and `expectedOffset`.

Severity: medium-high. Likelihood: high.

### 5. Fallback Weak In Practice

Failure story: Fallback exists as emergency slate or global fallback logic, but real fallback media may be missing, ugly, silent, expired, or not capture-tested. When bad media appears, the app switches to something technically valid but editorially unacceptable.

Fallback should be a product promise, not last-resort code path.

Underlying assumption: having fallback logic equals having a usable fallback experience.

Early warning signs: no ready global fallback asset; fallback never tested in OBS/vMix.

Severity: high. Likelihood: medium.

### 6. Operator Recovery Is Underspecified

Failure story: Output is wrong. Operator sees debug JSON, mediaState, and Admin Output controls, but does not know the sequence: reload? return to schedule? force fallback? stop broadcast? refresh Vimeo? The system exposes controls but not a decision path.

Under stress, ambiguous controls cause wrong actions.

Underlying assumption: operators can infer recovery steps from UI labels.

Early warning signs: runbook has generic checks; no incident prompts tied to actual media state.

Severity: high. Likelihood: medium.

### 7. Split-Brain Workflow

Failure story: Some pages still mention VLC/HLS/ffmpeg while new path says Browser Output. One operator follows old docs, another opens browser capture. Debugging starts from different mental models.

This kills trust. A broadcast tool needs one official path.

Underlying assumption: legacy paths can remain without confusing users.

Early warning signs: UI or manual still says "VLC Output"; deploy still has output-channel service.

Severity: medium. Likelihood: high.

### 8. No Hard On-Air Health Signal

Failure story: Output may be loaded, but app does not know whether OBS/vMix is actually capturing it or whether sound reaches program output. Admin Health can say ok while real broadcast is black/silent.

The system monitors itself, not the final signal.

Underlying assumption: browser renderer state is enough to infer broadcast health.

Early warning signs: no periodic screenshot/audio heartbeat from capture environment; no operator confirmation timer.

Severity: high. Likelihood: medium.

### 9. Long-Running Browser Degrades

Failure story: Browser output works for a 5-minute test. After hours, memory grows, HLS buffers stall, Vimeo tokenized URLs expire, or transition logic accumulates state. The output freezes or falls behind.

Short smoke tests miss endurance failures.

Underlying assumption: 30-second preview behavior predicts 8-hour playout.

Early warning signs: increasing memory use; current time drift; recurring waiting/stalled events.

Severity: high. Likelihood: medium.

### 10. External Provider Dependency

Failure story: Vimeo API tokens, HLS signatures, CORS, privacy settings, or rate limits change. Imported videos still appear ready in Library, but playback fails at air time.

The product depends on provider behavior it does not control.

Underlying assumption: ready Vimeo asset remains playable whenever scheduled.

Early warning signs: playback readiness not rechecked near airtime; Vimeo HLS link generated only at playback time and errors surface late.

Severity: high. Likelihood: medium.

## Revised Product Plan

1. Add a Go Live Drill page/state.
   - Must verify current day active, current block present, output opens, audio unlocked, video plays, slide renders, fallback works, reload resumes at offset.
   - Result stored with timestamp and shown in Admin Health.

2. Certify one capture runtime.
   - Pick OBS Browser Source or vMix as official first.
   - Test actual capture runtime, not only Chrome.
   - Document exact settings: autoplay, reload behavior, resolution, audio route.

3. Add output drift monitor.
   - Compare `video.currentTime` to expected schedule offset.
   - Warn if drift exceeds 2 seconds for 10 seconds.
   - Fail if stalled/waiting persists over threshold.

4. Make fallback an asset requirement.
   - No active day without ready global fallback.
   - Test fallback in browser output before live.

5. Remove split-brain docs and primary UI.
   - Browser Output is official.
   - ffmpeg/VLC path marked legacy or removed.

6. Add operator incident prompts.
   - If mediaState errored: show "force fallback / reload output / return to schedule."
   - If audio locked: show "click Start Output on capture machine."
   - If no active day: show "activate today's schedule."

7. Add endurance test.
   - Run output renderer for at least 2 hours with video, slide, image/ad, fallback.
   - Log memory, drift, stalled events, reload recovery.

## Pre-Launch Checklist

1. Today has active program day and current active block.
2. Actual OBS/vMix capture runtime plays Vimeo video with audio after Start Output.
3. Reload mid-episode resumes near expected offset.
4. Slide block renders correctly in capture runtime.
5. Bad media triggers approved fallback.
6. Admin Health shows a Go Live Drill pass less than 24 hours old.
7. Operator runbook includes exact recovery steps for black screen, silence, stalled video, wrong block.
