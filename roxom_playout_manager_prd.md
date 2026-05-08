# PRD — Roxom Playout Manager

## 1. One-line Summary

Build a new CMS-controlled broadcast playout manager for Roxom TV, based on the lessons from `backgroundclima`, where an admin can program exactly what appears on air and when: long-form videos, ads, slides, maps, cameras, weather, widgets, promos, and other visual layers.

This should be a new architecture, not a direct extension of the current `backgroundclima` city-rotation logic.

---

## 2. Background

The existing `backgroundclima` project started as a visual application for rotating live city camera views with weather information. That product is useful and should not be discarded. It already contains valuable logic and visual ideas around:

- city/camera display,
- weather data,
- automatic rotation,
- fullscreen browser output,
- TV-style ambient visuals,
- compatibility with a broadcast environment such as vMix or OBS.

However, the new product goal is much broader.

The desired product is no longer just a rotating weather/camera background. It is a full internal tool for managing and programming a broadcast visual layer.

The new product should support:

- 2-hour continuous video playback,
- short ads of 5 minutes or less,
- slides or visual cards scheduled at exact timestamps,
- cameras and weather scenes,
- data widgets,
- maps or location-based scenes,
- promos,
- fallback loops,
- fullscreen broadcast output,
- and an admin interface for content managers.

The viewer does not interact with the product. This is for television. The admin/operator controls what appears on air.

---

## 3. Strategic Decision

### Recommendation

Start a new project or a very clean new branch using a new architecture.

Do not keep stretching `backgroundclima` into a larger CMS/playout system.

Use `backgroundclima` as a source of reusable components, patterns, and lessons, especially for weather/camera scenes. But the new system should be architected around timelines and scheduled layers, not city rotation.

### Why

The center of the old product is:

```txt
City rotation → Camera view → Weather overlay
```

The center of the new product must be:

```txt
Timeline → Scheduled Layers → Broadcast Renderer
```

This is a different product category.

If we keep adding features directly on top of the old architecture, the app will likely become hard to maintain:

- city rotation logic mixed with timeline logic,
- video playback mixed with widgets,
- slides mixed with weather scenes,
- CMS state mixed with broadcast output state,
- ad playback mixed with map scenes,
- and no clean abstraction for what is actually on air.

The new product should treat `backgroundclima` as one possible scene type inside a broader system.

---

## 4. Product Name

Working name:

# Roxom Playout Manager

Alternative internal names:

- Roxom Signal Layer
- Roxom Visual Rundown Manager
- Roxom Broadcast Timeline Manager
- Roxom Visual CMS

Recommended name: **Roxom Playout Manager**.

Reason: it clearly communicates that the product is not only a CMS, not only a weather app, and not only a graphics layer. It manages what plays out to air.

---

## 5. Product Definition

Roxom Playout Manager is an internal CMS + timeline manager + browser-based broadcast renderer.

It allows a content administrator to create and schedule visual/audio-visual elements on a timeline, then output that programmed sequence through a fullscreen browser route that can be captured by vMix, OBS, or another broadcast system.

The product has two main surfaces:

### 5.1 Admin CMS

The admin CMS is used by internal operators, producers, or content admins to manage:

- media assets,
- long-form videos,
- ads,
- promos,
- slides,
- cameras,
- weather scenes,
- map scenes,
- data widgets,
- calendars,
- topics,
- timelines,
- fallback scenes,
- schedules,
- durations,
- transitions,
- and on-air status.

### 5.2 Broadcast Output

The broadcast output is a fullscreen browser route designed for TV.

It must be:

- non-interactive for the viewer,
- stable over long playback sessions,
- compatible with vMix/OBS browser input,
- readable on TV,
- able to play long videos,
- able to show overlays/slides/widgets at exact scheduled moments,
- and able to recover gracefully if an asset fails.

---

## 6. Core Product Principle

The user does not explore the interface.

The admin programs the interface.

The viewer watches a directed visual sequence.

This is not a consumer map, not a clickable app, and not an interactive dashboard.

It is a broadcast playout layer.

---

## 7. Core Abstraction

The central abstraction is:

```txt
Timeline → Scheduled Layers → Broadcast Renderer
```

Everything that appears on air should be represented as either:

- a base layer,
- an overlay layer,
- or a scheduled scene.

Example:

