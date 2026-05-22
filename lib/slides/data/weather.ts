import type { WeatherForecastPoint, WeatherSlideData } from "@/lib/slides/types"

const DEFAULT_LOCATION_NAME = "Buenos Aires"
const DEFAULT_LAT = -34.6037
const DEFAULT_LON = -58.3816
const WEATHER_CACHE_DURATION_MS = 10 * 60 * 1000

type WeatherCacheEntry = { data: WeatherSlideData; timestamp: number }

type OpenWeatherCurrent = {
  name?: string
  weather?: Array<{ main?: string; description?: string; icon?: string }>
  main?: { temp?: number; feels_like?: number; humidity?: number }
  wind?: { speed?: number }
}

type OpenWeatherForecast = {
  list?: Array<{
    dt_txt?: string
    pop?: number
    weather?: Array<{ main?: string; description?: string; icon?: string }>
    main?: { temp?: number }
  }>
}

let weatherCache: WeatherCacheEntry | null = null

export async function getWeatherSlideData(): Promise<WeatherSlideData> {
  const now = Date.now()
  if (weatherCache && now - weatherCache.timestamp < WEATHER_CACHE_DURATION_MS) {
    return weatherCache.data
  }

  const apiKey = process.env.OPENWEATHER_API_KEY ?? process.env.OPENWEATHERMAP_API_KEY ?? ""
  if (!apiKey) {
    return unavailableWeatherData("OPENWEATHER_API_KEY is not configured")
  }

  const lat = parseCoordinate(process.env.WEATHER_LAT, DEFAULT_LAT)
  const lon = parseCoordinate(process.env.WEATHER_LON, DEFAULT_LON)
  const configuredLocation = process.env.WEATHER_LOCATION_NAME ?? DEFAULT_LOCATION_NAME

  try {
    const params = new URLSearchParams({
      appid: apiKey,
      lat: String(lat),
      lon: String(lon),
      units: "metric"
    })
    const [currentResponse, forecastResponse] = await Promise.all([
      fetch(`https://api.openweathermap.org/data/2.5/weather?${params.toString()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(7_000)
      }),
      fetch(`https://api.openweathermap.org/data/2.5/forecast?${params.toString()}`, {
        cache: "no-store",
        signal: AbortSignal.timeout(7_000)
      })
    ])

    if (!currentResponse.ok) {
      throw new Error(`OpenWeather current returned ${currentResponse.status}`)
    }
    if (!forecastResponse.ok) {
      throw new Error(`OpenWeather forecast returned ${forecastResponse.status}`)
    }

    const current = (await currentResponse.json()) as OpenWeatherCurrent
    const forecast = (await forecastResponse.json()) as OpenWeatherForecast
    const condition = current.weather?.[0]
    const data: WeatherSlideData = {
      available: true,
      locationName: current.name || configuredLocation,
      temperatureC: numberOrNull(current.main?.temp),
      feelsLikeC: numberOrNull(current.main?.feels_like),
      humidityPct: numberOrNull(current.main?.humidity),
      windKph:
        typeof current.wind?.speed === "number" ? Math.round(current.wind.speed * 3.6) : null,
      condition: condition?.main || "Weather",
      description: titleCase(condition?.description || condition?.main || "Current conditions"),
      iconCode: condition?.icon ?? null,
      forecast: mapForecast(forecast),
      updatedAt: new Date().toISOString()
    }

    weatherCache = { data, timestamp: now }
    return data
  } catch (error) {
    console.error("[lib/slides/data/weather.ts:getWeatherSlideData]", error)
    if (weatherCache) return { ...weatherCache.data, reason: "stale weather cache" }
    return unavailableWeatherData(error instanceof Error ? error.message : "weather fetch failed")
  }
}

function mapForecast(payload: OpenWeatherForecast): WeatherForecastPoint[] {
  const points = Array.isArray(payload.list) ? payload.list : []
  return points.slice(0, 4).map((point) => {
    const condition = point.weather?.[0]
    return {
      label: formatForecastLabel(point.dt_txt),
      temperatureC: numberOrNull(point.main?.temp),
      condition: condition?.main || "Weather",
      precipitationProbability: typeof point.pop === "number" ? Math.round(point.pop * 100) : null
    }
  })
}

function unavailableWeatherData(reason: string): WeatherSlideData {
  return {
    available: false,
    locationName: process.env.WEATHER_LOCATION_NAME ?? DEFAULT_LOCATION_NAME,
    temperatureC: null,
    feelsLikeC: null,
    humidityPct: null,
    windKph: null,
    condition: "Unavailable",
    description: "Weather data unavailable",
    iconCode: null,
    forecast: [],
    updatedAt: new Date().toISOString(),
    reason
  }
}

function parseCoordinate(value: string | undefined, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function numberOrNull(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? value : null
}

function formatForecastLabel(value: string | undefined) {
  if (!value) return "Next"
  const date = new Date(value.replace(" ", "T"))
  if (Number.isNaN(date.getTime())) return "Next"
  return date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false })
}

function titleCase(value: string) {
  return value.replace(/\b\w/g, (letter) => letter.toUpperCase())
}

export function __resetWeatherCacheForTests() {
  weatherCache = null
}
