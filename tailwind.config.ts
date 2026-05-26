import defaultTheme from 'tailwindcss/defaultTheme';

import type { Config } from 'tailwindcss';

const config: Config = {
    content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}', './lib/**/*.{ts,tsx}'],
    theme: {
        extend: {
            fontFamily: {
                sans: ['var(--font-dm-sans)', ...defaultTheme.fontFamily.sans],
            },
            colors: {
                // Legacy OKLCH semantic names remapped to dark-theme equivalents so
                // components that still reference bg-panel / text-ink / text-muted etc.
                // render against the chyron-derived dark palette.
                ink: 'rgba(255,255,255,0.92)',
                muted: 'rgba(255,255,255,0.6)',
                panel: '#1e1e1e',
                'panel-soft': '#191919',
                surface: '#191919',
                line: 'rgba(255,255,255,0.1)',
                'line-strong': 'rgba(255,255,255,0.2)',
                signal: '#1ae784',
                warn: '#fbbf24',
                'warn-soft': 'rgba(251,191,36,0.1)',
                'warn-line': 'rgba(251,191,36,0.3)',
                'warn-strong': '#fbbf24',
                danger: '#ef4444',
                'danger-soft': 'rgba(239,68,68,0.1)',
                'danger-line': 'rgba(239,68,68,0.3)',
                'danger-strong': '#ef4444',
                success: '#1ae784',
                'success-soft': 'rgba(26,231,132,0.1)',
                'success-line': 'rgba(26,231,132,0.3)',
                'success-strong': '#1ae784',
                info: '#60a5fa',
                'info-soft': 'rgba(96,165,250,0.1)',
                'info-line': 'rgba(96,165,250,0.3)',
                'info-strong': '#60a5fa',
                'surface-elevated-1': '#191919',
                'surface-elevated-2': '#1e1e1e',
                'surface-selected-positive': '#19241f',
                'accent-positive': '#1ae784',
                'accent-positive-hover': '#16cc74',
                'accent-positive-glow': 'rgba(26,231,132,0.25)',
                'accent-positive-glow-strong': 'rgba(26,231,132,0.60)',
                'accent-live': '#e7000b',
                'accent-live-text': '#ff4d4d',
                'info-blue': '#60a5fa',
                'warn-amber': '#fbbf24',
                'info-violet': '#c084fc',
                'negative-red': '#ef4444',
            },
            boxShadow: {
                'accent-positive-glow': '0 0 24px 0 rgba(26,231,132,0.25)',
                'accent-positive-glow-strong': '0 0 8px 0 rgba(26,231,132,0.60)',
            },
        },
    },
    plugins: [],
};

export default config;
