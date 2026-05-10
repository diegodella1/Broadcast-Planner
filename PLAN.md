# RTV-TL-MANAGER — Phased Adjustment Plan

Repo: `roxom-playout-manager` (Next.js 15 / React 19 / TS 5.8 / Tailwind 3.4 / Supabase / npm). Branch `main` clean.

---

## 1. Executive Summary

The codebase is structurally sound (clean server/client split, 0 `any`, accurate README, working bootstrap auth) but visually and operationally drifts from the locked design at `rtv-air-manager_2.html`. The shift is three-pronged: (a) port a **dark broadcast theme** with chyron-derived tokens, a 56px icon sidebar, 48px topbar with ON AIR pill, vertical rundown rows and a 240px right-rail operations panel; (b) **internationalize** the UI — extract every hardcoded Spanish string to message catalogs and default the app to English with Spanish as secondary; (c) close standards debt — silent `catch {}` blocks in `lib/data.ts` mask Supabase outages with mock data (a broadcast risk), test coverage is ~8%, `vitest` lacks jsdom/RTL, and `tsconfig` runs only `strict:true`. We recommend seven phases: foundation tokens first, then i18n bootstrap (so every later UI task uses `t()` from day one), then domain types, then visible shell, then the rundown + right-rail (the largest user-facing block), then remaining views (Assets/Slides/Output), then a standards-lift polish phase.

---

## 2. Open Product Decisions

- **PRD reconciliation**: `product.md` and `roxom_playout_manager_prd.md` predate the design HTML — confirm which sections supersede.
- **Drag-and-drop block reorder**: include in Phase 5 or defer to a follow-up? (Affects rundown task scope.)
- **`BlockCategory` taxonomy lock**: confirm the 8 values (`mercados | earthcam | clima | calendario | trending | deuda | reuters | broadcast`) before migration is written.
- **Operator panel route**: confirm `/admin/output` is correct and `/output/live` stays untouched as the vMix capture surface.
- **i18n library choice**: recommend `next-intl` (App Router native, server + client component support). Confirm before Phase 2 starts. Default locale = `en`. Spanish stays as `es`.
- **Category names per locale**: should domain enum values (`mercados`, `clima`, etc.) translate to English in UI ("Markets", "Weather") while DB values stay Spanish? Recommended yes — DB stable, label translated.
- **Linear MCP access**: requires a fresh Claude Code session opened at the repo root.

---

## 3. Phased Plan

### Phase 1 — Foundation: dark theme, tokens, font

**Goal**: Lock the visual direction so every later phase can reference token names instead of hex.
**Duration**: 1–1.5 dev-days.
**Exit criteria**: All token names from the design HTML resolve in Tailwind; `app/globals.css` declares `color-scheme: dark`; `DESIGN.md` matches; existing pages render against new tokens without raw hex.

1. **Add dark broadcast tokens to Tailwind**
   - **What changes**: `tailwind.config.ts` — extend `theme.colors` with `surface-elevated-1` `#191919`, `surface-elevated-2` `#1e1e1e`, `surface-selected-positive` `#19241f`, `accent-positive` `#1ae784`, `accent-positive-hover` `#16cc74`, `accent-positive-glow` `rgba(26,231,132,0.25)`, `accent-positive-glow-strong` `rgba(26,231,132,0.60)`, `accent-live` `#e7000b`, `accent-live-text` `#ff4d4d`, `info-blue` `#60a5fa`, `warn-amber` `#fbbf24`, `info-violet` `#c084fc`, `negative-red` `#ef4444`. Source of truth: `rtv-air-manager_2.html:11-18`.
   - **Acceptance**: Does `tailwind.config.ts` export every token above? Are all values exact-match to the design HTML? Does `npx tailwindcss -i ... --content ...` build without warnings?
   - **Dependencies**: none.
   - **Suggested specialist**: `nextjs-component-agent`.

2. **Set dark color-scheme + base body styles**
   - **What changes**: `app/globals.css` — add `:root { color-scheme: dark; }`, set `body` background to `surface-elevated-1`, default text to a near-white reference. Remove leftover OKLCH light-theme variables.
   - **Acceptance**: Does the file declare `color-scheme: dark`? Are no OKLCH light tokens present? Does `body` reference Tailwind tokens (no raw hex)?
   - **Dependencies**: 1.
   - **Suggested specialist**: `nextjs-component-agent`.

3. **Wire DM Sans via next/font (optional)**
   - **What changes**: `app/layout.tsx` — import `DM_Sans` from `next/font/google`, attach the CSS variable to `<body>`, expose `--font-dm-sans` in Tailwind `theme.fontFamily.sans`.
   - **Acceptance**: Is the font loaded with `display: 'swap'`? Does Tailwind `font-sans` resolve to DM Sans? Does the build pass with zero new network calls at runtime (font self-hosted by next/font)?
   - **Dependencies**: 1.
   - **Suggested specialist**: `nextjs-component-agent`.

