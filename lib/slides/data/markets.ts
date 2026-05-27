/**
 * Markets data fetcher: BTC + metals (XAU, XAG) + oil (WTI, Brent) via Pyth Network,
 * FX (EUR/JPY/GBP) via rtv-api /api/fx with upstream fallback, copper (ICOP ETF) via rtv-api market-indices.
 *
 * Source for the slide-port: backgroundclima/app/api/markets/sats/route.ts.
 * Pyth requires no API key; FX prefers RTV_API_URL/RTV_API_KEY and falls back to
 * FX_API_URL/FX_API_KEY (or the no-key open.er-api.com endpoint); copper relies on
 * RTV_API_URL/RTV_API_KEY (already used for the BTC price cache).
 */

import type { MarketsSatsData } from '@/lib/slides/types';

import { getBtcPriceUsd } from './btc-cache';

const PYTH_HERMES_URL = 'https://hermes.pyth.network';

const PYTH_FEED_IDS = {
    gold: '0x765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2',
    silver: '0xf2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e',
    wti: '0x6a60b0d1ea6809b47dbe599f24a71c8bda335aa5c77e503e7260cde5ba2f4694',
    brent: '0xc96458d393fe9deb7a7d63a0ac41e2898a67a7750dbd166673279e06c868df0a',
} as const;

const MARKETS_CACHE_DURATION_MS = 30 * 1000;
const FX_CACHE_DURATION_MS = 30 * 1000;
const FX_FALLBACK_URL = 'https://open.er-api.com/v6/latest/USD';

type PythPriceData = {
    price: string;
    conf: string;
    expo: number;
    publish_time: number;
};

type PythParsedFeed = {
    id: string;
    price: PythPriceData;
    ema_price: PythPriceData;
};

type CommodityRaw = { usd: number; change24hPct: number | null };
type FxRaw = {
    EUR: { usdPerUnit: number };
    JPY: { usdPerUnit: number };
    GBP: { usdPerUnit: number };
};

let marketsCache: { data: MarketsSatsData; timestamp: number } | null = null;
let fxCache: { data: FxRaw; timestamp: number } | null = null;

function parsePythPrice(d: PythPriceData): number {
    return Number.parseInt(d.price, 10) * Math.pow(10, d.expo);
}

function approximateChange24h(current: PythPriceData, ema: PythPriceData): number | null {
    const cur = parsePythPrice(current);
    const e = parsePythPrice(ema);

    if (e <= 0 || cur <= 0) {
        return null;
    }

    return ((cur - e) / e) * 100;
}

function usdToSats(usdPrice: number, btcUsd: number): number {
    return (usdPrice / btcUsd) * 100_000_000;
}

function emptyMarketsSats(btcUsd = 0): MarketsSatsData {
    return {
        btcUsd,
        timestamp: new Date().toISOString(),
        metals: {
            gold: { usd: 0, sats: 0, change24hPct: null },
            silver: { usd: 0, sats: 0, change24hPct: null },
        },
        oil: {
            wti: { usd: 0, sats: 0, change24hPct: null },
            brent: { usd: 0, sats: 0, change24hPct: null },
        },
        copper: { usd: 0, sats: 0, change24hPct: null },
        fx: {
            EUR: { usdPerUnit: 0, satsPerUnit: 0 },
            JPY: { usdPerUnit: 0, satsPerUnit: 0 },
            GBP: { usdPerUnit: 0, satsPerUnit: 0 },
            USD: { usdPerUnit: 1, satsPerUnit: btcUsd > 0 ? usdToSats(1, btcUsd) : 0 },
        },
        stale: true,
    };
}

