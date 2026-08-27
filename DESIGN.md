# Obsidian Broadcast — Admin Design System

Updated 2026-07-29. Source references: `stitch_media_production_suite.zip`, especially
`obsidian_broadcast/DESIGN.md`. This file is the implementation source of truth.

## Direction

Industrial broadcast instrument for operators working under time pressure. The interface favors
fast scanning, explicit signal state and dense workspaces over decorative cards. Dark-only.

Recognition anchor: persistent on-air strip, monospaced timecodes and edge-to-edge technical panels.

## Tokens

Tokens live as CSS variables in `app/globals.css` and are exposed through semantic Tailwind names.
Component code must not introduce raw colors.

| Role           | Value     | Usage                       |
| -------------- | --------- | --------------------------- |
| Floor          | `#0a0a0a` | App background, video stage |
| Surface low    | `#131313` | Sidebar, rails              |
| Surface        | `#1e1e1e` | Panels, controls            |
| Surface high   | `#2a2a2a` | Hover and selected rows     |
| Overlay        | `#353534` | Drawers, popovers           |
| Primary        | `#8fb3ff` | Actions, focus, selection   |
| Primary strong | `#4d8eff` | High-emphasis interaction   |
| Secondary      | `#d0bcff` | Creative/graphics context   |
| Ready          | `#10b981` | Healthy, ready, standby     |
| Recording      | `#f59e0b` | Warning and recording       |
| Live           | `#ef4444` | On-air and destructive only |

Green, amber and red are status colors. They must not represent ordinary navigation or primary
actions.

## Typography

- Display: Hanken Grotesk 600–700 for page and panel titles.
- UI: Inter 400–700 for controls and prose.
- Technical: JetBrains Mono 400–700 for timecodes, identifiers and machine state.
- Labels use uppercase, 11px, 0.08em tracking.

## Layout

- Desktop: fixed 256px sidebar, 64px topbar and persistent status strip.
- Workspaces use edge-to-edge panels separated by 1px borders.
- 4px base rhythm; normal panel padding 12–16px.
- Tablet: sidebar becomes a menu and secondary panels stack or become drawers.
- Mobile is an access fallback, not the primary operating target.

## Components

- Panels use tonal separation and borders, not heavy shadows.
- Tables and queues use dense 56–64px rows with a blue left edge for selection.
- Inspectors open on the right and retain context.
- Buttons use 4px radii; status chips may be pill-shaped.
- Time-sensitive controls show their current state and require confirmation when destructive.
- Empty states name the next valid action.

## Motion and Accessibility

- Motion is limited to live/recording pulses, drawer transitions and direct interaction feedback.
- All animation is disabled by `prefers-reduced-motion`.
- Focus uses the primary blue token and remains visible on every interactive element.
- Preserve keyboard drag-and-drop, modal focus handling, semantic labels and WCAG AA contrast.

## Boundaries

- Admin UI changes must not leak into `/output/*` broadcast plates.
- Keep existing API, auth, server-action and route contracts unless a product change explicitly
  requires otherwise.
- No decorative controls without working behavior.