4. **Update `DESIGN.md` to dark broadcast spec**
   - **What changes**: `DESIGN.md` — replace the OKLCH section with the new token table, add screenshots/notes referencing `rtv-air-manager_2.html`, document the chyron-canonical green `#1ae784`.
   - **Acceptance**: Does `DESIGN.md` list every token from task 1? Does it mark the OKLCH light theme as deprecated? Does it cite the design HTML as source of truth?
   - **Dependencies**: 1.
   - **Suggested specialist**: `head-designer`.

5. **Migrate any raw color literals in shared shell to tokens**
   - **What changes**: Sweep `components/admin-shell.tsx`, `app/admin/schedule/[date]/blocks/[id]/page.tsx:1-357` and any file using `bg-red-50`/`bg-amber-50`/`bg-emerald-50`/`text-zinc-*` — replace with the new tokens. Visual fidelity not yet required (Phase 4/5 reworks the layout); just the palette swap.
   - **Acceptance**: Does `grep -r "bg-zinc-\|text-zinc-\|bg-red-50\|bg-amber-50\|bg-emerald-50" app components` return empty? Do all replaced classes reference tokens from task 1?
   - **Dependencies**: 1, 2.
   - **Suggested specialist**: `nextjs-component-agent`.

---

### Phase 2 — Internationalization (i18n): English default + Spanish secondary

**Goal**: Externalize every UI string and default the app to English. Locked early so every later UI task in Phases 4-6 uses `t()` from day one — avoids retrofitting after the visual rework lands.
**Duration**: 1.5–2 dev-days.
**Exit criteria**: Zero hardcoded user-facing strings outside `messages/*.json`; default locale = `en`; language switcher in topbar (lands in Phase 4 task 2); build passes typecheck with `next-intl` strict mode; both `messages/en.json` and `messages/es.json` complete and symmetric.

1. **Install + bootstrap `next-intl`**
   - **What changes**: `npm i next-intl`. Add `i18n.ts` (or `src/i18n.ts`) exporting `locales: ['en', 'es']`, `defaultLocale: 'en'`. Create `messages/en.json` + `messages/es.json` (both empty `{}`). Wrap `app/layout.tsx` root in `<NextIntlClientProvider>` reading messages async per request.
   - **Acceptance**: Does `next-intl` resolve in `app/layout.tsx`? Are messages loaded via async `getMessages()`? Does `defaultLocale` = `'en'`? Does `npm run build` pass?
   - **Dependencies**: Phase 1.
   - **Suggested specialist**: `senior-ts-microservices-architect`.

2. **Wire locale-aware routing + chain with admin auth middleware**
   - **What changes**: Update `middleware.ts` — chain `next-intl/middleware` w/ locale prefix mode `'as-needed'` (English at `/...`, Spanish at `/es/...`) AND the existing `rpm_admin_token` admin gate. Order: i18n first (rewrites locale), then admin auth (checks cookie). Update `matcher` so both run for `/admin/*` regardless of locale.
   - **Acceptance**: Does `/admin/calendar` render English? Does `/es/admin/calendar` render Spanish? Does admin auth still gate `/admin/*` regardless of locale prefix? Does login redirect preserve locale?
   - **Dependencies**: 1.
   - **Suggested specialist**: `senior-ts-microservices-architect`.

3. **Extract hardcoded Spanish strings to message catalogs**
   - **What changes**: Sweep every UI string and move to `messages/en.json` + `messages/es.json`. Targets: `app/page.tsx` (eyebrow "Roxom TV", title "Playout Manager", 3 link labels + details), `components/admin-shell.tsx` (nav labels), `app/admin/**/page.tsx` (titles, descriptions, button + form labels), `lib/schedule-health.ts:67-165` (8+ Spanish issue strings: "Gap de programacion", "Bloques solapados", "Layer fuera de rango", etc.), `lib/mock-data.ts` labels, `app/output/**/page.tsx`, `components/output-renderer.tsx`. Use namespaced keys: `home.title`, `nav.calendar`, `health.issues.gap`, `block.status.broadcast`, etc. English copy is canonical; Spanish translates from existing strings.
   - **Acceptance**: Does `grep -rn "Calendario\|Al aire ahora\|AHORA\|Música\|Broadcast manual\|Gap de programacion\|Bloques solapados" app components lib` return 0 hits in `.tsx`/`.ts` files (excluding `messages/`)? Are all keys present and non-empty in BOTH `en.json` and `es.json`? Does a JSON-key-symmetry script (added to `package.json`) pass?
   - **Dependencies**: 1.
   - **Suggested specialist**: `senior-ts-microservices-architect`.

4. **Wire `useTranslations` / `getTranslations` in components**
   - **What changes**: Server components use `getTranslations()`, client components use `useTranslations()`. Rewrite `app/page.tsx`, `components/admin-shell.tsx`, every admin page, `output-renderer.tsx`, schedule-health rendering, status-pill, ui.tsx. Pass translated category labels into the (Phase 3) `BlockBadge` via prop, NOT inside the component (keeps it pure-presentational).
   - **Acceptance**: Does `grep -rn "[A-Z][a-z]+\|[áéíóúñÁÉÍÓÚÑ]" app components` return only JSX structural strings (className, props), not user-visible copy? Does TS still compile? Does every consumer of i18n keys reference an existing key (no broken refs)?
   - **Dependencies**: 3.
   - **Suggested specialist**: `nextjs-component-agent`.

