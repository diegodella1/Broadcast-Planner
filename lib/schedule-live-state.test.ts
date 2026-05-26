import { describe, expect, it } from 'vitest';

import { getScheduleLiveState } from './schedule-live-state';

import type { ProgramBlock } from './types';

describe('getScheduleLiveState', () => {
    it('returns inactive state when the schedule date is not today in the schedule timezone', () => {
        const state = getScheduleLiveState({
            date: '2026-05-19',
            timezone: 'America/Argentina/Buenos_Aires',
            blocks,
            now: new Date('2026-05-20T15:30:00.000Z'),
        });

        expect(state.isToday).toBe(false);
        expect(state.nowSeconds).toBeNull();
        expect(state.activeBlock).toBeNull();
    });

    it('finds the active block and elapsed seconds for today', () => {
        const state = getScheduleLiveState({
            date: '2026-05-20',
            timezone: 'America/Argentina/Buenos_Aires',
            blocks,
            now: new Date('2026-05-20T15:30:00.000Z'),
        });

        expect(state.isToday).toBe(true);
        expect(state.activeBlock?.id).toBe('block-2');
        expect(state.elapsedSeconds).toBe(1800);
        expect(state.nextBlock?.id).toBe('block-3');
    });

    it('returns no active block when now falls in a gap', () => {
        const state = getScheduleLiveState({
            date: '2026-05-20',
            timezone: 'America/Argentina/Buenos_Aires',
            blocks,
            now: new Date('2026-05-20T14:30:00.000Z'),
        });

        expect(state.activeBlock).toBeNull();
        expect(state.nextBlock?.id).toBe('block-2');
    });
});

const baseBlock = {
    programDayId: 'day-1',
    blockType: 'video',
    category: 'broadcast',
    assetId: null,
    slideId: null,
    hideOverlays: false,
    fallbackAssetId: null,
    notes: null,
    metadata: null,
    createdAt: '2026-05-20T00:00:00.000Z',
    updatedAt: '2026-05-20T00:00:00.000Z',
} satisfies Omit<
    ProgramBlock,
    'id' | 'title' | 'startTime' | 'startTimeSeconds' | 'durationSeconds' | 'status'
>;

const blocks: ProgramBlock[] = [
    {
        ...baseBlock,
        id: 'block-1',
        title: 'Morning',
        startTime: '10:00:00',
        startTimeSeconds: 36000,
        durationSeconds: 1800,
        status: 'ready',
    },
    {
        ...baseBlock,
        id: 'block-2',
        title: 'Live',
        startTime: '12:00:00',
        startTimeSeconds: 43200,
        durationSeconds: 3600,
        status: 'ready',
    },
    {
        ...baseBlock,
        id: 'block-3',
        title: 'Next',
        startTime: '13:30:00',
        startTimeSeconds: 48600,
        durationSeconds: 1800,
        status: 'ready',
    },
];
