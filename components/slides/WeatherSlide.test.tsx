import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { WeatherSlide } from './WeatherSlide';

import type { WeatherSlideData } from '@/lib/slides/types';

const baseData: WeatherSlideData = {
    available: true,
    locationName: 'Buenos Aires',
    temperatureC: 22.4,
    feelsLikeC: 23,
    humidityPct: 62,
    windKph: 14,
    condition: 'Clouds',
    description: 'Scattered Clouds',
    iconCode: '03d',
    forecast: [
        {
            label: '15:00',
            temperatureC: 24,
            condition: 'Clear',
            precipitationProbability: 10,
        },
    ],
    updatedAt: '2026-05-22T12:00:00.000Z',
};

describe('WeatherSlide', () => {
    it('renders current conditions and forecast', () => {
        render(<WeatherSlide data={baseData} />);

        expect(screen.getByText('Buenos Aires')).toBeInTheDocument();
        expect(screen.getByText('22°C')).toBeInTheDocument();
        expect(screen.getByText('Scattered Clouds')).toBeInTheDocument();
        expect(screen.getByText('Feels Like')).toBeInTheDocument();
        expect(screen.getByText('Rain 10%')).toBeInTheDocument();
    });

    it('renders an unavailable state when weather is not configured', () => {
        render(
            <WeatherSlide
                data={{
                    ...baseData,
                    available: false,
                    temperatureC: null,
                    forecast: [],
                    reason: 'OPENWEATHER_API_KEY is not configured',
                }}
            />,
        );

        expect(screen.getByText('Weather data unavailable')).toBeInTheDocument();
        expect(screen.getByText('OPENWEATHER_API_KEY is not configured')).toBeInTheDocument();
    });
});