5. **Locale-aware date / time / number formatting**
   - **What changes**: Replace hand-rolled `Intl.DateTimeFormat` calls in `lib/time.ts` and consumers w/ `next-intl`'s `useFormatter()` / `getFormatter()`. Time zone stays from `ProgramDay.timezone`; locale comes from request. Number formatting (durations, percentages on progress bar) follows locale conventions.
   - **Acceptance**: Does a Spanish-locale date render `7 may 2026` style? English `May 7, 2026`? Are all `Intl.DateTimeFormat`/`toLocaleString` calls routed through `next-intl`?
   - **Dependencies**: 1, 4.
   - **Suggested specialist**: `senior-ts-microservices-architect`.

6. **Add language switcher (lands in Phase 4 topbar)**
   - **What changes**: Stub component `components/locale-switcher.tsx` — small dropdown w/ EN / ES. Stores selection in `NEXT_LOCALE` cookie. Triggers nav to locale-prefixed route preserving current path. Component built here; **mounts in Phase 4 topbar (task 2)** as a topbar action.
   - **Acceptance**: Does the switcher persist selection across reloads? Does it update URL prefix + cookie atomically? Is it keyboard-accessible (arrow keys, Enter)? Does it carry `aria-label="Language"`? Does the active option carry `aria-selected="true"`?
   - **Dependencies**: 1.
   - **Suggested specialist**: `nextjs-component-agent`.

---

### Phase 3 — Domain extensions: BlockCategory, reuters source, Live chip

**Goal**: Land schema + types so badges, filters, and chips compile against real fields.
**Duration**: 1–2 dev-days.
**Exit criteria**: Migrations applied, seed updated, `lib/types.ts` exports new enums, all server actions/queries that touch blocks accept a category.

1. **Add `BlockCategory` enum to types and schema**
   - **What changes**: `lib/types.ts` — export `type BlockCategory = "mercados" | "earthcam" | "clima" | "calendario" | "trending" | "deuda" | "reuters" | "broadcast"`. Add column `category` (text, NOT NULL, CHECK constraint over enum values) to `program_blocks` via a new `supabase/migrations/<ts>_add_block_category.sql`. Default existing rows to `"mercados"` then drop default. Translation labels live in `messages/*.json` under `block.category.*`.
   - **Acceptance**: Does the migration include UP and DOWN sections? Does `lib/types.ts` re-export the enum? Does TypeScript compile with the new field non-optional on `ProgramBlock`? Are `block.category.mercados/earthcam/clima/calendario/trending/deuda/reuters/broadcast` keys present in both locales?
   - **Dependencies**: Phase 1, Phase 2 task 3.
   - **Suggested specialist**: `database-migration-agent`.

2. **Extend `SourceType` with `reuters`**
   - **What changes**: `lib/types.ts` — add `"reuters"` to `SourceType`. Migration alters CHECK constraint on `assets.source_type`. Update any switch/match statements in `lib/mutations.ts`, `lib/data.ts`, `lib/scheduler.ts` to handle the new variant exhaustively.
   - **Acceptance**: Does `tsc --noEmit` pass with `noImplicitReturns`? Are all switch statements over `SourceType` exhaustive (no fallthrough default)? Does the migration roll back cleanly?
   - **Dependencies**: 1.
   - **Suggested specialist**: `database-migration-agent`.

3. **Update seed data**
   - **What changes**: `supabase/seed.sql` (or equivalent) — assign categories to seeded blocks; add at least one Reuters asset. Update `mockSchedule` in `lib/data.ts` to match new shape so the silent fallback (until Phase 7 fixes it) doesn't crash type-checks.
   - **Acceptance**: Does `npm run seed` (or the documented command) succeed? Does the seed cover all 8 categories at least once? Does `mockSchedule` typecheck?
   - **Dependencies**: 1, 2.
   - **Suggested specialist**: `supabase-agent`.

4. **Implement Live duration chip rule**
   - **What changes**: Wherever block durations are formatted (helper in `lib/`, consumers in schedule views), branch on `durationSeconds === null && sourceType === "reuters"` to render the `Live` chip. Add the helper to `lib/` so both rundown and detail editor share it. Label "Live" / "En vivo" comes from `messages/*.json` under `block.live`.
   - **Acceptance**: Does the helper return a discriminated union (`{ kind: "live" } | { kind: "duration"; seconds: number }`)? Does the consuming component pull the label via `t('block.live')`? Are tests added covering both branches (deferred to Phase 7 if test infra not ready, but the helper must be export-only-pure)?
   - **Dependencies**: 1, 2, Phase 2.
   - **Suggested specialist**: `senior-ts-microservices-architect`.

---

### Phase 4 — Shell rework: 56px sidebar, 48px topbar, ON AIR pill, language switcher

**Goal**: The visible spine of the app matches the design before deeper views are reworked.
**Duration**: 1.5–2 dev-days.
**Exit criteria**: `components/admin-shell.tsx` renders the new chrome; ON AIR pill is gated correctly; topbar buttons exist with correct icons + aria-labels; language switcher mounts in topbar.