```txt
00:00:00 — Start 2-hour video as base layer
00:02:00 — Show title slide
00:10:00 — Show BTC widget
00:15:00 — Play 60-second ad
00:16:00 — Return to program video
00:30:00 — Show calendar card
01:00:00 — Show weather/camera scene
01:45:00 — Show promo slide
02:00:00 — End timeline and go to fallback loop
```

---

## 8. Goals

### 8.1 Product Goals

- Allow a non-technical admin to program a broadcast timeline.
- Support continuous long-form video playback up to 2 hours.
- Support ads/promos of 5 minutes or less.
- Allow slides to be scheduled at exact timestamps.
- Allow widgets, cameras, maps, weather, and promos to be scheduled.
- Provide a fullscreen browser output compatible with vMix/OBS.
- Preserve existing `backgroundclima` value as a reusable weather/camera scene type.
- Avoid rebuilding the product around the old city-rotation architecture.

### 8.2 Editorial / Operational Goals

- Give the team a simple way to keep the screen alive and informed.
- Reduce manual operator burden.
- Enable structured continuity/filler programming.
- Allow ads and promos to be inserted predictably.
- Create a tool that can grow into a more complete visual rundown manager.

### 8.3 Technical Goals

- Build clean TypeScript models from the start.
- Separate CMS state from output rendering.
- Separate assets from timeline scheduling.
- Separate base media playback from overlays.
- Support fallback behavior.
- Make future Supabase persistence easy.
- Keep the MVP pragmatic.

---

## 9. Non-Goals for This Phase

Do not implement these in the MVP:

- Reuters integration,
- RTMP ingest,
- live ingest server,
- automatic transcoding,
- full ad server,
- user-facing interaction,
- public consumer app,
- full vMix automation,
- full permissions/roles system,
- AI-generated rundown automation,
- complex rights management,
- multi-channel master control.

All playable video in this phase should be browser-compatible:

- uploaded file URL,
- remote MP4,
- HLS if already available,
- YouTube embed if already supported and stable.

Do not assume browser playback of RTMP.

---

## 10. MVP Scope

The MVP should prove the core playout system, not the entire final CMS.

### MVP Must Have

1. Admin can create/manage media assets.
2. Admin can create/manage slide assets.
3. Admin can create a timeline.
4. Admin can add a long-form video as a base layer.
5. Admin can schedule slides at exact timestamps.
6. Admin can schedule short ads/promos.
7. Admin can schedule simple overlay layers.
8. Admin can preview a timeline.
9. Broadcast output can render the timeline automatically.
10. Broadcast output can play a long video continuously.
11. Broadcast output can play ads of 5 minutes or less.
12. Broadcast output can return to the main timeline after an ad.
13. Broadcast output has a fallback state if media fails.
14. Existing camera/weather functionality can be reused as a scene type.

### MVP Should Have

1. Basic drag-and-drop or reorder timeline items.
2. Ability to enable/disable individual scheduled layers.
3. Ability to duplicate a timeline.
4. Ability to save a timeline as draft/ready/active.
5. Basic transition types: cut, fade, none.
6. Basic output status: playing, paused, failed, ended.
7. Local JSON or Supabase-backed persistence depending on implementation speed.

### MVP Could Have

1. Calendar cards.
2. Topic cards.
3. Widget scheduling.
4. Weather/camera scheduling.
5. Map scenes.
6. Admin dashboard showing “now on air” and “up next”.

---

## 11. User Roles

### 11.1 Content Administrator

Primary user of the system.

Can:

- create media assets,
- upload or reference videos,
- create slides,
- create timelines,
- place assets on a timeline,
- schedule exact timestamps,
- set duration,
- set priority,
- set fallback,
- preview the output,
- publish a timeline.

### 11.2 Technical Operator

May use the system during live/broadcast operations.

Can:

- open output route in vMix/OBS,
- verify playback,
- force fallback,
- force next item,
- disable a broken item,
- monitor current output.

### 11.3 Viewer

Passive TV viewer.

Cannot interact.

Does not click, tap, navigate, or control anything.

---

## 12. Main Surfaces

## 12.1 Admin Surface

Suggested routes:

```txt
/admin
/admin/assets
/admin/slides
/admin/scenes
/admin/timelines
/admin/timelines/[id]
/admin/locations
/admin/widgets
/admin/settings
```

### Admin Dashboard

