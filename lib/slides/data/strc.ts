/**
 * STRC + SATA slide data fetcher.
 * Proxies to rtv-api endpoints; rtv-api owns the dividend math + valuation pipeline.
 *
 *   /api/strc/info    -> StrcData (used by StrcSlide)
 *   /api/strc/strive  -> SataData (used by SataSlide)
 *
 * Ported from backgroundclima/app/api/strc/{data,strive}/route.ts.
 */

import type { SataData, StrcData } from "@/lib/slides/types"

type Envelope<T> = { success?: boolean; data?: T } | T

function emptyStrc(): StrcData {
  return {
    strc: {
      price: 0,
      previousClose: 0,
      priceChange: 0,
      priceChangePercent: 0,
      negative: false,
      volume: null
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
      nextPayoutDate: "",
      nextRecordDate: ""
    },
    lastUpdate: new Date().toISOString()
  }
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
      avgVolume30D: null
    },
    lastUpdate: new Date().toISOString()
  }
}

async function proxyRtvApi<T>(path: string, label: string, fallback: T): Promise<T> {
  const rtvApiUrl = (process.env.RTV_API_URL ?? "https://api.roxom.tv").replace(/\/$/, "")
  const rtvApiKey = process.env.RTV_API_KEY ?? process.env.NEXT_PUBLIC_RTV_API_KEY ?? ""
  if (!process.env.RTV_API_URL && !rtvApiKey) {
    console.warn(
      `[lib/slides/data/strc.ts:${label}] RTV_API_URL / RTV_API_KEY not configured; returning empty payload`
    )
    return fallback
  }
  try {
    const headers: Record<string, string> = { Accept: "application/json" }
    if (rtvApiKey) headers["x-api-key"] = rtvApiKey
    const response = await fetch(`${rtvApiUrl}${path}`, {
      headers,
      cache: "no-store",
      signal: AbortSignal.timeout(10_000)
    })
    if (!response.ok) {
      console.error(
        `[lib/slides/data/strc.ts:${label}] rtv-api returned ${response.status} for ${path}`
      )
      return fallback
    }
    const envelope = (await response.json()) as Envelope<T>
    if (
      envelope &&
      typeof envelope === "object" &&
      "success" in envelope &&
      (envelope as { success?: boolean }).success &&
      "data" in envelope
    ) {
      return (envelope as { data: T }).data
    }
    return envelope as T
  } catch (error) {
    console.error(`[lib/slides/data/strc.ts:${label}]`, error)
    return fallback
  }
}

export function getStrcSlideData(): Promise<StrcData> {
  return proxyRtvApi<StrcData>("/api/strc/info", "getStrcSlideData", emptyStrc())
}

export function getSataSlideData(): Promise<SataData> {
  return proxyRtvApi<SataData>("/api/strc/strive", "getSataSlideData", emptySata())
}

export const __internals = { emptyStrc, emptySata }
