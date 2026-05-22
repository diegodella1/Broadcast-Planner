import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { __resetBtcCacheForTests, getBtcPriceData, getBtcPriceUsd } from "./btc-cache"

describe("getBtcPriceUsd", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
    __resetBtcCacheForTests()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    __resetBtcCacheForTests()
  })

  it("uses rtv-api BTC price when available", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(rtvPayload("81234.56")))
    )

    await expect(getBtcPriceUsd()).resolves.toBe(81234.56)
  })

  it("returns BTC price source metadata", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(rtvPayload("81234.56")))
    )

    await expect(getBtcPriceData()).resolves.toMatchObject({
      price: 81234.56,
      source: "rtv-api"
    })
  })

  it("falls back to Coinbase spot price when rtv-api fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)
    vi.stubGlobal(
      "fetch",
      vi
        .fn<typeof fetch>()
        .mockResolvedValueOnce(new Response("nope", { status: 500 }))
        .mockResolvedValueOnce(jsonResponse({ data: { amount: "77357.875" } }))
    )

    await expect(getBtcPriceUsd()).resolves.toBe(77357.875)
  })
})

function rtvPayload(price: string) {
  return {
    success: true,
    data: {
      price: {
        live_price: price
      }
    }
  }
}

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })
}
