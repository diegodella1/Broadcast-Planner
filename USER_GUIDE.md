# RTV-TL-MANAGER — Operator User Guide

Internal playout / lineup manager for Roxom TV. Programs the on-air day, manages assets, and exposes fresh HLS links for VLC playback.

> **Audience**: Roxom TV operators (producer, director, on-air ops). Read-only roles can browse but not mutate. Bootstrap auth = single token until multi-operator lands.

---

## 1. Getting started

**URL**: `https://rtvtime.diegodella.ar/admin/calendar` (production) or `http://localhost:3450/admin/calendar` (local dev).

The app is served from the domain root. Old `/rtvtime/...` links redirect to root paths.

**Login** (`/admin/login`):

1. Page accepts a single password — the `ADMIN_BOOTSTRAP_TOKEN` configured by ops.
2. Submit → cookie `rpm_admin_token` is set → middleware grants access to `/admin/*` for the session.

**Locale**: top-bar toggle EN / ES. Selection stored in `NEXT_LOCALE` cookie. Brand names ("Roxom TV", "Vimeo", "Reuters") never translate.

---

## 2. The chrome

| Element                | What                                                                                                                                       |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **Sidebar**            | Left navigation for Dashboard, Control, Programming, Library, Vimeo, Graphics, Music, Audit and Integrations. Active route is highlighted. |
| **Header**             | Page title, page description and primary action for the current admin screen.                                                              |
| **Output card**        | Sidebar shortcut opens `/admin/output`, where operators copy the active HLS link for VLC.                                                  |
| **Outage / health UI** | Health endpoints and schedule health panels show Supabase, storage, Vimeo and programming risks.                                           |

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

- **Click a row** → opens `/admin/schedule/<date>/blocks/<id>` (block detail editor: title, start, duration, category, asset and scheduled layers).
- **Drag a row** → reorders the active rundown and recalculates start times from the first block.
- **Up / Down** → keyboard-safe reorder controls for the same server-side reorder path.
- **Minus / Plus** → resize duration in 5-minute steps. Server conflict checks and the DB trigger reject overlaps.
- **Duplicate** → creates a draft copy after the source block and shifts following blocks when the day still fits.
- **Archive** → removes the block from the active rundown without hard-deleting it.
- **Bulk status** → select rows and set draft, ready, active or archived.
- **Add block** form below the rundown — manual creation.
- **Generate 12 hr grid** button — bulk create test blocks for a window.

### Operator runbook

Open `/admin/runbook/<date>` from the schedule header or admin nav.

- **Preflight** — critical checks for schedule health, fallback readiness, output monitor and media readiness.
- **Live** — active block, next block, fallback reason and clock-skew verification.
- **Incident** — operator notes and mitigation confirmation.
- **Shutdown** — off-air/handoff, day archive and audit review.

Runbook checks and notes persist per `ProgramDay` in Supabase and write audit events. Critical
preflight items show a warning on the schedule page, but they do not block live output.

Operational rule: finish the critical preflight checks before switching the day to active unless an
operator explicitly accepts the risk. If runbook checks fail to save, the production database is
missing the `operator_runbook_checks` migration.

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

#### 4.3 Schedule health

Compact icon+text rows for every detected issue:

- 🔴 Critical (overlaps, missing assets, ad too long)
- 🟡 Warning (gaps, hidden layers, slide not ready)
- 🟢 OK (no issues)

Each row reads from `lib/schedule-health.ts:analyzeSchedule()`. Refreshes when the page revalidates.

#### 4.4 Background music

Toggle + volume slider. **Local state only** — does not persist (see §11.4 follow-up).

---

## 5. Block detail editor (`/admin/schedule/<date>/blocks/<id>`)

For deep edits.

| Section          | What                                                                                                                                                      |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Form             | title · start time · duration · type (video/image/slide/ad/promo/fallback) · category · status · notes · `hide_overlays` toggle · fallback asset override |
| Asset assignment | dropdown of compatible `media_assets`. Live chip shows `Live` for null-duration Reuters streams.                                                          |
| Slide assignment | dropdown of `slide_assets`.                                                                                                                               |
| Scheduled layers | list of overlays attached to this block: custom layers (logo bug, sidebar widgets, fullscreen takeovers). Add/remove inline.                              |
| Readiness        | rolled-up signal: green if asset+slide+layers all ready; red/amber otherwise with reason list.                                                            |
| Conflict action  | normal save rejects overlaps; explicit "Archive conflicting blocks and save" archives overlapping blocks and writes audit events.                         |

