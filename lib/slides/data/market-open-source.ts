import type { MarketIndex, MarketIndexPoint, MarketOpenData } from "@/lib/slides/types"

const MARKET_CACHE_DURATION_MS = 30_000
const MAX_POINTS = 48

type MarketItem = Record<string, unknown>

export type MarketInstrumentConfig = {
  id: string
  label: string
  primary: string[]
  proxies: string[]
  demo: {
    symbol: string
    proxySymbol: string
    price: number
    change: number
    changePercent: number
  }
}

export type MarketOpenConfig = {
  envPrefix: string
  logLabel: string
  marketName: string
  regionLabel: string
  previewLabel: string
  timezone: string
  open: { hour: number; minute: number }
  close: { hour: number; minute: number }
  instruments: MarketInstrumentConfig[]
}

export function createMarketOpenDataSource(config: MarketOpenConfig) {
  let marketCache: { data: MarketOpenData; timestamp: number } | null = null
  let pointHistory = new Map<string, MarketIndexPoint[]>()

  async function getData(now = new Date()): Promise<MarketOpenData> {
    const timestamp = Date.now()
    const providerUrl = process.env[`${config.envPrefix}_MARKET_DATA_URL`]
    if (!providerUrl) return buildDemoData(config, now)

    if (marketCache && timestamp - marketCache.timestamp < MARKET_CACHE_DURATION_MS) {
      return {
        ...marketCache.data,
        ...getMarketClock(config, now)
      }
    }

    try {
      const items = await fetchProviderMarketItems(config, providerUrl)
      const updatedAt = now.toISOString()
      const instruments = config.instruments.map((instrument) =>
        normalizeInstrument(config, instrument, items, updatedAt, pointHistory)
      )
      const data: MarketOpenData = {
        mode: "live",
        marketName: config.marketName,
        regionLabel: config.regionLabel,
        previewLabel: config.previewLabel,
        ...getMarketClock(config, now),
        updatedAt,
        cacheSeconds: MARKET_CACHE_DURATION_MS / 1000,
        source: process.env[`${config.envPrefix}_MARKET_DATA_PROVIDER`] || "Configured market API",
        instruments
      }
      marketCache = { data, timestamp }
      return data
    } catch (error) {
      console.error(`[${config.logLabel}]`, error)
      if (marketCache) {
        return {
          ...marketCache.data,
          ...getMarketClock(config, now),
          stale: true
        }
      }
      return {
        mode: "unavailable",
        marketName: config.marketName,
        regionLabel: config.regionLabel,
        previewLabel: config.previewLabel,
        ...getMarketClock(config, now),
        updatedAt: now.toISOString(),
        cacheSeconds: MARKET_CACHE_DURATION_MS / 1000,
        source: process.env[`${config.envPrefix}_MARKET_DATA_PROVIDER`] || "Configured market API",
        instruments: config.instruments.map((instrument) =>
          unavailableInstrument(instrument, pointHistory)
        )
      }
    }
  }

  function reset() {
    marketCache = null
    pointHistory = new Map()
  }

  return { getData, reset }
}

async function fetchProviderMarketItems(
  config: MarketOpenConfig,
  providerUrl: string
): Promise<MarketItem[]> {
  const apiKey = process.env[`${config.envPrefix}_MARKET_DATA_KEY`] ?? ""
  const headers: Record<string, string> = { Accept: "application/json" }
  if (apiKey) headers["x-api-key"] = apiKey

  const response = await fetch(providerUrl, {
    headers,
    cache: "no-store",
    signal: AbortSignal.timeout(10_000)
  })
  if (!response.ok) throw new Error(`${config.marketName} market data error: ${response.status}`)
  const envelope = (await response.json()) as {
    success?: boolean
    data?: unknown
    markets?: unknown
    instruments?: unknown
  }
  const items = Array.isArray(envelope.data)
    ? envelope.data
    : Array.isArray(envelope.markets)
      ? envelope.markets
      : Array.isArray(envelope.instruments)
        ? envelope.instruments
        : Array.isArray(envelope)
          ? envelope
          : []
  if (envelope.success === false) throw new Error(`${config.marketName} market data success=false`)
  return items.filter(isObject)
}

