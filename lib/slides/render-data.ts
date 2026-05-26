import { SLIDE_TEMPLATES, type SlideTemplateId } from './registry';
import { demoData as mockGuestLineupData, getGuestLineupData } from './data/guests';
import { getWeatherSlideData } from './data/weather';
import type { SlideAsset } from '@/lib/types';
import type {
    CalendarEvent,
    DebtData,
    GuestLineupData,
    MarketsSatsData,
    SataData,
    StrcData,
    UsMarketOpenData,
    WeatherSlideData,
} from './types';

type Json = Record<string, unknown>;

export async function getSlideRenderData(templateId: SlideTemplateId, slide?: SlideAsset | null) {
    if (templateId === 'guest-lineup') {
        try {
            return { data: await getGuestLineupData({ slide }) };
        } catch {
            return { data: mockGuestLineupData() };
        }
    }

    if (templateId === 'weather') {
        try {
            return { data: await getWeatherSlideData({ slide }) };
        } catch {
            return { data: unavailableWeatherData() };
        }
    }
    const entry = SLIDE_TEMPLATES.find((template) => template.id === templateId);
    const raw = entry?.dataEndpoint ? await fetchSlideData(entry.dataEndpoint) : null;

    return adaptSlideData(templateId, raw);
}

async function fetchSlideData(endpoint: string) {
    const base =
        process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || 'http://127.0.0.1:3450';

    try {
        const response = await fetch(new URL(endpoint, base), { cache: 'no-store' });

        if (!response.ok) {
            return null;
        }

        return (await response.json()) as unknown;
    } catch {
        return null;
    }
}

function adaptSlideData(templateId: SlideTemplateId, raw: unknown): unknown {
    if (templateId === 'calendar') {
        return { events: pickEvents(raw) };
    }

    if (templateId === 'event') {
        const events = pickEvents(raw);

        return { selectedEventIds: events.slice(0, 2).map((event) => event.id), events };
    }

    if (templateId === 'event-modern') {
        const events = pickEvents(raw);

        return {
            selectedEventIds: events.slice(0, 4).map((event) => event.id),
            events,
            eventSlideTitle: 'Upcoming',
        };
    }

    if (templateId === 'strc') {
        return { data: pickNested(raw, 'strc') ?? mockStrcData() };
    }

    if (templateId === 'sata') {
        return { data: pickNested(raw, 'sata') ?? mockSataData() };
    }

    if (templateId === 'debt') {
        return { data: isObject(raw) ? raw : mockDebtData() };
    }

    if (templateId === 'guest-lineup') {
        return { data: isGuestLineupData(raw) ? raw : mockGuestLineupData() };
    }

    if (isMarketOpenTemplate(templateId)) {
        return { data: isObject(raw) ? raw : mockMarketOpenData(templateId) };
    }

    if (templateId === 'weather') {
        return { data: isObject(raw) ? raw : unavailableWeatherData() };
    }

    return { data: isObject(raw) ? raw : mockMarketsData() };
}

function pickEvents(raw: unknown): CalendarEvent[] {
    if (Array.isArray(raw)) {
        return raw as CalendarEvent[];
    }

    if (isObject(raw) && Array.isArray(raw.events)) {
        return raw.events as CalendarEvent[];
    }

    return mockEvents();
}

function pickNested(raw: unknown, key: string) {
    if (!isObject(raw)) {
        return null;
    }
    const value = raw[key];

    return isObject(value) ? value : null;
}

