import { describe, expect, it, vi } from 'vitest';

import { GET } from './route';

import { getSlides } from '@/lib/data';
import { getWeatherSlideData } from '@/lib/slides/data/weather';
import type { SlideAsset } from '@/lib/types';

vi.mock('@/lib/data', () => ({
    getSlides: vi.fn(),
}));

vi.mock('@/lib/slides/data/weather', () => ({
    getWeatherSlideData: vi.fn(),
}));

describe('GET /api/slide-data/weather', () => {
    it('passes the requested slide to weather data lookup', async () => {
        const slide: SlideAsset = {
            id: 'weather-miami',
            title: 'Miami Weather',
            slideType: 'template',
            templateId: 'weather',
            status: 'ready',
            metadata: { weatherLocationName: 'Miami', weatherLat: 25.7617, weatherLon: -80.1918 },
            createdAt: '',
            updatedAt: '',
        };
        vi.mocked(getSlides).mockResolvedValue([slide]);
        vi.mocked(getWeatherSlideData).mockResolvedValue({
            available: true,
            locationName: 'Miami',
            temperatureC: 31,
            feelsLikeC: 32,
            humidityPct: 70,
            windKph: 15,
            condition: 'Rain',
            description: 'Rain',
            iconCode: null,
            forecast: [],
            updatedAt: '2026-05-25T00:00:00.000Z',
        });

        const response = await GET(
            new Request('http://test/api/slide-data/weather?slideId=weather-miami'),
        );
        const payload = await response.json();

        expect(getWeatherSlideData).toHaveBeenCalledWith({ slide });
        expect(payload.locationName).toBe('Miami');
    });
});
