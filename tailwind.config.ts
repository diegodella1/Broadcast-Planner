import defaultTheme from 'tailwindcss/defaultTheme';

import type { Config } from 'tailwindcss';

// NOTE: bespoke chyron-derived dark palette is intentional. Migration to the
// Shared Broadcast Planner design-system preset is deferred — to be picked up alongside
// the on-air plates visual remodel workstream (see README "remodel the visual
// design of on-air plates"). When that lands, replace the inline color tokens
// below with the design-system preset import.
const config: Config = {
    content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['var(--font-inter)', ...defaultTheme.fontFamily.sans],
                display: ['var(--font-hanken)', ...defaultTheme.fontFamily.sans],
                mono: ['var(--font-jetbrains-mono)', ...defaultTheme.fontFamily.mono],
            },
            colors: {
                ink: 'var(--obsidian-text)',
                muted: 'var(--obsidian-text-muted)',
                panel: 'var(--obsidian-floor)',
                'panel-soft': 'var(--obsidian-surface-low)',
                surface: 'var(--obsidian-surface)',
                'surface-high': 'var(--obsidian-surface-high)',
                overlay: 'var(--obsidian-overlay)',
                line: 'var(--obsidian-line)',
                'line-strong': 'var(--obsidian-line-strong)',
                signal: 'var(--obsidian-primary)',
                warn: '#fbbf24',
                'warn-soft': 'rgba(251,191,36,0.1)',
                'warn-line': 'rgba(251,191,36,0.3)',
                'warn-strong': '#fbbf24',
                danger: '#ef4444',
                'danger-soft': 'rgba(239,68,68,0.1)',
                'danger-line': 'rgba(239,68,68,0.3)',
                'danger-strong': '#ef4444',
                success: '#10b981',
                'success-soft': 'rgba(16,185,129,0.1)',
                'success-line': 'rgba(16,185,129,0.3)',
                'success-strong': '#34d399',
                info: '#8fb3ff',
                'info-soft': 'rgba(77,142,255,0.1)',
                'info-line': 'rgba(77,142,255,0.35)',
                'info-strong': '#adc6ff',
                'surface-elevated-1': 'var(--obsidian-surface-low)',
                'surface-elevated-2': 'var(--obsidian-surface)',
                'surface-selected-positive': 'rgba(77,142,255,0.13)',
                'accent-positive': 'var(--obsidian-primary)',
                'accent-positive-hover': '#6d9fff',
                'accent-positive-glow': 'rgba(77,142,255,0.22)',
                'accent-positive-glow-strong': 'rgba(77,142,255,0.48)',
                'accent-live': '#e7000b',
                'accent-live-text': '#ff4d4d',
                'info-blue': '#8fb3ff',
                'warn-amber': '#fbbf24',
                'info-violet': '#d0bcff',
                'negative-red': '#ef4444',
            },
            boxShadow: {
                'accent-positive-glow': '0 0 24px 0 rgba(77,142,255,0.18)',
                'accent-positive-glow-strong': '0 0 8px 0 rgba(77,142,255,0.48)',
            },
        },
    },
    plugins: [],
};

export default config;
