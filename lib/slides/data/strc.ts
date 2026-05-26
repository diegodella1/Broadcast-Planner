/**
 * STRC + SATA slide data fetchers.
 *
 * STRC comes from Strategy's JSON KPI endpoint.
 * SATA/Strive comes from StrategyTracker's versioned ASST payload.
 */

import type { SataData, StrcData } from '@/lib/slides/types';

import { getBtcPriceData } from './btc-cache';

const STRC_CACHE_DURATION_MS = 60_000;
const SATA_CACHE_DURATION_MS = 60_000;
const DEFAULT_STRATEGY_API_URL = 'https://api.strategy.com/btc/strcKpiData';
const DEFAULT_STRATEGY_TRACKER_URL = 'https://data.strategytracker.com';
const PAR_VALUE = 100;

type CacheEntry<T> = { data: T; timestamp: number };
type JsonObject = Record<string, unknown>;

let strcCache: CacheEntry<StrcData> | null = null;
let sataCache: CacheEntry<SataData> | null = null;

function emptyStrc(): StrcData {
    return {
        strc: {
            price: 0,
            previousClose: 0,
            priceChange: 0,
            priceChangePercent: 0,
            negative: false,
            volume: null,
        },
        btc: { price: 0 },
        dividends: [],
        metrics: {
            parValue: 0,
            annualDiv: 0,
            annualRate: 0,
            monthlyDiv: 0,
            monthlyDivBtc: 0,
            annualDivBtc: 0,
            effYield: 0,
            marketCap: null,
            sharesOutstanding: null,
            nextPayoutDate: '',
            nextRecordDate: '',
        },
        lastUpdate: new Date().toISOString(),
    };
}

function emptySata(): SataData {
    return {
        preferred: null,
        btc: { price: 0 },
        metrics: {
            monthlyDiv: 0,
            annualDiv: 0,
            monthlyDivBtc: 0,
            annualDivBtc: 0,
            effYield: null,
            marketCap: null,
            sharesOutstanding: null,
            nextPayoutDate: null,
            nextRecordDate: null,
            companyName: null,
            yearHigh: null,
            yearLow: null,
            avgVolume30D: null,
        },
        lastUpdate: new Date().toISOString(),
    };
}

export async function getStrcSlideData(): Promise<StrcData> {
    const now = Date.now();

    if (strcCache && now - strcCache.timestamp < STRC_CACHE_DURATION_MS) {
        return strcCache.data;
    }

    try {
        const [payload, btc] = await Promise.all([fetchStrategyStrc(), getBtcPriceData()]);
        const data = normalizeStrc(payload, btc.price);
        strcCache = { data, timestamp: now };

        return data;
    } catch (error) {
        console.error('[lib/slides/data/strc.ts:getStrcSlideData]', error);

        if (strcCache) {
            return strcCache.data;
        }

        return emptyStrc();
    }
}

export async function getSataSlideData(): Promise<SataData> {
    const now = Date.now();

    if (sataCache && now - sataCache.timestamp < SATA_CACHE_DURATION_MS) {
        return sataCache.data;
    }

    try {
        const [payload, btc] = await Promise.all([fetchStrategyTrackerAsst(), getBtcPriceData()]);
        const data = normalizeSata(payload, btc.price);
        sataCache = { data, timestamp: now };

        return data;
    } catch (error) {
        console.error('[lib/slides/data/strc.ts:getSataSlideData]', error);

        if (sataCache) {
            return sataCache.data;
        }

        return emptySata();
    }
}

async function fetchStrategyStrc() {
    const url = process.env.STRATEGY_API_URL || DEFAULT_STRATEGY_API_URL;
    const json = await fetchJson(url, 10_000);
    const rows = Array.isArray(json) ? json : [json];
    const row =
        rows.find((item) => isObject(item) && stringValue(item.company) === 'STRC') ?? rows[0];

    if (!isObject(row)) {
        throw new Error('Strategy STRC response missing row');
    }

    return row;
}

