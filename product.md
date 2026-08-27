# Broadcast Planner Product Plan

## Product Identity

Broadcast Planner is a broadcast operations product for programming what appears on an output, when it appears, and how it recovers when something fails.

The product is not a consumer website, not a passive video library, and not only a weather or camera rotation tool. It is a CMS-controlled playout layer for a television workflow. The viewer does not interact with it. Operators, producers, and content administrators use it to assemble the signal that is later captured by vMix, OBS, or another broadcast system.

The core product sentence:

> Program the day, verify the signal, keep the screen on air.

The core abstraction:

```txt
Program Day -> Blocks -> Scheduled Layers -> Broadcast Renderer
```

The current codebase already follows this direction. It has daily programming, media assets, slides, scheduled layers, a fullscreen output renderer, Supabase persistence, Vimeo import, uploaded video assets, schedule health checks, and a long-grid generator.

## Register

Product UI. Design serves task execution.

This product should feel like a broadcast operations console: dense, calm, explicit, and resistant to operator mistakes. Visual expression belongs mainly in the output renderer and scene templates. Admin surfaces should prioritize scan speed, scheduling confidence, and fast correction under time pressure.

## Existing Project Snapshot

### Stack

- Next.js 15 app router.
- React 19.
- TypeScript.
- Tailwind CSS.
- Supabase for data and storage.
- Vimeo integration.
- Vitest unit tests for scheduling and schedule generation.
- Playwright available for end-to-end validation.

### Implemented Product Areas

- Admin shell with side navigation.
- Calendar/day programming route.
- Assets library with remote URLs, Vimeo import, uploaded video assets, duration, status, orientation metadata, and fallback assets.
- Slides library with HTML, image, markdown, and template-oriented types.
- Daily schedule view with operational panels: now, next, coverage.
- Visual daily timeline by hour.
- Health checks for gaps, overlaps, missing assets, unready assets, and missing fallback.
- Program block creation.
- Long test schedule generator for multi-hour programming.
- Scheduled layer mutation helpers.
- Lower-third helper that creates a slide plus scheduled layer.
- Live output route.
- Output preview route by block.
- Fallback rendering.
- Basic vertical-video presentation with blurred background.
- Supabase schema for assets, slides, program days, blocks, scheduled layers, calendar events,
  integration settings, and audit log.

### Current Implementation Notes

The admin UX is now grouped by operator intent:

- `/admin/prepare` is the front door for assets, Vimeo, music, guests, weather city plates and
  real-data plates.
- `/admin/program` is the front door for Calendar, Schedule, Loop Builder, fallback policy and
  schedule health.
- `/admin/operate` is the live control-room hub for Output, health, runbook, audit and recovery.

The focused block editor exists at `/admin/schedule/[date]/blocks/[id]` and is the primary surface
for detailed timing/content/fallback/layer work. Inline schedule editing also supports normal
program-only `PREVIOUSLY RECORDED` bug configuration with four-corner placement. Real-data plate
coverage now includes external metals data with fallback, Open-Meteo weather fallback, Supabase events
for calendar plates, guest lineup inputs and a CSS-safe debt plate background.

Loop Builder lives on the schedule page and makes the operator choose one intent: create scheduled
slide-loop blocks, update the global visual fallback carousel, or do both. Fallback-only updates do
not create scheduled blocks.

## Product Thesis

Broadcast playout fails when systems hide uncertainty. Broadcast Planner should make uncertainty visible before it becomes an on-air problem.

The product should not only store media and schedule blocks. It should continuously answer:

- What is on air now?
- What is next?
- What is missing?
- What can break?
- What will happen if the current media fails?
- What does the output route currently render?
- Can an operator correct the issue before the viewer sees it?

The best product features are therefore not decorative CMS features. The best features are operational guarantees:

- conflict detection,
- output confidence,
- fast preview,
- fallback confidence,
- asset readiness,
- operator override,
- auditability,
- repeatable schedule generation,
- and reusable broadcast scene templates.

## Users

### Content Administrator

Primary builder of schedules and assets.

Jobs:

- Upload or reference media.
- Import Vimeo videos.
- Create slides and lower thirds.
- Build daily schedules.
- Assign assets to blocks.
- Add promos, ads, bumpers, and fallback loops.
- Publish a day as ready or active.

Success means they can build tomorrow's programming without needing engineering support.

### Technical Operator

Primary user during live or near-live operation.

Jobs:

- Open output route in vMix or OBS.
- Verify current output.
- Monitor now, next, fallback, and health.
- Preview a block before it airs.
- Force fallback if an asset fails.
- Disable an unsafe overlay.
- Recover quickly from broken media.

Success means they know what the signal is doing and can act in seconds.

### Producer

Editorial owner of continuity and promotion.

Jobs:

- Choose what airs in promos and slides.
- Approve daily programming.
- Confirm ad and promo placements.
- Review gaps in the day.
- Reuse proven programming patterns.

Success means the day has editorial rhythm, not just technically valid blocks.

### Viewer

Passive TV viewer.

Jobs:

- None. They watch.

Success means they never see admin UI, broken URLs, browser controls, accidental scrollbars, cursor dependence, layout jumps, unsupported media messages, or raw debug information.

## Product Principles

### 1. Timeline Truth

Every output state should be explainable from schedule data. If something appears on air, the admin should be able to trace it back to a program block, scheduled layer, asset, slide, fallback, or explicit operator override.

### 2. Broadcast Safety Before CMS Completeness

Shipping many asset fields matters less than knowing the output can survive missing media, bad status, gaps, and timing conflicts.

### 3. Fewer Visible Choices, Same Power

The primary admin path is Prepare -> Program -> Operate. Direct routes and advanced metadata remain
available, but operators should not need to scan every tool at once during normal work.

### 4. Operator Correction Must Be Faster Than Editing Raw Data

During live operation, the operator should not need to search several pages to fix the current output. The system needs direct controls for preview, disable, force next, force fallback, and mark unsafe.

### 5. Ready Means Ready To Air

An asset with status `ready` should satisfy minimum playout requirements:

- source URL exists,
- duration is known or deliberately waived,
- media type is compatible with renderer,
- status is not failed or syncing,
- fallback is available when the asset is used in an active schedule.

### 6. Daily Programming Is A First-Class Object

The current architecture uses `program_days`, which is correct for broadcast operations. The product should keep leaning into daily programming rather than generic project timelines.

### 7. Output Renderer Is Sacred

The output route must remain clean, fullscreen, stable, and boring in the best way. Debug panels are useful only behind explicit debug parameters.

### 7. Reusable Scenes Beat One-Off HTML

Raw HTML slides are useful for speed, but the product should evolve toward reusable templates for lower thirds, promos, title cards, weather, market widgets, maps, and fallback scenes.

## Current Product Model

### Media Asset

Represents playable or renderable media:

- uploaded video,
- remote MP4,
- HLS,
- Vimeo video,
- remote image,
- Supabase image,
- graphic,
- ad,
- promo,
- fallback.

Best next evolution:

- add readiness checks,
- add automatic metadata extraction where possible,
- add playable-source validation,
- add preview thumbnails,
- add usage tracking,
- add rights or expiry metadata only when the team actually needs it.

### Slide Asset

Represents renderable visual cards:

- image slide,
- HTML slide,
- markdown slide,
- future template slide.

Best next evolution:

- visual template editor,
- safe HTML sanitization or restricted component templates,
- slide preview thumbnails,
- brand-safe lower-third and promo templates.

### Program Day

Represents one broadcast day in one timezone.

Best next evolution:

- statuses with clear publish flow: draft, ready, active, archived,
- clone previous day,
- generate day from pattern,
- lock active day from accidental destructive edits,
- day-level fallback asset selection.

### Program Block

Represents base timeline content for a time range.

Best next evolution:

- detail page for editing,
- overlap prevention at write time,
- block preview,
- duplicate and shift,
- split block,
- insert ad break,
- mark as sponsor, promo, program, filler, or fallback,
- block-level notes for operator context.

### Scheduled Layer

Represents overlays inside a block.

Best next evolution:

- block-level layer editor,
- layer timeline strip,
- enable/disable toggles,
- locked layers for channel identity,
- preview inside block,
- quick-create lower third, logo bug, promo bug, bottom ticker.

## Best Feature Roadmap

## Phase 1: Operational MVP Hardening

Goal: make current product safe enough for real internal testing.

### 1. Block Detail Editor

Why it matters:

The schedule page points to block detail routes, and operators need a focused place to correct a block. Without it, the most important workflow stops at a broken navigation path.

Feature:

- Route: `/admin/schedule/[date]/blocks/[blockId]`.
- Edit block title, type, asset, slide, start time, duration, status, hide overlays, fallback.
- Show asset readiness and renderer compatibility.
- Show block preview link.
- Show active scheduled layers for this block.
- Add lower third.
- Add image or slide overlay.
- Disable or delete unsafe layers.
- Display block-local health checks.

Acceptance:

- Every schedule row link resolves.
- Admin can edit a block without touching database manually.
- Admin can add and disable overlays for that block.
- Preview route can be opened from the editor.

### 2. Publish Flow For Program Days

Why it matters:

Operators need a strong distinction between a draft day, a ready day, and the active day.

Feature:

- Day status controls.
- Pre-publish validation.
- Active day warning if critical issues exist.
- Prevent activation without fallback unless explicitly overridden.
- Display active day in admin shell.

Acceptance:

- Draft day can contain incomplete work.
- Ready day has zero critical issues.
- Active day is obvious from calendar and schedule pages.
- Activation writes audit log.

### 3. Strong Schedule Validation

Why it matters:

Current health checks exist in UI. They should become reusable product logic, not only page-local display logic.

Feature:

- Extract `analyzeSchedule` into `lib/schedule-health.ts`.
- Reuse in schedule page, block detail, publish flow, and tests.
- Validate gaps, overlaps, missing assets, unready assets, missing fallback, unsupported media, ad duration, invalid layer windows, layers longer than block, hidden overlays with active layers.

Acceptance:

- Unit tests cover each issue type.
- Publish flow blocks critical issues.
- Warnings remain visible but do not always block publishing.

### 4. Output Confidence Panel

Why it matters:

The admin should not have to open the output route to know if the schedule is safe.

Feature:

- Compact panel on schedule page showing:
    - current block,
    - current asset,
    - renderer support,
    - fallback asset,
    - active layers,
    - next transition time,
    - detected critical issues.

Acceptance:

- Operator can answer "what is on air now" from admin.
- Panel matches output debug state.

### 5. Asset Readiness Checks

Why it matters:

`ready` must mean operationally ready.

Feature:

- Add readiness status in assets list.
- Check required fields by source type.
- Show missing URL, missing Vimeo ID, missing duration, unsupported type, failed import, expired asset.
- Add a "needs attention" filter.

Acceptance:

- Asset list can be filtered to unsafe assets.
- Schedule health references same readiness logic.

## Phase 2: Faster Programming

Goal: reduce time needed to build a reliable broadcast day.

### 6. Clone Day

Why it matters:

Broadcast schedules often repeat patterns. Building from scratch every day wastes operator time.

Feature:

- Clone a program day into a new date.
- Option to keep assets, clear notes, shift start times, or replace only date.
- Preserve block order and scheduled layers.

Acceptance:

- Admin can create tomorrow from today in one flow.
- New day remains draft until validated.

### 7. Pattern-Based Grid Builder

Why it matters:

The current long test generator proves the concept. It should become a production scheduling helper.

Feature:

- Named patterns:
    - program plus ad break,
    - promo loop,
    - long-form video with bumpers,
    - filler loop,
    - overnight continuity.
- Asset pools by type and tag.
- Configurable duration rules.
- Preview generated blocks before insert.

Acceptance:

- Admin can generate a 12-hour schedule from ready assets.
- Admin can review before replacing a window.
- Generator avoids ads longer than 5 minutes.

### 8. Drag, Shift, Duplicate

Why it matters:

Time edits should not require manual recalculation.

Feature:

- Duplicate block.
- Shift selected block by seconds or minutes.
- Move block after previous or before next.
- Optional ripple edit: shifting one block moves following blocks.

Acceptance:

- Admin can correct schedule timing without retyping every start time.
- Conflicts are shown before save.

### 9. Asset Usage View

Why it matters:

Producers need to know where a video, ad, promo, or slide is used before editing or archiving it.

Feature:

- On asset details: list all days and blocks using it.
- On slide details: list all base blocks and scheduled layers using it.
- Warn before archiving in-use assets.

Acceptance:

- Admin can safely edit or archive assets.
- Schedule does not silently break from asset changes.

### 10. Bulk Import Workflow

Why it matters:

Vimeo import and upload exist, but operators need to triage imported media quickly.

Feature:

- Import results page.
- Detect duration, title, thumbnail, privacy, embed status.
- Bulk set asset type, status, tags, orientation, fallback candidate.
- Filter new imports.

Acceptance:

- Imported videos arrive in a review queue.
- Admin can mark many assets ready in one pass.

## Phase 3: Broadcast Scene System

Goal: move from raw slides to reusable, brand-safe broadcast scenes.

### 11. Scene Templates

Why it matters:

Raw HTML slides are flexible but unsafe and inconsistent. Template scenes give speed and brand control.

Feature:

- Lower third template.
- Title card template.
- Promo card template.
- Sponsor bug template.
- Fullscreen image plus caption.
- Calendar/event card.
- Fallback scene template.

Acceptance:

- Admin creates common broadcast graphics without writing HTML.
- Output renderer can render template data directly.
- Templates look consistent on 1080p output.

### 12. Weather And Camera Scene

Why it matters:

The original product direction includes valuable weather/camera work. In the new architecture, it becomes one scene type, not the system center.

Feature:

- Camera asset type or scene source.
- Weather data configuration.
- Location metadata.
- Scheduled block or overlay mode.
- Fallback if camera or weather data fails.

Acceptance:

- Weather/camera can be scheduled like any other block.
- It does not create special-case timeline logic.

### 13. Market Widget Scene

Why it matters:

Market and crypto data visuals must be reliable and readable.

Feature:

- Widget source settings.
- Data freshness indicator.
- Fullscreen or lower-third placement.
- Safe stale-data fallback.

Acceptance:

- Widget indicates stale data in debug/admin.
- Viewer output never shows raw errors.

### 14. Maps And Location Cards

Why it matters:

Maps add editorial value for city, camera, weather, and event coverage.

Feature:

- Location library.
- Map scene template.
- Camera/location relationship.
- Scheduled map cards.

Acceptance:

- Producer can schedule a location-driven scene without developer help.

## Phase 4: Live Operations Console

Goal: give technical operators a true control room surface.

### 15. Live Control Room

Why it matters:

The schedule page is a planning surface. Live operation needs a tighter surface focused on now, next, and emergency actions.

Feature:

- Route: `/admin/live`.
- Current output state.
- Preview window or still snapshot.
- Next block countdown.
- Active layers.
- Fallback readiness.
- Critical warnings.
- Force fallback.
- Force next block.
- Disable current layer.
- Copy output URL.

Acceptance:

- Operator can monitor and intervene from one screen.
- Emergency actions require confirmation but stay fast.

### 16. Manual Override Layer

Why it matters:

Broadcast operations sometimes need immediate messages outside the schedule.

Feature:

- Create temporary lower third.
- Create temporary fullscreen alert.
- Duration required.
- Auto-expire.
- Audit logged.

Acceptance:

- Operator can show an urgent message within seconds.
- Override automatically clears.

### 17. Output Heartbeat

Why it matters:

The admin should know if the browser output is alive.

Feature:

- Output route posts heartbeat.
- Admin shows last seen timestamp.
- Include current block ID, asset ID, renderer version, debug flag.

Acceptance:

- Operator sees if vMix/OBS browser source is stale or disconnected.

### 18. Renderer Error Reporting

Why it matters:

Media errors must be visible to the admin, not only inside the browser console.

Feature:

- Capture video error events.
- Capture image load failures.
- Capture Vimeo iframe fallback where possible.
- Report to API.
- Mark output status degraded.

Acceptance:

- Broken media creates an admin-visible warning.
- Renderer switches to fallback when configured.

## Phase 5: Scale And Governance

Goal: support more channels, more people, and more accountability when needed.

### 19. Multi-Channel Support

Why it matters:

If Broadcast Planner adds more outputs, the product should evolve without rewriting the schedule model.

Feature:

- Channel table.
- Program days scoped to channel.
- Output routes by channel.
- Channel-level fallback and branding.

Acceptance:

- One instance can manage multiple output feeds.

### 20. Roles And Permissions

Why it matters:

Current service-role server operations are practical for MVP, but team workflows eventually need controlled access.

Feature:

- Admin login tied to Supabase auth or a trusted internal auth layer.
- Roles: admin, producer, operator, viewer.
- Restrict publish and emergency override.

Acceptance:

- Users can work without sharing a single secret.
- Critical actions are attributable.

### 21. Audit Timeline

Why it matters:

Broadcast mistakes need traceability.

Feature:

- Human-readable audit page.
- Filter by day, asset, block, actor, action.
- Show before/after for critical edits.

Acceptance:

- Team can reconstruct who changed the active day and when.

### 22. Versioned Publishing

Why it matters:

Active schedules should not mutate invisibly.

Feature:

- Draft edits create a new schedule version.
- Publish promotes a version.
- Output reads active published version.
- Roll back to previous version.

Acceptance:

- On-air output is stable during editing.
- Rollback takes one action.

## Feature Priority Matrix

### Highest Value, Lowest Ambiguity

Build first:

- Block detail editor.
- Shared schedule health module.
- Day publish flow.
- Asset readiness checks.
- Clone day.
- Live output confidence panel.

Reason:

These features reinforce the current architecture and remove immediate workflow blockers.

### Highest Broadcast Safety

Build before serious live use:

- Output heartbeat.
- Renderer error reporting.
- Force fallback.
- Fallback selection per day and per block.
- Critical issue blocking before activation.

Reason:

These features reduce on-air risk.

### Highest Operator Speed

Build after safety:

- Drag, shift, duplicate blocks.
- Pattern-based grid builder.
- Bulk import review.
- Asset usage view.
- Live control room.

Reason:

These features reduce repetitive schedule work.

### Highest Editorial Quality

Build after core operations:

- Scene templates.
- Lower thirds as first-class scenes.
- Promo templates.
- Calendar cards.
- Weather/camera scenes.
- Market widgets.

Reason:

These features improve the on-air product once playout operations are dependable.

## UX Direction

### Admin Information Architecture

Recommended routes:

```txt
/admin/live
/admin/calendar
/admin/schedule/[date]
/admin/schedule/[date]/blocks/[blockId]
/admin/assets
/admin/assets/[assetId]
/admin/slides
/admin/slides/[slideId]
/admin/scenes
/admin/settings
/output/live
/output/preview/[blockId]
```

### Navigation

Side nav should become:

- Live
- Calendar
- Assets
- Slides
- Scenes
- Settings
- Output

The current "Agenda" link is useful, but the live console should become first because it is the operational center.

### Schedule Page

Keep:

- now,
- next,
- coverage,
- visual daily timeline,
- health checks,
- add block,
- generator.

Add:

- publish controls,
- clone day,
- filter by issue,
- active day badge,
- output heartbeat,
- copy output URL,
- route to live console.

### Block Detail Page

This should be dense and task-focused:

- Header: title, status, start, duration, preview, save.
- Left: base block fields.
- Middle: block preview and asset readiness.
- Right: layers and health.
- Bottom: audit/history and notes.

Avoid modal-first editing. This page needs enough space for timing, assets, warnings, and preview.

### Asset Page

Add:

- filters by type, status, readiness, source, orientation.
- usage count.
- preview thumbnail.
- bulk actions.
- import queue.

### Output UI

The output renderer should stay fullscreen and non-interactive:

- no admin controls,
- no scrollbars,
- no visible browser chrome,
- no cursor dependence,
- debug only behind query param,
- fallback visual always clean and branded.