1. **Collapse sidebar to 56px icon-only with tooltips**
   - **What changes**: `components/admin-shell.tsx:26-51` — reduce width from 256px to 56px, replace label rows with icon buttons (Lucide icons). Add `aria-label` per button (sourced from `t('nav.<route>')`) and a tooltip primitive (Radix or a 12-line custom one). Active route shows the green accent (`accent-positive`).
   - **Acceptance**: Is the sidebar exactly 56px wide? Does every icon button have an `aria-label` from `t()`? Does the active route render with `accent-positive`? Are tooltips keyboard-accessible (focus → visible)?
   - **Dependencies**: Phase 1, Phase 2 task 4.
   - **Suggested specialist**: `nextjs-component-agent`.

2. **Build 48px topbar with action slots + language switcher**
   - **What changes**: `components/admin-shell.tsx:53-69` — replace existing top row with a 48px-tall flex bar: ON AIR pill (left), `<LocaleSwitcher />` from Phase 2 task 6, Health button + Output button + primary action (right). Use new tokens. Each icon-only button gets `aria-label` via `t()`.
   - **Acceptance**: Is the topbar exactly 48px tall? Are all four right-side controls present (locale switcher + Health + Output + primary action)? Does the layout reflow correctly at narrow widths?
   - **Dependencies**: 1, Phase 2 task 6.
   - **Suggested specialist**: `nextjs-component-agent`.

3. **Gate ON AIR pill on `ProgramDay.status === "active"` + active block**
   - **What changes**: New small server component or a `useActiveBlock` hook (introduced in Phase 5 — for now read once on server) that resolves the gate. Pill renders `bg-accent-live` with `accent-live-text` text and `aria-live="polite"`. Label from `t('chrome.onAir')`. When inactive, render a dim placeholder, not nothing (keeps layout stable).
   - **Acceptance**: Is the pill present in DOM at all times (visibility state, not mount/unmount)? Does it carry `aria-live="polite"`? Does it correctly read `ProgramDay.status` from server state? Is "ON AIR" / "AL AIRE" pulled from `t()`?
   - **Dependencies**: 2.
   - **Suggested specialist**: `nextjs-component-agent`.

---

### Phase 5 — Schedule rundown + right-rail operations panel

**Goal**: The largest user-facing block. Convert the 24h grid to a vertical rundown and add the 240px operations panel.
**Duration**: 3–5 dev-days.
**Exit criteria**: `app/admin/schedule/[date]/page.tsx` renders rundown rows + now-line + right-rail; right-rail sections appear in the order specified.

1. **Add `useActiveBlock` polling hook (5s)**
   - **What changes**: New file `app/hooks/useActiveBlock.ts` — client hook, polls a server endpoint or revalidates server data every 5s, cleans up on unmount with `AbortController`. Returns `{ active, elapsedInBlock, status }`.
   - **Acceptance**: Does the hook abort the in-flight request on unmount? Does it back off on consecutive errors? Are there no leaked intervals in tests (verified in Phase 7)?
   - **Dependencies**: Phase 3 task 1.
   - **Suggested specialist**: `senior-ts-microservices-architect`.

2. **Build `BlockBadge` component**
   - **What changes**: New `components/block-badge.tsx` — maps `BlockCategory` to a token-driven badge (info-blue / warn-amber / info-violet / negative-red / accent-positive / etc.). Pure presentational, no client state. Receives `label` prop from parent (translated via `t('block.category.*')`).
   - **Acceptance**: Does the component handle all 8 categories with no fallthrough? Does it expose a `size` prop (sm/md)? Does it carry an `aria-label` describing the category? Does it accept `label` as a prop rather than reading `t()` internally?
   - **Dependencies**: Phase 3 task 1, Phase 2 task 4.
   - **Suggested specialist**: `nextjs-component-agent`.

3. **Convert 24h grid to vertical rundown rows**
   - **What changes**: `app/admin/schedule/[date]/page.tsx:291-355` — replace the grid with rundown rows: time label (left) + axis dot + block card (badge, title, duration or Live chip, status). Use `surface-elevated-2` for cards, `surface-selected-positive` for the current block. Apply green-glow ring on current, dim opacity on next, `accent-live` border on broadcast. All static copy via `t()`.
   - **Acceptance**: Does the page render rows in chronological order? Is the current block visually distinct (glow + ring)? Does the broadcast state apply `accent-live` border? Are all colors token-based? Are all labels from `t()`?
   - **Dependencies**: 1, 2.
   - **Suggested specialist**: `nextjs-component-agent`.

4. **Add now-line indicator**
   - **What changes**: Inside the rundown, render a 1px `accent-live` line + 7px dot + label `t('schedule.now')` (English "NOW" / Spanish "AHORA"). Carry `aria-live="polite"`. Position recomputes from `useActiveBlock`.
   - **Acceptance**: Is the line exactly 1px tall, the dot 7px? Does the label render via `t()`? Does `aria-live` fire on update? Does the position update at 5s cadence?
   - **Dependencies**: 1, 3.
   - **Suggested specialist**: `nextjs-component-agent`.

