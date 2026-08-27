import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetBtcCacheForTests } from './btc-cache';
import { __resetDebtCachesForTests, getDebtSlideData } from './debt';

const originalEnv = process.env;

describe('getDebtSlideData', () => {
    beforeEach(() => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date('2026-05-22T12:00:00.000Z'));
        vi.restoreAllMocks();
        vi.unstubAllGlobals();
        __resetBtcCacheForTests();
        __resetDebtCachesForTests();
        process.env = {
            ...originalEnv,
            DATA_PROVIDER_API_URL: 'https://data-provider.example',
        };
    });

    afterEach(() => {
        vi.useRealTimers();
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        __resetBtcCacheForTests();
        __resetDebtCachesForTests();
        process.env = originalEnv;
    });

    it('combines official debt, BTC, fiscal, and data-provider-api fiscal/context', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn<typeof fetch>()
                .mockResolvedValueOnce(
                    jsonResponse({
                        data: [
                            { record_date: '2026-05-21', tot_pub_debt_out_amt: '39000000000000' },
                            { record_date: '2026-05-20', tot_pub_debt_out_amt: '38999000000000' },
                        ],
                    }),
                )
                .mockResolvedValueOnce(jsonResponse(providerBtc('80000')))
                .mockResolvedValueOnce(
                    jsonResponse({
                        data: [
                            {
                                record_date: '2025-09-30',
                                record_calendar_month: '09',
                                current_month_gross_outly_amt: '7000000000000',
                                current_month_dfct_sur_amt: '-1800000000000',
                            },
                        ],
                    }),
                )
                .mockResolvedValueOnce(jsonResponse(providerFiscalContext())),
        );

        const data = await getDebtSlideData();

        expect(data.btcPriceUsd).toBe(80_000);
        expect(data.population).toBe(334_914_895);
        expect(data.taxReturns).toBeGreaterThan(100_000_000);
        expect(data.gdpUsd).toBe(29_184_900_000_000);
        expect(data.debtGdpNowPct).toBe(119.8);
        expect(data.debtSource).toMatch(/Treasury/);
        expect(data.stale).toBe(false);
    });

    it('falls back to Census + FRED when data-provider-api fiscal/context fails', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn<typeof fetch>()
                .mockResolvedValueOnce(
                    jsonResponse({
                        data: [
                            { record_date: '2026-05-21', tot_pub_debt_out_amt: '39000000000000' },
                            { record_date: '2026-05-20', tot_pub_debt_out_amt: '38999000000000' },
                        ],
                    }),
                )
                .mockResolvedValueOnce(jsonResponse(providerBtc('80000')))
                .mockResolvedValueOnce(
                    jsonResponse({
                        data: [
                            {
                                record_date: '2025-09-30',
                                record_calendar_month: '09',
                                current_month_gross_outly_amt: '7000000000000',
                                current_month_dfct_sur_amt: '-1800000000000',
                            },
                        ],
                    }),
                )
                .mockResolvedValueOnce(
                    new Response('upstream error', {
                        status: 503,
                        headers: { 'Content-Type': 'text/plain' },
                    }),
                )
                .mockResolvedValueOnce(
                    jsonResponse([
                        ['POP_2023', 'NAME', 'us'],
                        ['334914895', 'United States', '1'],
                    ]),
                )
                .mockResolvedValueOnce(csvResponse('observation_date,GDP\n2025-01-01,29184.9\n'))
                .mockResolvedValueOnce(
                    csvResponse(
                        'observation_date,GFDEGDQ188S\n1960-10-01,53.6\n1980-10-01,31.2\n2000-10-01,55.9\n2025-01-01,119.8\n',
                    ),
                ),
        );

        const data = await getDebtSlideData();

        expect(data.btcPriceUsd).toBe(80_000);
        expect(data.population).toBe(334_914_895);
        expect(data.gdpUsd).toBe(29_184_900_000_000);
        expect(data.debtGdpNowPct).toBe(119.8);
        expect(data.debtGdpHistory).toEqual([
            { year: '1960', pct: 53.6 },
            { year: '1980', pct: 31.2 },
            { year: '2000', pct: 55.9 },
        ]);
        expect(data.stale).toBe(false);
    });
});

function providerFiscalContext() {
    return {
        success: true,
        data: {
            population: { value: 334_914_895, year: '2023' },
            gdp: { value: 29_184_900_000_000, asOf: '2025-01-01' },
            debtToGdp: { value: 119.8, asOf: '2025-01-01' },
            stale: false,
        },
    };
}

function providerBtc(price: string) {
    return { success: true, data: { price: { live_price: price } } };
}

function jsonResponse(payload: unknown) {
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}

function csvResponse(payload: string) {
    return new Response(payload, {
        status: 200,
        headers: { 'Content-Type': 'text/csv' },
    });
}
