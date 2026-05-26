import { describe, expect, it, vi } from 'vitest';

import { getGuestLineupData } from './guests';

import type { Guest, SlideAsset } from '@/lib/types';

const getGuestsMock = vi.hoisted(() => vi.fn());

vi.mock('@/lib/data', () => ({
    getGuests: getGuestsMock,
}));

function guest(id: string, name: string): Guest {
    return {
        id,
        name,
        role: 'Analyst',
        company: 'RTV',
        host: 'Desk',
        program: 'Opening Bell',
        category: 'markets',
        appearanceAt: null,
        photoUrl: `https://example.com/${id}.jpg`,
        photoAssetId: null,
        videoUrl: null,
        videoAssetId: null,
        color: '#f7931a',
        sortOrder: 0,
        status: 'ready',
        metadata: null,
        createdAt: '2026-05-22T00:00:00Z',
        updatedAt: '2026-05-22T00:00:00Z',
    };
}

function plate(id: string, guestIds: string[]): SlideAsset {
    return {
        id,
        title: 'Guest plate',
        slideType: 'template',
        templateId: 'guest-lineup',
        defaultDurationSeconds: 30,
        status: 'ready',
        metadata: { guestIds },
        createdAt: '2026-05-22T00:00:00Z',
        updatedAt: '2026-05-22T00:00:00Z',
    };
}

describe('getGuestLineupData', () => {
    it('filters and orders guests from slide metadata', async () => {
        getGuestsMock.mockResolvedValueOnce([guest('1', 'Guest One'), guest('2', 'Guest Two')]);

        const data = await getGuestLineupData({ slide: plate('plate-filter', ['2', '1']) });

        expect(data.mode).toBe('live');
        expect(data.guests.map((item) => item.id)).toEqual(['2', '1']);
        expect(data.endpoint).toBe('/api/slide-data/guests?slideId=plate-filter');
    });

    it('keeps global fallback when a slide has no guest selection', async () => {
        getGuestsMock.mockResolvedValueOnce([guest('3', 'Guest Three')]);

        const data = await getGuestLineupData({ slide: plate('plate-global', []) });

        expect(data.guests.map((item) => item.id)).toEqual(['3']);
        expect(data.endpoint).toBe('/api/slide-data/guests');
    });
});