async function fetchPyth(): Promise<{
    gold: CommodityRaw;
    silver: CommodityRaw;
    wti: CommodityRaw;
    brent: CommodityRaw;
}> {
    const fallback = {
        gold: { usd: 0, change24hPct: null },
        silver: { usd: 0, change24hPct: null },
        wti: { usd: 0, change24hPct: null },
        brent: { usd: 0, change24hPct: null },
    };

    try {
        const ids = Object.values(PYTH_FEED_IDS).map((id) =>
            id.startsWith('0x') ? id.slice(2) : id,
        );
        const params = new URLSearchParams();
        ids.forEach((id) => params.append('ids[]', id));
        params.append('parsed', 'true');
        const url = `${PYTH_HERMES_URL}/v2/updates/price/latest?${params}`;

        const response = await fetch(url, {
            cache: 'no-store',
            signal: AbortSignal.timeout(20_000),
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`Pyth Hermes error: ${response.status}`);
        }
        const data = (await response.json()) as { parsed?: PythParsedFeed[] };

        if (!data.parsed || !Array.isArray(data.parsed)) {
            throw new Error("Pyth response missing 'parsed' array");
        }

        const byId = new Map<string, PythParsedFeed>();

        for (const feed of data.parsed) {
            const raw = (feed.id.startsWith('0x') ? feed.id.slice(2) : feed.id).toLowerCase();
            byId.set(`0x${raw}`, feed);
            byId.set(raw, feed);
        }
        const get = (key: keyof typeof PYTH_FEED_IDS) => {
            const id = PYTH_FEED_IDS[key].toLowerCase();
            const withPrefix = id.startsWith('0x') ? id : `0x${id}`;

            return byId.get(withPrefix) ?? byId.get(withPrefix.replace(/^0x/, '')) ?? null;
        };
        const goldFeed = get('gold');
        const silverFeed = get('silver');
        const wtiFeed = get('wti');
        const brentFeed = get('brent');

        return {
            gold: goldFeed
                ? {
                      usd: parsePythPrice(goldFeed.price),
                      change24hPct: approximateChange24h(goldFeed.price, goldFeed.ema_price),
                  }
                : fallback.gold,
            silver: silverFeed
                ? {
                      usd: parsePythPrice(silverFeed.price),
                      change24hPct: approximateChange24h(silverFeed.price, silverFeed.ema_price),
                  }
                : fallback.silver,
            wti: wtiFeed
                ? {
                      usd: parsePythPrice(wtiFeed.price),
                      change24hPct: approximateChange24h(wtiFeed.price, wtiFeed.ema_price),
                  }
                : fallback.wti,
            brent: brentFeed
                ? {
                      usd: parsePythPrice(brentFeed.price),
                      change24hPct: approximateChange24h(brentFeed.price, brentFeed.ema_price),
                  }
                : fallback.brent,
        };
    } catch (error) {
        console.error('[lib/slides/data/markets.ts:fetchPyth]', error);

        return fallback;
    }
}

type RtvFxEnvelope = {
    rates?: Record<string, number | string>;
    currencies?: Record<string, { usdPerUnit?: number | string }>;
    base?: string;
    timestamp?: number;
};

function toFiniteNumber(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
        return value;
    }

    if (typeof value === 'string') {
        const parsed = Number.parseFloat(value);

        if (Number.isFinite(parsed) && parsed > 0) {
            return parsed;
        }
    }

    return null;
}

async function fetchFxFromRtvApi(): Promise<FxRaw | null> {
    const rtvApiUrl = (process.env.RTV_API_URL ?? 'https://api.roxom.tv').replace(/\/$/, '');
    const rtvApiKey = process.env.RTV_API_KEY ?? process.env.NEXT_PUBLIC_RTV_API_KEY ?? '';
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (rtvApiKey) {
        headers['x-api-key'] = rtvApiKey;
    }

    const response = await fetch(`${rtvApiUrl}/api/fx`, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
        throw new Error(`rtv-api fx error: ${response.status}`);
    }
    const envelope = (await response.json()) as RtvFxEnvelope;
    const currencies = envelope.currencies;

    if (!currencies || typeof currencies !== 'object') {
        throw new Error('rtv-api fx payload missing currencies');
    }
    const eur = toFiniteNumber(currencies['EUR']?.usdPerUnit);
    const jpy = toFiniteNumber(currencies['JPY']?.usdPerUnit);
    const gbp = toFiniteNumber(currencies['GBP']?.usdPerUnit);

    if (eur === null || jpy === null || gbp === null) {
        throw new Error('rtv-api fx payload missing EUR/JPY/GBP usdPerUnit');
    }

    return {
        EUR: { usdPerUnit: eur },
        JPY: { usdPerUnit: jpy },
        GBP: { usdPerUnit: gbp },
    };
}

