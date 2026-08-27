/**
 * US debt clock data fetcher.
 * Source: data-provider fiscal endpoints (Treasury MTS + total public debt outstanding).
 * Official debt context (population, GDP, debt-to-GDP) is preferred from
 * data-provider-api `/api/fiscal/context`, with Census + FRED direct fetches as fallback.
 * Ported from backgroundclima/lib/debt.ts + app/api/debt/route.ts.
 */

import type { DebtData } from '@/lib/slides/types';

import { getBtcPriceData } from './btc-cache';
import { getDataProviderConfig } from './provider-config';

const FISCAL_PROXY_BASE_URL =
    process.env.FISCAL_PROXY_BASE_URL ?? 'https://data-provider.vercel.app/api/fiscal';
const FISCAL_DEBT_URL = `${FISCAL_PROXY_BASE_URL.replace(/\/$/, '')}/debt`;
const FISCAL_REVENUE_URL = `${FISCAL_PROXY_BASE_URL.replace(/\/$/, '')}/revenue`;

const DEBT_CACHE_DURATION_MS = 15 * 60 * 1000;
const MTS_CACHE_DURATION_MS = 24 * 60 * 60 * 1000;

const TREASURY_DEBT_TIMEOUT_MS = 7_000;
const TREASURY_MTS_TIMEOUT_MS = 5_000;
const OFFICIAL_CONTEXT_TIMEOUT_MS = 5_000;

const CENSUS_POPULATION_FALLBACK = {
    population: 341_784_857,
    asOf: '2025',
    source: 'U.S. Census QuickFacts estimate fallback',
};

const IRS_TAX_RETURNS_FALLBACK = {
    taxReturns: 163_146_000,
    asOf: 'Tax Year 2023',
    source: 'IRS SOI Publication 1304 fallback',
};

const GDP_FALLBACK = {
    gdpUsd: 29_184_900_000_000,
    asOf: '2025-Q1',
    source: 'FRED GDP fallback',
};

const DEBT_GDP_FALLBACK = {
    nowPct: 119.8,
    history: [
        { year: '1960', pct: 53.6 },
        { year: '1980', pct: 31.2 },
        { year: '2000', pct: 55.9 },
    ],
    source: 'FRED GFDEGDQ188S fallback',
};

const RETRYABLE_HTTP_STATUS = new Set([
    408, 425, 429, 500, 502, 503, 504, 520, 522, 523, 524, 525, 526, 530,
]);

export type DebtRow = { recordDate: Date; totalDebt: number };

export type DebtCalculation = {
    latestDateUTC: string;
    latestTotal: number;
    perSecond: number;
    estimatedTodayDelta: number;
    liveNow: number;
    lastDelta: number;
};

type DebtApiResponse = {
    data?: Array<{ record_date?: string; tot_pub_debt_out_amt?: string }>;
};

type MtsTable1ApiRow = {
    record_date: string;
    record_calendar_month: string;
    current_month_gross_outly_amt: string;
    current_month_dfct_sur_amt: string;
};

type MtsTable1ApiResponse = {
    success?: boolean;
    data?: MtsTable1ApiRow[];
};

type DebtCacheEntry = { data: DebtData; timestamp: number };
type MtsCacheEntry = { annualSpending: number; annualDeficit: number; timestamp: number };
type OfficialContextCacheEntry = { data: OfficialDebtContext; timestamp: number };

type OfficialDebtContext = {
    population: number;
    populationAsOf: string;
    populationSource: string;
    taxReturns: number;
    taxReturnsAsOf: string;
    taxReturnsSource: string;
    gdpUsd: number;
    gdpAsOf: string;
    gdpSource: string;
    debtGdpNowPct: number;
    debtGdpHistory: Array<{ year: string; pct: number }>;
    debtGdpSource: string;
    stale: boolean;
    warnings: string[];
};

let debtCache: DebtCacheEntry | null = null;
let mtsCache: MtsCacheEntry | null = null;
let officialContextCache: OfficialContextCacheEntry | null = null;

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => {
        setTimeout(resolve, ms);
    });
}

