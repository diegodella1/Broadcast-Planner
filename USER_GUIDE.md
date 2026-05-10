# RTV-TL-MANAGER — Operator User Guide

Internal playout / lineup manager for Roxom TV. Programs the on-air day, manages assets, drives the broadcast composition surface for vMix/OBS capture.

> **Audience**: Roxom TV operators (producer, director, on-air ops). Read-only roles can browse but not mutate. Bootstrap auth = single token until multi-operator lands.

---

## 1. Getting started

**URL**: `https://<your-domain>/admin/calendar` (production) or `http://localhost:3000/admin/calendar` (local dev).

The app is served from the domain root. Old `/rtvtime/...` links redirect to root paths.

**Login** (`/admin/login`):

1. Page accepts a single password — the `ADMIN_BOOTSTRAP_TOKEN` configured by ops.
2. Submit → cookie `rpm_admin_token` is set → middleware grants access to `/admin/*` for the session.

**Locale**: top-bar toggle EN / ES. Selection stored in `NEXT_LOCALE` cookie. Brand names ("Roxom TV", "Vimeo", "Reuters") never translate.

---

## 2. The chrome

| Element                 | What                                                                                                                                                      |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **56px sidebar** (left) | Icon-only nav: Calendar / Schedule / Assets / Slides / Settings / Output. Hover any icon → tooltip shows label. Active route is green.                    |
| **48px topbar** (top)   | Page title (left) · ON AIR pill / Locale switcher / Health / Output / page-action button (right).                                                         |
| **ON AIR pill**         | Red + pulsing when day status is `active` AND a block is currently airing. Dim when off.                                                                  |
| **Outage banner**       | Red strip above topbar if Supabase calls fail. Means: data shown may be stale or fixture-only. Operator should NOT trust the rundown until banner clears. |

---

## 3. Calendar (`/admin/calendar`)

Lists every `ProgramDay`. Each card shows the air date + status (`draft` / `ready` / `active` / `archived`) + block count.

**Common actions**:

- **Create day** → button at top. Pick date + timezone. New day starts in `draft`.
- **Open** a day → click a card → goes to `/admin/schedule/<date>`.
- **Schedule today** quick-link in the header → jumps to today's schedule (creates the day if missing).

---

## 4. Schedule (`/admin/schedule/<YYYY-MM-DD>`)

The biggest screen. Two columns:

- **Main rundown** (left, flex-1)
- **Operations panel** (right, fixed 240px) — your live cockpit

### Rundown rows

Each row = one `ProgramBlock`:

```
[ HH:MM ][ ● ][  [BADGE]  Block title             [duration / Live] ]
```