async function fetchFxFromUpstream(): Promise<FxRaw> {
    const fallback: FxRaw = {
        EUR: { usdPerUnit: 0 },
        JPY: { usdPerUnit: 0 },
        GBP: { usdPerUnit: 0 },
    };
    const apiUrl = process.env.FX_API_URL;
    const apiKey = process.env.FX_API_KEY;

    try {
        const url = apiUrl
            ? apiKey
                ? `${apiUrl.replace('/latest', '/live')}?access_key=${apiKey}&source=USD`
                : `${apiUrl}?base=USD`
            : FX_FALLBACK_URL;
        const response = await fetch(url, {
            cache: 'no-store',
            signal: AbortSignal.timeout(15_000),
            headers: { Accept: 'application/json' },
        });

        if (!response.ok) {
            throw new Error(`FX API error: ${response.status}`);
        }
        const json = (await response.json()) as {
            success?: boolean;
            result?: string;
            quotes?: Record<string, number | string>;
            rates?: Record<string, number | string>;
        };

        if (json.success === false || json.result === 'error') {
            throw new Error('FX provider returned an error');
        }

        let eurRate = 0;
        let jpyRate = 0;
        let gbpRate = 0;

        if (json.quotes) {
            eurRate = Number.parseFloat(String(json.quotes['USDEUR'] ?? '0'));
            jpyRate = Number.parseFloat(String(json.quotes['USDJPY'] ?? '0'));
            gbpRate = Number.parseFloat(String(json.quotes['USDGBP'] ?? '0'));
        } else if (json.rates) {
            eurRate = Number.parseFloat(String(json.rates['EUR'] ?? '0'));
            jpyRate = Number.parseFloat(String(json.rates['JPY'] ?? '0'));
            gbpRate = Number.parseFloat(String(json.rates['GBP'] ?? '0'));
        }
        const result: FxRaw = {
            EUR: { usdPerUnit: eurRate > 0 ? 1 / eurRate : 0 },
            JPY: { usdPerUnit: jpyRate > 0 ? 1 / jpyRate : 0 },
            GBP: { usdPerUnit: gbpRate > 0 ? 1 / gbpRate : 0 },
        };

        return result;
    } catch (error) {
        console.error('[lib/slides/data/markets.ts:fetchFxFromUpstream]', error);

        return fallback;
    }
}

async function fetchFx(): Promise<FxRaw> {
    const now = Date.now();

    if (fxCache && now - fxCache.timestamp < FX_CACHE_DURATION_MS) {
        return fxCache.data;
    }
    const rtvApiData = await fetchFxFromRtvApi().catch((error) => {
        console.warn('[lib/slides/data/markets.ts:fetchFxFromRtvApi]', error);

        return null;
    });

    if (rtvApiData) {
        fxCache = { data: rtvApiData, timestamp: now };

        return rtvApiData;
    }
    const upstream = await fetchFxFromUpstream();
    const hasData =
        upstream.EUR.usdPerUnit > 0 || upstream.JPY.usdPerUnit > 0 || upstream.GBP.usdPerUnit > 0;

    if (hasData) {
        fxCache = { data: upstream, timestamp: now };

        return upstream;
    }

    if (fxCache) {
        return fxCache.data;
    }

    return upstream;
}