async function fetchStrategyTrackerAsst() {
    const base = (process.env.STRATEGY_TRACKER_URL || DEFAULT_STRATEGY_TRACKER_URL).replace(
        /\/$/,
        '',
    );
    const latest = await fetchJson(`${base}/latest.json`, 10_000);

    if (!isObject(latest)) {
        throw new Error('StrategyTracker latest response invalid');
    }
    const version = stringValue(latest.version);

    if (!version) {
        throw new Error('StrategyTracker latest response missing version');
    }
    const payload = await fetchJson(`${base}/ASST.v${version}.json`, 20_000);

    if (!isObject(payload)) {
        throw new Error('StrategyTracker ASST response invalid');
    }

    return payload;
}

async function fetchJson(url: string, timeoutMs: number) {
    const response = await fetch(url, {
        cache: 'no-store',
        signal: AbortSignal.timeout(timeoutMs),
        headers: { Accept: 'application/json' },
    });

    if (!response.ok) {
        throw new Error(`${url} returned ${response.status}`);
    }

    return response.json() as Promise<unknown>;
}

function normalizeStrc(row: JsonObject, btcUsd: number): StrcData {
    const price = numberValue(row.ufPrice) ?? numberValue(row.price) ?? 0;
    const negative = booleanValue(row.negative) ?? false;
    const rawChange = numberValue(row.priceVarVal) ?? 0;
    const priceChange = signedValue(rawChange, negative);
    const priceChangePercent = numberValue(row.priceVarPerc) ?? 0;
    const previousClose = price > 0 ? price - priceChange : 0;
    const annualDiv = numberValue(row.currentDividend) ?? 0;
    const monthlyDiv =
        latestCashDividend(row.dividendHistory) ?? (annualDiv > 0 ? annualDiv / 12 : 0);
    const marketCap = numberValue(row.notional) ?? millionsValue(row.marketCap);
    const sharesOutstanding =
        marketCap && price > 0 ? marketCap / price : numberValue(row.sharesOutstanding);
    const lastUpdate =
        isoDate(row.timeStampUtc) ?? isoDate(row.msTimeStamp) ?? new Date().toISOString();
    const pffCor = numberValue(row.pffCor);
    const correlations: NonNullable<StrcData['metrics']['correlations']> = {
        mstr: numberValue(row.mstrCor) ?? 0,
        spy: numberValue(row.spyCor) ?? 0,
        btc: numberValue(row.btcCor) ?? 0,
    };

    if (pffCor != null) {
        correlations.pff = pffCor;
    }
    const metrics: StrcData['metrics'] = {
        parValue: PAR_VALUE,
        annualDiv,
        annualRate: annualDiv > 0 ? annualDiv / PAR_VALUE : 0,
        monthlyDiv,
        monthlyDivBtc: btcValue(monthlyDiv, btcUsd),
        annualDivBtc: btcValue(annualDiv, btcUsd),
        effYield: numberValue(row.effYield) ?? (price > 0 ? (annualDiv / price) * 100 : 0),
        marketCap: marketCap ?? null,
        sharesOutstanding: sharesOutstanding ?? null,
        nextPayoutDate: stringValue(row.nextPayoutDate),
        nextRecordDate: stringValue(row.nextRecordDate),
        correlations,
    };
    const sharpeRatio = numberValue(row.sharpeRatio);
    const annualizedVolatility = numberValue(row.annualizedVolatility);
    const vwap1mo = numberValue(row.vwap1mo);
    const mstrPrice = numberValue(row.mstr);

    if (sharpeRatio != null) {
        metrics.sharpeRatio = sharpeRatio;
    }

    if (annualizedVolatility != null) {
        metrics.annualizedVolatility = annualizedVolatility;
    }

    if (vwap1mo != null) {
        metrics.vwap1mo = vwap1mo;
    }

    if (mstrPrice != null) {
        metrics.mstrPrice = mstrPrice;
    }

    return {
        strc: {
            price,
            previousClose,
            priceChange,
            priceChangePercent,
            negative,
            volume: sharesValue(row.sharesVolume) ?? sharesValue(row.dailyVolume),
        },
        btc: { price: btcUsd },
        dividends: dividendRows(row.dividendHistory, btcUsd),
        metrics,
        lastUpdate,
    };
}