async function fetchWithRetry(
    url: string,
    init: Omit<RequestInit, 'signal'>,
    label: string,
    options: { attempts: number; timeoutMs: number },
): Promise<Response> {
    let lastError: unknown;
    const { attempts, timeoutMs } = options;

    for (let attempt = 1; attempt <= attempts; attempt += 1) {
        try {
            const response = await fetch(url, {
                ...init,
                signal: AbortSignal.timeout(timeoutMs),
            });

            if (response.ok) {
                return response;
            }

            if (attempt < attempts && RETRYABLE_HTTP_STATUS.has(response.status)) {
                await delay(300 * attempt);
                continue;
            }
            throw new Error(`${label} API error: ${response.status}`);
        } catch (error) {
            lastError = error;

            if (attempt < attempts) {
                await delay(300 * attempt);
                continue;
            }
        }
    }
    throw lastError instanceof Error ? lastError : new Error(`${label} API request failed`);
}

export function parseDebtApi(apiResponse: DebtApiResponse): DebtRow[] {
    if (!apiResponse.data || !Array.isArray(apiResponse.data)) {
        throw new Error('Invalid API response format');
    }
    const rows: DebtRow[] = [];

    for (const item of apiResponse.data) {
        if (!item.record_date || !item.tot_pub_debt_out_amt) {
            continue;
        }
        const recordDate = new Date(item.record_date);
        const totalDebt = Math.round(Number.parseFloat(item.tot_pub_debt_out_amt));

        if (!Number.isFinite(totalDebt) || Number.isNaN(recordDate.getTime())) {
            continue;
        }
        rows.push({ recordDate, totalDebt });
    }
    rows.sort((a, b) => b.recordDate.getTime() - a.recordDate.getTime());

    return rows;
}

export function computeRate(rows: DebtRow[]): DebtCalculation {
    if (rows.length < 2) {
        throw new Error('Need at least 2 data points to compute rate');
    }
    const latest = rows[0]!;
    const latestDateUTC = latest.recordDate.toISOString();
    const latestTotal = latest.totalDebt;

    let lastDelta = 0;
    let previousRecord: DebtRow | null = null;

    for (let i = 0; i < rows.length; i++) {
        const current = rows[i]!;

        for (let j = i + 1; j < rows.length; j++) {
            const candidate = rows[j]!;
            const currentDay = new Date(current.recordDate);
            currentDay.setHours(0, 0, 0, 0);
            const candidateDay = new Date(candidate.recordDate);
            candidateDay.setHours(0, 0, 0, 0);

            if (currentDay.getTime() !== candidateDay.getTime()) {
                previousRecord = candidate;
                lastDelta = current.totalDebt - candidate.totalDebt;
                break;
            }
        }

        if (previousRecord) {
            break;
        }
    }

    if (lastDelta === 0 && rows.length >= 2) {
        const first = rows[0]!;
        const second = rows[1]!;
        const timeDiff = first.recordDate.getTime() - second.recordDate.getTime();
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

        if (daysDiff > 0) {
            lastDelta = (first.totalDebt - second.totalDebt) / daysDiff;
        }
    }

    let totalChange = 0;
    let dayCount = 0;

    for (let i = 0; i < Math.min(rows.length - 1, 7); i++) {
        const current = rows[i]!;
        const next = rows[i + 1]!;
        const timeDiff = current.recordDate.getTime() - next.recordDate.getTime();
        const daysDiff = timeDiff / (1000 * 60 * 60 * 24);

        if (daysDiff > 0 && daysDiff <= 2) {
            totalChange += (current.totalDebt - next.totalDebt) / daysDiff;
            dayCount += 1;
        }
    }
    const avgDailyChange = dayCount > 0 ? totalChange / dayCount : lastDelta;
    const perSecond = avgDailyChange / (24 * 60 * 60);

    const now = new Date();
    const secondsSinceLastRecord = (now.getTime() - latest.recordDate.getTime()) / 1000;
    const estimatedTotalDelta = perSecond * secondsSinceLastRecord;
    const liveNow = latestTotal + estimatedTotalDelta;

    const todayStart = new Date(now);
    todayStart.setHours(0, 0, 0, 0);
    const secondsSinceMidnight = (now.getTime() - todayStart.getTime()) / 1000;
    const estimatedTodayDelta = perSecond * secondsSinceMidnight;

    return {
        latestDateUTC,
        latestTotal,
        perSecond,
        estimatedTodayDelta,
        liveNow,
        lastDelta: avgDailyChange,
    };
}