async function fetchCopperFromRtvApi(): Promise<CommodityRaw> {
    try {
        const rtvApiUrl = (process.env.RTV_API_URL ?? 'https://api.roxom.tv').replace(/\/$/, '');
        const rtvApiKey = process.env.RTV_API_KEY ?? process.env.NEXT_PUBLIC_RTV_API_KEY ?? '';
        const headers: Record<string, string> = { Accept: 'application/json' };

        if (rtvApiKey) {
            headers['x-api-key'] = rtvApiKey;
        }

        const response = await fetch(`${rtvApiUrl}/api/market-indices/us`, {
            headers,
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            console.warn(
                `[lib/slides/data/markets.ts:fetchCopperFromRtvApi] HTTP ${response.status}`,
            );

            return { usd: 0, change24hPct: null };
        }
        const envelope = (await response.json()) as {
            success?: boolean;
            data?: Array<{ symbol: string; priceUSD?: number; changePercentUSD?: number }>;
        };
        const items = envelope.success && Array.isArray(envelope.data) ? envelope.data : [];
        const icop = items.find((i) => i.symbol === 'ICOP');

        if (!icop || typeof icop.priceUSD !== 'number') {
            return { usd: 0, change24hPct: null };
        }

        return { usd: icop.priceUSD, change24hPct: icop.changePercentUSD ?? null };
    } catch (error) {
        console.error('[lib/slides/data/markets.ts:fetchCopperFromRtvApi]', error);

        return { usd: 0, change24hPct: null };
    }
}

async function fetchMetalsFromRtvApi(): Promise<{
    gold: CommodityRaw;
    silver: CommodityRaw;
}> {
    const fallback = {
        gold: { usd: 0, change24hPct: null },
        silver: { usd: 0, change24hPct: null },
    };

    try {
        const rtvApiUrl = (process.env.RTV_API_URL ?? 'https://api.roxom.tv').replace(/\/$/, '');
        const rtvApiKey = process.env.RTV_API_KEY ?? process.env.NEXT_PUBLIC_RTV_API_KEY ?? '';
        const headers: Record<string, string> = { Accept: 'application/json' };

        if (rtvApiKey) {
            headers['x-api-key'] = rtvApiKey;
        }

        const response = await fetch(`${rtvApiUrl}/api/metals`, {
            headers,
            cache: 'no-store',
            signal: AbortSignal.timeout(10_000),
        });

        if (!response.ok) {
            console.warn(
                `[lib/slides/data/markets.ts:fetchMetalsFromRtvApi] HTTP ${response.status}`,
            );

            return fallback;
        }
        const envelope = (await response.json()) as {
            success?: boolean;
            data?: Array<{ symbol: string; price?: number; changePercent?: number }>;
        };
        const items = envelope.success && Array.isArray(envelope.data) ? envelope.data : [];
        const bySymbol = new Map(items.map((item) => [item.symbol, item]));
        const gold = bySymbol.get('XAU');
        const silver = bySymbol.get('XAG');

        return {
            gold:
                typeof gold?.price === 'number'
                    ? { usd: gold.price, change24hPct: gold.changePercent ?? null }
                    : fallback.gold,
            silver:
                typeof silver?.price === 'number'
                    ? { usd: silver.price, change24hPct: silver.changePercent ?? null }
                    : fallback.silver,
        };
    } catch (error) {
        console.error('[lib/slides/data/markets.ts:fetchMetalsFromRtvApi]', error);

        return fallback;
    }
}

export async function getMarketsSatsData(): Promise<MarketsSatsData> {
    const now = Date.now();

    if (
        marketsCache &&
        now - marketsCache.timestamp < MARKETS_CACHE_DURATION_MS &&
        (marketsCache.data.metals.gold.usd > 0 || marketsCache.data.metals.silver.usd > 0)
    ) {
        return marketsCache.data;
    }

    const btcUsd = await getBtcPriceUsd();

    if (!btcUsd || btcUsd <= 0) {
        if (marketsCache) {
            return { ...marketsCache.data, stale: true };
        }

        return emptyMarketsSats();
    }

    const [pythRes, fxRes, copperRes, rtvMetalsRes] = await Promise.allSettled([
        fetchPyth(),
        fetchFx(),
        fetchCopperFromRtvApi(),
        fetchMetalsFromRtvApi(),
    ]);

    const pyth =
        pythRes.status === 'fulfilled'
            ? pythRes.value
            : {
                  gold: { usd: 0, change24hPct: null },
                  silver: { usd: 0, change24hPct: null },
                  wti: { usd: 0, change24hPct: null },
                  brent: { usd: 0, change24hPct: null },
              };
    const fx: FxRaw =
        fxRes.status === 'fulfilled'
            ? fxRes.value
            : { EUR: { usdPerUnit: 0 }, JPY: { usdPerUnit: 0 }, GBP: { usdPerUnit: 0 } };
    const copper: CommodityRaw =
        copperRes.status === 'fulfilled' ? copperRes.value : { usd: 0, change24hPct: null };
    const rtvMetals =
        rtvMetalsRes.status === 'fulfilled'
            ? rtvMetalsRes.value
            : {
                  gold: { usd: 0, change24hPct: null },
                  silver: { usd: 0, change24hPct: null },
              };
    const gold = rtvMetals.gold.usd > 0 ? rtvMetals.gold : pyth.gold;
    const silver = rtvMetals.silver.usd > 0 ? rtvMetals.silver : pyth.silver;

    const result: MarketsSatsData = {
        btcUsd,
        timestamp: new Date().toISOString(),
        metals: {
            gold: {
                usd: gold.usd,
                sats: gold.usd > 0 ? usdToSats(gold.usd, btcUsd) : 0,
                change24hPct: gold.change24hPct,
            },
            silver: {
                usd: silver.usd,
                sats: silver.usd > 0 ? usdToSats(silver.usd, btcUsd) : 0,
                change24hPct: silver.change24hPct,
            },
        },
        oil: {
            wti: {
                usd: pyth.wti.usd,
                sats: pyth.wti.usd > 0 ? usdToSats(pyth.wti.usd, btcUsd) : 0,
                change24hPct: pyth.wti.change24hPct,
            },
            brent: {
                usd: pyth.brent.usd,
                sats: pyth.brent.usd > 0 ? usdToSats(pyth.brent.usd, btcUsd) : 0,
                change24hPct: pyth.brent.change24hPct,
            },
        },
        copper: {
            usd: copper.usd,
            sats: copper.usd > 0 ? usdToSats(copper.usd, btcUsd) : 0,
            change24hPct: copper.change24hPct,
        },
        fx: {
            EUR: {
                usdPerUnit: fx.EUR.usdPerUnit,
                satsPerUnit: fx.EUR.usdPerUnit > 0 ? usdToSats(fx.EUR.usdPerUnit, btcUsd) : 0,
            },
            JPY: {
                usdPerUnit: fx.JPY.usdPerUnit,
                satsPerUnit: fx.JPY.usdPerUnit > 0 ? usdToSats(fx.JPY.usdPerUnit, btcUsd) : 0,
            },
            GBP: {
                usdPerUnit: fx.GBP.usdPerUnit,
                satsPerUnit: fx.GBP.usdPerUnit > 0 ? usdToSats(fx.GBP.usdPerUnit, btcUsd) : 0,
            },
            USD: { usdPerUnit: 1, satsPerUnit: usdToSats(1, btcUsd) },
        },
    };

    marketsCache = { data: result, timestamp: now };

    return result;
}

/** Internal helpers exposed for unit tests. */
export const __internals = { emptyMarketsSats, usdToSats };

/** Test-only helper. */
export function __resetMarketsCachesForTests() {
    marketsCache = null;
    fxCache = null;
}
