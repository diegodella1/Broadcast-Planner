export type SlideTemplateId =
    | 'calendar'
    | 'debt'
    | 'event'
    | 'event-modern'
    | 'fx'
    | 'gold'
    | 'guest-lineup'
    | 'japan-market-open'
    | 'metals'
    | 'oil'
    | 'sata'
    | 'china-market-open'
    | 'saudi-market-open'
    | 'silver'
    | 'strc'
    | 'uk-market-open'
    | 'us-market-open'
    | 'weather';

export type SlideTemplateEntry = {
    readonly id: SlideTemplateId;
    readonly label: string;
    readonly description: string;
    readonly dataEndpoint: string | null;
};

export const SLIDE_TEMPLATES: ReadonlyArray<SlideTemplateEntry> = [
    {
        id: 'calendar',
        label: 'Calendar',
        description: 'Upcoming events list from the events table',
        dataEndpoint: '/api/slide-data/calendar',
    },
    {
        id: 'debt',
        label: 'US Debt',
        description: 'Live US national debt clock in BTC terms',
        dataEndpoint: '/api/slide-data/debt',
    },
    {
        id: 'event',
        label: 'Event',
        description: 'Featured event card(s) with image, date and timezone times',
        dataEndpoint: '/api/slide-data/calendar',
    },
    {
        id: 'event-modern',
        label: 'Event Modern',
        description: 'Retro-bordered event grid with month/year header',
        dataEndpoint: '/api/slide-data/calendar',
    },
    {
        id: 'fx',
        label: 'FX / Currency',
        description: 'Satoshis-per-unit for EUR, JPY, GBP and USD',
        dataEndpoint: '/api/slide-data/markets',
    },
    {
        id: 'gold',
        label: 'Gold',
        description: 'XAU price in sats and USD with 24 h change',
        dataEndpoint: '/api/slide-data/metals',
    },
    {
        id: 'guest-lineup',
        label: 'Guest Lineup',
        description: 'Rotating guest slate from the Supabase guests table',
        dataEndpoint: '/api/slide-data/guests',
    },
    {
        id: 'japan-market-open',
        label: 'Japan Market Open',
        description: 'Japan index board with countdown to Tokyo market bell',
        dataEndpoint: '/api/slide-data/japan-market-open',
    },
    {
        id: 'metals',
        label: 'Metals',
        description: 'Gold, silver, oil and copper 2×2 grid',
        dataEndpoint: '/api/slide-data/metals',
    },
    {
        id: 'oil',
        label: 'Oil',
        description: 'WTI and Brent crude oil prices in sats and USD',
        dataEndpoint: '/api/slide-data/markets',
    },
    {
        id: 'sata',
        label: 'SATA',
        description: 'SATA ETF dashboard with ATM and stats grid',
        dataEndpoint: '/api/slide-data/strc',
    },
    {
        id: 'china-market-open',
        label: 'China Market Open',
        description: 'China and Hong Kong index board with countdown to the market bell',
        dataEndpoint: '/api/slide-data/china-market-open',
    },
    {
        id: 'saudi-market-open',
        label: 'Saudi Market Open',
        description: 'Saudi Tadawul board with countdown to Riyadh market bell',
        dataEndpoint: '/api/slide-data/saudi-market-open',
    },
    {
        id: 'silver',
        label: 'Silver',
        description: 'XAG price in sats and USD with 24 h change',
        dataEndpoint: '/api/slide-data/metals',
    },
    {
        id: 'strc',
        label: 'STRC',
        description: 'STRC preferred stock dashboard with ATM and stats grid',
        dataEndpoint: '/api/slide-data/strc',
    },
    {
        id: 'uk-market-open',
        label: 'UK Market Open',
        description: 'London index board with countdown to LSE market bell',
        dataEndpoint: '/api/slide-data/uk-market-open',
    },
    {
        id: 'us-market-open',
        label: 'US Market Open',
        description: 'US index futures/ETF board with countdown to the market bell',
        dataEndpoint: '/api/slide-data/us-market-open',
    },
    {
        id: 'weather',
        label: 'Weather',
        description: 'Current conditions and forecast from OpenWeather',
        dataEndpoint: '/api/slide-data/weather',
    },
] as const;
