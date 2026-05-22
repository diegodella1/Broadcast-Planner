import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { getChinaMarketOpenData } from "./china-market-open"
import { getJapanMarketOpenData } from "./japan-market-open"
import { getSaudiMarketOpenData } from "./saudi-market-open"
import { getUkMarketOpenData } from "./uk-market-open"

describe("regional market open demo boards", () => {
  beforeEach(() => {
    delete process.env.JAPAN_MARKET_DATA_URL
    delete process.env.UK_MARKET_DATA_URL
    delete process.env.CHINA_MARKET_DATA_URL
    delete process.env.SAUDI_MARKET_DATA_URL
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it("returns demo boards without fetching when providers are not configured", async () => {
    const fetchMock = vi.fn<typeof fetch>()
    vi.stubGlobal("fetch", fetchMock)

    await expect(getJapanMarketOpenData(new Date("2026-05-22T00:00:00Z"))).resolves.toMatchObject({
      mode: "demo",
      marketName: "Japan Market",
      marketTimezone: "Asia/Tokyo"
    })
    await expect(getUkMarketOpenData(new Date("2026-05-22T07:00:00Z"))).resolves.toMatchObject({
      mode: "demo",
      marketName: "UK Market",
      marketTimezone: "Europe/London"
    })
    await expect(getChinaMarketOpenData(new Date("2026-05-22T01:00:00Z"))).resolves.toMatchObject({
      mode: "demo",
      marketName: "China Market",
      marketTimezone: "Asia/Shanghai"
    })
    await expect(getSaudiMarketOpenData(new Date("2026-05-22T07:00:00Z"))).resolves.toMatchObject({
      mode: "demo",
      marketName: "Saudi Market",
      marketTimezone: "Asia/Riyadh"
    })

    expect(fetchMock).not.toHaveBeenCalled()
  })
})
