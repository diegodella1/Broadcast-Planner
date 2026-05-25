import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { __resetWeatherCacheForTests, getWeatherSlideData } from "./weather"

describe("getWeatherSlideData", () => {
  const originalEnv = process.env

  beforeEach(() => {
    vi.restoreAllMocks()
    __resetWeatherCacheForTests()
    process.env = { ...originalEnv }
  })

  afterEach(() => {
    process.env = originalEnv
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
    __resetWeatherCacheForTests()
  })

  it("uses Open-Meteo when OpenWeather is not configured", async () => {
    delete process.env.OPENWEATHER_API_KEY
    delete process.env.OPENWEATHERMAP_API_KEY
    process.env.WEATHER_LOCATION_NAME = "Buenos Aires"
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(
      jsonResponse({
        current: {
          time: "2026-05-22T12:00",
          temperature_2m: 21.5,
          apparent_temperature: 22,
          relative_humidity_2m: 58,
          wind_speed_10m: 18,
          weather_code: 1
        },
        hourly: {
          time: ["2026-05-22T11:00", "2026-05-22T12:00", "2026-05-22T13:00", "2026-05-22T14:00"],
          temperature_2m: [20, 21.5, 22, 23],
          precipitation_probability: [5, 10, 20, 25],
          weather_code: [0, 1, 61, 63]
        }
      })
    )
    vi.stubGlobal("fetch", fetchMock)

    const data = await getWeatherSlideData()

    expect(data.available).toBe(true)
    expect(data.locationName).toBe("Buenos Aires")
    expect(data.temperatureC).toBe(21.5)
    expect(data.windKph).toBe(18)
    expect(data.description).toBe("Partly Cloudy")
    expect(data.forecast[0]).toMatchObject({
      label: "12:00",
      temperatureC: 21.5,
      condition: "Clouds",
      precipitationProbability: 10
    })
  })

  it("maps OpenWeather current and forecast payloads", async () => {
    process.env.OPENWEATHER_API_KEY = "test-key"
    process.env.WEATHER_LOCATION_NAME = "Buenos Aires"
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        jsonResponse({
          name: "Buenos Aires",
          weather: [{ main: "Clouds", description: "scattered clouds", icon: "03d" }],
          main: { temp: 22.4, feels_like: 23, humidity: 62 },
          wind: { speed: 4 }
        })
      )
      .mockResolvedValueOnce(
        jsonResponse({
          list: [
            {
              dt_txt: "2026-05-22 15:00:00",
              pop: 0.25,
              weather: [{ main: "Clear" }],
              main: { temp: 24 }
            }
          ]
        })
      )
    vi.stubGlobal("fetch", fetchMock)

    const data = await getWeatherSlideData()

    expect(data.available).toBe(true)
    expect(data.locationName).toBe("Buenos Aires")
    expect(data.temperatureC).toBe(22.4)
    expect(data.windKph).toBe(14)
    expect(data.description).toBe("Scattered Clouds")
    expect(data.forecast[0]).toMatchObject({
      label: "15:00",
      temperatureC: 24,
      condition: "Clear",
      precipitationProbability: 25
    })
  })
})

function jsonResponse(payload: unknown) {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  })
}
