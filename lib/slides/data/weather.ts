import type { WeatherForecastPoint, WeatherSlideData } from '@/lib/slides/types';
import type { SlideAsset } from '@/lib/types';
import { getDataProviderConfig } from './provider-config';

const DEFAULT_LOCATION_NAME = 'Buenos Aires';
const DEFAULT_LAT = -34.6037;
const DEFAULT_LON = -58.3816;
const WEATHER_CACHE_DURATION_MS = 10 * 60 * 1000;

type WeatherLocationConfig = {
    locationName: string;
    lat: number;
    lon: number;
};

type WeatherCacheEntry = { data: WeatherSlideData; timestamp: number };

type OpenWeatherCurrent = {
    name?: string;
    weather?: Array<{ main?: string; description?: string; icon?: string }>;
    main?: { temp?: number; feels_like?: number; humidity?: number };
    wind?: { speed?: number };
};

type OpenWeatherForecast = {
    list?: Array<{
        dt_txt?: string;
        pop?: number;
        weather?: Array<{ main?: string; description?: string; icon?: string }>;
        main?: { temp?: number };
    }>;
};

type OpenMeteoPayload = {
    current?: {
        time?: string;
        temperature_2m?: number;
        apparent_temperature?: number;
        relative_humidity_2m?: number;
        wind_speed_10m?: number;
        weather_code?: number;
    };
    hourly?: {
        time?: string[];
        temperature_2m?: number[];
        precipitation_probability?: number[];
        weather_code?: number[];
    };
};

type DataProviderWeatherForecastPoint = {
    label?: string;
    temperatureC?: number | null;
    condition?: string;
    precipitationProbability?: number | null;
};

type DataProviderWeatherEnvelope = {
    available?: boolean;
    locationName?: string;
    temperatureC?: number | null;
    feelsLikeC?: number | null;
    humidityPct?: number | null;
    windKph?: number | null;
    condition?: string;
    description?: string;
    iconCode?: string | null;
    forecast?: DataProviderWeatherForecastPoint[];
    updatedAt?: string;
    reason?: string;
};

const weatherCache = new Map<string, WeatherCacheEntry>();

export async function getWeatherSlideData(input?: {
    slide?: SlideAsset | null | undefined;
}): Promise<WeatherSlideData> {
    const now = Date.now();
    const config = weatherConfigFromSlide(input?.slide);
    const cacheKey = `${config.locationName}:${config.lat}:${config.lon}`;
    const cached = weatherCache.get(cacheKey);

    if (cached && now - cached.timestamp < WEATHER_CACHE_DURATION_MS) {
        return cached.data;
    }
    const dataProviderApiData = await fetchWeatherFromDataProviderApi(config).catch((error) => {
        console.warn('[lib/slides/data/weather.ts:fetchWeatherFromDataProviderApi]', error);

        return null;
    });

    if (dataProviderApiData) {
        weatherCache.set(cacheKey, { data: dataProviderApiData, timestamp: now });

        return dataProviderApiData;
    }

    const apiKey = process.env.OPENWEATHER_API_KEY ?? process.env.OPENWEATHERMAP_API_KEY ?? '';

    if (!apiKey) {
        return fetchOpenMeteoWeather(config, cacheKey);
    }

    try {
        const params = new URLSearchParams({
            appid: apiKey,
            lat: String(config.lat),
            lon: String(config.lon),
            units: 'metric',
        });
        const [currentResponse, forecastResponse] = await Promise.all([
            fetch(`https://api.openweathermap.org/data/2.5/weather?${params.toString()}`, {
                cache: 'no-store',
                signal: AbortSignal.timeout(7_000),
            }),
            fetch(`https://api.openweathermap.org/data/2.5/forecast?${params.toString()}`, {
                cache: 'no-store',
                signal: AbortSignal.timeout(7_000),
            }),
        ]);

        if (!currentResponse.ok) {
            throw new Error(`OpenWeather current returned ${currentResponse.status}`);
        }

        if (!forecastResponse.ok) {
            throw new Error(`OpenWeather forecast returned ${forecastResponse.status}`);
        }

        const current = (await currentResponse.json()) as OpenWeatherCurrent;
        const forecast = (await forecastResponse.json()) as OpenWeatherForecast;
        const condition = current.weather?.[0];
        const data: WeatherSlideData = {
            available: true,
            locationName: current.name || config.locationName,
            temperatureC: numberOrNull(current.main?.temp),
            feelsLikeC: numberOrNull(current.main?.feels_like),
            humidityPct: numberOrNull(current.main?.humidity),
            windKph:
                typeof current.wind?.speed === 'number'
                    ? Math.round(current.wind.speed * 3.6)
                    : null,
            condition: condition?.main || 'Weather',
            description: titleCase(
                condition?.description || condition?.main || 'Current conditions',
            ),
            iconCode: condition?.icon ?? null,
            forecast: mapForecast(forecast),
            updatedAt: new Date().toISOString(),
        };

        weatherCache.set(cacheKey, { data, timestamp: now });

        return data;
    } catch (error) {
        console.error('[lib/slides/data/weather.ts:getWeatherSlideData]', error);

        if (cached) {
            return { ...cached.data, reason: 'stale weather cache' };
        }

        return unavailableWeatherData(
            error instanceof Error ? error.message : 'weather fetch failed',
            config,
        );
    }
}