- **Time label** — block start in HH:MM (day's tz).
- **Axis dot** — vertical 1px line connects all rows; dot marks each block's anchor.
- **Block card** — category badge + title + duration display.
- **Now-line** — red horizontal line + "AHORA" / "NOW" label inserted between rows where the current second falls. Visible only on today's date.

### Block states

| State         | Visual                              | When                                   |
| ------------- | ----------------------------------- | -------------------------------------- |
| Default       | dark card, faint border             | not active                             |
| **Current**   | green-glow ring + green selected bg | block matches current second           |
| **Next**      | dim opacity                         | block whose start ≥ now and is closest |
| **Broadcast** | red border (accent-live)            | category = `broadcast`                 |

### Block categories (8)

`mercados` · `earthcam` · `clima` · `calendario` · `trending` · `deuda` · `reuters` · `broadcast`. Each renders its own colored pill on the card. DB enum values stay Spanish; UI labels translate via locale.

### Block actions

- **Click a row** → opens `/admin/schedule/<date>/blocks/<id>` (block detail editor: title, start, duration, category, asset, scheduled layers, lower-third overrides).
- **Add block** form below the rundown — manual creation.
- **Generate 12 hr grid** button — bulk create test blocks for a window.

### Operations panel sections (right rail, in order)

#### 4.1 On air now

Shows the active block's badge + title + progress bar (filled by `elapsedInBlock / durationSeconds`). Empty placeholder when nothing is airing. Polls every 5 s via `useActiveBlock`.

#### 4.2 Manual broadcast (the Vimeo / Reuters cockpit)

The fastest way to override the day's grid with something live.

**Source toggle**: Vimeo · Reuters

**Vimeo flow**:

1. Type a query into search box (debounced 300 ms).
2. `GET /api/vimeo/search?q=...` server-side calls Vimeo API with the stored `VIMEO_ACCESS_TOKEN` (from env or encrypted in DB — never typed in this UI).
3. Pick a result.
4. Choose mode:
   - **Now** — go to air immediately. Inserts a `ProgramBlock` at the current second with `category=broadcast`.
   - **Schedule at HH:MM** — pick a time, server inserts the block at that start.
5. Click the action button. Inline error shows if validation fails or there's a conflict with an existing block.

**Reuters flow** (currently fixtures-only — see §11.2):

1. Toggle source to Reuters.
2. List shows the synced channels (Top News HD, World News HD, Markets HD, Sports HD, Weather HD).
3. "Refresh channels" button → `POST /api/reuters/sync` to re-pull the catalog.
4. Pick a channel + Now / Schedule, same as Vimeo.

#### 4.3 Lower third

Two text inputs (title + subtitle) + visibility toggle. Live preview renders in the same style as the on-air output (`output-renderer.tsx`). Currently **local state only** — does not persist to a `ScheduledLayer` yet (see §11.3 follow-up).

#### 4.4 Schedule health

Compact icon+text rows for every detected issue:

- 🔴 Critical (overlaps, missing assets, ad too long)
- 🟡 Warning (gaps, hidden layers, slide not ready)
- 🟢 OK (no issues)

Each row reads from `lib/schedule-health.ts:analyzeSchedule()`. Refreshes when the page revalidates.

#### 4.5 Background music

Toggle + volume slider. **Local state only** — does not persist (see §11.4 follow-up).

---

## 5. Block detail editor (`/admin/schedule/<date>/blocks/<id>`)

For deep edits.

| Section          | What                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form             | title · start time · duration · type (video/image/slide/ad/promo/fallback) · category · status · notes · `hide_overlays` toggle · fallback asset override |
| Asset assignment | dropdown of compatible `media_assets`. Live chip shows `Live` for null-duration Reuters streams.                                                          |
| Slide assignment | dropdown of `slide_assets`.                                                                                                                               |
| Scheduled layers | list of overlays attached to this block: lower-thirds, custom layers (logo bug, sidebar widgets, fullscreen takeovers). Add/remove inline.                |
| Readiness        | rolled-up signal: green if asset+slide+layers all ready; red/amber otherwise with reason list.                                                            |

All copy translated. Token-safe palette (no raw `bg-red-50` etc.).

---

## 6. Assets (`/admin/assets`)

Catalog of media that blocks can reference.

### View modes

URL params: `?view=list|tiles&source=all|vimeo|reuters|uploads`

**Tile grid** (`?view=tiles`): 16:9 thumbnails in `auto-fill minmax(150px, 1fr)`. Each tile = thumbnail + duration badge (or `Live` chip) + name + source pill.

**List** (default): rich table with every column for editing.

### Source pills (in tiles)

| Source                                                   | Pill         |
| -------------------------------------------------------- | ------------ |
| `vimeo`                                                  | blue         |
| `reuters`                                                | red (live)   |
| `supabase_image` / `remote_image` / `remote_mp4` / `hls` | white-tinted |

### Filter tabs

`Todos / Vimeo / Reuters / Uploads` — combine with status filters AND-style.

### Common actions

- **Upload** — drag MP4/PNG into upload form → posts to `/api/assets/upload`, file goes to Supabase storage, row created in `media_assets`.
- **Import from Vimeo** — paste a Vimeo video URI → `/api/vimeo/import` calls Vimeo API + upserts. (See also Settings §10.1 episode picker for bulk import.)
- **Edit** an existing row → opens inline form: title · duration override · status · fallback flag · orientation.

### Live chip rule

Assets with `durationSeconds === null && sourceType === "reuters"` render the `Live` pill (green, accent-positive). Any other null-duration asset renders a placeholder time.

---

## 7. Slides (`/admin/slides`)

Operator-facing slide library. URL: `?slide=<id>` selects one.

**Layout**: 260px slide list (left) · 16:9 preview pane (right).

### Preview pane

Auto-detects slide type via `slideType` enum or title heuristic:

- `earthcam` — animated globe with concentric `pd`-keyframe dots
- `market` — animated chart bars (`bar-grow`)
- `weather` — 3 city cards (Sun / Cloud / CloudRain icons)
- `generic` — centered title + subtitle

All animations gated by `prefers-reduced-motion: reduce` — operators with reduced-motion settings see static states.

### Actions

`New slide` (inline form) · `Edit` (per-row).

---

## 8. Output panel (`/admin/output`)

The operator's broadcast cockpit. **NOT** the same as `/output/live` — that's the vMix capture surface.

| Section               | What                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Preview pane (16:9)   | Renders the currently active block via `findActiveSchedule`. Shows fallback "No active broadcast" when idle.                                                                 |
| ON AIR / OFF AIR pill | Red pulsing when broadcasting, dim when not.                                                                                                                                 |
| Broadcast status      | Live / Paused / Idle text.                                                                                                                                                   |
| Source switcher       | Currently a stubbed select (Vimeo / Reuters / Slide / HLS / Remote image) — wire to real mutation in §11.5.                                                                  |
| Lower-third editor    | Reuses `OperationsPanelLowerThird` from §4.3.                                                                                                                                |
| **Stop broadcast**    | Big red button. Click → `confirm()` modal → server action flips `ProgramDay.status` to `"ready"` and clears any manual override block. Disabled when no broadcast is active. |

---

## 9. The on-air composition surface (`/output/live`)

**This is the URL vMix or OBS captures.** NOT for operators to interact with — open it in a browser source at the broadcast PC.

Renders whatever block is active right now via `findActiveSchedule` + `output-renderer.tsx`. Polls every second internally. Source-type-aware:

- `vimeo` → iframe embed
- `remote_mp4` → HTML5 `<video>`
- `hls` / `reuters` → HLS player (`hls.js` lazy-loaded; Safari uses native)
- `supabase_image` / `remote_image` → `<Image>`

Append `?debug=true` to see overlays of clock, day, block id, elapsed seconds, asset, layer count. Useful for staging.

Layers (lower-thirds, sidebar widgets, fullscreen takeovers) render as absolutely positioned overlays on top of the base content.

---

## 10. Settings (`/admin/settings`)

### 10.1 Vimeo

Form fields: token · folder URI · timezone.

- Token saved encrypted via `APP_ENCRYPTION_KEY`.
- After save, the **Episode picker** appears: lists shows from the configured folder, drill into episodes, bulk-import to `media_assets`.
- Status pill shows last connection state (`connected` / `invalid` / `failed` / `unknown`).

Token can also be set via `VIMEO_ACCESS_TOKEN` env var; env wins over DB.

### 10.2 Reuters

Form fields: client ID · client secret · refresh token (all encrypted).

- "Running on fixtures" notice when `REUTERS_PROVIDER` ≠ `"real"`.
- "Refresh channels" button — POSTs `/api/reuters/sync` to upsert channels into `media_assets`.
- Real OAuth2 flow not implemented yet (`lib/reuters-real.ts` is a placeholder — see §11.2).

---

## 11. What's left to build (functionality)

### Active surfaces / known gaps

#### 11.1 Vimeo manual broadcast

- ✅ Search + go-live + schedule shipped.
- ⚠️ **Pre-existing bug**: `app/api/vimeo/search/route.ts` returns `{results: [...]}` but client parses body as `VimeoVideo[]`. Currently returns 0 results until fixed. One-line fix.
- 🔧 **Conflict resolution**: when scheduled time overlaps an existing block, action throws via `hasBaseBlockConflict`. UI shows error string but no "preempt and replace" option.
- 🔧 No "cancel pending broadcast" (must navigate to block detail and delete).
- 🔧 No multi-asset queue (e.g. schedule 3 sequential clips).

#### 11.2 Reuters playback

- ✅ Fixtures pipeline scaffolded (5 placeholder channels, channel sync, HLS player).
- ❌ **Real client not implemented** — `lib/reuters-real.ts` throws. Needs:
  - OAuth2 client_id + secret + refresh-token flow.
  - Reuters Connect API search + signed-stream-URL endpoint.
  - Token refresh during long broadcasts (Reuters URLs expire 1-24 h).
  - Background channel sync (currently button-triggered only).
- 🔧 No per-channel preview before going live.

#### 11.3 Lower-third editor

- ✅ UI + live preview shipped.
- ❌ Persist to `ScheduledLayer` — currently local state only.
- ❌ Apply to currently airing block as live overlay.
- ❌ Schedule a lower-third for a future block.

#### 11.4 Background music

- ✅ UI shipped.
- ❌ Persistence to settings table.
- ❌ Real audio playback hooks (audio source URL, ducking on lower-third, fade-in/out).

#### 11.5 Operator panel `/admin/output`

- ✅ Stop broadcast w/ confirm.
- ❌ Source switcher is a stub — needs to call real mutation.
- 🔧 Audit log for Stop broadcast is `console.log` only — should write to `audit_log` table.
- 🔧 No manual-override-block clearing logic on Stop.

#### 11.6 Schedule rundown

- ✅ Vertical rows + now-line + right rail.
- ❌ Drag-and-drop reorder (deferred — needs `@dnd-kit/core`).
- ❌ Inline edit from rundown row (must open block detail page).
- ❌ Bulk operations (multi-select, change category, delete N).
- ❌ Block templates / recurring blocks (e.g. "every weekday 09:00").

#### 11.7 Health widget

- ✅ Compact rows + tone tokens.
- 🔧 Click an issue row → deep-link to the offending block (currently no link).
- 🔧 Auto-refresh via polling (currently server-rendered once per page load).
- ❌ One-click suggested fixes (e.g. "Generate fallback overlay").

#### 11.8 Assets

- ✅ Tile grid + source filter + Live chip.
- 🔧 No asset preview modal (click a tile → popup).
- ❌ Tag system / categories (currently just status + source).
- ❌ Search box (only filter chips).
- ❌ Bulk import from Vimeo folder (only Settings episode picker).

#### 11.9 Slides

- 🔧 No WYSIWYG HTML editor (raw HTML textarea only).
- 🔧 No live Markdown preview while typing.
- ❌ Template gallery.
- ❌ Image upload directly into image-type slides.
- ❌ Slide animations preview swap (currently static type-based).

#### 11.10 Calendar

- ❌ Recurring schedule (e.g. weekday-only patterns).
- ❌ Copy day to another date.
- ❌ Holiday / blackout markers.
- ❌ Multi-day grid view (currently one-day-at-a-time).
- ❌ iCal export.

#### 11.11 Settings

- 🔧 No Vimeo connection-test button (need to save then refresh page).
- 🔧 Audit log viewer (data exists in `audit_log` table; no UI).
- ❌ Multi-operator support — currently single bootstrap token.
- ❌ Roles (producer / director / admin).

#### 11.12 Output (broadcast composition)

- ✅ Source-type-aware rendering (vimeo iframe, mp4 video, HLS player, image).
- ❌ vMix integration via NDI / RTSP (currently relies on browser-source capture).
- ❌ Output recording (local DVR).
- ❌ Multiple bitrate streams (low-bandwidth + HD).
- ❌ Backup output failover.
- ❌ Captions / subtitles overlay.
- ❌ SCTE-35 ad markers.

#### 11.13 Infrastructure

- 🔧 `/admin/health` route doesn't exist — Health button currently temp-points at `/output/live`.
- 🔧 `@keyframes blink` / `pd` / `bar-grow` definitions missing — `.anim-*` classes reference non-existent keyframes (silent fail; reduced-motion guard works).
- 🔧 Repo-wide Prettier sweep needed — ~48 files unformatted; CI `format:check` is currently `continue-on-error`.
- ❌ Background job queue (channel sync, asset re-cache currently manual).
- ❌ Realtime Supabase channels for live operator updates (currently 5 s polling).

#### 11.14 i18n

- 🔧 Some literals still hardcoded in UI (audit pending).
- ❌ Validation error messages (Zod `safeParse` errors are static English).
- ❌ Currency / number locale formatting beyond date.

#### 11.15 Tests

- ✅ 161 tests, mutations 99 % covered.
- ❌ End-to-end Playwright tests.
- ❌ Visual regression screenshots.
- ❌ Performance benchmarks for `findActiveSchedule` over large schedules.

#### 11.16 Security

- 🔧 No rate limiting on `/api/*` endpoints.
- 🔧 No CSRF protection on server actions.
- ❌ Multi-operator auth.
- ❌ Audit log immutability (currently regular table).

#### 11.17 Monitoring

- ❌ Sentry / error tracking.
- ❌ Performance monitoring (Cloudflare Web Analytics or similar).
- ❌ Custom broadcast-health dashboards.
- ❌ Pager / alerting on outage banner trigger.

---

## 12. Common workflows

### 12.1 Program a day from scratch

1. `/admin/calendar` → Create day for the date, pick tz, status `draft`.
2. Open the day → `/admin/schedule/<date>`.
3. Add blocks one at a time via the inline form, OR use **Generate 12 hr grid** for a fast scaffold.
4. Click any block → assign asset / slide / layers in the detail editor.
5. Watch the **Health** panel — resolve any critical issues before publishing.
6. Topbar action → set status to `ready`.
7. When the day is supposed to start, set status to `active`. ON AIR pill turns red.

### 12.2 Replace what's airing right now (manual broadcast)

1. Right rail → **Manual broadcast**.
2. Source: Vimeo (or Reuters once live).
3. Search → pick clip → mode = Now → "Ir al aire ahora".
4. Output renderer flips next tick.
5. To return to grid: stop the manual broadcast via `/admin/output` → Stop broadcast.

### 12.3 Schedule a Reuters segment for tonight

_(when Reuters is wired)_

1. Right rail → **Manual broadcast** → Reuters mode.
2. "Refresh channels" if catalog is stale.
3. Pick channel → mode = Schedule → time = `21:00` → confirm.
4. New `ProgramBlock` at 21:00, category=reuters, durationSeconds=1800 default. Adjust duration in block detail editor if needed.

### 12.4 React to an outage banner

The red strip means Supabase calls failed. **Do not trust the rundown** until it clears.

1. Check Supabase dashboard: project up?
2. Verify env vars: `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY` / `APP_ENCRYPTION_KEY` present.
3. Refresh the page. Banner should clear.
4. If it persists, fall back to the published static image / Vimeo "fallback" asset for output until ops rotates the keys / restores Supabase.

### 12.5 Switch operator language

Topbar → locale toggle → click EN or ES. Page refreshes; cookie `NEXT_LOCALE` persists across sessions. Domain enum values (`mercados`, `clima`) keep their Spanish DB values; only the visible labels translate.

---

## 13. Glossary

- **Block / ProgramBlock**: a scheduled time slot on a `ProgramDay`. Owns one base asset (video / image / slide) + 0..N scheduled layers (overlays).
- **Layer / ScheduledLayer**: an overlay layered on top of a block during its airtime — lower-third, logo bug, sidebar widget, fullscreen takeover.
- **MediaAsset**: a piece of source content (video, image, graphic). Source types: `vimeo`, `reuters`, `supabase_image`, `remote_image`, `remote_mp4`, `hls`.
- **SlideAsset**: editorial slide content (template, image, html, markdown). Distinct from `MediaAsset`.
- **ProgramDay**: a date's worth of programming. Status: `draft` → `ready` → `active` → `archived`.
- **Output / vMix capture surface**: the `/output/live` URL meant to be opened in a browser-source capture tool. Renders the active broadcast composition.
- **Operations panel**: the right rail on the schedule page. Where operators control live state.
- **Manual broadcast**: an operator-initiated override that pre-empts the scheduled grid. Inserts a `ProgramBlock` with `category=broadcast` at the current second (or scheduled time).
- **Manual override block**: a block created via Manual broadcast. Cleared when Stop broadcast fires.
- **Live chip**: the green `Live` pill rendered when an asset has `durationSeconds: null && sourceType: "reuters"`.
- **Outage banner**: red strip above the topbar when Supabase calls fail. Fixture data is shown locally; real data is unavailable.

---

## 14. Quick reference — keyboard / URL shortcuts

| Where                        | Shortcut                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| Any locale-prefix path       | `?lang=en                                                                                          | es` won't work; toggle via topbar (cookie-based). |
| Schedule for today           | `/admin/schedule/<today's-iso-date-in-ARG-tz>` (Calendar's "Schedule today" button computes this). |
| Output debug overlay         | append `?debug=true` to `/output/live`.                                                            |
| Force Reuters provider       | env `REUTERS_PROVIDER=real                                                                         | fixtures`.                                        |
| Bypass admin gate (dev only) | unset `ADMIN_BOOTSTRAP_TOKEN` env var → middleware no-ops.                                         |

---

## 15. Where things live in the codebase

For operators who also ship code:

```
app/
├── admin/
│   ├── calendar/page.tsx              # day list
│   ├── schedule/[date]/page.tsx       # rundown + ops panel
│   ├── schedule/[date]/blocks/[id]/   # block detail editor
│   ├── assets/page.tsx                # asset catalog (list + tiles)
│   ├── slides/page.tsx                # slide list + preview
│   ├── output/page.tsx                # operator broadcast cockpit
│   ├── settings/page.tsx              # Vimeo + Reuters creds
│   └── login/page.tsx                 # bootstrap login
├── api/
│   ├── active-block/route.ts          # GET → current block snapshot
│   ├── assets/upload/route.ts         # POST media file
│   ├── vimeo/import/route.ts          # POST Vimeo URI → media_assets
│   ├── vimeo/search/route.ts          # GET ?q=... → VimeoVideo[]
│   ├── reuters/sync/route.ts          # POST sync, GET list channels
│   ├── settings/route.ts              # POST Vimeo settings (legacy)
│   └── health/route.ts                # GET liveness ping
├── hooks/
│   └── useActiveBlock.ts              # client polling 5 s
└── output/
    ├── live/page.tsx                  # vMix capture surface
    ├── [timelineId]/page.tsx          # alt timeline render
    └── preview/[blockId]/page.tsx     # single-block preview

components/
├── admin-shell.tsx                    # 56px sidebar + 48px topbar + outage banner
├── admin-nav.tsx                      # client subcomponent for usePathname()
├── locale-switcher.tsx                # EN / ES toggle
├── output-renderer.tsx                # broadcast composition (incl. ReutersPlayer)
├── operations-panel.tsx               # 240px right rail wrapper
├── operations-panel/
│   ├── on-air.tsx                     # progress bar + active block
│   ├── manual-broadcast.tsx           # Vimeo + Reuters search + go-live
│   ├── lower-third.tsx                # title/subtitle/visible + preview
│   ├── health.tsx                     # compact issue rows
│   └── music.tsx                      # toggle + slider
├── rundown-row.tsx
├── now-line.tsx
├── block-badge.tsx
├── status-pill.tsx
└── stop-broadcast-button.tsx

lib/
├── types.ts                           # ProgramDay, ProgramBlock, ScheduledLayer,
│                                      # MediaAsset, SlideAsset, BlockCategory,
│                                      # SourceType
├── data.ts                            # read-side queries + outage wrapper
├── mutations.ts                       # create/update/delete server-side
├── scheduler.ts                       # findActiveSchedule + overlap check
├── schedule-health.ts                 # analyzeSchedule + helpers
├── schedule-builder.ts                # 12 hr grid generator
├── duration-display.ts                # Live chip helper
├── time.ts                            # parseTimecode, formatTimecode, tz helpers
├── settings.ts                        # Vimeo creds storage
├── vimeo.ts                           # Vimeo API client
├── manual-broadcast.ts                # Vimeo + Reuters orchestrators
├── reuters.ts                         # ReutersClient interface + fixtures
├── reuters-real.ts                    # placeholder for OAuth2 client
├── reuters-credentials.ts             # encrypted-DB OAuth2 triple
├── auth.ts                            # bootstrap auth helpers
├── crypto.ts                          # encryptSecret/decryptSecret
└── schemas/                           # 8 Zod schema files (one per domain)

messages/
├── en.json                            # 393 leaf keys
└── es.json                            # 393 leaf keys (symmetric)
```

Adapter / deploy: `wrangler.jsonc` + `open-next.config.ts` + `npm run cf:*` scripts.

---

## 16. Where to ask for help

- Roxom internal slack: `#rtv-playout` (or whichever channel ops uses).
- Code questions: open a GitHub issue on `roxom-tv/RTV-TL-MANAGER`.
- Outages affecting on-air: ping the on-call producer immediately AND open an incident in the dashboard. Don't wait for the banner to disappear on its own.

---

## 17. Slide templates (operator catalog)

Single-source list of all 14 templates available when creating a `template`-kind slide in `/admin/slides`. The canonical registry is `lib/slides/registry.ts` (`SLIDE_TEMPLATES`). The values below are mirrored from there — if the table and the registry ever disagree, the registry wins and this section is the bug.

| Template ID    | Label         | Description                                                 | Data source                    |
| -------------- | ------------- | ----------------------------------------------------------- | ------------------------------ |
| `calendar`     | Calendar      | Upcoming events list from the events table                  | `GET /api/slide-data/calendar` |
| `debt`         | US Debt       | Live US national debt clock in BTC terms                    | `GET /api/slide-data/debt`     |
| `event`        | Event         | Featured event card(s) with image, date and timezone times  | `GET /api/slide-data/calendar` |
| `event-modern` | Event Modern  | Retro-bordered event grid with month/year header            | `GET /api/slide-data/calendar` |
| `fx`           | FX / Currency | Satoshis-per-unit for EUR, JPY, GBP and USD                 | `GET /api/slide-data/markets`  |
| `gold`         | Gold          | XAU price in sats and USD with 24 h change                  | `GET /api/slide-data/metals`   |
| `metals`       | Metals        | Gold, silver, oil and copper 2×2 grid                       | `GET /api/slide-data/metals`   |
| `news`         | News          | Full-screen headline with Ken Burns image effect            | `GET /api/slide-data/news`     |
| `oil`          | Oil           | WTI and Brent crude oil prices in sats and USD              | `GET /api/slide-data/markets`  |
| `sata`         | SATA          | SATA ETF dashboard with ATM and stats grid                  | `GET /api/slide-data/strc`     |
| `show`         | Show          | Upcoming show card with host, schedule and background image | none                           |
| `silver`       | Silver        | XAG price in sats and USD with 24 h change                  | `GET /api/slide-data/metals`   |
| `strc`         | STRC          | STRC preferred stock dashboard with ATM and stats grid      | `GET /api/slide-data/strc`     |
| `video`        | Video         | Full-screen video player with optional loop count           | none                           |

The `id` value is what gets persisted in `slide_assets.template_id` when an operator picks a template. `show` and `video` do not fetch — `show` reads everything from the slide row and the linked DB record, `video` plays the `media_url` on the slide row.

### 17.1 How operators use a template

1. Go to `/admin/slides` and click **New slide**, then set kind to `template`.
2. Pick a template from the dropdown — the dropdown is populated from `SLIDE_TEMPLATES` in `lib/slides/registry.ts`, so it stays in sync with this list automatically.
3. Save. A new row is written to `slide_assets` with `kind: "template"` and `template_id` set to the chosen ID.
4. Schedule a `ProgramBlock` that references the slide. At airtime the `output-renderer` mounts the matching React component (in `components/slides/`) and, if the registry entry has a `dataEndpoint`, fetches it once before render.

### 17.2 Required environment / secrets per template

Cross-reference: `.env.example` at the repo root currently lists **only** Supabase + admin/encryption vars (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `APP_ENCRYPTION_KEY`, `ADMIN_BOOTSTRAP_TOKEN`, `NEXT_PUBLIC_APP_BASE_URL`, `SUPABASE_FETCH_TIMEOUT_MS`). None of the third-party provider keys called for by the templates below have been ported in yet — the directories under `app/api/slide-data/*` exist but are still empty placeholders. Treat every "TODO" row as a follow-up that has to land before the template will render real data on-air.

| Template(s)                                    | Secret / config needed                                                                             | Status                                                                                        |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| `calendar`, `event`, `event-modern`            | none — reads the Supabase `events` table directly via service-role client                          | OK (Supabase already configured)                                                              |
| `show`                                         | none — reads the Supabase `shows` table (or equivalent DB row referenced from the slide); no fetch | OK (Supabase already configured)                                                              |
| `video`                                        | none — `media_url` lives on the `slide_assets` row                                                 | OK                                                                                            |
| `debt`                                         | external debt-clock API key/URL                                                                    | TODO — verify in `lib/slides/debt.ts` (file does not exist yet; port from backgroundclima)    |
| `news`                                         | news source URL or RSS endpoint                                                                    | TODO — verify in `lib/slides/news.ts` (file does not exist yet; port from backgroundclima)    |
| `fx`, `oil` (`markets` endpoint)               | market data provider token                                                                         | TODO — verify in `lib/slides/markets.ts` (file does not exist yet; port from backgroundclima) |
| `gold`, `silver`, `metals` (`metals` endpoint) | metals price provider token                                                                        | TODO — verify in `lib/slides/metals.ts` (file does not exist yet; port from backgroundclima)  |
| `strc`, `sata` (`strc` endpoint)               | STRC service URL                                                                                   | TODO — verify in `lib/slides/strc.ts` (file does not exist yet; port from backgroundclima)    |

Note: an empty `app/api/slide-data/weather/` directory exists in the tree, but **there is no `weather` template registered in `SLIDE_TEMPLATES`**. If/when a weather template is added it will need `OPENWEATHER_API_KEY` (per backgroundclima); until then the directory is dead and should either be wired up or removed.

### 17.3 Adding a new template

Checklist for devs:

1. Add the React component under `components/slides/<TemplateName>.tsx` (use the existing slide components as the shape reference — props are the response payload of the template's `dataEndpoint`).
2. Register it in `lib/slides/registry.ts`: add the literal to the `SlideTemplateId` union and an entry to `SLIDE_TEMPLATES` (`id`, `label`, `description`, `dataEndpoint` — set `dataEndpoint` to `null` for DB-only templates).
3. If the template needs server data, add a route handler at `app/api/slide-data/<source>/route.ts` and (when secrets are involved) document the env var in `.env.example` plus add it to the `app/api/health/route.ts` required-keys list so deploys fail fast on missing config.
4. Add a case for the new ID to `SlideTemplateRenderer` (the switch that maps `template_id` to the component) in the output renderer.
5. Add i18n keys to `messages/en.json` and `messages/es.json` for any operator-facing or on-air copy the template uses, then update this §17 table so the catalog stays in sync.
