import { getDataProviderConfig } from './provider-config';

/**
 * Shared BTC price cache used by debt and markets data fetchers.
 * data-provider-api is preferred when configured; Coinbase spot price is the public fallback.
 */

const BTC_CACHE_DURATION_MS = 2 * 60 * 1000;

const FALLBACK_BTC_USD = 95_000;

export type BtcPriceData = {
    price: number;
    source: string;
    updatedAt: string;
    stale?: boolean;
};

type BtcCacheEntry = { data: BtcPriceData; timestamp: number };

let btcCache: BtcCacheEntry | null = null;

function parsePrice(priceString: string): number {
    const cleaned = priceString.replace(/[$,]/g, '');
    const parsed = Number.parseFloat(cleaned);

    if (!Number.isFinite(parsed)) {
        throw new Error(`Invalid price format: ${priceString}`);
    }

    return parsed;
}

type DataProviderBtcEnvelope = {
    success?: boolean;
    data?: { price?: { live_price?: string } };
    price?: { live_price?: string };
};

type CoinbaseSpotEnvelope = {
    data?: { amount?: string; base?: string; currency?: string };
};

/**
 * Resolve current BTC/USD price.
 * Returns the cached value if fresh, otherwise calls data-provider-api `/api/btc/info`,
 * then Coinbase spot BTC-USD, then cached/fixed fallback.
 */
export async function getBtcPriceUsd(): Promise<number> {
    return (await getBtcPriceData()).price;
}

export async function getBtcPriceData(): Promise<BtcPriceData> {
    const now = Date.now();

    if (btcCache && now - btcCache.timestamp < BTC_CACHE_DURATION_MS) {
        return btcCache.data;
    }

    const provider = getDataProviderConfig();
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (provider?.apiKey) {
        headers['x-api-key'] = provider.apiKey;
    }

    const dataProviderPrice = provider
        ? await fetchDataProviderBtcPrice(provider.baseUrl, headers).catch((error) => {
              console.error('[lib/slides/data/btc-cache.ts:fetchDataProviderBtcPrice]', error);

              return null;
          })
        : null;

    if (dataProviderPrice) {
        const data = {
            price: dataProviderPrice,
            source: 'data-provider-api',
            updatedAt: new Date().toISOString(),
        };
        btcCache = { data, timestamp: now };

        return data;
    }

    const coinbasePrice = await fetchCoinbaseBtcPrice().catch((error) => {
        console.error('[lib/slides/data/btc-cache.ts:fetchCoinbaseBtcPrice]', error);

        return null;
    });

    if (coinbasePrice) {
        const data = {
            price: coinbasePrice,
            source: 'Coinbase spot BTC-USD',
            updatedAt: new Date().toISOString(),
        };
        btcCache = { data, timestamp: now };

        return data;
    }

    if (btcCache) {
        return { ...btcCache.data, stale: true };
    }

    return {
        price: FALLBACK_BTC_USD,
        source: 'fixed fallback',
        updatedAt: new Date().toISOString(),
        stale: true,
    };
}

async function fetchDataProviderBtcPrice(
    dataProviderApiUrl: string,
    headers: Record<string, string>,
): Promise<number | null> {
    const response = await fetch(`${dataProviderApiUrl}/api/btc/info`, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
        throw new Error(`data-provider-api error: ${response.status}`);
    }
    const envelope = (await response.json()) as DataProviderBtcEnvelope;
    const inner = envelope.success && envelope.data ? envelope.data : envelope;
    const livePriceString = inner.price?.live_price;

    if (!livePriceString || typeof livePriceString !== 'string') {
        throw new Error('Invalid BTC price data from data-provider-api');
    }

    return parsePrice(livePriceString);
}

async function fetchCoinbaseBtcPrice(): Promise<number | null> {
    const response = await fetch('https://api.coinbase.com/v2/prices/BTC-USD/spot', {
        headers: { Accept: 'application/json' },
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
        throw new Error(`coinbase spot error: ${response.status}`);
    }
    const envelope = (await response.json()) as CoinbaseSpotEnvelope;
    const amount = envelope.data?.amount;

    if (!amount || typeof amount !== 'string') {
        throw new Error('Invalid BTC price data from Coinbase');
    }

    return parsePrice(amount);
}

/** Test-only helper to reset the cache between unit tests. */
export function __resetBtcCacheForTests() {
    btcCache = null;
}