async function getFederalSpendingAndDeficit(): Promise<{
    annualSpending: number;
    annualDeficit: number;
}> {
    const now = Date.now();

    if (mtsCache && now - mtsCache.timestamp < MTS_CACHE_DURATION_MS) {
        return { annualSpending: mtsCache.annualSpending, annualDeficit: mtsCache.annualDeficit };
    }

    try {
        const response = await fetchWithRetry(
            FISCAL_REVENUE_URL,
            { cache: 'no-store' },
            'MTS Table 1',
            { attempts: 1, timeoutMs: TREASURY_MTS_TIMEOUT_MS },
        );
        const json = (await response.json()) as MtsTable1ApiResponse;

        if (json.success === false) {
            throw new Error('Fiscal revenue proxy returned success=false');
        }

        if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
            throw new Error('No MTS Table 1 data returned');
        }
        const parsedRows = json.data
            .map((row) => ({
                row,
                spending: Number.parseFloat(row.current_month_gross_outly_amt || '0'),
            }))
            .filter(({ spending }) => Number.isFinite(spending) && spending > 0);

        if (parsedRows.length === 0) {
            throw new Error('No valid MTS Table 1 spending rows returned');
        }

        const pickBest = (rows: typeof parsedRows) => {
            if (rows.length === 0) {
                return null;
            }

            return rows.reduce((best, current) =>
                current.spending > best.spending ? current : best,
            );
        };
        const september = pickBest(
            parsedRows.filter(({ row }) => row.record_calendar_month === '09'),
        );
        const target = september?.row ?? pickBest(parsedRows)?.row;

        if (!target) {
            throw new Error('No fallback MTS row available');
        }

        const fytdSpending = Number.parseFloat(target.current_month_gross_outly_amt || '0');
        const fytdDeficit = Number.parseFloat(target.current_month_dfct_sur_amt || '0');
        const result = { annualSpending: fytdSpending, annualDeficit: Math.abs(fytdDeficit) };
        mtsCache = { ...result, timestamp: now };

        return result;
    } catch (error) {
        console.error('[lib/slides/data/debt.ts:getFederalSpendingAndDeficit]', error);

        if (mtsCache) {
            return {
                annualSpending: mtsCache.annualSpending,
                annualDeficit: mtsCache.annualDeficit,
            };
        }

        return { annualSpending: 0, annualDeficit: 0 };
    }
}

type DataProviderFiscalContextEnvelope = {
    success?: boolean;
    data?: DataProviderFiscalContextPayload;
} & Partial<DataProviderFiscalContextPayload>;

type DataProviderFiscalContextPayload = {
    population?: { value?: number; year?: string | number };
    gdp?: { value?: number; asOf?: string };
    debtToGdp?: { value?: number; asOf?: string };
    stale?: boolean;
};