function buildDemoData(config: MarketOpenConfig, now: Date): MarketOpenData {
  const updatedAt = now.toISOString()
  return {
    mode: "demo",
    marketName: config.marketName,
    regionLabel: config.regionLabel,
    previewLabel: config.previewLabel,
    ...getMarketClock(config, now),
    updatedAt,
    cacheSeconds: 0,
    source: "Demo board",
    instruments: config.instruments.map((instrument, index) =>
      demoInstrument(instrument, updatedAt, index)
    )
  }
}

function demoInstrument(
  config: MarketInstrumentConfig,
  updatedAt: string,
  index: number
): MarketIndex {
  const { demo } = config
  const points = [
    { timestamp: updatedAt, price: demo.price - demo.change * 0.7 - index * 0.8 },
    { timestamp: updatedAt, price: demo.price - demo.change * 0.35 + index * 0.35 },
    { timestamp: updatedAt, price: demo.price }
  ]
  return {
    id: config.id,
    label: config.label,
    symbol: demo.symbol,
    proxySymbol: demo.proxySymbol,
    price: demo.price,
    change: demo.change,
    changePercent: demo.changePercent,
    source: "Demo data - not live",
    points
  }
}

function normalizeInstrument(
  config: MarketOpenConfig,
  instrument: MarketInstrumentConfig,
  items: MarketItem[],
  updatedAt: string,
  pointHistory: Map<string, MarketIndexPoint[]>
): MarketIndex {
  const primary = findBySymbols(items, instrument.primary)
  const proxy = findBySymbols(items, instrument.proxies)
  const item = primary ?? proxy
  if (!item) return unavailableInstrument(instrument, pointHistory)

  const price = firstNumber(item, ["priceUSD", "price", "last", "value", "close"])
  if (price === null || price <= 0) return unavailableInstrument(instrument, pointHistory)

  const change = firstNumber(item, ["changeUSD", "change", "changePrice", "priceChange"])
  const changePercent = firstNumber(item, [
    "changePercentUSD",
    "changePercent",
    "priceChangePercent",
    "percentChange"
  ])
  const symbol = firstString(item, ["symbol", "ticker", "id"]) ?? instrument.primary[0]!
  const points = pushPoint(instrument.id, { timestamp: updatedAt, price }, pointHistory)

  return {
    id: instrument.id,
    label: instrument.label,
    symbol,
    proxySymbol: primary ? instrument.primary[0]! : instrument.proxies[0]!,
    price,
    change,
    changePercent,
    source: primary
      ? `${config.marketName} configured API`
      : `${config.marketName} configured API proxy`,
    points
  }
}

function unavailableInstrument(
  config: MarketInstrumentConfig,
  pointHistory: Map<string, MarketIndexPoint[]>
): MarketIndex {
  return {
    id: config.id,
    label: config.label,
    symbol: config.primary[0]!,
    proxySymbol: config.proxies[0]!,
    price: null,
    change: null,
    changePercent: null,
    source: "Configured market API",
    points: pointHistory.get(config.id) ?? [],
    unavailable: true
  }
}

function findBySymbols(items: MarketItem[], symbols: string[]) {
  const wanted = new Set(symbols.map(normalizeSymbol))
  return (
    items.find((item) => {
      const symbol = firstString(item, ["symbol", "ticker", "id"])
      return symbol ? wanted.has(normalizeSymbol(symbol)) : false
    }) ?? null
  )
}

function normalizeSymbol(symbol: string) {
  return symbol.replace(/^\//, "").toUpperCase()
}

function pushPoint(
  id: string,
  point: MarketIndexPoint,
  pointHistory: Map<string, MarketIndexPoint[]>
) {
  const points = [...(pointHistory.get(id) ?? [])]
  const last = points.at(-1)
  if (!last || last.price !== point.price) points.push(point)
  const limited = points.slice(-MAX_POINTS)
  pointHistory.set(id, limited)
  return limited
}

function firstNumber(item: MarketItem, keys: string[]) {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === "number" && Number.isFinite(value)) return value
    if (typeof value === "string") {
      const parsed = Number.parseFloat(value.replace(/,/g, ""))
      if (Number.isFinite(parsed)) return parsed
    }
  }
  return null
}