async function fetchWeatherFromDataProviderApi(
    config: WeatherLocationConfig,
): Promise<WeatherSlideData | null> {
    const provider = getDataProviderConfig();

    if (!provider) {
        return null;
    }
    const headers: Record<string, string> = { Accept: 'application/json' };

    if (provider.apiKey) {
        headers['x-api-key'] = provider.apiKey;
    }
    const params = new URLSearchParams({
        lat: String(config.lat),
        lon: String(config.lon),
    });
    const response = await fetch(`${provider.baseUrl}/api/weather?${params.toString()}`, {
        headers,
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
    });

    if (!response.ok) {
        throw new Error(`data-provider-api weather error: ${response.status}`);
    }
    const envelope = (await response.json()) as DataProviderWeatherEnvelope;

    if (envelope.available !== true) {
        return null;
    }

    return mapDataProviderWeatherEnvelope(envelope, config);
}

function mapDataProviderWeatherEnvelope(
    envelope: DataProviderWeatherEnvelope,
    config: WeatherLocationConfig,
): WeatherSlideData {
    const forecast = Array.isArray(envelope.forecast) ? envelope.forecast : [];

    return {
        available: true,
        locationName:
            typeof envelope.locationName === 'string' && envelope.locationName.trim()
                ? envelope.locationName
                : config.locationName,
        temperatureC: numberOrNull(envelope.temperatureC),
        feelsLikeC: numberOrNull(envelope.feelsLikeC),
        humidityPct: numberOrNull(envelope.humidityPct),
        windKph: numberOrNull(envelope.windKph),
        condition: envelope.condition || 'Weather',
        description: envelope.description || envelope.condition || 'Current Conditions',
        iconCode: typeof envelope.iconCode === 'string' ? envelope.iconCode : null,
        forecast: forecast.slice(0, 4).map((point) => ({
            label: typeof point.label === 'string' && point.label ? point.label : 'Next',
            temperatureC: numberOrNull(point.temperatureC),
            condition: point.condition || 'Weather',
            precipitationProbability: numberOrNull(point.precipitationProbability),
        })),
        updatedAt:
            typeof envelope.updatedAt === 'string' && envelope.updatedAt
                ? envelope.updatedAt
                : new Date().toISOString(),
    };
}

async function fetchOpenMeteoWeather(
    config: WeatherLocationConfig,
    cacheKey: string,
): Promise<WeatherSlideData> {
    const cached = weatherCache.get(cacheKey);

    try {
        const params = new URLSearchParams({
            latitude: String(config.lat),
            longitude: String(config.lon),
            current: [
                'temperature_2m',
                'apparent_temperature',
                'relative_humidity_2m',
                'wind_speed_10m',
                'weather_code',
            ].join(','),
            hourly: ['temperature_2m', 'precipitation_probability', 'weather_code'].join(','),
            forecast_days: '2',
            timezone: 'auto',
        });
        const response = await fetch(
            `https://api.open-meteo.com/v1/forecast?${params.toString()}`,
            {
                cache: 'no-store',
                signal: AbortSignal.timeout(7_000),
                headers: { Accept: 'application/json' },
            },
        );

        if (!response.ok) {
            throw new Error(`Open-Meteo returned ${response.status}`);
        }
        const payload = (await response.json()) as OpenMeteoPayload;
        const weather = weatherCodeLabel(payload.current?.weather_code);
        const data: WeatherSlideData = {
            available: true,
            locationName: config.locationName,
            temperatureC: numberOrNull(payload.current?.temperature_2m),
            feelsLikeC: numberOrNull(payload.current?.apparent_temperature),
            humidityPct: numberOrNull(payload.current?.relative_humidity_2m),
            windKph: numberOrNull(payload.current?.wind_speed_10m),
            condition: weather.condition,
            description: weather.description,
            iconCode: null,
            forecast: mapOpenMeteoForecast(payload),
            updatedAt: new Date().toISOString(),
        };
        weatherCache.set(cacheKey, { data, timestamp: Date.now() });

        return data;
    } catch (error) {
        console.error('[lib/slides/data/weather.ts:fetchOpenMeteoWeather]', error);

        if (cached) {
            return { ...cached.data, reason: 'stale weather cache' };
        }

        return unavailableWeatherData(
            error instanceof Error ? error.message : 'weather fetch failed',
            config,
        );
    }
}

