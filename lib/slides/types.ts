/**
 * Domain types shared across slide components.
 * Ported from backgroundclima/lib/supabase/types.ts — only the shapes
 * the 14 slide renderers actually consume.
 */

export type EventTextSize = "small" | "medium" | "large" | "xlarge"
export type LayoutOrientation = "horizontal" | "vertical"
export type EventSlideStyle = "classic" | "modern"

export type ScheduleTime = {
  timezone: string
  time: string
}

export type CalendarEvent = {
  id: string
  title: string
  description: string | null
  image_url: string | null
  start_date: string
  end_date: string | null
  start_time: string | null
  end_time: string | null
  is_active: boolean
  order_index: number
  color: string
  title_font: string | null
  title_size: EventTextSize | null
  title_color: string | null
  text_color: string | null
  overlay_opacity: number | null
  show_date_badge: boolean
  location: string | null
  schedule_times: ScheduleTime[] | null
  created_at: string
  updated_at: string
}

export type MarketCommodity = {
  usd: number
  sats: number
  change24hPct: number | null
}

export type FxPair = {
  usdPerUnit: number
  satsPerUnit: number
}

export type MarketsSatsData = {
  btcUsd: number
  timestamp: string
  metals: {
    gold: MarketCommodity
    silver: MarketCommodity
  }
  oil: {
    wti: MarketCommodity
    brent: MarketCommodity
  }
  copper: MarketCommodity
  fx: {
    EUR: FxPair
    JPY: FxPair
    GBP: FxPair
    USD: FxPair
  }
  stale?: boolean
}

export type DebtData = {
  liveEstimateNow: number
  perSecond: number
  annualFederalSpending: number
  annualBudgetDeficit: number
  btcPriceUsd: number
}

export type StrcData = {
  strc: {
    price: number
    previousClose: number
    priceChange: number
    priceChangePercent: number
    negative: boolean
    volume: number | null
  }
  btc: { price: number }
  dividends: ReadonlyArray<{
    period: string
    recordDate: string
    payDate: string
    usd: number
    rate: number
    btc: number
  }>
  metrics: {
    parValue: number
    annualDiv: number
    annualRate: number
    monthlyDiv: number
    monthlyDivBtc: number
    annualDivBtc: number
    effYield: number
    marketCap: number | null
    sharesOutstanding: number | null
    nextPayoutDate: string
    nextRecordDate: string
    sharpeRatio?: number
    annualizedVolatility?: number
    vwap1mo?: number
    mstrPrice?: number
    correlations?: { mstr: number; spy: number; btc: number; pff?: number }
  }
  lastUpdate: string
}

export type SataData = {
  preferred: {
    ticker: string
    name: string
    price: number | null
    priceChange: number | null
    priceChangePercent: number | null
    volume: number | null
    previousClose: number | null
  } | null
  btc: { price: number }
  metrics: {
    monthlyDiv: number
    annualDiv: number
    monthlyDivBtc: number
    annualDivBtc: number
    effYield: number | null
    marketCap: number | null
    sharesOutstanding: number | null
    nextPayoutDate: string | null
    nextRecordDate: string | null
    companyName: string | null
    yearHigh: number | null
    yearLow: number | null
    avgVolume30D: number | null
  }
  source?: string
  lastUpdate: string
}

export type NewsSlideData = {
  imageUrl: string
  headline: string
  description?: string | null
  source?: string | null
  durationSeconds: number
}

export type ShowSlideData = {
  name: string
  description?: string | null
  imageUrl?: string | null
  hostName?: string | null
  showDays?: string | null
  scheduleTimes: ScheduleTime[]
}

export type VideoSlideData = {
  videoUrl: string
  loopCount: number | null
}
