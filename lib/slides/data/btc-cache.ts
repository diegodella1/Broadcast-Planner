/**
 * Shared BTC price cache used by debt and markets data fetchers.
 * rtv-api is preferred when configured; Coinbase spot price is the public fallback.
 */

const BTC_CACHE_DURATION_MS = 2 * 60 * 1000

const FALLBACK_BTC_USD = 95_000

export type BtcPriceData = {
  price: number
  source: string
  updatedAt: string
  stale?: boolean
}

type BtcCacheEntry = { data: BtcPriceData; timestamp: number }

let btcCache: BtcCacheEntry | null = null

function parsePrice(priceString: string): number {
  const cleaned = priceString.replace(/[$,]/g, "")
  const parsed = Number.parseFloat(cleaned)
  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid price format: ${priceString}`)
  }
  return parsed
}

type RtvBtcEnvelope = {
  success?: boolean
  data?: { price?: { live_price?: string } }
  price?: { live_price?: string }
}

type CoinbaseSpotEnvelope = {
  data?: { amount?: string; base?: string; currency?: string }
}

/**
 * Resolve current BTC/USD price.
 * Returns the cached value if fresh, otherwise calls rtv-api `/api/btc/info`,
 * then Coinbase spot BTC-USD, then cached/fixed fallback.
 */
export async function getBtcPriceUsd(): Promise<number> {
  return (await getBtcPriceData()).price
}

export async function getBtcPriceData(): Promise<BtcPriceData> {
  const now = Date.now()
  if (btcCache && now - btcCache.timestamp < BTC_CACHE_DURATION_MS) {
    return btcCache.data
  }

  const rtvApiUrl = (process.env.RTV_API_URL ?? "https://api.roxom.tv").replace(/\/$/, "")
  const rtvApiKey = process.env.RTV_API_KEY ?? process.env.NEXT_PUBLIC_RTV_API_KEY ?? ""

  const headers: Record<string, string> = { Accept: "application/json" }
  if (rtvApiKey) {
    headers["x-api-key"] = rtvApiKey
  }

  const rtvPrice = await fetchRtvBtcPrice(rtvApiUrl, headers).catch((error) => {
    console.error("[lib/slides/data/btc-cache.ts:fetchRtvBtcPrice]", error)
    return null
  })
  if (rtvPrice) {
    const data = { price: rtvPrice, source: "rtv-api", updatedAt: new Date().toISOString() }
    btcCache = { data, timestamp: now }
    return data
  }

  const coinbasePrice = await fetchCoinbaseBtcPrice().catch((error) => {
    console.error("[lib/slides/data/btc-cache.ts:fetchCoinbaseBtcPrice]", error)
    return null
  })
  if (coinbasePrice) {
    const data = {
      price: coinbasePrice,
      source: "Coinbase spot BTC-USD",
      updatedAt: new Date().toISOString()
    }
    btcCache = { data, timestamp: now }
    return data
  }

  if (btcCache) return { ...btcCache.data, stale: true }
  return {
    price: FALLBACK_BTC_USD,
    source: "fixed fallback",
    updatedAt: new Date().toISOString(),
    stale: true
  }
}

async function fetchRtvBtcPrice(
  rtvApiUrl: string,
  headers: Record<string, string>
): Promise<number | null> {
  const response = await fetch(`${rtvApiUrl}/api/btc/info`, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(5_000)
  })
  if (!response.ok) {
    throw new Error(`rtv-api error: ${response.status}`)
  }
  const envelope = (await response.json()) as RtvBtcEnvelope
  const inner = envelope.success && envelope.data ? envelope.data : envelope
  const livePriceString = inner.price?.live_price
  if (!livePriceString || typeof livePriceString !== "string") {
    throw new Error("Invalid BTC price data from rtv-api")
  }
  return parsePrice(livePriceString)
}

async function fetchCoinbaseBtcPrice(): Promise<number | null> {
  const response = await fetch("https://api.coinbase.com/v2/prices/BTC-USD/spot", {
    headers: { Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(5_000)
  })
  if (!response.ok) throw new Error(`coinbase spot error: ${response.status}`)
  const envelope = (await response.json()) as CoinbaseSpotEnvelope
  const amount = envelope.data?.amount
  if (!amount || typeof amount !== "string") throw new Error("Invalid BTC price data from Coinbase")
  return parsePrice(amount)
}

/** Test-only helper to reset the cache between unit tests. */
export function __resetBtcCacheForTests() {
  btcCache = null
}