## Data Model Evolution

### Add `channels`

Later, when needed:

```txt
channels
- id
- name
- slug
- timezone
- fallback_asset_id
- status
- created_at
- updated_at
```

Then scope `program_days` to `channel_id`.

### Add `schedule_versions`

For published stability:

```txt
schedule_versions
- id
- program_day_id
- version_number
- status
- snapshot_json
- published_at
- published_by
```

The output renderer can read a stable version instead of mutable draft tables.

### Add `asset_checks`

For readiness:

```txt
asset_checks
- id
- media_asset_id
- check_type
- status
- message
- checked_at
```

### Add `output_sessions`

For heartbeat:

```txt
output_sessions
- id
- channel_id
- route
- user_agent
- last_seen_at
- current_program_day_id
- current_block_id
- current_asset_id
- status
```

### Add `operator_overrides`

For emergency actions:

```txt
operator_overrides
- id
- channel_id
- override_type
- payload
- starts_at
- ends_at
- status
- created_by
- created_at
```

## Technical Recommendations

### 1. Extract Schedule Health

Move page-local health logic into a library with unit tests.

Target:

```txt
lib/schedule-health.ts
lib/schedule-health.test.ts
```

This gives one source of truth for UI warnings, publish blocking, and future API checks.

### 2. Add Write-Time Conflict Protection

`hasBaseBlockConflict` exists but `createProgramBlock` does not appear to use it. Add conflict checks before insert, or support an explicit override.

### 3. Fix Missing Block Route

Create `/admin/schedule/[date]/blocks/[blockId]` before building more scheduling features.

### 4. Harden Output Media Events

Current renderer displays fallback for missing or unsupported assets, but video/image runtime load failures should also trigger fallback and report an error.

### 5. Treat Vimeo As Potentially Fragile

Vimeo iframe playback is practical for MVP, but output reliability may vary by privacy, embed settings, network, and autoplay rules. Keep uploaded MP4/HLS as the preferred broadcast-safe path where possible.

### 6. Restrict Raw HTML Long-Term

`dangerouslySetInnerHTML` enables fast lower thirds and HTML slides. It should be replaced or constrained for production templates, especially if more users gain access.

### 7. Separate Planning Data From Playback Data

`getPlaybackScheduleForDate` already narrows data for output. Continue this pattern. Output should receive only what it needs to render the current program safely.

### 8. Make Fallback Explicit

Fallback should exist at multiple levels:

- channel fallback,
- day fallback,
- block fallback,
- asset failure fallback,
- renderer hard fallback.

## MVP Definition From Here

The next MVP should not be "more CMS pages." It should be "a complete safe loop from planning to output."

### MVP Must Include

- Assets can be created, uploaded, imported, edited, and marked ready.
- Slides can be created and scheduled.
- Program day can be created and filled with blocks.
- Block detail editor exists.
- Block can be previewed.
- Layers can be added and disabled.
- Schedule health is visible and tested.
- Program day can be marked ready only when critical checks pass.
- Output route renders live schedule.
- Fallback asset exists and is used.
- Operator can see current and next block.

### MVP Should Include

- Clone day.
- Basic publish/activate flow.
- Output heartbeat.
- Asset readiness filters.
- Bulk Vimeo review.
- Generator preview before insert.

### MVP Can Wait

- Multi-channel.
- Roles.
- Versioned publishing.
- Advanced scene editor.
- Full drag-and-drop.
- AI schedule generation.
- Complex rights management.
- vMix automation.
- RTMP ingest or transcoding.

## Product Quality Bar

### Admin Quality

- Every schedule link resolves.
- Every destructive action has confirmation or recovery.
- Every active output issue appears in admin.
- Every critical warning is actionable.
- Every timing field accepts timecode consistently.
- Every status has clear meaning.
- Empty states tell the admin what action to take next.

### Output Quality

- 1920x1080 safe.
- No accidental scrolling.
- No visible controls.
- No layout jumps at transitions.
- No raw exception messages.
- Fallback always renders.
- Debug mode is useful but hidden by default.
- Long playback does not drift from schedule time without detection.