Should show:

- active timeline,
- currently playing item,
- next scheduled item,
- output health,
- failed assets,
- draft timelines,
- quick links to assets and timelines.

### Assets Admin

Should allow management of:

- long-form videos,
- short clips,
- ads,
- promos,
- bumpers,
- loops,
- camera references,
- graphics.

### Timeline Admin

The most important admin surface.

Should allow the admin to:

- create timeline,
- add base video,
- add scheduled layers,
- set start time in seconds or timecode,
- set duration,
- set z-index/layer position,
- preview,
- enable/disable item,
- publish.

### Scene Admin

Should eventually manage reusable scene templates:

- weather/camera scene,
- map scene,
- title card,
- lower-third,
- widget scene,
- promo scene,
- fallback scene.

---

## 12.2 Broadcast Output Surface

Suggested routes:

```txt
/output/[timelineId]
/output/live
/output/preview/[timelineId]
```

Optional query params:

```txt
/output/[timelineId]?safe=true
/output/[timelineId]?transparent=false
/output/[timelineId]?resolution=1080
/output/[timelineId]?debug=true
```

Output requirements:

- fullscreen browser safe,
- no admin controls visible unless debug mode is active,
- no cursor dependence,
- no interaction required,
- no accidental scrollbars,
- no layout jumps,
- stable playback,
- readable overlays,
- fallback state.

---

## 13. Data Models

These are suggested TypeScript models. They can be adapted during implementation, but the conceptual separation should remain.

---

## 13.1 MediaAsset

```ts
type MediaAsset = {
  id: string
  title: string
  description?: string

  assetType:
    | "long_form_video"
    | "short_clip"
    | "ad"
    | "promo"
    | "bumper"
    | "loop"
    | "camera"
    | "graphic"

  sourceType: "uploaded_file" | "remote_url" | "youtube_embed" | "hls" | "internal_storage"

  url: string
  thumbnailUrl?: string

  durationSeconds?: number

  status:
    | "draft"
    | "processing"
    | "ready"
    | "scheduled"
    | "playing"
    | "played"
    | "expired"
    | "failed"

  enabled: boolean
  priority: number

  startsAt?: string
  endsAt?: string
  expiresAt?: string

  tags: string[]
  relatedLocationIds?: string[]
  relatedTopicIds?: string[]

  createdAt: string
  updatedAt: string
}
```

---

## 13.2 SlideAsset

```ts
type SlideAsset = {
  id: string
  title: string

  slideType: "image" | "html" | "template" | "markdown" | "custom_graphic"

  content?: string
  imageUrl?: string
  htmlContent?: string
  templateId?: string

  defaultDurationSeconds?: number

  status: "draft" | "ready" | "archived"

  createdAt: string
  updatedAt: string
}
```

A slide is not necessarily a PowerPoint slide. It can be:

- an uploaded image,
- an HTML card,
- a CMS-generated graphic,
- a promo card,
- a title card,
- a widget card,
- a full-screen visual.

---

## 13.3 BroadcastTimeline

```ts
type BroadcastTimeline = {
  id: string
  title: string
  description?: string

  status: "draft" | "ready" | "active" | "archived"

  totalDurationSeconds?: number

  startsAt?: string
  endsAt?: string

  outputMode: "manual" | "scheduled" | "loop"

  fallbackSceneId?: string

  layers: ScheduledLayer[]

  createdAt: string
  updatedAt: string
}
```

---

## 13.4 ScheduledLayer

```ts
type ScheduledLayer = {
  id: string

  timelineId: string

  layerType:
    | "video"
    | "ad"
    | "promo"
    | "slide"
    | "image"
    | "camera"
    | "map"
    | "weather"
    | "widget"
    | "calendar"
    | "topic"
    | "lower_third"
    | "logo_bug"
    | "ticker"
    | "audio"

  title: string

  assetId?: string
  slideId?: string
  sceneId?: string
  widgetId?: string

  startTimeSeconds: number
  durationSeconds: number

  zIndex: number

  position?: "fullscreen" | "lower_third" | "sidebar" | "top_right" | "bottom_bar" | "custom"

  transitionIn?: "cut" | "fade" | "slide" | "none"
  transitionOut?: "cut" | "fade" | "slide" | "none"

  enabled: boolean
  locked: boolean

  createdAt: string
  updatedAt: string
}
```