function mapForecast(payload: OpenWeatherForecast): WeatherForecastPoint[] {
    const points = Array.isArray(payload.list) ? payload.list : [];

    return points.slice(0, 4).map((point) => {
        const condition = point.weather?.[0];

        return {
            label: formatForecastLabel(point.dt_txt),
            temperatureC: numberOrNull(point.main?.temp),
            condition: condition?.main || 'Weather',
            precipitationProbability:
                typeof point.pop === 'number' ? Math.round(point.pop * 100) : null,
        };
    });
}

function mapOpenMeteoForecast(payload: OpenMeteoPayload): WeatherForecastPoint[] {
    const times = payload.hourly?.time ?? [];
    const temps = payload.hourly?.temperature_2m ?? [];
    const pops = payload.hourly?.precipitation_probability ?? [];
    const codes = payload.hourly?.weather_code ?? [];
    const currentTime = payload.current?.time
        ? new Date(payload.current.time).getTime()
        : Date.now();
    const points: WeatherForecastPoint[] = [];

    for (let index = 0; index < times.length && points.length < 4; index += 1) {
        const time = times[index];

        if (!time) {
            continue;
        }
        const timestamp = new Date(time).getTime();

        if (!Number.isFinite(timestamp) || timestamp < currentTime) {
            continue;
        }
        const weather = weatherCodeLabel(codes[index]);
        points.push({
            label: formatForecastLabel(time),
            temperatureC: numberOrNull(temps[index]),
            condition: weather.condition,
            precipitationProbability: numberOrNull(pops[index]),
        });
    }

    return points;
}

function weatherCodeLabel(code: number | undefined) {
    if (code === 0) {
        return { condition: 'Clear', description: 'Clear Sky' };
    }

    if (code === 1 || code === 2 || code === 3) {
        return { condition: 'Clouds', description: 'Partly Cloudy' };
    }

    if (code === 45 || code === 48) {
        return { condition: 'Fog', description: 'Fog' };
    }

    if ([51, 53, 55, 56, 57].includes(code ?? -1)) {
        return { condition: 'Drizzle', description: 'Drizzle' };
    }

    if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code ?? -1)) {
        return { condition: 'Rain', description: 'Rain' };
    }

    if ([71, 73, 75, 77, 85, 86].includes(code ?? -1)) {
        return { condition: 'Snow', description: 'Snow' };
    }

    if ([95, 96, 99].includes(code ?? -1)) {
        return { condition: 'Thunderstorm', description: 'Thunderstorm' };
    }

    return { condition: 'Weather', description: 'Current Conditions' };
}

function unavailableWeatherData(
    reason: string,
    config: WeatherLocationConfig = envWeatherConfig(),
): WeatherSlideData {
    return {
        available: false,
        locationName: config.locationName,
        temperatureC: null,
        feelsLikeC: null,
        humidityPct: null,
        windKph: null,
        condition: 'Unavailable',
        description: 'Weather data unavailable',
        iconCode: null,
        forecast: [],
        updatedAt: new Date().toISOString(),
        reason,
    };
}

function weatherConfigFromSlide(slide: SlideAsset | null | undefined): WeatherLocationConfig {
    const metadata = slide?.metadata ?? {};
    const locationName =
        typeof metadata.weatherLocationName === 'string' && metadata.weatherLocationName.trim()
            ? metadata.weatherLocationName.trim()
            : null;
    const lat = parseCoordinate(metadata.weatherLat, Number.NaN);
    const lon = parseCoordinate(metadata.weatherLon, Number.NaN);

    if (locationName && Number.isFinite(lat) && Number.isFinite(lon)) {
        return { locationName, lat, lon };
    }

    return envWeatherConfig();
}

function envWeatherConfig(): WeatherLocationConfig {
    return {
        locationName: process.env.WEATHER_LOCATION_NAME ?? DEFAULT_LOCATION_NAME,
        lat: parseCoordinate(process.env.WEATHER_LAT, DEFAULT_LAT),
        lon: parseCoordinate(process.env.WEATHER_LON, DEFAULT_LON),
    };
}

function parseCoordinate(value: unknown, fallback: number) {
    const parsed = Number(value);

    return Number.isFinite(parsed) ? parsed : fallback;
}

function numberOrNull(value: unknown) {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function formatForecastLabel(value: string | undefined) {
    if (!value) {
        return 'Next';
    }
    const date = new Date(value.replace(' ', 'T'));

    if (Number.isNaN(date.getTime())) {
        return 'Next';
    }

    return date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
}

function titleCase(value: string) {
    return value.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

export function __resetWeatherCacheForTests() {
    weatherCache.clear();
}