function mapDataProviderFiscalContext(
    payload: DataProviderFiscalContextPayload,
): OfficialDebtContext {
    const populationValue = payload.population?.value;
    const populationYear = payload.population?.year;
    const gdpValue = payload.gdp?.value;
    const gdpAsOf = payload.gdp?.asOf;
    const debtToGdpValue = payload.debtToGdp?.value;
    const debtToGdpAsOf = payload.debtToGdp?.asOf;

    if (
        typeof populationValue !== 'number' ||
        !Number.isFinite(populationValue) ||
        populationValue <= 0 ||
        typeof gdpValue !== 'number' ||
        !Number.isFinite(gdpValue) ||
        gdpValue <= 0 ||
        typeof debtToGdpValue !== 'number' ||
        !Number.isFinite(debtToGdpValue) ||
        typeof gdpAsOf !== 'string' ||
        typeof debtToGdpAsOf !== 'string'
    ) {
        throw new Error('Invalid data-provider-api fiscal/context payload');
    }
    const stale = Boolean(payload.stale);
    const warnings: string[] = stale
        ? ['data-provider-api fiscal/context reports upstream data is stale']
        : [];

    return {
        population: populationValue,
        populationAsOf: String(populationYear ?? ''),
        populationSource: 'U.S. Census Population Estimates API',
        taxReturns: IRS_TAX_RETURNS_FALLBACK.taxReturns,
        taxReturnsAsOf: IRS_TAX_RETURNS_FALLBACK.asOf,
        taxReturnsSource: IRS_TAX_RETURNS_FALLBACK.source,
        gdpUsd: gdpValue,
        gdpAsOf,
        gdpSource: 'FRED GDP',
        debtGdpNowPct: debtToGdpValue,
        debtGdpHistory: DEBT_GDP_FALLBACK.history,
        debtGdpSource: 'FRED GFDEGDQ188S',
        stale,
        warnings,
    };
}

async function fetchFromDataProviderApi(): Promise<OfficialDebtContext | null> {
    const provider = getDataProviderConfig();

    if (!provider) {
        return null;
    }
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (provider.apiKey) {
        headers['x-api-key'] = provider.apiKey;
    }

    const response = await fetch(`${provider.baseUrl}/api/fiscal/context`, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(OFFICIAL_CONTEXT_TIMEOUT_MS),
    });

    if (!response.ok) {
        throw new Error(`data-provider-api fiscal/context error: ${response.status}`);
    }
    const envelope = (await response.json()) as DataProviderFiscalContextEnvelope;
    const payload: DataProviderFiscalContextPayload =
        envelope.success && envelope.data ? envelope.data : envelope;

    return mapDataProviderFiscalContext(payload);
}

async function fetchOfficialDebtContextFromUpstream(): Promise<OfficialDebtContext> {
    const warnings: string[] = [];
    const [population, gdp, debtGdp] = await Promise.all([
        fetchCensusPopulation().catch((error) => {
            console.error('[lib/slides/data/debt.ts:fetchCensusPopulation]', error);
            warnings.push('Census population unavailable; using documented fallback');

            return { ...CENSUS_POPULATION_FALLBACK, stale: true };
        }),
        fetchFredGdp().catch((error) => {
            console.error('[lib/slides/data/debt.ts:fetchFredGdp]', error);
            warnings.push('FRED GDP unavailable; using documented fallback');

            return { ...GDP_FALLBACK, stale: true };
        }),
        fetchFredDebtGdp().catch((error) => {
            console.error('[lib/slides/data/debt.ts:fetchFredDebtGdp]', error);
            warnings.push('FRED debt/GDP unavailable; using documented fallback');

            return { ...DEBT_GDP_FALLBACK, stale: true };
        }),
    ]);

    return {
        population: population.population,
        populationAsOf: population.asOf,
        populationSource: population.source,
        taxReturns: IRS_TAX_RETURNS_FALLBACK.taxReturns,
        taxReturnsAsOf: IRS_TAX_RETURNS_FALLBACK.asOf,
        taxReturnsSource: IRS_TAX_RETURNS_FALLBACK.source,
        gdpUsd: gdp.gdpUsd,
        gdpAsOf: gdp.asOf,
        gdpSource: gdp.source,
        debtGdpNowPct: debtGdp.nowPct,
        debtGdpHistory: debtGdp.history,
        debtGdpSource: debtGdp.source,
        stale: Boolean(population.stale || gdp.stale || debtGdp.stale),
        warnings,
    };
}