---

## 13.5 BroadcastScene

```ts
type BroadcastScene = {
  id: string
  name: string

  baseLayer:
    | { type: "media_asset"; mediaAssetId: string }
    | { type: "camera"; cameraId: string }
    | { type: "map"; locationId?: string }
    | { type: "graphic"; graphicId: string }
    | { type: "empty" }

  overlays: BroadcastOverlay[]

  durationSeconds?: number

  transitionIn?: "cut" | "fade" | "slide" | "none"
  transitionOut?: "cut" | "fade" | "slide" | "none"

  status: "draft" | "ready" | "active" | "expired"
}
```

---

## 13.6 BroadcastOverlay

```ts
type BroadcastOverlay = {
  id: string
  type:
    | "slide"
    | "widget"
    | "lower_third"
    | "logo_bug"
    | "ticker"
    | "weather"
    | "topic"
    | "calendar"
    | "promo"

  assetId?: string
  slideId?: string
  widgetId?: string

  position: "fullscreen" | "lower_third" | "sidebar" | "top_right" | "bottom_bar" | "custom"

  zIndex: number
  durationSeconds?: number
  enabled: boolean
}
```

---

## 13.7 Location / Camera Scene

The old `backgroundclima` functionality should become a scene type.

```ts
type Location = {
  id: string
  name: string
  country: string
  region: string
  latitude?: number
  longitude?: number
  timezone: string
  weatherQuery: string
  enabled: boolean
  priority: number
  tags: string[]
}
```

```ts
type CameraFeed = {
  id: string
  locationId: string
  title: string
  provider: "youtube" | "remote_url" | "custom"
  url: string
  embedUrl?: string
  status: "active" | "inactive" | "broken" | "testing"
  priority: number
  notes?: string
  lastCheckedAt?: string
}
```

---

## 13.8 DataWidget

```ts
type DataWidget = {
  id: string
  name: string
  type: "market" | "debt" | "commodity" | "bitcoin" | "treasury" | "macro" | "custom"

  enabled: boolean
  priority: number
  maxDisplaySeconds: number
  source: string
  refreshIntervalSeconds: number
  staleAfterSeconds: number
  displayMode: "compact" | "standard" | "full"
}
```

---

## 14. Timeline Behavior

The renderer should evaluate the active timeline based on elapsed time.

### Example Timeline

```txt
00:00:00 - 02:00:00  Base video: Market Recap Special
00:00:10 - 00:00:25  Overlay: Roxom logo bug
00:02:00 - 00:02:20  Slide: Program title
00:10:00 - 00:10:30  Widget: BTC price
00:15:00 - 00:16:00  Ad: Sponsor ad
00:30:00 - 00:31:00  Slide: Key market events
01:00:00 - 01:02:00  Weather/camera scene
01:45:00 - 01:45:30  Promo: Coming up next
02:00:00              Fallback loop
```

### Timeline Rules

- A timeline can have one primary base layer.
- A timeline can have multiple overlay layers.
- Overlay layers can overlap if z-index is clear.
- Disabled layers should not render.
- Locked layers should not be accidentally moved in the admin UI.
- If a base video fails, go to fallback.
- If an overlay fails, skip it and continue.
- If the timeline ends, follow fallback policy.

---

## 15. Playback Requirements

### Long-form Video

The system must support playing one continuous video up to 2 hours.

Requirements:

- Browser-compatible source.
- Stable playback.
- No interaction required.
- Can be used as base layer.
- Can optionally allow overlays.
- Can fallback if it fails.
- Can go to fallback or next item when it ends.

### Ads

Ads are media assets with type `ad`.

Requirements:

- 5 minutes or less.
- Can be scheduled at exact timestamps.
- Can play fullscreen.
- Can optionally hide other overlays.
- Can return to previous or next scheduled state.
- Can have active window and expiration.

### Slides

Slides are scheduled visual assets.

Requirements:

- Can be fullscreen or overlay.
- Can have exact start time and duration.
- Can be image, HTML, template, markdown, or graphic.
- Can appear over a base video or as a full scene.

### Weather / Camera Scenes

The existing background/weather/camera logic should be preserved as a reusable scene.

Requirements:

- Can be scheduled on timeline.
- Can be fullscreen.
- Can include weather overlay.
- Can be used as fallback loop.
- Can be used as filler between media assets.

---

