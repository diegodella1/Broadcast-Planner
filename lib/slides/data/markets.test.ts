import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { __resetMarketsCachesForTests, getMarketsSatsData } from "./markets"

vi.mock("./btc-cache", () => ({
  getBtcPriceUsd: vi.fn().mockResolvedValue(100_000)
}))

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  })
}

const pythPayload = {
  parsed: [
    {
      id: "765d2ba906dbc32ca17cc11f5310a89e9ee1f6420508c63861f2f8ba4ee34bb2",
      price: { price: "230000", conf: "1", expo: -2, publish_time: 1 },
      ema_price: { price: "229000", conf: "1", expo: -2, publish_time: 1 }
    },
    {
      id: "f2fb02c32b055c805e7238d628e5e9dadef274376114eb1f012337cabe93871e",
      price: { price: "2800", conf: "1", expo: -2, publish_time: 1 },
      ema_price: { price: "2790", conf: "1", expo: -2, publish_time: 1 }
    },
    {
      id: "6a60b0d1ea6809b47dbe599f24a71c8bda335aa5c77e503e7260cde5ba2f4694",
      price: { price: "7500", conf: "1", expo: -2, publish_time: 1 },
      ema_price: { price: "7400", conf: "1", expo: -2, publish_time: 1 }
    },
    {
      id: "c96458d393fe9deb7a7d63a0ac41e2898a67a7750dbd166673279e06c868df0a",
      price: { price: "8000", conf: "1", expo: -2, publish_time: 1 },
      ema_price: { price: "7900", conf: "1", expo: -2, publish_time: 1 }
    }
  ]
}

describe("getMarketsSatsData", () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-05-22T12:00:00Z"))
    __resetMarketsCachesForTests()
    delete process.env.FX_API_URL
    delete process.env.FX_API_KEY
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllGlobals()
    __resetMarketsCachesForTests()
  })

  it("uses the no-key FX fallback when FX_API_URL is not configured", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse(pythPayload))
        .mockResolvedValueOnce(
          jsonResponse({ result: "success", rates: { EUR: 0.92, JPY: 156, GBP: 0.79 } })
        )
        .mockResolvedValueOnce(jsonResponse({ success: true, data: [] }))
    )

    const data = await getMarketsSatsData()

    expect(data.fx.EUR.usdPerUnit).toBeCloseTo(1 / 0.92)
    expect(data.fx.JPY.usdPerUnit).toBeCloseTo(1 / 156)
    expect(data.fx.GBP.usdPerUnit).toBeCloseTo(1 / 0.79)
  })

  it("serves the unified markets cache inside 30 seconds", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(pythPayload))
      .mockResolvedValueOnce(
        jsonResponse({ result: "success", rates: { EUR: 0.92, JPY: 156, GBP: 0.79 } })
      )
      .mockResolvedValueOnce(jsonResponse({ success: true, data: [] }))
    vi.stubGlobal("fetch", fetchMock)

    await getMarketsSatsData()
    vi.setSystemTime(new Date("2026-05-22T12:00:20Z"))
    await getMarketsSatsData()

    expect(fetchMock).toHaveBeenCalledTimes(3)
  })
})
