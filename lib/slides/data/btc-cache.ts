/**
 * Shared BTC price cache used by debt and markets data fetchers.
 * Ported from backgroundclima/lib/btc-cache.ts; key is `RTV_API_URL + RTV_API_KEY`.
 */

const BTC_CACHE_DURATION_MS = 2 * 60 * 1000

const FALLBACK_BTC_USD = 95_000

type BtcCacheEntry = { price: number; timestamp: number }

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

/**
 * Resolve current BTC/USD price.
 * Returns the cached value if fresh, otherwise calls rtv-api `/api/btc/info`.
 * On error returns the cached value if any, then `FALLBACK_BTC_USD`.
 */
export async function getBtcPriceUsd(): Promise<number> {
  const now = Date.now()
  if (btcCache && now - btcCache.timestamp < BTC_CACHE_DURATION_MS) {
    return btcCache.price
  }

  const rtvApiUrl = (process.env.RTV_API_URL ?? "https://api.roxom.tv").replace(/\/$/, "")
  const rtvApiKey = process.env.RTV_API_KEY ?? process.env.NEXT_PUBLIC_RTV_API_KEY ?? ""

  const headers: Record<string, string> = { Accept: "application/json" }
  if (rtvApiKey) {
    headers["x-api-key"] = rtvApiKey
  }

  try {
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
    const price = parsePrice(livePriceString)
    btcCache = { price, timestamp: now }
    return price
  } catch (error) {
    console.error("[lib/slides/data/btc-cache.ts:getBtcPriceUsd]", error)
    if (btcCache) return btcCache.price
    return FALLBACK_BTC_USD
  }
}

/** Test-only helper to reset the cache between unit tests. */
export function __resetBtcCacheForTests() {
  btcCache = null
}
