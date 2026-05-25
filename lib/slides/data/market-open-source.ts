import type { MarketIndex, MarketIndexPoint, MarketOpenData } from "@/lib/slides/types"

const MARKET_CACHE_DURATION_MS = 30_000
const MAX_POINTS = 48

type MarketItem = Record<string, unknown>

type StooqSymbolConfig = {
  symbol: string
  proxy?: boolean
}

export type MarketInstrumentConfig = {
  id: string
  label: string
  primary: string[]
  proxies: string[]
  stooq?: StooqSymbolConfig[]
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
  let refreshPromise: Promise<MarketOpenData> | null = null
  let pointHistory = new Map<string, MarketIndexPoint[]>()

  async function getData(now = new Date()): Promise<MarketOpenData> {
    const timestamp = Date.now()
    if (marketCache && timestamp - marketCache.timestamp < MARKET_CACHE_DURATION_MS) {
      return {
        ...marketCache.data,
        ...getMarketClock(config, now)
      }
    }
    if (refreshPromise) {
      const data = await refreshPromise
      return {
        ...data,
        ...getMarketClock(config, now)
      }
    }

    refreshPromise = refreshMarketData(config, now, pointHistory)
      .then((data) => {
        marketCache = { data, timestamp }
        return data
      })
      .finally(() => {
        refreshPromise = null
      })

    try {
      return await refreshPromise
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
        source: getActiveProviderLabel(config),
        instruments: config.instruments.map((instrument) =>
          unavailableInstrument(instrument, pointHistory, getActiveProviderLabel(config))
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

async function refreshMarketData(
  config: MarketOpenConfig,
  now: Date,
  pointHistory: Map<string, MarketIndexPoint[]>
): Promise<MarketOpenData> {
  const providerUrl = process.env[`${config.envPrefix}_MARKET_DATA_URL`]
  const providerLabel = getActiveProviderLabel(config)
  const items = providerUrl
    ? await fetchProviderMarketItems(config, providerUrl)
    : await fetchStooqMarketItems(config)
  const updatedAt = newestProviderTimestamp(items) ?? now.toISOString()
  const instruments = config.instruments.map((instrument) =>
    providerUrl
      ? normalizeConfiguredInstrument(config, instrument, items, updatedAt, pointHistory)
      : normalizeStooqInstrument(instrument, items, updatedAt, pointHistory)
  )
  if (!providerUrl && instruments.every((instrument) => instrument.unavailable)) {
    throw new Error(`${config.marketName} Stooq data unavailable`)
  }

  return {
    mode: "live",
    marketName: config.marketName,
    regionLabel: config.regionLabel,
    previewLabel: config.previewLabel,
    ...getMarketClock(config, now),
    updatedAt,
    cacheSeconds: MARKET_CACHE_DURATION_MS / 1000,
    source: providerLabel,
    instruments
  }
}

function getActiveProviderLabel(config: MarketOpenConfig) {
  if (process.env[`${config.envPrefix}_MARKET_DATA_URL`]) {
    return process.env[`${config.envPrefix}_MARKET_DATA_PROVIDER`] || "Configured market API"
  }
  return "Stooq delayed quotes"
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

async function fetchStooqMarketItems(config: MarketOpenConfig): Promise<MarketItem[]> {
  const symbols = [
    ...new Set(
      config.instruments
        .flatMap((instrument) => instrument.stooq ?? [])
        .map((candidate) => candidate.symbol)
    )
  ]
  if (symbols.length === 0) throw new Error(`${config.marketName} has no Stooq symbols`)

  const results = await Promise.allSettled(
    symbols.map(async (symbol) => {
      const response = await fetch(
        `https://stooq.com/q/l/?s=${encodeURIComponent(symbol)}&f=sd2t2ohlcv&h&e=csv`,
        {
          headers: { Accept: "text/csv,text/plain,*/*" },
          cache: "no-store",
          signal: AbortSignal.timeout(10_000)
        }
      )
      if (!response.ok) throw new Error(`Stooq ${symbol} error: ${response.status}`)
      return parseStooqQuote(symbol, await response.text())
    })
  )

  const items = results.flatMap((result) => {
    if (result.status === "fulfilled" && result.value) return [result.value]
    return []
  })
  if (items.length === 0) throw new Error(`${config.marketName} Stooq data unavailable`)
  return items
}

function parseStooqQuote(symbol: string, csv: string): MarketItem | null {
  const lines = csv
    .trim()
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const values = splitCsvLine(lines.at(-1) ?? "")
  if (values.length < 8) return null
  const [rawSymbol, date, time, openRaw, , , closeRaw, volumeRaw] = values
  if (!rawSymbol || rawSymbol.toUpperCase() === "N/D") return null
  const open = parseFiniteNumber(openRaw)
  const close = parseFiniteNumber(closeRaw)
  if (open === null || open <= 0 || close === null || close <= 0) return null
  const change = close - open
  return {
    symbol: rawSymbol || symbol,
    price: close,
    close,
    open,
    change,
    changePercent: (change / open) * 100,
    volume: parseFiniteNumber(volumeRaw),
    updatedAt: parseStooqTimestamp(date ?? "", time ?? "")
  }
}

function splitCsvLine(line: string) {
  return line.split(",").map((value) => value.trim())
}

function parseFiniteNumber(value: unknown) {
  if (typeof value !== "string" && typeof value !== "number") return null
  const parsed = typeof value === "number" ? value : Number.parseFloat(value.replace(/,/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

function parseStooqTimestamp(date: string, time: string) {
  const parsed = new Date(`${date}T${time || "00:00:00"}Z`)
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString()
}

function newestProviderTimestamp(items: MarketItem[]) {
  const timestamps = items
    .map((item) => firstString(item, ["updatedAt"]))
    .filter((value): value is string => Boolean(value))
    .map((value) => new Date(value).getTime())
    .filter(Number.isFinite)
  if (timestamps.length === 0) return null
  return new Date(Math.max(...timestamps)).toISOString()
}

function normalizeInstrument(
  config: MarketOpenConfig,
  instrument: MarketInstrumentConfig,
  items: MarketItem[],
  updatedAt: string,
  pointHistory: Map<string, MarketIndexPoint[]>
): MarketIndex {
  return normalizeConfiguredInstrument(config, instrument, items, updatedAt, pointHistory)
}

function normalizeConfiguredInstrument(
  config: MarketOpenConfig,
  instrument: MarketInstrumentConfig,
  items: MarketItem[],
  updatedAt: string,
  pointHistory: Map<string, MarketIndexPoint[]>
): MarketIndex {
  const primary = findBySymbols(items, instrument.primary)
  const proxy = findBySymbols(items, instrument.proxies)
  const item = primary ?? proxy
  if (!item) return unavailableInstrument(instrument, pointHistory, "Configured market API")

  const price = firstNumber(item, ["priceUSD", "price", "last", "value", "close"])
  if (price === null || price <= 0) {
    return unavailableInstrument(instrument, pointHistory, "Configured market API")
  }

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

function normalizeStooqInstrument(
  instrument: MarketInstrumentConfig,
  items: MarketItem[],
  updatedAt: string,
  pointHistory: Map<string, MarketIndexPoint[]>
): MarketIndex {
  const candidates = instrument.stooq ?? []
  for (const candidate of candidates) {
    const item = findBySymbols(items, [candidate.symbol])
    if (!item) continue
    const price = firstNumber(item, ["price", "close"])
    if (price === null || price <= 0) continue
    const symbol = firstString(item, ["symbol"]) ?? candidate.symbol
    const points = pushPoint(instrument.id, { timestamp: updatedAt, price }, pointHistory)
    return {
      id: instrument.id,
      label: instrument.label,
      symbol,
      proxySymbol: candidate.symbol,
      price,
      change: firstNumber(item, ["change"]),
      changePercent: firstNumber(item, ["changePercent"]),
      source: candidate.proxy ? "Stooq ETF proxy" : "Stooq delayed quote",
      points
    }
  }
  return unavailableInstrument(instrument, pointHistory, "Stooq delayed quotes")
}

function unavailableInstrument(
  config: MarketInstrumentConfig,
  pointHistory: Map<string, MarketIndexPoint[]>,
  source = "Configured market API"
): MarketIndex {
  return {
    id: config.id,
    label: config.label,
    symbol: config.primary[0]!,
    proxySymbol: config.proxies[0]!,
    price: null,
    change: null,
    changePercent: null,
    source,
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