async function getOfficialDebtContext(): Promise<OfficialDebtContext> {
    const now = Date.now();

    if (officialContextCache && now - officialContextCache.timestamp < MTS_CACHE_DURATION_MS) {
        return officialContextCache.data;
    }
    const dataProviderApiData = await fetchFromDataProviderApi().catch((error) => {
        console.warn('[lib/slides/data/debt.ts:fetchFromDataProviderApi]', error);

        return null;
    });
    const data = dataProviderApiData ?? (await fetchOfficialDebtContextFromUpstream());
    officialContextCache = { data, timestamp: now };

    return data;
}

async function fetchCensusPopulation(): Promise<{
    population: number;
    asOf: string;
    source: string;
    stale?: boolean;
}> {
    const response = await fetch(
        'https://api.census.gov/data/2023/pep/population?get=POP_2023,NAME&for=us:*',
        {
            cache: 'no-store',
            signal: AbortSignal.timeout(OFFICIAL_CONTEXT_TIMEOUT_MS),
        },
    );

    if (!response.ok) {
        throw new Error(`Census API error: ${response.status}`);
    }
    const rows = (await response.json()) as unknown;

    if (!Array.isArray(rows) || !Array.isArray(rows[1])) {
        throw new Error('Invalid Census payload');
    }
    const value = Number(rows[1][0]);

    if (!Number.isFinite(value) || value <= 0) {
        throw new Error('Invalid Census population');
    }

    return {
        population: value,
        asOf: '2023',
        source: 'U.S. Census Population Estimates API',
    };
}

async function fetchFredGdp(): Promise<{
    gdpUsd: number;
    asOf: string;
    source: string;
    stale?: boolean;
}> {
    const observations = await fetchFredCsv('GDP');
    const latest = latestObservation(observations);

    if (!latest) {
        throw new Error('No FRED GDP observations');
    }

    return {
        gdpUsd: latest.value * 1_000_000_000,
        asOf: latest.date,
        source: 'FRED GDP',
    };
}

async function fetchFredDebtGdp(): Promise<{
    nowPct: number;
    history: Array<{ year: string; pct: number }>;
    source: string;
    stale?: boolean;
}> {
    const observations = await fetchFredCsv('GFDEGDQ188S');
    const latest = latestObservation(observations);

    if (!latest) {
        throw new Error('No FRED debt/GDP observations');
    }
    const history = ['1960', '1980', '2000'].map((year) => ({
        year,
        pct:
            annualObservation(observations, year) ??
            DEBT_GDP_FALLBACK.history.find((item) => item.year === year)!.pct,
    }));

    return {
        nowPct: latest.value,
        history,
        source: 'FRED GFDEGDQ188S',
    };
}

async function fetchFredCsv(seriesId: string): Promise<Array<{ date: string; value: number }>> {
    const response = await fetch(
        `https://fred.stlouisfed.org/graph/fredgraph.csv?id=${encodeURIComponent(seriesId)}`,
        {
            cache: 'no-store',
            signal: AbortSignal.timeout(OFFICIAL_CONTEXT_TIMEOUT_MS),
        },
    );

    if (!response.ok) {
        throw new Error(`FRED ${seriesId} error: ${response.status}`);
    }
    const csv = await response.text();

    return csv
        .trim()
        .split(/\r?\n/)
        .slice(1)
        .map((line) => {
            const [date, rawValue] = line.split(',');
            const value = Number(rawValue);

            return { date: date ?? '', value };
        })
        .filter((item) => item.date && Number.isFinite(item.value));
}

function latestObservation(observations: Array<{ date: string; value: number }>) {
    return observations.at(-1) ?? null;
}

function annualObservation(observations: Array<{ date: string; value: number }>, year: string) {
    const matching = observations.filter((item) => item.date.startsWith(year));

    if (!matching.length) {
        return null;
    }

    return matching[matching.length - 1]!.value;
}

