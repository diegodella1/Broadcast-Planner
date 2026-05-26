import { describe, expect, it } from 'vitest';

import { planScheduleMutation } from './schedule-planner';

import type { ProgramBlock } from '../types';

describe('schedule planner', () => {
    it('auto-inserts by shifting affected blocks', () => {
        const plan = planScheduleMutation({
            blocks: [block('a', 0, 1800), block('b', 1800, 600)],
            candidate: {
                programDayId: 'day-1',
                startTimeSeconds: 900,
                durationSeconds: 57,
                status: 'ready',
            },
            mode: 'insert_shift',
        });

        expect(plan.blocksToArchive).toEqual([]);
        expect(plan.blocksToShift.map((shift) => [shift.id, shift.startTimeSeconds])).toEqual([
            ['a', 957],
            ['b', 2757],
        ]);
    });

    it('archives conflicts in replace-window mode', () => {
        const plan = planScheduleMutation({
            blocks: [block('a', 0, 1800), block('b', 1800, 600)],
            candidate: {
                programDayId: 'day-1',
                startTimeSeconds: 900,
                durationSeconds: 1200,
                status: 'ready',
            },
            mode: 'replace_window',
        });

        expect(plan.blocksToArchive.map((item) => item.blockId)).toEqual(['a', 'b']);
        expect(plan.blocksToShift).toEqual([]);
    });

    it('rejects strict overlaps', () => {
        expect(() =>
            planScheduleMutation({
                blocks: [block('a', 0, 1800)],
                candidate: {
                    programDayId: 'day-1',
                    startTimeSeconds: 900,
                    durationSeconds: 60,
                    status: 'ready',
                },
                mode: 'strict',
            }),
        ).toThrow('solapa');
    });

    it('rejects auto-inserts beyond the day boundary', () => {
        expect(() =>
            planScheduleMutation({
                blocks: [block('late', 86380, 10)],
                candidate: {
                    programDayId: 'day-1',
                    startTimeSeconds: 86370,
                    durationSeconds: 21,
                    status: 'ready',
                },
                mode: 'insert_shift',
            }),
        ).toThrow('24 horas');
    });
});

function block(id: string, startTimeSeconds: number, durationSeconds: number): ProgramBlock {
    return {
        id,
        programDayId: 'day-1',
        title: `Block ${id}`,
        blockType: 'video',
        category: 'broadcast',
        assetId: null,
        slideId: null,
        startTime: '00:00:00',
        startTimeSeconds,
        durationSeconds,
        status: 'ready',
        hideOverlays: false,
        fallbackAssetId: null,
        notes: null,
        metadata: {},
        createdAt: '',
        updatedAt: '',
    };
}
