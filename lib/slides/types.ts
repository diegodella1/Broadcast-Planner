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

export type MarketOpenPhase = "pre-market" | "open" | "after-hours" | "closed"
export type MarketDataMode = "demo" | "live" | "unavailable"

export type MarketIndexPoint = {
  timestamp: string
  price: number
}

export type MarketIndex = {
  id: string
  label: string
  symbol: string
  proxySymbol: string
  price: number | null
  change: number | null
  changePercent: number | null
  source: string
  points: MarketIndexPoint[]
  unavailable?: boolean
}

export type MarketOpenData = {
  mode: MarketDataMode
  phase: MarketOpenPhase
  marketName: string
  regionLabel: string
  previewLabel: string
  nextBellAt: string
  nextBellLabel: "Opening bell" | "Closing bell"
  marketTimezone: string
  updatedAt: string
  cacheSeconds: number
  stale?: boolean
  source: string
  instruments: MarketIndex[]
}

export type UsMarketPhase = MarketOpenPhase
export type UsMarketDataMode = MarketDataMode
export type UsMarketIndexPoint = MarketIndexPoint
export type UsMarketIndex = MarketIndex
export type UsMarketOpenData = MarketOpenData

export type DebtData = {
  liveEstimateNow: number
  perSecond: number
  annualFederalSpending: number
  annualBudgetDeficit: number
  btcPriceUsd: number
  debtAsOf?: string
  debtSource?: string
  btcPriceSource?: string
  btcPriceUpdatedAt?: string
  population?: number
  populationAsOf?: string
  populationSource?: string
  taxReturns?: number
  taxReturnsAsOf?: string
  taxReturnsSource?: string
  gdpUsd?: number
  gdpAsOf?: string
  gdpSource?: string
  debtGdpNowPct?: number
  debtGdpHistory?: Array<{ year: string; pct: number }>
  debtGdpSource?: string
  stale?: boolean
  warnings?: string[]
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

export type WeatherForecastPoint = {
  label: string
  temperatureC: number | null
  condition: string
  precipitationProbability: number | null
}

export type WeatherSlideData = {
  available: boolean
  locationName: string
  temperatureC: number | null
  feelsLikeC: number | null
  humidityPct: number | null
  windKph: number | null
  condition: string
  description: string
  iconCode: string | null
  forecast: WeatherForecastPoint[]
  updatedAt: string
  reason?: string
}

export type GuestLineupGuest = {
  id: string
  name: string
  role: string | null
  company: string | null
  host: string | null
  program: string | null
  category: string
  appearanceAt: string | null
  photoUrl: string | null
  photoAssetId?: string | null
  videoUrl: string | null
  videoAssetId?: string | null
  color: string
  sortOrder: number
}

export type GuestLineupData = {
  mode: "live" | "demo" | "unavailable"
  guests: GuestLineupGuest[]
  updatedAt: string
  rotationSeconds: number
  cacheSeconds: number
  endpoint?: string
  stale?: boolean
  source: string
}