5. **Build right-rail operations panel skeleton (240px)**
   - **What changes**: New `components/operations-panel.tsx` — fixed 240px wide, scrolls independently. Five sections in order: `t('ops.onAir')` ("On air now"), `t('ops.manualBroadcast')` ("Manual broadcast"), `t('ops.lowerThird')` ("Lower third"), `t('ops.health')` ("Schedule health"), `t('ops.music')` ("Background music"). Each section is its own subcomponent stub for now.
   - **Acceptance**: Is the panel exactly 240px wide? Are sections in the specified order? Does each section have a heading element for landmarks? Are all section titles via `t()`?
   - **Dependencies**: Phase 4 complete.
   - **Suggested specialist**: `nextjs-component-agent`.

6. **Implement "On air now" section**
   - **What changes**: Within `operations-panel.tsx`, render the active block name + a progress bar driven by `active.elapsedInBlock / active.block.durationSeconds`. Carry `aria-live="polite"`. Show the live duration chip when applicable. Time-remaining text via `t()` + `useFormatter`.
   - **Acceptance**: Does the progress bar reflect 0–100% mapping correctly? Is `aria-live` present? Does it gracefully render an empty state when no active block? Does time-remaining format per locale?
   - **Dependencies**: 1, 5.
   - **Suggested specialist**: `nextjs-component-agent`.

7. **Implement "Manual broadcast" section**
   - **What changes**: Vimeo source selector + search input + result rows + go-live button. The button is a server action (likely in `lib/mutations.ts`) that sets the manual broadcast override and audits. Placeholder + button labels via `t()`.
   - **Acceptance**: Does the search debounce input? Does the action validate inputs (Phase 7 will replace `String(formData.get(...))` with Zod)? Does the button disable while the action is in-flight? Does the audit log capture user + timestamp?
   - **Dependencies**: 5, Phase 3 task 2.
   - **Suggested specialist**: `nextjs-component-agent`.

8. **Implement "Lower third" editor with live preview**
   - **What changes**: Two text inputs + a toggle. Live preview reuses `output-renderer.tsx` rendering rules so the preview matches air output. State is local to this section; commits via a server action. Form labels via `t()`.
   - **Acceptance**: Does the preview update on each keystroke? Does it visually match the broadcast renderer? Does the commit action succeed and surface errors?
   - **Dependencies**: 5.
   - **Suggested specialist**: `nextjs-component-agent`.

9. **Implement "Schedule health" compact rows**
   - **What changes**: Replace the existing big metric tiles with compact icon+text rows. Source data from `lib/schedule-health.ts:50` (note: `analyzeSchedule` is 131 lines and overdue for split — flag for Phase 7, do not refactor here). Issue messages already extracted in Phase 2 task 3 — reference via `t('health.issues.<key>')`. Carry `aria-live="polite"`.
   - **Acceptance**: Are rows compact (single line each)? Does each row include an icon and a token-colored status indicator? Does the section refresh with the polling hook? Are all health messages from `t()`?
   - **Dependencies**: 1, 5, Phase 2 task 3.
   - **Suggested specialist**: `nextjs-component-agent`.

10. **Implement "Background music" toggle + slider**
    - **What changes**: Persistent toggle + volume slider. Server action saves to a settings table or `ProgramDay`-level setting. Slider is keyboard-accessible. Labels via `t()`.
    - **Acceptance**: Is the toggle keyboard-toggleable with Space? Does the slider expose `aria-valuenow`? Does the value persist across reloads?
    - **Dependencies**: 5.
    - **Suggested specialist**: `nextjs-component-agent`.

11. **Wire `prefers-reduced-motion` for ported keyframes**
    - **What changes**: The design uses `blink`, `pd`, `bar-grow` keyframes. Add `@media (prefers-reduced-motion: reduce)` blocks in `app/globals.css` or as Tailwind variants to disable each.
    - **Acceptance**: With `prefers-reduced-motion: reduce`, do all three animations stop? Are no animations defined outside the guard?
    - **Dependencies**: Phase 1.
    - **Suggested specialist**: `nextjs-component-agent`.

---

### Phase 6 — Assets, Slides, Operator panel `/admin/output`

**Goal**: Round out the views the design HTML specifies.
**Duration**: 3–4 dev-days.
**Exit criteria**: Assets supports tile-grid + source filter; Slides has list + 16:9 preview; `/admin/output` exists with broadcast controls.

1. **Add tile-grid mode to Assets view**
   - **What changes**: Existing assets view (`app/admin/assets/page.tsx`) — add a view-mode toggle (list ↔ tile-grid). Tile grid uses `auto-fill minmax(150px, 1fr)`. Preserve current status tabs. Toggle labels via `t()`.
   - **Acceptance**: Does the toggle persist within the session? Do tiles reflow correctly at viewport widths 1024/1280/1440? Are images lazy-loaded?
   - **Dependencies**: Phase 5 complete (token + shell stable).
   - **Suggested specialist**: `nextjs-component-agent`.

