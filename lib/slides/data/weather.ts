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

type OpenMeteoPayload = {
  current?: {
    time?: string
    temperature_2m?: number
    apparent_temperature?: number
    relative_humidity_2m?: number
    wind_speed_10m?: number
    weather_code?: number
  }
  hourly?: {
    time?: string[]
    temperature_2m?: number[]
    precipitation_probability?: number[]
    weather_code?: number[]
  }
}

let weatherCache: WeatherCacheEntry | null = null

export async function getWeatherSlideData(): Promise<WeatherSlideData> {
  const now = Date.now()
  if (weatherCache && now - weatherCache.timestamp < WEATHER_CACHE_DURATION_MS) {
    return weatherCache.data
  }

  const apiKey = process.env.OPENWEATHER_API_KEY ?? process.env.OPENWEATHERMAP_API_KEY ?? ""

  const lat = parseCoordinate(process.env.WEATHER_LAT, DEFAULT_LAT)
  const lon = parseCoordinate(process.env.WEATHER_LON, DEFAULT_LON)
  const configuredLocation = process.env.WEATHER_LOCATION_NAME ?? DEFAULT_LOCATION_NAME

  if (!apiKey) {
    return fetchOpenMeteoWeather(lat, lon, configuredLocation)
  }

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

async function fetchOpenMeteoWeather(
  lat: number,
  lon: number,
  configuredLocation: string
): Promise<WeatherSlideData> {
  try {
    const params = new URLSearchParams({
      latitude: String(lat),
      longitude: String(lon),
      current: [
        "temperature_2m",
        "apparent_temperature",
        "relative_humidity_2m",
        "wind_speed_10m",
        "weather_code"
      ].join(","),
      hourly: ["temperature_2m", "precipitation_probability", "weather_code"].join(","),
      forecast_days: "2",
      timezone: "auto"
    })
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params.toString()}`, {
      cache: "no-store",
      signal: AbortSignal.timeout(7_000),
      headers: { Accept: "application/json" }
    })
    if (!response.ok) throw new Error(`Open-Meteo returned ${response.status}`)
    const payload = (await response.json()) as OpenMeteoPayload
    const weather = weatherCodeLabel(payload.current?.weather_code)
    const data: WeatherSlideData = {
      available: true,
      locationName: configuredLocation,
      temperatureC: numberOrNull(payload.current?.temperature_2m),
      feelsLikeC: numberOrNull(payload.current?.apparent_temperature),
      humidityPct: numberOrNull(payload.current?.relative_humidity_2m),
      windKph: numberOrNull(payload.current?.wind_speed_10m),
      condition: weather.condition,
      description: weather.description,
      iconCode: null,
      forecast: mapOpenMeteoForecast(payload),
      updatedAt: new Date().toISOString()
    }
    weatherCache = { data, timestamp: Date.now() }
    return data
  } catch (error) {
    console.error("[lib/slides/data/weather.ts:fetchOpenMeteoWeather]", error)
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

function mapOpenMeteoForecast(payload: OpenMeteoPayload): WeatherForecastPoint[] {
  const times = payload.hourly?.time ?? []
  const temps = payload.hourly?.temperature_2m ?? []
  const pops = payload.hourly?.precipitation_probability ?? []
  const codes = payload.hourly?.weather_code ?? []
  const currentTime = payload.current?.time ? new Date(payload.current.time).getTime() : Date.now()
  const points: WeatherForecastPoint[] = []
  for (let index = 0; index < times.length && points.length < 4; index += 1) {
    const time = times[index]
    if (!time) continue
    const timestamp = new Date(time).getTime()
    if (!Number.isFinite(timestamp) || timestamp < currentTime) continue
    const weather = weatherCodeLabel(codes[index])
    points.push({
      label: formatForecastLabel(time),
      temperatureC: numberOrNull(temps[index]),
      condition: weather.condition,
      precipitationProbability: numberOrNull(pops[index])
    })
  }
  return points
}

function weatherCodeLabel(code: number | undefined) {
  if (code === 0) return { condition: "Clear", description: "Clear Sky" }
  if (code === 1 || code === 2 || code === 3) {
    return { condition: "Clouds", description: "Partly Cloudy" }
  }
  if (code === 45 || code === 48) return { condition: "Fog", description: "Fog" }
  if ([51, 53, 55, 56, 57].includes(code ?? -1)) {
    return { condition: "Drizzle", description: "Drizzle" }
  }
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code ?? -1)) {
    return { condition: "Rain", description: "Rain" }
  }
  if ([71, 73, 75, 77, 85, 86].includes(code ?? -1)) {
    return { condition: "Snow", description: "Snow" }
  }
  if ([95, 96, 99].includes(code ?? -1)) {
    return { condition: "Thunderstorm", description: "Thunderstorm" }
  }
  return { condition: "Weather", description: "Current Conditions" }
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