function normalizeSata(payload: JsonObject, btcUsd: number): SataData {
    const metrics = asObject(asObject(asObject(payload.companies)?.ASST)?.processedMetrics);

    if (!metrics) {
        return { ...emptySata(), btc: { price: btcUsd } };
    }

    const price = numberValue(metrics.stockPrice);
    const delta = asObject(metrics.stockPriceDelta);
    const priceChange = numberValue(delta?.value);
    const priceChangePercent = numberValue(delta?.percent);
    const sharesOutstanding =
        numberValue(metrics.latestTotalShares) ?? numberValue(metrics.sharesOutstanding);
    const marketCap =
        numberValue(metrics.currentMarketCap) ??
        numberValue(metrics.marketCapBasic) ??
        (price && sharesOutstanding ? price * sharesOutstanding : null);
    const prices = numberArray(asObject(metrics.historicalLiquidity)?.prices);

    return {
        preferred: {
            ticker: stringValue(metrics.ticker) || 'ASST',
            name: stringValue(metrics.companyName) || 'Strive, Inc.',
            price,
            priceChange,
            priceChangePercent,
            volume: null,
            previousClose: price != null && priceChange != null ? price - priceChange : null,
        },
        btc: { price: btcUsd },
        metrics: {
            monthlyDiv: 0,
            annualDiv: 0,
            monthlyDivBtc: 0,
            annualDivBtc: 0,
            effYield: null,
            marketCap: marketCap ?? null,
            sharesOutstanding: sharesOutstanding ?? null,
            nextPayoutDate: null,
            nextRecordDate: null,
            companyName: stringValue(metrics.companyName) || 'Strive, Inc.',
            yearHigh: prices.length ? Math.max(...prices.slice(-365)) : null,
            yearLow: prices.length ? Math.min(...prices.slice(-365)) : null,
            avgVolume30D: null,
        },
        source: 'StrategyTracker',
        lastUpdate:
            isoDate(payload.timestamp) ??
            isoDate(metrics.stockPriceDate) ??
            isoDate(metrics.latestTreasuryDate) ??
            new Date().toISOString(),
    };
}

function dividendRows(value: unknown, btcUsd: number): StrcData['dividends'] {
    if (!Array.isArray(value)) {
        return [];
    }

    return value.filter(isObject).map((row) => {
        const usd = numberValue(row.cashAmount) ?? 0;

        return {
            period: stringValue(row.period),
            recordDate: stringValue(row.recordDate),
            payDate: stringValue(row.payDate),
            usd,
            rate: numberValue(row.rate) ?? 0,
            btc: btcValue(usd, btcUsd),
        };
    });
}

function latestCashDividend(value: unknown) {
    if (!Array.isArray(value)) {
        return null;
    }
    const rows = value.filter(isObject);

    for (let index = rows.length - 1; index >= 0; index -= 1) {
        const cash = numberValue(rows[index]?.cashAmount);

        if (cash && cash > 0) {
            return cash;
        }
    }

    return null;
}

function btcValue(usd: number, btcUsd: number) {
    return btcUsd > 0 ? usd / btcUsd : 0;
}

function signedValue(value: number, negative: boolean) {
    return negative ? -Math.abs(value) : Math.abs(value);
}

function millionsValue(value: unknown) {
    const parsed = numberValue(value);

    return parsed == null ? null : parsed * 1_000_000;
}

function sharesValue(value: unknown) {
    const parsed = numberValue(value);

    if (parsed == null) {
        return null;
    }

    return parsed < 10_000 ? parsed * 10_000 : parsed;
}

function numberValue(value: unknown) {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value.replace(/[$,%₿,]/g, ''));

        if (Number.isFinite(parsed)) {
            return parsed;
        }
    }

    return null;
}

function numberArray(value: unknown) {
    return Array.isArray(value)
        ? value.map(numberValue).filter((item): item is number => item != null)
        : [];
}

function stringValue(value: unknown) {
    return typeof value === 'string' ? value.trim() : '';
}

function booleanValue(value: unknown) {
    return typeof value === 'boolean' ? value : null;
}

function isoDate(value: unknown) {
    if (typeof value !== 'string' && typeof value !== 'number') {
        return null;
    }
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function asObject(value: unknown): JsonObject | null {
    return isObject(value) ? value : null;
}

function isObject(value: unknown): value is JsonObject {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export const __internals = {
    emptyStrc,
    emptySata,
    normalizeStrc,
    normalizeSata,
};

export function __resetStrcCachesForTests() {
    strcCache = null;
    sataCache = null;
}
