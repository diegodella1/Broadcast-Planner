import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __internals, __resetMarketsCachesForTests, getMarketsSatsData } from './markets';

vi.mock('./btc-cache', () => ({
    getBtcPriceUsd: vi.fn().mockResolvedValue(100_000),
}));

function jsonResponse(body: unknown, status = 200) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

const pythPayload = {
    parsed: [
        {
            id: '765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2',
            price: { price: '230000', conf: '1', expo: -2, publish_time: 1 },
            ema_price: { price: '229000', conf: '1', expo: -2, publish_time: 1 },
        },
        {
            id: 'f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e',
            price: { price: '2800', conf: '1', expo: -2, publish_time: 1 },
            ema_price: { price: '2790', conf: '1', expo: -2, publish_time: 1 },
        },
        {
            id: '6a60b0d1ea6809b47dbe599f24a71c8bda335aa5c77e503e7260cde5ba2f4694',
            price: { price: '7500', conf: '1', expo: -2, publish_time: 1 },
            ema_price: { price: '7400', conf: '1', expo: -2, publish_time: 1 },
        },
        {
            id: 'c96458d393fe9deb7a7d63a0ac41e2898a67a7750dbd166673279e06c868df0a',
            price: { price: '8000', conf: '1', expo: -2, publish_time: 1 },
            ema_price: { price: '7900', conf: '1', expo: -2, publish_time: 1 },
        },
    ],
};

const providerMetalsPayload = {
    success: true,
    data: [
        { symbol: 'XAU', name: 'Gold spot', price: 2450, changePercent: 1.25 },
        { symbol: 'XAG', name: 'Silver spot', price: 31, changePercent: -0.5 },
        { symbol: 'PLAT', name: 'Platinum', price: 1200, changePercent: 0.3 },
        { symbol: 'PALL', name: 'Palladium', price: 980, changePercent: 0.1 },
    ],
};

const providerFxPayload = {
    rates: { EUR: 0.92, JPY: 155.5, GBP: 0.79 },
    currencies: {
        EUR: { usdPerUnit: 1.087 },
        JPY: { usdPerUnit: 0.00643 },
        GBP: { usdPerUnit: 1.266 },
    },
    base: 'USD',
    timestamp: 1_748_340_000,
};

const eiaBrentText = `
  2026 May-18 to May-22 116.73 114.64 108.93 105.84 106.90
  2026 May-25 to May-29 102.75
`;

const eiaWtiText = `
  2026 May-18 to May-22 112.25 112.09 101.69 100.20 100.35
  2026 May-25 to May-29 97.63
`;

describe('getMarketsSatsData', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-22T12:00:00Z'));
        __resetMarketsCachesForTests();
        delete process.env.FX_API_URL;
        delete process.env.FX_API_KEY;
        process.env.DATA_PROVIDER_API_URL = 'https://data-provider.example';
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        __resetMarketsCachesForTests();
    });

    it('consumes data-provider-api /api/fx when available', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn<typeof fetch>()
                .mockResolvedValueOnce(jsonResponse(pythPayload))
                .mockResolvedValueOnce(jsonResponse(providerFxPayload))
                .mockResolvedValueOnce(jsonResponse({ success: true, data: [] }))
                .mockResolvedValueOnce(jsonResponse(providerMetalsPayload))
                .mockResolvedValueOnce(new Response(eiaBrentText))
                .mockResolvedValueOnce(new Response(eiaWtiText)),
        );

        const data = await getMarketsSatsData();

        expect(data.fx.EUR.usdPerUnit).toBeCloseTo(1.087);
        expect(data.fx.JPY.usdPerUnit).toBeCloseTo(0.00643);
        expect(data.fx.GBP.usdPerUnit).toBeCloseTo(1.266);
    });

    it('falls back to upstream FX when data-provider-api /api/fx fails', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn<typeof fetch>()
                .mockResolvedValueOnce(jsonResponse(pythPayload))
                .mockResolvedValueOnce(new Response('upstream error', { status: 503 }))
                .mockResolvedValueOnce(jsonResponse({ success: true, data: [] }))
                .mockResolvedValueOnce(jsonResponse(providerMetalsPayload))
                .mockResolvedValueOnce(new Response(eiaBrentText))
                .mockResolvedValueOnce(new Response(eiaWtiText))
                .mockResolvedValueOnce(
                    jsonResponse({ result: 'success', rates: { EUR: 0.92, JPY: 156, GBP: 0.79 } }),
                ),
        );

        const data = await getMarketsSatsData();

        expect(data.fx.EUR.usdPerUnit).toBeCloseTo(1 / 0.92);
        expect(data.fx.JPY.usdPerUnit).toBeCloseTo(1 / 156);
        expect(data.fx.GBP.usdPerUnit).toBeCloseTo(1 / 0.79);
    });

    it('serves the unified markets cache inside 30 seconds', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(pythPayload))
            .mockResolvedValueOnce(jsonResponse(providerFxPayload))
            .mockResolvedValueOnce(jsonResponse({ success: true, data: [] }))
            .mockResolvedValueOnce(jsonResponse(providerMetalsPayload))
            .mockResolvedValueOnce(new Response(eiaBrentText))
            .mockResolvedValueOnce(new Response(eiaWtiText));
        vi.stubGlobal('fetch', fetchMock);

        await getMarketsSatsData();
        vi.setSystemTime(new Date('2026-05-22T12:00:20Z'));
        await getMarketsSatsData();

        expect(fetchMock).toHaveBeenCalledTimes(6);
    });

    it('prefers the configured metals API for gold and silver', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn<typeof fetch>()
                .mockResolvedValueOnce(jsonResponse(pythPayload))
                .mockResolvedValueOnce(jsonResponse(providerFxPayload))
                .mockResolvedValueOnce(jsonResponse({ success: true, data: [] }))
                .mockResolvedValueOnce(jsonResponse(providerMetalsPayload))
                .mockResolvedValueOnce(new Response(eiaBrentText))
                .mockResolvedValueOnce(new Response(eiaWtiText)),
        );

        const data = await getMarketsSatsData();

        expect(data.metals.gold.usd).toBe(2450);
        expect(data.metals.gold.sats).toBe(2_450_000);
        expect(data.metals.gold.change24hPct).toBe(1.25);
        expect(data.metals.silver.usd).toBe(31);
        expect(data.metals.silver.sats).toBe(31_000);
        expect(data.metals.silver.change24hPct).toBe(-0.5);
    });

    it('prefers public EIA daily spot prices for oil over the hardcoded Pyth feeds', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn<typeof fetch>()
                .mockResolvedValueOnce(jsonResponse(pythPayload))
                .mockResolvedValueOnce(jsonResponse(providerFxPayload))
                .mockResolvedValueOnce(jsonResponse({ success: true, data: [] }))
                .mockResolvedValueOnce(jsonResponse(providerMetalsPayload))
                .mockResolvedValueOnce(new Response(eiaBrentText))
                .mockResolvedValueOnce(new Response(eiaWtiText)),
        );

        const data = await getMarketsSatsData();

        expect(data.oil.brent.usd).toBe(102.75);
        expect(data.oil.wti.usd).toBe(97.63);
    });
});

describe('parseEiaOilText', () => {
    it('uses the latest available price, even on partial weeks', () => {
        expect(__internals.parseEiaOilText(eiaBrentText)).toEqual({
            usd: 102.75,
            change24hPct: expect.any(Number),
        });
    });
});
