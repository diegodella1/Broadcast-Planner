import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetChinaMarketOpenCacheForTests, getChinaMarketOpenData } from './china-market-open';
import { __resetJapanMarketOpenCacheForTests, getJapanMarketOpenData } from './japan-market-open';
import { __resetSaudiMarketOpenCacheForTests, getSaudiMarketOpenData } from './saudi-market-open';
import { __resetUkMarketOpenCacheForTests, getUkMarketOpenData } from './uk-market-open';

function stooqResponse(url: string | URL | Request) {
    const value = typeof url === 'string' ? url : url instanceof URL ? url.toString() : url.url;
    const symbol = new URL(value).searchParams.get('s') ?? 'UNKNOWN';

    return new Response(
        [
            'Symbol,Date,Time,Open,High,Low,Close,Volume',
            `${symbol},2026-05-22,22:00:21,100,105,99,102,12345`,
        ].join('\n'),
        {
            status: 200,
            headers: { 'Content-Type': 'text/csv' },
        },
    );
}

describe('regional market open boards', () => {
    beforeEach(() => {
        delete process.env.JAPAN_MARKET_DATA_URL;
        delete process.env.UK_MARKET_DATA_URL;
        delete process.env.CHINA_MARKET_DATA_URL;
        delete process.env.SAUDI_MARKET_DATA_URL;
        __resetJapanMarketOpenCacheForTests();
        __resetUkMarketOpenCacheForTests();
        __resetChinaMarketOpenCacheForTests();
        __resetSaudiMarketOpenCacheForTests();
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        __resetJapanMarketOpenCacheForTests();
        __resetUkMarketOpenCacheForTests();
        __resetChinaMarketOpenCacheForTests();
        __resetSaudiMarketOpenCacheForTests();
    });

    it('uses Stooq boards when providers are not configured', async () => {
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockImplementation((url) => Promise.resolve(stooqResponse(url)));
        vi.stubGlobal('fetch', fetchMock);

        await expect(
            getJapanMarketOpenData(new Date('2026-05-22T00:00:00Z')),
        ).resolves.toMatchObject({
            mode: 'live',
            marketName: 'Japan Market',
            marketTimezone: 'Asia/Tokyo',
            source: 'Stooq delayed quotes',
        });
        await expect(getUkMarketOpenData(new Date('2026-05-22T07:00:00Z'))).resolves.toMatchObject({
            mode: 'live',
            marketName: 'UK Market',
            marketTimezone: 'Europe/London',
            source: 'Stooq delayed quotes',
        });
        await expect(
            getChinaMarketOpenData(new Date('2026-05-22T01:00:00Z')),
        ).resolves.toMatchObject({
            mode: 'live',
            marketName: 'China Market',
            marketTimezone: 'Asia/Shanghai',
            source: 'Stooq delayed quotes',
        });
        await expect(
            getSaudiMarketOpenData(new Date('2026-05-22T07:00:00Z')),
        ).resolves.toMatchObject({
            mode: 'live',
            marketName: 'Saudi Market',
            marketTimezone: 'Asia/Riyadh',
            source: 'Stooq delayed quotes',
        });

        expect(fetchMock).toHaveBeenCalled();
    });
});