2. **Add source filter tabs to Assets**
   - **What changes**: New tab row: `t('assets.tabs.all')` / `Vimeo` / `Reuters` / `t('assets.tabs.uploads')`. Filter applies to both list and tile-grid modes. Reuses Phase 3 source type extension. (Brand names "Vimeo" / "Reuters" stay untranslated.)
   - **Acceptance**: Do all four tabs exist? Does the active tab carry `aria-selected="true"`? Does selection update the URL query param so refresh preserves state?
   - **Dependencies**: 1, Phase 3 task 2.
   - **Suggested specialist**: `nextjs-component-agent`.

3. **Build Slides view: 260px list + 16:9 preview pane**
   - **What changes**: Existing slides view — split layout: 260px list on left, 16:9 preview pane on right. Preview pane maps slide type to a renderer: earthcam globe, market chart, weather cards, debt placeholder. Each animation is `prefers-reduced-motion`-guarded. Renderer copy via `t()`.
   - **Acceptance**: Is the list exactly 260px wide? Does the preview hold a 16:9 aspect ratio at all viewport widths? Does each renderer respect reduced motion? Is selection keyboard-navigable (arrow keys)?
   - **Dependencies**: Phase 5 task 11.
   - **Suggested specialist**: `nextjs-component-agent`.

4. **Create `/admin/output` operator panel**
   - **What changes**: New route `app/admin/output/page.tsx` (NOT `/output/live`, which stays for vMix capture). Surface: broadcast status with live dot, source switcher, lower-third editor, "Stop broadcast" / "Detener broadcast" button. The button is a server action that flips `ProgramDay.status` to `"inactive"`, clears manual override, writes audit log. All copy via `t()`.
   - **Acceptance**: Does `/admin/output` resolve at the domain root AND its locale prefix? Does Stop broadcast require explicit confirmation (modal or hold-to-confirm)? Does the audit log capture before/after status + user + timestamp? Does `/output/live` remain untouched?
   - **Dependencies**: Phase 5 tasks 7, 8.
   - **Suggested specialist**: `nextjs-component-agent`.

5. **Refactor block detail editor to token palette**
   - **What changes**: `app/admin/schedule/[date]/blocks/[id]/page.tsx:1-357` — strip raw `bg-red-50`/`bg-amber-50`/`bg-emerald-50`/`text-zinc-*` references; replace with new tokens. All copy already extracted in Phase 2 task 3 — wire via `t()`. Consider absorbing into the right-rail per the design HTML, but a token migration alone is acceptable scope here.
   - **Acceptance**: Does `grep` for the listed raw classes in the file return empty? Does the editor still typecheck and submit correctly? Are all labels from `t()`?
   - **Dependencies**: Phase 1, Phase 2 task 4.
   - **Suggested specialist**: `nextjs-component-agent`.

---

### Phase 7 — Standards bar: tests, tsconfig, lint, error handling, dead deps, CI

**Goal**: Lift the project's engineering floor. Most of this is parallel-safe with Phase 6; listed last so a clean "polish PR" exists.
**Duration**: 3–5 dev-days.
**Exit criteria**: Coverage thresholds enforced; tsconfig strictness raised; silent catches replaced with telemetry + outage banner; CI runs typecheck + lint + test on PRs.

1. **Replace silent `catch {}` blocks with logged failures + outage banner**
   - **What changes**: `lib/data.ts:31,85,102,121,132,143` and `lib/supabase/server.ts:52` — log to console (and to a telemetry hook), surface a top-level outage banner in `components/admin-shell.tsx` when a Supabase call fails. Banner copy via `t('chrome.outage')`. **Stop falling back to `mockSchedule` in production.** Mock fallback only when `process.env.NODE_ENV !== "production"`.
   - **Acceptance**: Does `grep -n "catch {}" lib` return empty? Does the banner render on Supabase failure? Is `mockSchedule` only reachable in non-production? Operationally: would a Supabase outage now show "service degraded" instead of fixture data?
   - **Dependencies**: Phase 3 (so types are stable), Phase 2 task 3.
   - **Suggested specialist**: `senior-ts-microservices-architect`.

2. **Upgrade `vitest.config.ts` for component + DOM testing**
   - **What changes**: `vitest.config.ts` (currently 6 lines, env=node) — switch to `environment: "jsdom"`, add `setupFiles` with `@testing-library/jest-dom` and a `next-intl` test provider, expand `include` beyond `lib/`, add coverage thresholds (start at 30% lines, raise to 60% in a follow-up). Add `@testing-library/react`, `@testing-library/jest-dom`, `@testing-library/user-event`, `msw` to devDependencies.
   - **Acceptance**: Does `vitest run` discover tests outside `lib/`? Does `expect(...).toBeInTheDocument()` resolve? Does coverage report generate? Is the threshold enforced (CI fails below)? Do `useTranslations()` consumers render in tests w/o crashing?
   - **Dependencies**: Phase 2.
   - **Suggested specialist**: `ts-test-writer`.

