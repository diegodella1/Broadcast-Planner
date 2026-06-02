import { describe, expect, it } from 'vitest';

import { parseFallbackCarousel } from './fallback-carousel';

describe('parseFallbackCarousel', () => {
    it('parses legacy active cards', () => {
        expect(
            parseFallbackCarousel(
                {
                    enabled: true,
                    cards: [{ slideId: 'slide-1', durationSeconds: 30 }],
                },
                '2026-05-25T00:00:00.000Z',
            ),
        ).toEqual({
            enabled: true,
            activeSetId: null,
            sets: [],
            cards: [
                {
                    kind: 'slide',
                    id: 'slide-1',
                    slideId: 'slide-1',
                    durationSeconds: 30,
                },
            ],
            updatedAt: '2026-05-25T00:00:00.000Z',
        });
    });

    it('parses named sets and keeps the active cards field', () => {
        expect(
            parseFallbackCarousel(
                {
                    enabled: true,
                    activeSetId: 'set-1',
                    cards: [{ slideId: 'slide-1', durationSeconds: 12 }],
                    sets: [
                        {
                            id: 'set-1',
                            name: 'Market break',
                            cards: [{ slideId: 'slide-1', durationSeconds: 12 }],
                            createdAt: '2026-05-24T00:00:00.000Z',
                            updatedAt: '2026-05-25T00:00:00.000Z',
                        },
                    ],
                },
                '2026-05-25T00:00:00.000Z',
            )?.sets,
        ).toEqual([
            {
                id: 'set-1',
                name: 'Market break',
                cards: [
                    {
                        kind: 'slide',
                        id: 'slide-1',
                        slideId: 'slide-1',
                        durationSeconds: 12,
                    },
                ],
                createdAt: '2026-05-24T00:00:00.000Z',
                updatedAt: '2026-05-25T00:00:00.000Z',
            },
        ]);
    });
});