function firstString(item: MarketItem, keys: string[]) {
  for (const key of keys) {
    const value = item[key]
    if (typeof value === "string" && value.trim()) return value.trim()
  }
  return null
}

function getMarketClock(
  config: MarketOpenConfig,
  now: Date
): Pick<MarketOpenData, "phase" | "nextBellAt" | "nextBellLabel" | "marketTimezone"> {
  const parts = getZonedParts(config.timezone, now)
  const weekday = parts.weekday
  const minutes = parts.hour * 60 + parts.minute
  const openMinutes = config.open.hour * 60 + config.open.minute
  const closeMinutes = config.close.hour * 60 + config.close.minute
  const isWeekday = weekday >= 1 && weekday <= 5

  if (isWeekday && minutes < openMinutes) {
    return {
      phase: "pre-market",
      nextBellAt: zonedWallTimeToUtc(
        config.timezone,
        parts.year,
        parts.month,
        parts.day,
        config.open.hour,
        config.open.minute
      ).toISOString(),
      nextBellLabel: "Opening bell",
      marketTimezone: config.timezone
    }
  }
  if (isWeekday && minutes < closeMinutes) {
    return {
      phase: "open",
      nextBellAt: zonedWallTimeToUtc(
        config.timezone,
        parts.year,
        parts.month,
        parts.day,
        config.close.hour,
        config.close.minute
      ).toISOString(),
      nextBellLabel: "Closing bell",
      marketTimezone: config.timezone
    }
  }
  const next = nextWeekday(parts.year, parts.month, parts.day, isWeekday ? 1 : 1)
  return {
    phase: isWeekday ? "after-hours" : "closed",
    nextBellAt: zonedWallTimeToUtc(
      config.timezone,
      next.year,
      next.month,
      next.day,
      config.open.hour,
      config.open.minute
    ).toISOString(),
    nextBellLabel: "Opening bell",
    marketTimezone: config.timezone
  }
}

function getZonedParts(timeZone: string, date: Date) {
  const values = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).formatToParts(date)
  const part = (type: string) => Number(values.find((value) => value.type === type)?.value ?? 0)
  const weekday = Number(
    new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short" })
      .format(date)
      .replace("Sun", "0")
      .replace("Mon", "1")
      .replace("Tue", "2")
      .replace("Wed", "3")
      .replace("Thu", "4")
      .replace("Fri", "5")
      .replace("Sat", "6")
  )
  return {
    year: part("year"),
    month: part("month"),
    day: part("day"),
    hour: part("hour") % 24,
    minute: part("minute"),
    weekday
  }
}

function nextWeekday(year: number, month: number, day: number, minimumDaysAhead: number) {
  const utc = new Date(Date.UTC(year, month - 1, day + minimumDaysAhead, 12, 0, 0))
  while (utc.getUTCDay() === 0 || utc.getUTCDay() === 6) {
    utc.setUTCDate(utc.getUTCDate() + 1)
  }
  return { year: utc.getUTCFullYear(), month: utc.getUTCMonth() + 1, day: utc.getUTCDate() }
}

function zonedWallTimeToUtc(
  timeZone: string,
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
) {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0))
  const parts = getZonedParts(timeZone, guess)
  const diffMinutes =
    (parts.year - year) * 525_600 +
    (parts.month - month) * 43_200 +
    (parts.day - day) * 1_440 +
    (parts.hour - hour) * 60 +
    (parts.minute - minute)
  return new Date(guess.getTime() - diffMinutes * 60_000)
}

function isObject(value: unknown): value is MarketItem {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export const __internals = {
  getMarketClock,
  normalizeInstrument,
  MARKET_CACHE_DURATION_MS
}