All copy translated. Token-safe palette (no raw `bg-red-50` etc.).

---

## 6. Assets (`/admin/assets`)

Catalog of media that blocks can reference.

### Pagination and filters

The Library is a server-rendered list with 50 assets per page. Pagination appears above and below the asset list, preserves all filters, and supports `?page=N`.

Filters:

- Status: all, review, ready.
- Kind/source: video, Vimeo, fallbacks, ads, promos, images, audio.
- Text search: title, description, source, kind, asset type and Vimeo show metadata.
- Vimeo show, month, year.
- Lifecycle: synced, reviewed, rejected, stale, expired, scheduled-in-use.
- Sort: title, duration, status, lifecycle.

### Common actions

- **Upload** — drag MP4/PNG into upload form → posts to `/api/assets/upload`, file goes to Supabase storage, row created in `media_assets`.
- **Upload and schedule** — from a day schedule, upload directly to `/api/assets/upload-schedule` and create a block.
- **Add remote URL** — register remote image, MP4, HLS, RTMP or Vimeo source without uploading.
- **Sync Vimeo** — use `/admin/vimeo` to mirror account videos into Library.
- **Edit** an existing row → opens inline form: title · URL · duration override · source type · media kind · asset type · status · lifecycle · orientation · thumbnail · description.
- **Delete** → confirm modal removes the Library row. Assets marked scheduled-in-use require an explicit force checkbox.

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

The operator's broadcast cockpit and the source of the active HLS link for VLC playback.

| Section               | What                                                                                                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ON AIR / OFF AIR pill | Red pulsing when broadcasting, dim when not.                                                                                                                                 |
| Broadcast status      | Live / Paused / Idle text.                                                                                                                                                   |
| Observability         | Polls current block, asset, fallback reason, media/Vimeo errors and clock skew from `/api/output/monitor`.                                                                   |
| HLS copy              | Generates and copies a fresh signed Vimeo HLS URL for VLC.                                                                                                                   |
| Source switcher       | Currently a stubbed select (Vimeo / Reuters / Slide / HLS / Remote image) — wire to real mutation in §11.5.                                                                  |
| **Stop broadcast**    | Big red button. Click → `confirm()` modal → server action flips `ProgramDay.status` to `"ready"` and clears any manual override block. Disabled when no broadcast is active. |

---

## 9. Output status route (`/output/live`)

This route is status-only compatibility. It does not render media playback.

For playback, copy the active HLS URL from `/admin/output` and open it in VLC as a network stream.

Production output is protected by `OUTPUT_CAPTURE_TOKEN`. Normal admin flow uses `/api/output/session`, sets an `HttpOnly` `rpm_output_token` cookie, then redirects to `/output/live`. Direct `?token=` access remains for scripts and first-time capture bootstrap only.

Append `?debug=true` to see clock, block, asset and fallback status. Useful for staging.

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
- ✅ Conflict resolution shows safe move/resize options and explicit archive-conflicts replacement.
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

#### 11.4 Background music

- ✅ UI shipped.
- ❌ Persistence to settings table.
- ❌ Real audio playback hooks (audio source URL, fade-in/out).

#### 11.5 Operator panel `/admin/output`

- ✅ Stop broadcast w/ confirm.
- ✅ Observability panel for current block, asset, fallback, Vimeo errors and clock skew.
- ❌ Source switcher is a stub — needs to call real mutation.
- 🔧 No manual-override-block clearing logic on Stop.

#### 11.6 Schedule rundown

- ✅ Vertical rows + now-line + right rail.
- ✅ Drag-and-drop reorder via `@dnd-kit/core`.
- ✅ Keyboard reorder, duration resize, duplicate, archive and bulk status.
- ✅ Server conflict checks plus DB trigger enforcement.
- ❌ Block templates / recurring blocks (e.g. "every weekday 09:00").

#### 11.7 Health widget

- ✅ Compact rows + tone tokens.
- 🔧 Click an issue row → deep-link to the offending block (currently no link).
- 🔧 Auto-refresh via polling (currently server-rendered once per page load).
- ❌ One-click suggested fixes (e.g. "Generate fallback overlay").

#### 11.8 Assets