### Broadcast Content Quality

- Lower thirds are readable from a TV distance.
- Promo slides use consistent typography and margins.
- Vertical videos are handled deliberately.
- Images never stretch incorrectly.
- Fallback screen feels intentional, not broken.

## Near-Term Implementation Sequence

### Sprint 1

- Add block detail route.
- Add edit block mutation.
- Add scheduled layer list and creation on block page.
- Add preview link.
- Fix broken schedule links.

### Sprint 2

- Extract schedule health into shared library.
- Add tests for gaps, overlaps, missing assets, unready assets, ad limits, fallback.
- Add publish readiness checks.
- Add day status controls.

### Sprint 3

- Add asset readiness checks and filters.
- Add asset usage view basics.
- Add clone day.
- Improve long-grid generator with preview mode.

### Sprint 4

- Add live control room.
- Add output heartbeat.
- Add renderer media error reporting.
- Add force fallback.

### Sprint 5

- Add reusable scene templates.
- Convert lower third from raw HTML helper into a first-class template.
- Add calendar and promo templates.

## Strategic Product Bets

### Best Bet 1: Broadcast Safety As Differentiator

The product becomes valuable when it prevents bad output, not when it simply stores assets.

Invest in:

- validation,
- readiness,
- heartbeat,
- fallback,
- audit,
- preview.

### Best Bet 2: Fast Daily Programming

The product becomes sticky when a producer can build a whole day quickly.

Invest in:

- clone day,
- schedule patterns,
- bulk import review,
- duplicate and shift,
- asset pools.

### Best Bet 3: Scene Templates

The product becomes visually strong when producers can make good broadcast graphics without custom HTML.

Invest in:

- lower thirds,
- promo cards,
- title cards,
- market widgets,
- weather/camera scenes.

### Best Bet 4: Live Console

The product becomes operational when it supports live correction, not only pre-planning.

Invest in:

- now/next,
- countdown,
- preview,
- force fallback,
- temporary override,
- output health.

## Risks

### Browser Playback Risk

Long playback in browser capture can fail from autoplay rules, network instability, iframe restrictions, memory growth, or media incompatibility.

Mitigation:

- prefer local/uploaded MP4 or HLS for critical output,
- add media error handling,
- add heartbeat,
- test long sessions,
- keep fallback visible and fast.

### Schedule Drift Risk

Current renderer increments seconds locally every second. Over long sessions, timers can drift.

Mitigation:

- periodically resync to wall clock,
- calculate active block from actual current time,
- expose drift in debug mode.

### Raw HTML Risk

HTML slides enable unsafe or inconsistent output.

Mitigation:

- restrict raw HTML to admin-only trusted users,
- move common patterns into templates,
- sanitize if wider access is added.

### Mutable Active Schedule Risk

Editing the same data output reads can create on-air surprises.

Mitigation:

- add publish/version snapshots,
- keep active output pinned to published data,
- audit critical edits.

### Missing Route Risk

Schedule links to block pages currently imply a route that was not found.

Mitigation:

- implement block detail route first.

## Success Metrics

### Operational

- Time to create tomorrow's schedule.
- Number of critical issues before activation.
- Number of on-air fallbacks caused by missing or failed assets.
- Time to recover from broken media.
- Output heartbeat uptime.

### Editorial

- Number of scheduled promos and lower thirds per day.
- Reuse rate of templates.
- Time from idea to ready slide.

### Technical

- Renderer error rate.
- Schedule health test coverage.
- Long-session playback stability.
- Vimeo import failure rate.
- Asset readiness pass rate.

## Final Direction

The codebase is already pointed at the right product: a daily broadcast playout manager, not a generic CMS. The best next work is not broad expansion. It is closing the operational loop:

```txt
create assets -> build day -> validate -> preview -> publish -> monitor output -> recover safely
```

Once that loop is dependable, the product can grow into richer broadcast graphics, weather/camera scenes, market widgets, maps, multi-channel output, and live control room features without losing the simple truth of the system: the schedule explains the signal.
