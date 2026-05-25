import { beforeEach, describe, expect, it, vi } from "vitest"

import { __internals, __resetStrcCachesForTests, getSataSlideData, getStrcSlideData } from "./strc"

import { getBtcPriceData } from "./btc-cache"

vi.mock("./btc-cache", () => ({
  getBtcPriceData: vi.fn()
}))

const originalEnv = { ...process.env }

describe("STRC/SATA slide data", () => {
  beforeEach(() => {
    vi.resetAllMocks()
    __resetStrcCachesForTests()
    process.env = { ...originalEnv }
    vi.mocked(getBtcPriceData).mockResolvedValue({
      price: 100_000,
      source: "test",
      updatedAt: "2026-05-25T12:00:00.000Z"
    })
  })

  it("normalizes Strategy STRC data into the slide shape", () => {
    const data = __internals.normalizeStrc(strategyStrcRow, 100_000)

    expect(data.strc).toMatchObject({
      price: 99.3,
      previousClose: 99.32,
      priceChange: -0.02,
      priceChangePercent: -0.02,
      negative: true,
      volume: 1_707_925
    })
    expect(data.metrics).toMatchObject({
      parValue: 100,
      annualDiv: 11.5,
      monthlyDiv: 0.96,
      monthlyDivBtc: 0.0000096,
      annualDivBtc: 0.000115,
      effYield: 11.58,
      marketCap: 10_489_470_500,
      nextPayoutDate: "2026-05-31",
      nextRecordDate: "2026-05-15",
      mstrPrice: 159.89
    })
    expect(data.dividends[0]).toMatchObject({
      period: "May 2026",
      recordDate: "2026-05-15",
      payDate: "2026-05-31",
      usd: 0.96,
      btc: 0.0000096
    })
  })

  it("fetches STRC directly from Strategy and caches the successful payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse([strategyStrcRow]))
        .mockRejectedValueOnce(new Error("offline"))
    )

    const first = await getStrcSlideData()
    const second = await getStrcSlideData()

    expect(first.strc.price).toBe(99.3)
    expect(second.strc.price).toBe(99.3)
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1)
  })

  it("returns empty STRC data when Strategy is unavailable and no cache exists", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockRejectedValue(new Error("offline")))

    const data = await getStrcSlideData()

    expect(data.strc.price).toBe(0)
    expect(data.dividends).toHaveLength(0)
  })

  it("normalizes StrategyTracker ASST data into the SATA slide shape", () => {
    const data = __internals.normalizeSata(strategyTrackerAsstPayload, 100_000)

    expect(data.preferred).toMatchObject({
      ticker: "ASST",
      name: "Strive, Inc.",
      price: 18.21,
      priceChange: 0,
      priceChangePercent: 0,
      previousClose: 18.21
    })
    expect(data.metrics).toMatchObject({
      marketCap: 1_339_111_665.39,
      sharesOutstanding: 73_537_163,
      companyName: "Strive, Inc.",
      yearHigh: 20,
      yearLow: 10
    })
    expect(data.source).toBe("StrategyTracker")
  })

  it("fetches SATA from StrategyTracker latest/versioned ASST payload", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(jsonResponse({ version: "20260525T121934Z" }))
        .mockResolvedValueOnce(jsonResponse(strategyTrackerAsstPayload))
    )

    const data = await getSataSlideData()

    expect(data.preferred?.ticker).toBe("ASST")
    expect(data.preferred?.price).toBe(18.21)
    expect(vi.mocked(fetch).mock.calls[0]?.[0]).toBe("https://data.strategytracker.com/latest.json")
    expect(vi.mocked(fetch).mock.calls[1]?.[0]).toBe(
      "https://data.strategytracker.com/ASST.v20260525T121934Z.json"
    )
  })
})

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })
}

const strategyStrcRow = {
  company: "STRC",
  ufPrice: 99.3,
  sharesVolume: 1_707_925,
  timeStampUtc: "2026-05-22T20:00:00",
  mstr: 159.89,
  priceVarVal: "0.02",
  priceVarPerc: "-0.02",
  negative: true,
  marketCap: 10416,
  notional: 10_489_470_500,
  annualizedVolatility: 12.4,
  mstrCor: 67,
  spyCor: 32,
  btcCor: 61,
  pffCor: 33,
  effYield: 11.58,
  vwap1mo: 99.7131,
  sharpeRatio: "1.89",
  currentDividend: 11.5,
  nextRecordDate: "2026-05-15",
  nextPayoutDate: "2026-05-31",
  dividendHistory: [
    {
      period: "May 2026",
      recordDate: "2026-05-15",
      payDate: "2026-05-31",
      cashAmount: 0.96,
      rate: 11.5
    },
    {
      period: "Jun 2026",
      recordDate: "2026-06-15",
      payDate: "2026-06-30",
      cashAmount: null,
      isUpcoming: true
    }
  ]
}

const strategyTrackerAsstPayload = {
  timestamp: "2026-05-25T12:19:12.767351+00:00",
  companies: {
    ASST: {
      processedMetrics: {
        ticker: "ASST",
        companyName: "Strive, Inc.",
        currentMarketCap: 1_339_111_665.39,
        sharesOutstanding: 73_537_159,
        stockPrice: 18.21,
        stockPriceDate: "2026-05-25",
        stockPriceDelta: {
          value: 0,
          percent: 0,
          positive: true
        },
        latestTotalShares: 73_537_163,
        historicalLiquidity: {
          prices: [10, 18.21, 20]
        }
      }
    }
  }
}
