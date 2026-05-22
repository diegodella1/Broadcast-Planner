import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { __resetUsMarketOpenCacheForTests, getUsMarketOpenData } from "./us-market-open"

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

const marketPayload = {
  success: true,
  data: [
    { symbol: "ES", priceUSD: 6300.25, changeUSD: 12.5, changePercentUSD: 0.2 },
    { symbol: "NQ", priceUSD: 22900.5, changeUSD: -25.1, changePercentUSD: -0.11 },
    { symbol: "YM", priceUSD: 46250, changeUSD: 90, changePercentUSD: 0.19 },
    { symbol: "RTY", priceUSD: 2280.75, changeUSD: 8.2, changePercentUSD: 0.36 }
  ]
}

describe("getUsMarketOpenData", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-22T13:00:00Z"))
    __resetUsMarketOpenCacheForTests()
    delete process.env.US_MARKET_DATA_URL
    delete process.env.US_MARKET_DATA_KEY
    delete process.env.US_MARKET_DATA_PROVIDER
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    __resetUsMarketOpenCacheForTests()
  })

  it("returns visible demo data and does not fetch without a configured provider", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)

    const data = await getUsMarketOpenData(new Date("2026-05-22T13:00:00Z"))

    expect(data.mode).toBe("demo")
    expect(data.source).toBe("Demo board")
    expect(data.cacheSeconds).toBe(0)
    expect(data.instruments).toHaveLength(4)
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it("normalizes US index futures from the configured API", async () => {
    process.env.US_MARKET_DATA_URL = "https://markets.example.test/us"
    process.env.US_MARKET_DATA_PROVIDER = "Example Markets"
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(marketPayload)))

    const data = await getUsMarketOpenData(new Date("2026-05-22T13:00:00Z"))

    expect(data.mode).toBe("live")
    expect(data.phase).toBe("pre-market")
    expect(data.source).toBe("Example Markets")
    expect(data.cacheSeconds).toBe(30)
    expect(data.instruments).toHaveLength(4)
    expect(data.instruments[0]).toMatchObject({
      id: "sp500",
      symbol: "ES",
      price: 6300.25,
      changePercent: 0.2
    })
  })

  it("uses ETF proxies when futures are unavailable", async () => {
    process.env.US_MARKET_DATA_URL = "https://markets.example.test/us"
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [{ symbol: "SPY", priceUSD: 620.2, changeUSD: 1.4, changePercentUSD: 0.23 }]
        })
      )
    )

    const data = await getUsMarketOpenData(new Date("2026-05-22T13:00:00Z"))

    expect(data.instruments[0]).toMatchObject({
      id: "sp500",
      symbol: "SPY",
      proxySymbol: "SPY",
      source: "US Market configured API proxy"
    })
    expect(data.instruments[1]?.unavailable).toBe(true)
  })

  it("serves cached data within 30 seconds and revalidates afterward", async () => {
    process.env.US_MARKET_DATA_URL = "https://markets.example.test/us"
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(marketPayload))
      .mockResolvedValueOnce(
        jsonResponse({
          success: true,
          data: [{ symbol: "ES", priceUSD: 6310, changeUSD: 22, changePercentUSD: 0.35 }]
        })
      )
    vi.stubGlobal("fetch", fetchMock)

    await getUsMarketOpenData(new Date("2026-05-22T13:00:00Z"))
    vi.setSystemTime(new Date("2026-05-22T13:00:20Z"))
    const cached = await getUsMarketOpenData(new Date("2026-05-22T13:00:20Z"))
    expect(cached.instruments[0]?.price).toBe(6300.25)
    expect(fetchMock).toHaveBeenCalledTimes(1)

    vi.setSystemTime(new Date("2026-05-22T13:00:31Z"))
    const refreshed = await getUsMarketOpenData(new Date("2026-05-22T13:00:31Z"))
    expect(refreshed.instruments[0]?.price).toBe(6310)
    expect(fetchMock).toHaveBeenCalledTimes(2)
  })

  it("returns stale cache when the provider fails", async () => {
    process.env.US_MARKET_DATA_URL = "https://markets.example.test/us"
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(marketPayload))
      .mockResolvedValueOnce(jsonResponse({ success: false }, 200))
    vi.stubGlobal("fetch", fetchMock)

    await getUsMarketOpenData(new Date("2026-05-22T13:00:00Z"))
    vi.setSystemTime(new Date("2026-05-22T13:01:00Z"))
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)
    const stale = await getUsMarketOpenData(new Date("2026-05-22T13:01:00Z"))

    expect(stale.stale).toBe(true)
    expect(stale.mode).toBe("live")
    expect(stale.instruments[0]?.price).toBe(6300.25)
    consoleSpy.mockRestore()
  })

  it("returns unavailable data when the provider fails without cache", async () => {
    process.env.US_MARKET_DATA_URL = "https://markets.example.test/us"
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse({ success: false }))
    )
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => undefined)

    const data = await getUsMarketOpenData(new Date("2026-05-22T13:00:00Z"))

    expect(data.mode).toBe("unavailable")
    expect(data.instruments[0]?.price).toBeNull()
    consoleSpy.mockRestore()
  })

  it("calculates market phases in New York time", async () => {
    await expect(getUsMarketOpenData(new Date("2026-05-22T13:00:00Z"))).resolves.toMatchObject({
      phase: "pre-market"
    })
    await expect(getUsMarketOpenData(new Date("2026-05-22T14:00:00Z"))).resolves.toMatchObject({
      phase: "open"
    })
    await expect(getUsMarketOpenData(new Date("2026-05-22T21:00:00Z"))).resolves.toMatchObject({
      phase: "after-hours"
    })
    await expect(getUsMarketOpenData(new Date("2026-05-24T16:00:00Z"))).resolves.toMatchObject({
      phase: "closed"
    })
  })
})