- ✅ Paginated Library list, search, filters, lifecycle states, month/year/show filters and Live chip.
- 🔧 No asset preview modal (click a tile → popup).
- ❌ Tag system / categories (currently just status + source).

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
- ✅ Audit log viewer for critical mutation events.
- ❌ Multi-operator support — currently single bootstrap token.
- ❌ Roles (producer / director / admin).

#### 11.12 Output (broadcast composition)

- ✅ HLS copy for VLC playback.
- ❌ vMix integration via NDI / RTSP.
- ❌ Output recording (local DVR).
- ❌ Multiple bitrate streams (low-bandwidth + HD).
- ❌ Backup output failover.
- ❌ Captions / subtitles overlay.
- ❌ SCTE-35 ad markers.

#### 11.13 Infrastructure

- 🔧 `/admin/health` route doesn't exist — Health button currently temp-points at `/output/live`.
- 🔧 `@keyframes blink` / `pd` / `bar-grow` definitions missing — `.anim-*` classes reference non-existent keyframes (silent fail; reduced-motion guard works).
- ❌ Background job queue (channel sync, asset re-cache currently manual).
- ❌ Realtime Supabase channels for live operator updates (currently 5 s polling).

#### 11.14 i18n

- 🔧 Some literals still hardcoded in UI (audit pending).
- ❌ Validation error messages (Zod `safeParse` errors are static English).
- ❌ Currency / number locale formatting beyond date.

#### 11.15 Tests

- ✅ Unit tests, HTTP smoke and Playwright playout smoke.
- 🔧 Add richer authenticated Playwright flows for admin assets, Vimeo sync, schedule creation and output control.
- ❌ Visual regression screenshots.
- ❌ Performance benchmarks for `findActiveSchedule` over large schedules.

#### 11.16 Security

- 🔧 No rate limiting on `/api/*` endpoints.
- ✅ CSRF protection on mutating admin forms and APIs.
- ✅ Output routes protected by output token/cookie in production.
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
- **Layer / ScheduledLayer**: an overlay layered on top of a block during its airtime — logo bug, sidebar widget, fullscreen takeover.
- **MediaAsset**: a piece of source content (video, image, graphic). Source types: `vimeo`, `reuters`, `supabase_image`, `remote_image`, `remote_mp4`, `hls`.
- **SlideAsset**: editorial slide content (template, image, html, markdown). Distinct from `MediaAsset`.
- **ProgramDay**: a date's worth of programming. Status: `draft` → `ready` → `active` → `archived`.
- **Output status route**: the `/output/live` URL that reports active block status. VLC HLS is the playback path.
- **Operations panel**: the right rail on the schedule page. Where operators control live state.
- **Manual broadcast**: an operator-initiated override that pre-empts the scheduled grid. Inserts a `ProgramBlock` with `category=broadcast` at the current second (or scheduled time).
- **Manual override block**: a block created via Manual broadcast. Cleared when Stop broadcast fires.
- **Live chip**: the green `Live` pill rendered when an asset has `durationSeconds: null && sourceType: "reuters"`.
- **Outage banner**: red strip above the topbar when Supabase calls fail. Fixture data is shown locally; real data is unavailable.

---

## 14. Quick reference — keyboard / URL shortcuts

| Where                        | Shortcut                                                                                           |
| ---------------------------- | -------------------------------------------------------------------------------------------------- |
| Locale                       | Use the topbar toggle; `?lang=en/es` is not supported.                                             |
| Schedule for today           | `/admin/schedule/<today's-iso-date-in-ARG-tz>` (Calendar's "Schedule today" button computes this). |
| Output debug overlay         | Open admin debug link or append `?debug=true` after output session is minted.                      |
| Force Reuters provider       | env `REUTERS_PROVIDER=real` or `REUTERS_PROVIDER=fixtures`.                                        |
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
    ├── live/page.tsx                  # status-only output
    ├── [timelineId]/page.tsx          # status-only compat route
    └── preview/[blockId]/page.tsx     # single-block status preview

components/
├── admin-shell.tsx                    # 56px sidebar + 48px topbar + outage banner
├── admin-nav.tsx                      # client subcomponent for usePathname()
├── locale-switcher.tsx                # EN / ES toggle
├── output-stub.tsx                    # status-only output surface
├── operations-panel.tsx               # 240px right rail wrapper
├── operations-panel/
│   ├── on-air.tsx                     # progress bar + active block
│   ├── manual-broadcast.tsx           # Vimeo + Reuters search + go-live
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
4. Schedule a `ProgramBlock` that references the slide. Slides are managed in the schedule and can be used by future output integrations.

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
