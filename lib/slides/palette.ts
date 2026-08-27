/**
 * Hex color constants extracted verbatim from components/slides/*.
 *
 * Scope: only extractable usages (inline `style={{...}}` values, JSX string
 * props like SVG fill/stroke, and string-literal fallbacks). Tailwind arbitrary
 * values (e.g., `bg-[#07130f]`) are intentionally left in place because Tailwind
 * compiles arbitrary values at build time and cannot resolve dynamic strings.
 *
 * Values are byte-identical to the originals (including case sensitivity).
 * Migration to shared Broadcast Planner design-system tokens is deferred per product decision.
 */

export const eventSlide = {
    titleFallback: '#FFFFFF',
    textFallback: '#E5E7EB',
    gradientBlack: '#000',
} as const;

export const eventSlideModern = {
    borderFallback: '#10B981',
    titleAccent: '#10B981',
    titleFallback: '#FFFFFF',
    descFallback: '#D1D5DB',
    locationGray: '#A3A3A3',
    gridBg: '#0d0d0d',
    gradientDark: '#111',
    shadowOffset: '#0d0d0d',
} as const;

export const fxSlide = {
    euBlue: '#003399',
    euYellow: '#FFCC00',
    white: '#FFFFFF',
    jpRed: '#BC002D',
    ukBlue: '#012169',
    ukRed: '#C8102E',
    usRed: '#B22234',
    usCanton: '#3C3B6E',
    globeStroke: '#4169E1',
} as const;

export const metalsSlide = {
    bitcoinOrange: '#F7931A',
    labelGray: '#A5A5A5',
} as const;

export const oilSlide = {
    derrickGray: '#2C2C2C',
    barrelLight: '#8B4513',
    barrelDark: '#654321',
} as const;

export const guestLineupSlide = {
    bitcoinOrangeFallback: '#f7931a',
} as const;

export const usMarketOpenSlide = {
    sparklineUp: '#6ee7b7',
    sparklineDown: '#fca5a5',
} as const;

export const calendarSlide = {
    gradientBlack: '#000',
} as const;

/**
 * Shared palette used by both SataSlide and StrcSlide (price-data slides with
 * identical visual treatment).
 */
export const priceSlide = {
    bgPrimary: '#020617',
    borderSubtle: '#1E293B',
    textMuted: '#64748B',
    textSubtle: '#CBD5E1',
    textPrimary: '#F8FAFC',
    accentGold: '#FBBF24',
    accentGreen: '#22C55E',
    accentRed: '#EF4444',
} as const;
