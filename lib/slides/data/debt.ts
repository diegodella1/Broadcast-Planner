/**
 * US debt clock data fetcher.
 * Source: rtv-proxy fiscal endpoints (Treasury MTS + total public debt outstanding).
 * Ported from backgroundclima/lib/debt.ts + app/api/debt/route.ts.
 */

import type { DebtData } from "@/lib/slides/types"

import { getBtcPriceUsd } from "./btc-cache"

const FISCAL_PROXY_BASE_URL =
  process.env.FISCAL_PROXY_BASE_URL ?? "https://rtv-proxy.vercel.app/api/fiscal"
const FISCAL_DEBT_URL = `${FISCAL_PROXY_BASE_URL.replace(/\/$/, "")}/debt`
const FISCAL_REVENUE_URL = `${FISCAL_PROXY_BASE_URL.replace(/\/$/, "")}/revenue`

const DEBT_CACHE_DURATION_MS = 15 * 60 * 1000
const MTS_CACHE_DURATION_MS = 24 * 60 * 60 * 1000

const TREASURY_DEBT_TIMEOUT_MS = 7_000
const TREASURY_MTS_TIMEOUT_MS = 5_000

const RETRYABLE_HTTP_STATUS = new Set([
  408, 425, 429, 500, 502, 503, 504, 520, 522, 523, 524, 525, 526, 530
])

export type DebtRow = { recordDate: Date; totalDebt: number }

export type DebtCalculation = {
  latestDateUTC: string
  latestTotal: number
  perSecond: number
  estimatedTodayDelta: number
  liveNow: number
  lastDelta: number
}

type DebtApiResponse = {
  data?: Array<{ record_date?: string; tot_pub_debt_out_amt?: string }>
}

type MtsTable1ApiRow = {
  record_date: string
  record_calendar_month: string
  current_month_gross_outly_amt: string
  current_month_dfct_sur_amt: string
}

type MtsTable1ApiResponse = {
  success?: boolean
  data?: MtsTable1ApiRow[]
}

type DebtCacheEntry = { data: DebtData; timestamp: number }
type MtsCacheEntry = { annualSpending: number; annualDeficit: number; timestamp: number }

let debtCache: DebtCacheEntry | null = null
let mtsCache: MtsCacheEntry | null = null

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}

async function fetchWithRetry(
  url: string,
  init: Omit<RequestInit, "signal">,
  label: string,
  options: { attempts: number; timeoutMs: number }
): Promise<Response> {
  let lastError: unknown
  const { attempts, timeoutMs } = options
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      const response = await fetch(url, {
        ...init,
        signal: AbortSignal.timeout(timeoutMs)
      })
      if (response.ok) return response
      if (attempt < attempts && RETRYABLE_HTTP_STATUS.has(response.status)) {
        await delay(300 * attempt)
        continue
      }
      throw new Error(`${label} API error: ${response.status}`)
    } catch (error) {
      lastError = error
      if (attempt < attempts) {
        await delay(300 * attempt)
        continue
      }
    }
  }
  throw lastError instanceof Error ? lastError : new Error(`${label} API request failed`)
}

export function parseDebtApi(apiResponse: DebtApiResponse): DebtRow[] {
  if (!apiResponse.data || !Array.isArray(apiResponse.data)) {
    throw new Error("Invalid API response format")
  }
  const rows: DebtRow[] = []
  for (const item of apiResponse.data) {
    if (!item.record_date || !item.tot_pub_debt_out_amt) continue
    const recordDate = new Date(item.record_date)
    const totalDebt = Math.round(Number.parseFloat(item.tot_pub_debt_out_amt))
    if (!Number.isFinite(totalDebt) || Number.isNaN(recordDate.getTime())) continue
    rows.push({ recordDate, totalDebt })
  }
  rows.sort((a, b) => b.recordDate.getTime() - a.recordDate.getTime())
  return rows
}

export function computeRate(rows: DebtRow[]): DebtCalculation {
  if (rows.length < 2) {
    throw new Error("Need at least 2 data points to compute rate")
  }
  const latest = rows[0]!
  const latestDateUTC = latest.recordDate.toISOString()
  const latestTotal = latest.totalDebt

  let lastDelta = 0
  let previousRecord: DebtRow | null = null
  for (let i = 0; i < rows.length; i++) {
    const current = rows[i]!
    for (let j = i + 1; j < rows.length; j++) {
      const candidate = rows[j]!
      const currentDay = new Date(current.recordDate)
      currentDay.setHours(0, 0, 0, 0)
      const candidateDay = new Date(candidate.recordDate)
      candidateDay.setHours(0, 0, 0, 0)
      if (currentDay.getTime() !== candidateDay.getTime()) {
        previousRecord = candidate
        lastDelta = current.totalDebt - candidate.totalDebt
        break
      }
    }
    if (previousRecord) break
  }

  if (lastDelta === 0 && rows.length >= 2) {
    const first = rows[0]!
    const second = rows[1]!
    const timeDiff = first.recordDate.getTime() - second.recordDate.getTime()
    const daysDiff = timeDiff / (1000 * 60 * 60 * 24)
    if (daysDiff > 0) {
      lastDelta = (first.totalDebt - second.totalDebt) / daysDiff
    }
  }

  let totalChange = 0
  let dayCount = 0
  for (let i = 0; i < Math.min(rows.length - 1, 7); i++) {
    const current = rows[i]!
    const next = rows[i + 1]!
    const timeDiff = current.recordDate.getTime() - next.recordDate.getTime()
    const daysDiff = timeDiff / (1000 * 60 * 60 * 24)
    if (daysDiff > 0 && daysDiff <= 2) {
      totalChange += (current.totalDebt - next.totalDebt) / daysDiff
      dayCount += 1
    }
  }
  const avgDailyChange = dayCount > 0 ? totalChange / dayCount : lastDelta
  const perSecond = avgDailyChange / (24 * 60 * 60)

  const now = new Date()
  const secondsSinceLastRecord = (now.getTime() - latest.recordDate.getTime()) / 1000
  const estimatedTotalDelta = perSecond * secondsSinceLastRecord
  const liveNow = latestTotal + estimatedTotalDelta

  const todayStart = new Date(now)
  todayStart.setHours(0, 0, 0, 0)
  const secondsSinceMidnight = (now.getTime() - todayStart.getTime()) / 1000
  const estimatedTodayDelta = perSecond * secondsSinceMidnight

  return {
    latestDateUTC,
    latestTotal,
    perSecond,
    estimatedTodayDelta,
    liveNow,
    lastDelta: avgDailyChange
  }
}