## 16. Fallback Behavior

Every timeline should define fallback behavior.

Possible fallback modes:

```ts
type FallbackMode = "black" | "slate" | "default_loop" | "weather_camera" | "next_item"
```

Recommended MVP fallback:

- If a video fails: show fallback slate or default weather/camera loop.
- If a slide fails: skip it.
- If an ad fails: skip it and continue timeline.
- If timeline ends: go to default loop.

---

## 17. Technical Architecture

Suggested architecture for new app:

```txt
/app
  /admin
    /page.tsx
    /assets
    /slides
    /scenes
    /timelines
      /[id]
    /locations
    /widgets
    /settings

  /output
    /live
    /[timelineId]
    /preview
      /[timelineId]

/components
  /admin
    AssetForm.tsx
    TimelineEditor.tsx
    ScheduledLayerEditor.tsx
    SlideEditor.tsx

  /renderer
    BroadcastRenderer.tsx
    TimelineRenderer.tsx
    LayerRenderer.tsx
    OverlayRenderer.tsx

  /player
    VideoPlayer.tsx
    YouTubePlayer.tsx
    HlsPlayer.tsx

  /scenes
    WeatherCameraScene.tsx
    MapScene.tsx
    SlideScene.tsx
    WidgetScene.tsx
    FallbackScene.tsx

  /timeline
    TimelineTrack.tsx
    TimelineItem.tsx
    TimecodeInput.tsx

/lib
  /playout
    timeline.ts
    scheduler.ts
    fallback.ts
    timecode.ts

  /assets
    validation.ts
    media.ts

  /weather
    weather.ts

  /storage
    supabase.ts

/types
  assets.ts
  timeline.ts
  scenes.ts
  widgets.ts
  locations.ts
```

---

## 18. Implementation Order

The implementation should prioritize the playout engine before the complete admin CMS.

### Phase 1 — Core Types and Renderer

1. Create TypeScript types:
   - MediaAsset
   - SlideAsset
   - BroadcastTimeline
   - ScheduledLayer
   - BroadcastScene
2. Create sample/mock data.
3. Build `/output/[timelineId]` route.
4. Build `TimelineRenderer`.
5. Build `LayerRenderer`.
6. Support base video playback.
7. Support slide overlay playback by timestamp.

Success condition:

A mock 2-hour timeline can render a video and scheduled slides in the browser.

---

### Phase 2 — Admin MVP

1. Build `/admin/timelines`.
2. Build simple timeline list.
3. Build timeline detail page.
4. Allow adding/editing scheduled layers.
5. Allow setting start time and duration.
6. Allow enabling/disabling layers.
7. Allow previewing timeline.

Success condition:

A non-technical admin can create a basic timeline and preview it.

---

### Phase 3 — Media Assets and Ads

1. Build `/admin/assets`.
2. Add asset type field.
3. Support long-form video assets.
4. Support ad assets.
5. Add validation for ad duration <= 5 minutes.
6. Schedule ad on timeline.
7. Return to base playback/fallback after ad.

Success condition:

Admin can schedule a video and a short ad in the same timeline.

---

### Phase 4 — Weather/Camera Scene Migration

1. Extract useful logic from `backgroundclima`.
2. Create `WeatherCameraScene`.
3. Create location/camera config.
4. Allow weather/camera scene as a scheduled layer.
5. Allow weather/camera scene as fallback.

Success condition:

Existing city/weather functionality works as one scene type inside the new timeline system.

---

### Phase 5 — Widgets and Promos

1. Create widget scene type.
2. Create promo scene type.
3. Allow scheduling widgets at timestamps.
4. Allow scheduling promo cards.

Success condition:

Admin can schedule a widget or promo as an overlay or fullscreen card.

---

## 19. Acceptance Criteria

The MVP is successful when:

- The app is not architected around city rotation.
- The core abstraction is timeline/scheduled layers/renderer.
- A 2-hour browser-compatible video can play continuously.
- A slide can be scheduled to appear at a specific timestamp.
- Multiple slides can appear at different timestamps.
- An ad of 5 minutes or less can be scheduled.
- The output can be opened fullscreen in a browser.
- The output is suitable for vMix/OBS browser input.
- The system has fallback behavior.
- Existing weather/camera functionality is available as a scene type.
- The admin can create or edit at least a basic timeline.
- The codebase is clean enough to expand into a larger CMS.

