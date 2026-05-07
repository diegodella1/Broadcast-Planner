# RTVTime Admin Design System

## Register

Product UI for internal broadcast operations. Design serves fast scanning, scheduling confidence, and error correction.

## Visual Direction

- Light operational console: cool tinted neutrals, high contrast, restrained accent.
- Use OKLCH tokens from Tailwind. Avoid pure black, pure white, gradients, decorative motion, and nested cards.
- Accent `signal` is for primary actions, selected state, and operational emphasis only.
- State colors: success, warning, danger, info. Every critical state must include clear text, not color alone.

## Component Rules

- Buttons: `btn-primary` for one main action per area, `btn-secondary` for secondary commands.
- Containers: `surface-card` for repeated items and metrics, `surface-panel` for grouped tools.
- Filters: `chip` and `chip-active`.
- Labels: use `eyebrow` for compact section labels and metric labels.
- Forms: group related fields, keep controls at least 40px tall, use concrete placeholders.

## Copy

- Admin copy stays short, concrete, and action-oriented.
- Spanish UI text is preferred for operator-facing labels.
- Avoid explaining how the whole product works inside the UI. Each empty state should name the next action.
