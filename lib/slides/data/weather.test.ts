import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { __resetWeatherCacheForTests, getWeatherSlideData } from './weather';
import type { SlideAsset } from '@/lib/types';

const providerWeatherPayload = {
    available: true,
    locationName: 'Buenos Aires',
    temperatureC: 18,
    feelsLikeC: 16,
    humidityPct: 72,
    windKph: 21.6,
    condition: 'Clouds',
    description: 'overcast clouds',
    iconCode: '04d',
    forecast: [
        {
            label: '15:00',
            temperatureC: 17,
            condition: 'Rain',
            precipitationProbability: 45,
        },
    ],
    updatedAt: '2026-05-27T11:01:00.000Z',
};

const providerUnavailablePayload = {
    available: false,
    reason: 'weather_upstream_failed',
};

describe('getWeatherSlideData', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        vi.restoreAllMocks();
        __resetWeatherCacheForTests();
        process.env = { ...originalEnv };
        process.env.DATA_PROVIDER_API_URL = 'https://data-provider.example';
    });

    afterEach(() => {
        process.env = originalEnv;
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
        __resetWeatherCacheForTests();
    });

    it('consumes data-provider-api /api/weather when available', async () => {
        process.env.WEATHER_LOCATION_NAME = 'Buenos Aires';
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(providerWeatherPayload));
        vi.stubGlobal('fetch', fetchMock);

        const data = await getWeatherSlideData();

        expect(data.available).toBe(true);
        expect(data.locationName).toBe('Buenos Aires');
        expect(data.temperatureC).toBe(18);
        expect(data.feelsLikeC).toBe(16);
        expect(data.windKph).toBe(21.6);
        expect(data.condition).toBe('Clouds');
        expect(data.description).toBe('overcast clouds');
        expect(data.iconCode).toBe('04d');
        expect(data.forecast[0]).toMatchObject({
            label: '15:00',
            temperatureC: 17,
            condition: 'Rain',
            precipitationProbability: 45,
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        const firstCallUrl = String(fetchMock.mock.calls[0]?.[0] ?? '');
        expect(firstCallUrl).toContain('/api/weather');
        expect(firstCallUrl).toContain('lat=-34.6037');
        expect(firstCallUrl).toContain('lon=-58.3816');
    });

    it('falls back to Open-Meteo when data-provider-api returns available:false', async () => {
        delete process.env.OPENWEATHER_API_KEY;
        delete process.env.OPENWEATHERMAP_API_KEY;
        process.env.WEATHER_LOCATION_NAME = 'Buenos Aires';
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(jsonResponse(providerUnavailablePayload))
            .mockResolvedValueOnce(
                jsonResponse({
                    current: {
                        time: '2026-05-22T12:00',
                        temperature_2m: 21.5,
                        apparent_temperature: 22,
                        relative_humidity_2m: 58,
                        wind_speed_10m: 18,
                        weather_code: 1,
                    },
                    hourly: {
                        time: [
                            '2026-05-22T11:00',
                            '2026-05-22T12:00',
                            '2026-05-22T13:00',
                            '2026-05-22T14:00',
                        ],
                        temperature_2m: [20, 21.5, 22, 23],
                        precipitation_probability: [5, 10, 20, 25],
                        weather_code: [0, 1, 61, 63],
                    },
                }),
            );
        vi.stubGlobal('fetch', fetchMock);

        const data = await getWeatherSlideData();

        expect(data.available).toBe(true);
        expect(data.locationName).toBe('Buenos Aires');
        expect(data.temperatureC).toBe(21.5);
        expect(data.windKph).toBe(18);
        expect(data.description).toBe('Partly Cloudy');
        expect(data.forecast[0]).toMatchObject({
            label: '12:00',
            temperatureC: 21.5,
            condition: 'Clouds',
            precipitationProbability: 10,
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('uses Open-Meteo when OpenWeather is not configured and data-provider-api fails', async () => {
        delete process.env.OPENWEATHER_API_KEY;
        delete process.env.OPENWEATHERMAP_API_KEY;
        process.env.WEATHER_LOCATION_NAME = 'Buenos Aires';
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(new Response('upstream error', { status: 503 }))
            .mockResolvedValueOnce(
                jsonResponse({
                    current: {
                        time: '2026-05-22T12:00',
                        temperature_2m: 21.5,
                        apparent_temperature: 22,
                        relative_humidity_2m: 58,
                        wind_speed_10m: 18,
                        weather_code: 1,
                    },
                    hourly: {
                        time: [
                            '2026-05-22T11:00',
                            '2026-05-22T12:00',
                            '2026-05-22T13:00',
                            '2026-05-22T14:00',
                        ],
                        temperature_2m: [20, 21.5, 22, 23],
                        precipitation_probability: [5, 10, 20, 25],
                        weather_code: [0, 1, 61, 63],
                    },
                }),
            );
        vi.stubGlobal('fetch', fetchMock);

        const data = await getWeatherSlideData();

        expect(data.available).toBe(true);
        expect(data.locationName).toBe('Buenos Aires');
        expect(data.temperatureC).toBe(21.5);
        expect(data.windKph).toBe(18);
        expect(data.description).toBe('Partly Cloudy');
        expect(data.forecast[0]).toMatchObject({
            label: '12:00',
            temperatureC: 21.5,
            condition: 'Clouds',
            precipitationProbability: 10,
        });
    });

    it('maps OpenWeather current and forecast payloads when data-provider-api is unavailable', async () => {
        process.env.OPENWEATHER_API_KEY = 'test-key';
        process.env.WEATHER_LOCATION_NAME = 'Buenos Aires';
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(new Response('upstream error', { status: 503 }))
            .mockResolvedValueOnce(
                jsonResponse({
                    name: 'Buenos Aires',
                    weather: [{ main: 'Clouds', description: 'scattered clouds', icon: '03d' }],
                    main: { temp: 22.4, feels_like: 23, humidity: 62 },
                    wind: { speed: 4 },
                }),
            )
            .mockResolvedValueOnce(
                jsonResponse({
                    list: [
                        {
                            dt_txt: '2026-05-22 15:00:00',
                            pop: 0.25,
                            weather: [{ main: 'Clear' }],
                            main: { temp: 24 },
                        },
                    ],
                }),
            );
        vi.stubGlobal('fetch', fetchMock);

        const data = await getWeatherSlideData();

        expect(data.available).toBe(true);
        expect(data.locationName).toBe('Buenos Aires');
        expect(data.temperatureC).toBe(22.4);
        expect(data.windKph).toBe(14);
        expect(data.description).toBe('Scattered Clouds');
        expect(data.forecast[0]).toMatchObject({
            label: '15:00',
            temperatureC: 24,
            condition: 'Clear',
            precipitationProbability: 25,
        });
    });

    it('uses slide weather metadata and keeps location caches separate', async () => {
        delete process.env.OPENWEATHER_API_KEY;
        delete process.env.OPENWEATHERMAP_API_KEY;
        const fetchMock = vi
            .fn<typeof fetch>()
            .mockResolvedValueOnce(
                jsonResponse({
                    ...providerWeatherPayload,
                    locationName: 'Buenos Aires',
                    temperatureC: 20,
                }),
            )
            .mockResolvedValueOnce(
                jsonResponse({
                    ...providerWeatherPayload,
                    locationName: 'Miami',
                    temperatureC: 31,
                }),
            );
        vi.stubGlobal('fetch', fetchMock);

        const buenosAires = await getWeatherSlideData({
            slide: weatherSlide('Buenos Aires', -34.6037, -58.3816),
        });
        const miami = await getWeatherSlideData({
            slide: weatherSlide('Miami', 25.7617, -80.1918),
        });
        const cachedBuenosAires = await getWeatherSlideData({
            slide: weatherSlide('Buenos Aires', -34.6037, -58.3816),
        });

        expect(buenosAires.locationName).toBe('Buenos Aires');
        expect(miami.locationName).toBe('Miami');
        expect(buenosAires.temperatureC).toBe(20);
        expect(miami.temperatureC).toBe(31);
        expect(cachedBuenosAires.temperatureC).toBe(20);
        expect(fetchMock).toHaveBeenCalledTimes(2);
    });
});

function weatherSlide(locationName: string, lat: number, lon: number): SlideAsset {
    return {
        id: `weather-${locationName}`,
        title: `${locationName} Weather`,
        slideType: 'template',
        templateId: 'weather',
        status: 'ready',
        metadata: { weatherLocationName: locationName, weatherLat: lat, weatherLon: lon },
        createdAt: '',
        updatedAt: '',
    };
}

function jsonResponse(payload: unknown) {
    return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
    });
}