async function getFederalSpendingAndDeficit(): Promise<{
  annualSpending: number
  annualDeficit: number
}> {
  const now = Date.now()
  if (mtsCache && now - mtsCache.timestamp < MTS_CACHE_DURATION_MS) {
    return { annualSpending: mtsCache.annualSpending, annualDeficit: mtsCache.annualDeficit }
  }
  try {
    const response = await fetchWithRetry(
      FISCAL_REVENUE_URL,
      { cache: "no-store" },
      "MTS Table 1",
      { attempts: 1, timeoutMs: TREASURY_MTS_TIMEOUT_MS }
    )
    const json = (await response.json()) as MtsTable1ApiResponse
    if (json.success === false) throw new Error("Fiscal revenue proxy returned success=false")
    if (!json.data || !Array.isArray(json.data) || json.data.length === 0) {
      throw new Error("No MTS Table 1 data returned")
    }
    const parsedRows = json.data
      .map((row) => ({
        row,
        spending: Number.parseFloat(row.current_month_gross_outly_amt || "0")
      }))
      .filter(({ spending }) => Number.isFinite(spending) && spending > 0)
    if (parsedRows.length === 0) throw new Error("No valid MTS Table 1 spending rows returned")

    const pickBest = (rows: typeof parsedRows) => {
      if (rows.length === 0) return null
      return rows.reduce((best, current) => (current.spending > best.spending ? current : best))
    }
    const september = pickBest(parsedRows.filter(({ row }) => row.record_calendar_month === "09"))
    const target = september?.row ?? pickBest(parsedRows)?.row
    if (!target) throw new Error("No fallback MTS row available")

    const fytdSpending = Number.parseFloat(target.current_month_gross_outly_amt || "0")
    const fytdDeficit = Number.parseFloat(target.current_month_dfct_sur_amt || "0")
    const result = { annualSpending: fytdSpending, annualDeficit: Math.abs(fytdDeficit) }
    mtsCache = { ...result, timestamp: now }
    return result
  } catch (error) {
    console.error("[lib/slides/data/debt.ts:getFederalSpendingAndDeficit]", error)
    if (mtsCache) {
      return { annualSpending: mtsCache.annualSpending, annualDeficit: mtsCache.annualDeficit }
    }
    return { annualSpending: 0, annualDeficit: 0 }
  }
}

export async function getDebtSlideData(): Promise<DebtData> {
  const now = Date.now()
  if (debtCache && now - debtCache.timestamp < DEBT_CACHE_DURATION_MS) {
    return debtCache.data
  }
  try {
    const response = await fetchWithRetry(FISCAL_DEBT_URL, { cache: "no-store" }, "Treasury", {
      attempts: 2,
      timeoutMs: TREASURY_DEBT_TIMEOUT_MS
    })
    const json = (await response.json()) as DebtApiResponse & { success?: boolean }
    if (json.success === false) throw new Error("Fiscal debt proxy returned success=false")
    const rows = parseDebtApi(json)
    if (rows.length === 0) throw new Error("Treasury API returned no valid debt rows")

    const calculation =
      rows.length >= 2
        ? computeRate(rows)
        : {
            latestDateUTC: rows[0]!.recordDate.toISOString(),
            latestTotal: rows[0]!.totalDebt,
            perSecond: 0,
            estimatedTodayDelta: 0,
            liveNow: rows[0]!.totalDebt,
            lastDelta: 0
          }

    const [btcPriceUsd, { annualSpending, annualDeficit }] = await Promise.all([
      getBtcPriceUsd(),
      getFederalSpendingAndDeficit()
    ])

    const result: DebtData = {
      liveEstimateNow: calculation.liveNow,
      perSecond: calculation.perSecond,
      annualFederalSpending: annualSpending,
      annualBudgetDeficit: annualDeficit,
      btcPriceUsd
    }
    debtCache = { data: result, timestamp: now }
    return result
  } catch (error) {
    console.error("[lib/slides/data/debt.ts:getDebtSlideData]", error)
    if (debtCache) return debtCache.data
    return {
      liveEstimateNow: 0,
      perSecond: 0,
      annualFederalSpending: 0,
      annualBudgetDeficit: 0,
      btcPriceUsd: 0
    }
  }
}

/** Test-only helper. */
export function __resetDebtCachesForTests() {
  debtCache = null
  mtsCache = null
}