---

## 20. Design / UX Notes

This is a broadcast tool, not a consumer app.

Admin UX should be functional first:

- clear timeline,
- precise timecode input,
- preview button,
- status indicators,
- simple forms,
- no unnecessary animation.

Broadcast output should be:

- clean,
- stable,
- high contrast,
- TV-safe,
- readable,
- non-interactive,
- no visible controls,
- no cursor dependence.

---

## 21. Important Product Rule

Do not build a clickable map.

The map, if added, is a programmed scene.

The admin decides when the map appears, what location it shows, and how long it stays on screen.

The viewer does not interact with it.

---

## 22. Migration from `backgroundclima`

Do not rewrite `backgroundclima` blindly.

Use it as reference for:

- weather API logic,
- city/camera display,
- camera embed handling,
- fullscreen styling,
- broadcast-friendly visual behavior,
- autoplay lessons,
- fallback ideas.

Migrate useful parts into:

```txt
WeatherCameraScene
```

Do not make city rotation the main architecture of the new product.

---

## 23. Suggested Tech Stack

Recommended:

- Next.js App Router
- TypeScript
- Tailwind
- React
- Supabase eventually for persistence/storage
- Zod for validation
- Framer Motion only where useful for broadcast-safe transitions

Avoid unnecessary complexity in MVP.

Persistence can start with local JSON/mock data if needed, but the architecture should make Supabase migration straightforward.

---

## 24. Risks

### Risk 1 — Overbuilding CMS before playout works

Mitigation:

Build renderer first. Then admin.

### Risk 2 — Turning app into a full broadcast automation system too early

Mitigation:

MVP only controls web output. Do not automate vMix yet.

### Risk 3 — Browser playback instability

Mitigation:

Use browser-compatible media, preload where possible, and implement fallback.

### Risk 4 — Confusing playlist with timeline

Mitigation:

A playlist is sequential. A timeline is scheduled and layered. This product needs timeline logic.

### Risk 5 — Reusing too much old code

Mitigation:

Reuse logic selectively. Keep new architecture clean.

---

## 25. Development Prompt for AI Agent

Use this prompt to guide implementation:

```md
You are working on a new product architecture based on lessons from the `backgroundclima` repo.

The new product is called Roxom Playout Manager.

Do not simply extend the old city-rotation logic. The old project should be used as reference, especially for weather/camera scenes, but the new architecture must be built around:

Timeline → Scheduled Layers → Broadcast Renderer

This is a CMS-controlled broadcast playout manager for Roxom TV.

The viewer does not interact with the UI. This is for television. The admin controls what appears on air.

The product must support:

- long-form video playback up to 2 hours,
- ads/promos of 5 minutes or less,
- slides scheduled at exact timestamps,
- overlays scheduled at exact timestamps,
- weather/camera scenes as reusable scene types,
- fullscreen browser output compatible with vMix/OBS,
- fallback behavior if media fails.

Do not implement Reuters.
Do not implement RTMP.
Do not implement live ingest.
Do not build a clickable consumer map.

Use browser-compatible media only:

- uploaded file URL,
- remote MP4,
- HLS if already available,
- YouTube embed if stable.

Implementation order:

1. Create clean TypeScript models for MediaAsset, SlideAsset, BroadcastTimeline, ScheduledLayer, BroadcastScene.
2. Create mock data for a sample 2-hour timeline.
3. Build a fullscreen `/output/[timelineId]` route.
4. Build TimelineRenderer and LayerRenderer.
5. Support base video playback.
6. Support scheduled slide overlays.
7. Add fallback behavior.
8. Build a minimal admin timeline editor.
9. Add ad asset support.
10. Migrate weather/camera functionality from backgroundclima as a scene type.

The first success milestone is:
A browser output route can play a long-form video and show scheduled slides/overlays at exact timestamps.

Keep the code modular and avoid overbuilding.
```

---

## 26. Final Definition

Roxom Playout Manager is a CMS-controlled visual rundown manager.

It lets an admin program what appears on air and when.

It can play videos, ads, slides, maps, cameras, weather scenes, widgets, and promos through a fullscreen browser output.

It is not an interactive consumer product.

It is not an RTMP ingest server.

It is not a complete vMix replacement.

It is the first step toward a structured internal broadcast playout layer for Roxom TV.