function isObject(value: unknown): value is Json {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isGuestLineupData(value: unknown): value is GuestLineupData {
    return isObject(value) && Array.isArray(value.guests);
}

function isMarketOpenTemplate(templateId: SlideTemplateId) {
    return [
        'us-market-open',
        'japan-market-open',
        'uk-market-open',
        'china-market-open',
        'saudi-market-open',
    ].includes(templateId);
}

function mockMarketsData(): MarketsSatsData {
    return {
        btcUsd: 103500,
        timestamp: new Date().toISOString(),
        metals: {
            gold: { usd: 3380, sats: 3265700, change24hPct: 0.4 },
            silver: { usd: 33.8, sats: 32657, change24hPct: -0.2 },
        },
        oil: {
            wti: { usd: 63.2, sats: 61063, change24hPct: 0.7 },
            brent: { usd: 66.5, sats: 64251, change24hPct: 0.5 },
        },
        copper: { usd: 4.75, sats: 4590, change24hPct: 0.1 },
        fx: {
            EUR: { usdPerUnit: 1.09, satsPerUnit: 1053 },
            JPY: { usdPerUnit: 0.0065, satsPerUnit: 6 },
            GBP: { usdPerUnit: 1.28, satsPerUnit: 1237 },
            USD: { usdPerUnit: 1, satsPerUnit: 966 },
        },
        stale: true,
    };
}

function mockDebtData(): DebtData {
    return {
        liveEstimateNow: 36000000000000,
        perSecond: 70000,
        annualFederalSpending: 6800000000000,
        annualBudgetDeficit: 1900000000000,
        btcPriceUsd: 103500,
        debtAsOf: new Date().toISOString(),
        debtSource: 'mock',
        btcPriceSource: 'mock',
        btcPriceUpdatedAt: new Date().toISOString(),
        population: 341784857,
        populationAsOf: '2025',
        populationSource: 'Census QuickFacts fallback',
        taxReturns: 163146000,
        taxReturnsAsOf: '2023',
        taxReturnsSource: 'IRS SOI fallback',
        gdpUsd: 29_184_900_000_000,
        gdpAsOf: '2025-Q1',
        gdpSource: 'FRED fallback',
        debtGdpNowPct: 119.8,
        debtGdpHistory: [
            { year: '1960', pct: 53.6 },
            { year: '1980', pct: 31.2 },
            { year: '2000', pct: 55.9 },
        ],
        debtGdpSource: 'FRED fallback',
        stale: true,
        warnings: ['mock debt data'],
    };
}

function mockMarketOpenData(templateId: SlideTemplateId): UsMarketOpenData {
    const updatedAt = new Date().toISOString();
    const preset = marketPreset(templateId);

    return {
        mode: 'demo',
        phase: 'pre-market',
        marketName: preset.marketName,
        regionLabel: preset.regionLabel,
        previewLabel: preset.previewLabel,
        nextBellAt: updatedAt,
        nextBellLabel: 'Opening bell',
        marketTimezone: preset.timezone,
        updatedAt,
        cacheSeconds: 0,
        stale: true,
        source: 'Demo board',
        instruments: preset.instruments.map(
            ([id, label, symbol, proxy, price, change, changePct]) =>
                marketIndex(id, label, symbol, proxy, price, change, changePct, updatedAt),
        ),
    };
}

function marketPreset(templateId: SlideTemplateId) {
    if (templateId === 'japan-market-open') {
        return {
            marketName: 'Japan Market',
            regionLabel: 'Japan index board / ETF proxy',
            previewLabel: 'Japan index board preview',
            timezone: 'Asia/Tokyo',
            instruments: [
                ['nikkei225', 'Nikkei 225', 'N225', '1321', 39280.5, 184.2, 0.47],
                ['topix', 'TOPIX', 'TOPIX', '1306', 2764.2, -6.4, -0.23],
                ['mothers', 'Growth 250', 'GROWTH250', '2516', 638.4, 3.8, 0.6],
                ['jpx400', 'JPX 400', 'JPX400', '1599', 25210.6, 88.5, 0.35],
            ] as const,
        };
    }

    if (templateId === 'uk-market-open') {
        return {
            marketName: 'UK Market',
            regionLabel: 'London index board / ETF proxy',
            previewLabel: 'London index board preview',
            timezone: 'Europe/London',
            instruments: [
                ['ftse100', 'FTSE 100', 'UKX', 'ISF', 8342.2, 28.4, 0.34],
                ['ftse250', 'FTSE 250', 'MCX', 'MIDD', 20680.7, -42.5, -0.21],
                ['aim100', 'AIM 100', 'AIM100', 'AIM', 3725.8, 11.2, 0.3],
                ['gbpusd', 'GBP/USD', 'GBP/USD', 'FXB', 1.276, 0.003, 0.24],
            ] as const,
        };
    }

    if (templateId === 'china-market-open') {
        return {
            marketName: 'China Market',
            regionLabel: 'China/HK index board / ETF proxy',
            previewLabel: 'China index board preview',
            timezone: 'Asia/Shanghai',
            instruments: [
                ['shanghai', 'Shanghai Composite', 'SHCOMP', 'ASHR', 3148.6, 13.8, 0.44],
                ['csi300', 'CSI 300', 'CSI300', 'ASHR', 3684.2, -9.4, -0.25],
                ['szcomp', 'Shenzhen Comp', 'SZCOMP', 'CNXT', 9812.5, 42.1, 0.43],
                ['hsi', 'Hang Seng', 'HSI', 'EWH', 18840.7, 96.5, 0.51],
            ] as const,
        };
    }

    if (templateId === 'saudi-market-open') {
        return {
            marketName: 'Saudi Market',
            regionLabel: 'Tadawul index board / ETF proxy',
            previewLabel: 'Saudi Tadawul board preview',
            timezone: 'Asia/Riyadh',
            instruments: [
                ['tasi', 'Tadawul TASI', 'TASI', 'KSA', 12184.2, 54.6, 0.45],
                ['mt30', 'MT30', 'MT30', 'KSA', 1512.8, -4.1, -0.27],
                ['aramco', 'Saudi Aramco', '2222.SR', 'KSA', 28.35, 0.12, 0.42],
                ['alrajhi', 'Al Rajhi Bank', '1120.SR', 'KSA', 87.4, 0.5, 0.58],
            ] as const,
        };
    }

    return {
        marketName: 'US Market',
        regionLabel: 'US index futures / ETF proxy',
        previewLabel: 'US index board preview',
        timezone: 'America/New_York',
        instruments: [
            ['sp500', 'S&P 500', 'ES', 'SPY', 6280.25, 12.4, 0.2],
            ['nasdaq100', 'Nasdaq 100', 'NQ', 'QQQ', 22890.75, -18.2, -0.08],
            ['dow', 'Dow', 'YM', 'DIA', 46210, 94.1, 0.2],
            ['russell2000', 'Russell 2000', 'RTY', 'IWM', 2264.5, 8.7, 0.39],
        ] as const,
    };
}

function marketIndex(
    id: string,
    label: string,
    symbol: string,
    proxySymbol: string,
    price: number,
    change: number,
    changePercent: number,
    updatedAt: string,
): UsMarketOpenData['instruments'][number] {
    return {
        id,
        label,
        symbol,
        proxySymbol,
        price,
        change,
        changePercent,
        source: 'mock',
        points: [
            { timestamp: updatedAt, price: price - change * 0.6 },
            { timestamp: updatedAt, price: price - change * 0.25 },
            { timestamp: updatedAt, price },
        ],
    };
}

function mockStrcData(): StrcData {
    return {
        strc: {
            price: 89.4,
            previousClose: 88.2,
            priceChange: 1.2,
            priceChangePercent: 1.36,
            negative: false,
            volume: 124000,
        },
        btc: { price: 103500 },
        dividends: [
            {
                period: 'May 2026',
                recordDate: '2026-05-15',
                payDate: '2026-05-30',
                usd: 0.72,
                rate: 0.008,
                btc: 0.00000695,
            },
        ],
        metrics: {
            parValue: 100,
            annualDiv: 8.64,
            annualRate: 0.0864,
            monthlyDiv: 0.72,
            monthlyDivBtc: 0.00000695,
            annualDivBtc: 0.0000835,
            effYield: 0.0966,
            marketCap: 1800000000,
            sharesOutstanding: 20100000,
            nextPayoutDate: '2026-05-30',
            nextRecordDate: '2026-05-15',
        },
        lastUpdate: new Date().toISOString(),
    };
}

function mockSataData(): SataData {
    return {
        preferred: {
            ticker: 'SATA',
            name: 'SATA Income ETF',
            price: 25.1,
            priceChange: 0.05,
            priceChangePercent: 0.2,
            volume: 52000,
            previousClose: 25.05,
        },
        btc: { price: 103500 },
        metrics: {
            monthlyDiv: 0.19,
            annualDiv: 2.28,
            monthlyDivBtc: 0.00000184,
            annualDivBtc: 0.000022,
            effYield: 0.0908,
            marketCap: 410000000,
            sharesOutstanding: 16300000,
            nextPayoutDate: '2026-05-30',
            nextRecordDate: '2026-05-15',
            companyName: 'SATA Income ETF',
            yearHigh: 26.2,
            yearLow: 23.7,
            avgVolume30D: 61000,
        },
        source: 'mock',
        lastUpdate: new Date().toISOString(),
    };
}

function unavailableWeatherData(): WeatherSlideData {
    return {
        available: false,
        locationName: 'Weather',
        temperatureC: null,
        feelsLikeC: null,
        humidityPct: null,
        windKph: null,
        condition: 'Unavailable',
        description: 'Weather data unavailable',
        iconCode: null,
        forecast: [],
        updatedAt: new Date().toISOString(),
        reason: 'weather endpoint unavailable',
    };
}

function mockEvents(): CalendarEvent[] {
    return [
        {
            id: 'mock-event-1',
            title: 'Market Open',
            description: 'Daily coverage and market context',
            image_url: null,
            start_date: new Date().toISOString().slice(0, 10),
            end_date: null,
            start_time: '07:40',
            end_time: '08:40',
            is_active: true,
            order_index: 1,
            color: '#22c55e',
            title_font: null,
            title_size: 'large',
            title_color: null,
            text_color: null,
            overlay_opacity: null,
            show_date_badge: true,
            location: 'RTV',
            schedule_times: [{ timezone: 'SF', time: '07:40' }],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        },
    ];
}