3. **Cover `lib/mutations.ts` write surface**
   - **What changes**: New tests for all 13 exports in `lib/mutations.ts` (509 lines). Priority: `updateProgramDayStatus` (gates broadcast publication), `createProgramBlock` (overlap path), `createLongTestSchedule`. Use Supabase mock or test client.
   - **Acceptance**: Is each exported mutation covered by at least one happy-path and one error-path test? Does coverage of `lib/mutations.ts` exceed 70%?
   - **Dependencies**: 2.
   - **Suggested specialist**: `ts-test-writer`.

4. **Cover `output-renderer.tsx` and key components**
   - **What changes**: Component tests for `output-renderer.tsx` (192 lines, has `useState`+`useEffect`+`useMemo`, broadcast heart), the new `BlockBadge`, the `useActiveBlock` hook, the new operations panel sections, the `LocaleSwitcher`. Use RTL.
   - **Acceptance**: Are at least 6 component test files added? Does `useActiveBlock` test verify abort-on-unmount? Does `output-renderer` test cover the broadcast heartbeat path? Does `LocaleSwitcher` test verify cookie + URL update on selection?
   - **Dependencies**: 2, Phase 5 complete.
   - **Suggested specialist**: `nextjs-frontend-tester`.

5. **Add i18n key-symmetry + missing-key script**
   - **What changes**: New `scripts/i18n-check.mjs` — fails if a key exists in `en.json` but not `es.json` or vice versa, OR if any string in `en.json` is empty. Wire to `package.json` as `i18n:check`. Run in CI (Phase 7 task 10) before lint.
   - **Acceptance**: Does the script detect a deliberately removed key? Does CI fail on asymmetric catalogs? Is it added to `pre-commit` (Phase 7 task 6)?
   - **Dependencies**: Phase 2 task 3.
   - **Suggested specialist**: `senior-ts-microservices-architect`.

6. **Tighten `tsconfig.json`**
   - **What changes**: Add `noUncheckedIndexedAccess`, `noUnusedLocals`, `noUnusedParameters`, `exactOptionalPropertyTypes`. Fix fallout (likely a handful of array access guards and optional-property assignments).
   - **Acceptance**: Do all four flags appear in `tsconfig.json`? Does `tsc --noEmit` pass? Are no `// @ts-expect-error` comments added to bypass the new rules?
   - **Dependencies**: Phase 6 complete (avoid churn during UI work).
   - **Suggested specialist**: `senior-ts-microservices-architect`.

7. **Expand ESLint + add Prettier + add scripts**
   - **What changes**: `.eslintrc.json` — add `plugin:@typescript-eslint/recommended-type-checked`, `plugin:react-hooks/recommended`, `plugin:jsx-a11y/recommended`, an import-order rule, and a custom rule rejecting hardcoded user-visible strings (e.g. `eslint-plugin-i18next` or a small custom rule keyed off `useTranslations`). Add `.prettierrc.json`. Add `package.json` scripts: `typecheck`, `format`, `format:check`, `i18n:check`. Add `husky` + `lint-staged` for pre-commit.
   - **Acceptance**: Does `npm run lint` flag a deliberately introduced violation? Does `npm run format:check` exist and pass? Does pre-commit run lint-staged + `i18n:check` on staged files?
   - **Dependencies**: 5, 6.
   - **Suggested specialist**: `senior-ts-microservices-architect`.

8. **Replace `String(formData.get(...))` with Zod schemas**
   - **What changes**: Every server action currently uses ad-hoc string coercion. Define Zod schemas per action (in `lib/schemas/` or co-located). Use `safeParse` and surface validation errors via `t('errors.<key>')`. `zod` is already in deps — this also discharges the dead-dep flag.
   - **Acceptance**: Does each server action call `schema.safeParse(formData)`? Are validation errors returned to the client (not thrown) and displayed via `t()`? Does `grep -n "String(formData.get" app lib` return empty?
   - **Dependencies**: 6.
   - **Suggested specialist**: `senior-ts-microservices-architect`.

9. **Remove dead deps + reconcile actually-used libs**
   - **What changes**: Remove `@vimeo/player` (raw iframe is in use). Remove `date-fns` (replaced by `next-intl` formatter in Phase 2 task 5). Keep `zod` after task 8 lands. Remove Playwright if Phase 7 doesn't add specs; otherwise add `playwright.config.ts` and one smoke spec.
   - **Acceptance**: Are `@vimeo/player` and `date-fns` absent from `package.json`? Does the install lockfile change reflect removals only? Decision on Playwright is recorded (either spec added or dep removed)?
   - **Dependencies**: Phase 2 task 5.
   - **Suggested specialist**: `senior-ts-microservices-architect`.

10. **Refactor long functions flagged in audit**
    - **What changes**: Split `lib/schedule-health.ts:50` `analyzeSchedule` (131 lines, 12 branches, 4 nesting levels) into smaller pure helpers. Reduce `lib/mutations.ts:189` `createLongTestSchedule` (66 lines) and `lib/mutations.ts:29` `createProgramBlock` (60 lines) to under 30 lines each. `createProgramBlock` should call `hasBaseBlockConflict` from `lib/scheduler.ts:56` instead of duplicating overlap logic.
    - **Acceptance**: Are all three functions under 30 lines? Does `createProgramBlock` import `hasBaseBlockConflict`? Are tests from task 3 still green?
    - **Dependencies**: 3.
    - **Suggested specialist**: `senior-ts-microservices-architect`.

