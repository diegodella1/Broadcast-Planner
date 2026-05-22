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

  it("returns unavailable data when OpenWeather is not configured", async () => {
    delete process.env.OPENWEATHER_API_KEY
    delete process.env.OPENWEATHERMAP_API_KEY

    const data = await getWeatherSlideData()

    expect(data.available).toBe(false)
    expect(data.reason).toBe("OPENWEATHER_API_KEY is not configured")
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
