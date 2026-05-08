**Updated 2026-05-07. Dark broadcast direction adopted. The previous light operational OKLCH theme is DEPRECATED. Source of truth: `rtv-air-manager_2.html` (visual brief).**

# RTVTime Admin Design System

## Register

Product UI for internal broadcast operations. Design serves fast scanning, scheduling confidence, and error correction.

## Source of Truth

Visual brief: `/Users/macarenazalazar/Downloads/rtv-air-manager_2.html`. Token authority: same file, lines `:11-18`.

## Tokens

All tokens declared in `tailwind.config.ts` (P1.1). Component code MUST consume these by name.

| Token | Value | Usage |
|---|---|---|
| `surface-elevated-1` | `#191919` | Body / sidebar / panels |
| `surface-elevated-2` | `#1e1e1e` | Cards / blocks |
| `surface-selected-positive` | `#19241f` | Active block bg |
| `accent-positive` | `#1ae784` | Brand green / positive sentiment (chyron-canonical) |
| `accent-positive-hover` | `#16cc74` | Hover on accent surfaces |
| `accent-positive-glow` | `rgba(26,231,132,0.25)` | Outer glow shadow |
| `accent-positive-glow-strong` | `rgba(26,231,132,0.60)` | Strong glow on focus |
| `accent-live` | `#e7000b` | LIVE / ON AIR pill bg |
| `accent-live-text` | `#ff4d4d` | Live text on dark |
| `info-blue` | `#60a5fa` | Markets category badge |
| `warn-amber` | `#fbbf24` | Calendar / warning category |
| `info-violet` | `#c084fc` | Debt category |
| `negative-red` | `#ef4444` | Negative sentiment / breaking |

## Typography

- Family: DM Sans 400 / 500 / 600 / 700 / 800. Loaded via `next/font/google` in `app/layout.tsx`.
- Base size: 13px.
- Inline scale used in chyron: 9-15px. Eyebrow at 9px with uppercase and letter-spacing 1.5-2px.

## Radii and Shape

- Square edges.
- Default `--r: 10px` for small radius on cards and buttons.
- `border-radius: 50%` only on dot indicators (live dot, category dot).

## Motion

- `blink` 1.4s -- ON AIR pill, LIVE dot.
- `pd` 2s -- globe / earthcam preview.
- `bar-grow` -- market chart preview.
- All animations gated by `@media (prefers-reduced-motion: reduce)`.

## Layout

- Fixed 56px sidebar.
- Fixed 48px topbar.
- Main content column.
- Optional 240px right-rail operations panel.
- Responsive within main column only. NOT a 1920x1080 fixed canvas (chyron mood-board is the only fixed-canvas surface).

## Chyron-Canonical Brand Green

`#1ae784` (`accent-positive`) is RoxomTV's brand green. Used for positive sentiment, active states, brand accents. Same value and role as the chyron design system documented in `~/.claude/skills/roxom-design-tokens/SKILL.md`.

## Forbidden

- No raw hex or rgba in component code. Tokens only.
- No light theme.
- No imports from `/Users/macarenazalazar/Downloads/x-ready-to-implement` (chyron mood board, separate project).
- No spark-ui, no Yarn, no Inter. RoxomTV ships on npm and DM Sans.

## Out of Scope

- Light/dark toggle.
- Mobile responsive (broadcast operator console is desktop only).
- High-contrast mode.

## Copy

- Admin copy stays short, concrete, and action-oriented.
- Spanish UI text is preferred for operator-facing labels.
- Avoid explaining how the whole product works inside the UI. Each empty state should name the next action.