11. **Add CI workflow (typecheck + lint + i18n + test)**
    - **What changes**: New `.github/workflows/ci.yml` — on PR: `npm ci`, `npm run typecheck`, `npm run lint`, `npm run format:check`, `npm run i18n:check`, `npm test -- --coverage`. Cache npm. Fail on coverage threshold breach.
    - **Acceptance**: Does the workflow run on `pull_request`? Does it fail on a deliberately broken PR (typecheck/lint/i18n/test/coverage)? Is `node_modules` cached?
    - **Dependencies**: 2, 5, 6, 7.
    - **Suggested specialist**: `senior-ts-microservices-architect`.

---

## 4. Cross-Cutting Work

These touch most phases — listed once with the phase that owns the landing.

- **`aria-live="polite"`** on ON AIR pill (Phase 4 task 3), Now line (Phase 5 task 4), "On air now" progress (Phase 5 task 6), Schedule health (Phase 5 task 9).
- **`aria-label`** on every icon-only button: sidebar (Phase 4 task 1), topbar (Phase 4 task 2), Stop/Back/Heart icons in operator panel (Phase 6 task 4). All sourced from `t()`.
- **`prefers-reduced-motion`** guard for `blink`, `pd`, `bar-grow` keyframes (Phase 5 task 11) and slide preview animations (Phase 6 task 3).
- **5s polling realtime**: `useActiveBlock` lives in Phase 5 task 1; consumed by Phase 4 task 3, Phase 5 tasks 4/6/9, Phase 6 task 4.
- **i18n discipline**: every UI string introduced in Phases 4-6 must come from `t()` / `getTranslations()`. New keys land in BOTH `messages/en.json` and `messages/es.json` (symmetry enforced by Phase 7 task 5 script). Brand names ("Vimeo", "Reuters", "Roxom TV") stay untranslated.

---

## 5. Linear Handoff Guidance

To turn this plan into Linear tickets:

1. Open a fresh Claude Code session at `/Users/macarenazalazar/Documents/ROXOMTV/RTV-TL-MANAGER` (Linear MCP needs the new session at the repo root).
2. In that session, run: `/nico fetch Linear issues for playout manager` to inspect existing tickets.
3. Then run `linear-issue-sync WRITE` with this `PLAN.md` as the source. Ask it to create one Linear issue per task above.
4. Use the title prefix `[playout] Phase N: <task subject>` — for example, `[playout] Phase 2: Install + bootstrap next-intl`.
5. Set Linear labels: `phase-1` … `phase-7`, plus a label per area (`area:frontend`, `area:db`, `area:tests`, `area:i18n`, `area:ci`).
6. Set the parent/child relationship so each task lists the dependencies declared in this plan.

---

## 6. Risks

- **Visual regressions during token swap (Phase 1, 6)**. _Mitigation_: keep existing layouts during palette migration; defer geometry changes to Phase 4/5. Add visual smoke spec via Playwright in Phase 7 task 9 if Playwright is kept.
- **Broadcast outage masked by silent catches**. _Mitigation_: Phase 7 task 1 is non-negotiable; ship before any production deploy of the dark theme so operators see real outage signals on the redesigned shell.
- **`useActiveBlock` polling overload**. _Mitigation_: 5s cadence + `AbortController` cleanup + exponential back-off on consecutive errors; verified by Phase 7 task 4 unmount test.
- **Schema migration drops production rows**. _Mitigation_: Phase 3 migrations include explicit DOWN sections, and `category` defaults existing rows to `"mercados"` before tightening the constraint.
- **i18n drift between locales**. _Mitigation_: Phase 7 task 5 (`i18n:check` script) blocks merges with asymmetric catalogs; Phase 7 task 7 lint rule rejects hardcoded UI strings.
- **English copy quality**. _Mitigation_: Phase 2 task 3 uses Spanish source as the seed; route through a native English review pass before Phase 4 ships (or accept iterative copy fixes per phase).
- **Locale routing collision with `/admin` middleware**. _Mitigation_: Phase 2 task 2 explicitly chains `next-intl/middleware` then admin auth; verify with manual test of `/es/admin/calendar` with and without cookie.
- **Spark-ui / Yarn / Inter creep from Roxom-markets habits**. _Mitigation_: Phase 1 task 4 (`DESIGN.md` update) explicitly documents that this repo is npm + Tailwind + DM Sans; reviewers reject any spark-ui imports.
- **Long functions persist past Phase 7**. _Mitigation_: Phase 7 task 10 has acceptance criteria tied to a 30-line ceiling and `createProgramBlock` reusing `hasBaseBlockConflict`; CI lint can later add `max-lines-per-function`.
- **Test coverage regression after raising tsconfig strictness**. _Mitigation_: Phase 7 ordering — tests (tasks 2–4) before tsconfig (task 6) so refactors land on a green test suite.
- **PRD drift (`product.md` vs design HTML)**. _Mitigation_: open product decision in Section 2 — block planning the disputed views until product reconciles.