export async function getDebtSlideData(): Promise<DebtData> {
    const now = Date.now();

    if (debtCache && now - debtCache.timestamp < DEBT_CACHE_DURATION_MS) {
        return debtCache.data;
    }

    try {
        const response = await fetchWithRetry(FISCAL_DEBT_URL, { cache: 'no-store' }, 'Treasury', {
            attempts: 2,
            timeoutMs: TREASURY_DEBT_TIMEOUT_MS,
        });
        const json = (await response.json()) as DebtApiResponse & { success?: boolean };

        if (json.success === false) {
            throw new Error('Fiscal debt proxy returned success=false');
        }
        const rows = parseDebtApi(json);

        if (rows.length === 0) {
            throw new Error('Treasury API returned no valid debt rows');
        }

        const calculation =
            rows.length >= 2
                ? computeRate(rows)
                : {
                      latestDateUTC: rows[0]!.recordDate.toISOString(),
                      latestTotal: rows[0]!.totalDebt,
                      perSecond: 0,
                      estimatedTodayDelta: 0,
                      liveNow: rows[0]!.totalDebt,
                      lastDelta: 0,
                  };

        const [btcPrice, { annualSpending, annualDeficit }, officialContext] = await Promise.all([
            getBtcPriceData(),
            getFederalSpendingAndDeficit(),
            getOfficialDebtContext(),
        ]);

        const result: DebtData = {
            liveEstimateNow: calculation.liveNow,
            perSecond: calculation.perSecond,
            annualFederalSpending: annualSpending,
            annualBudgetDeficit: annualDeficit,
            btcPriceUsd: btcPrice.price,
            debtAsOf: calculation.latestDateUTC,
            debtSource: 'U.S. Treasury FiscalData Debt to the Penny',
            btcPriceSource: btcPrice.source,
            btcPriceUpdatedAt: btcPrice.updatedAt,
            population: officialContext.population,
            populationAsOf: officialContext.populationAsOf,
            populationSource: officialContext.populationSource,
            taxReturns: officialContext.taxReturns,
            taxReturnsAsOf: officialContext.taxReturnsAsOf,
            taxReturnsSource: officialContext.taxReturnsSource,
            gdpUsd: officialContext.gdpUsd,
            gdpAsOf: officialContext.gdpAsOf,
            gdpSource: officialContext.gdpSource,
            debtGdpNowPct: officialContext.debtGdpNowPct,
            debtGdpHistory: officialContext.debtGdpHistory,
            debtGdpSource: officialContext.debtGdpSource,
            stale: Boolean(btcPrice.stale || officialContext.stale),
            warnings: officialContext.warnings,
        };
        debtCache = { data: result, timestamp: now };

        return result;
    } catch (error) {
        console.error('[lib/slides/data/debt.ts:getDebtSlideData]', error);

        if (debtCache) {
            return debtCache.data;
        }

        return {
            liveEstimateNow: 0,
            perSecond: 0,
            annualFederalSpending: 0,
            annualBudgetDeficit: 0,
            btcPriceUsd: 0,
            debtAsOf: new Date().toISOString(),
            debtSource: 'unavailable',
            btcPriceSource: 'unavailable',
            btcPriceUpdatedAt: new Date().toISOString(),
            population: CENSUS_POPULATION_FALLBACK.population,
            populationAsOf: CENSUS_POPULATION_FALLBACK.asOf,
            populationSource: CENSUS_POPULATION_FALLBACK.source,
            taxReturns: IRS_TAX_RETURNS_FALLBACK.taxReturns,
            taxReturnsAsOf: IRS_TAX_RETURNS_FALLBACK.asOf,
            taxReturnsSource: IRS_TAX_RETURNS_FALLBACK.source,
            gdpUsd: GDP_FALLBACK.gdpUsd,
            gdpAsOf: GDP_FALLBACK.asOf,
            gdpSource: GDP_FALLBACK.source,
            debtGdpNowPct: DEBT_GDP_FALLBACK.nowPct,
            debtGdpHistory: DEBT_GDP_FALLBACK.history,
            debtGdpSource: DEBT_GDP_FALLBACK.source,
            stale: true,
            warnings: ['Treasury debt unavailable; using empty debt payload'],
        };
    }
}

/** Test-only helper. */
export function __resetDebtCachesForTests() {
    debtCache = null;
    mtsCache = null;
    officialContextCache = null;
}
