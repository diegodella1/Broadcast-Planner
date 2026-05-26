import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScheduleTimeline } from './schedule-timeline';

import type { ProgramBlock, ScheduleBundle } from '@/lib/types';

const push = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push }),
}));

describe('ScheduleTimeline', () => {
    beforeAll(() => {
        window.PointerEvent = MouseEvent as typeof PointerEvent;
    });

    beforeEach(() => {
        push.mockClear();
    });

    it('moves an existing block by dragging it on the timeline', async () => {
        const moveBlockAction = vi.fn().mockResolvedValue(undefined);
        renderTimeline({ moveBlockAction });
        mockTrackRect();

        const block = screen.getByRole('link', { name: 'Open A' });
        fireEvent.pointerDown(block, { pointerId: 1, clientY: 84 });
        fireEvent.pointerMove(block, { pointerId: 1, clientY: 168 });
        fireEvent.pointerUp(block, { pointerId: 1, clientY: 168 });

        await waitFor(() =>
            expect(moveBlockAction).toHaveBeenCalledWith({
                blockId: 'block-1',
                startTimeSeconds: 7200,
            }),
        );
    });

    it('shows an error when moving a block fails', async () => {
        const moveBlockAction = vi
            .fn()
            .mockRejectedValue(new Error('El bloque se solapa con otro bloque'));
        renderTimeline({ moveBlockAction });
        mockTrackRect();

        const block = screen.getByRole('link', { name: 'Open A' });
        fireEvent.pointerDown(block, { pointerId: 1, clientY: 84 });
        fireEvent.pointerMove(block, { pointerId: 1, clientY: 168 });
        fireEvent.pointerUp(block, { pointerId: 1, clientY: 168 });

        expect(await screen.findByText('El bloque se solapa con otro bloque')).toBeInTheDocument();
    });

    it('keeps empty timeline drag for creating a range', () => {
        renderTimeline();
        const track = mockTrackRect();

        fireEvent.pointerDown(track, { pointerId: 1, clientY: 0 });
        fireEvent.pointerMove(track, { pointerId: 1, clientY: 84 });
        fireEvent.pointerUp(track, { pointerId: 1, clientY: 84 });

        expect(screen.getAllByText('Create block').length).toBeGreaterThan(0);
    });
});

function renderTimeline({
    moveBlockAction = vi.fn().mockResolvedValue(undefined),
}: {
    moveBlockAction?: (input: { blockId: string; startTimeSeconds: number }) => Promise<void>;
} = {}) {
    return render(
        <ScheduleTimeline
            blocks={schedule.blocks}
            schedule={schedule}
            date="2026-05-08"
            nowSeconds={null}
            issues={[]}
            createBlockAction={vi.fn()}
            moveBlockAction={moveBlockAction}
        />,
    );
}

function mockTrackRect() {
    const track = screen.getByTestId('schedule-timeline-track');
    vi.spyOn(track, 'getBoundingClientRect').mockReturnValue({
        x: 0,
        y: 0,
        width: 400,
        height: 2016,
        top: 0,
        right: 400,
        bottom: 2016,
        left: 0,
        toJSON: () => ({}),
    });
    track.setPointerCapture = vi.fn();
    track.releasePointerCapture = vi.fn();

    for (const block of screen.getAllByRole('link')) {
        (block as HTMLElement).setPointerCapture = vi.fn();
        (block as HTMLElement).releasePointerCapture = vi.fn();
    }

    return track;
}

const blocks: ProgramBlock[] = [
    {
        id: 'block-1',
        programDayId: 'day-1',
        title: 'A',
        blockType: 'video',
        category: 'broadcast',
        assetId: null,
        slideId: null,
        startTime: '01:00:00',
        startTimeSeconds: 3600,
        durationSeconds: 900,
        status: 'ready',
        hideOverlays: false,
        fallbackAssetId: null,
        notes: null,
        createdAt: '',
        updatedAt: '',
    },
];

const schedule: ScheduleBundle = {
    day: {
        id: 'day-1',
        airDate: '2026-05-08',
        timezone: 'America/Los_Angeles',
        status: 'draft',
        title: 'Programming 2026-05-08',
        notes: null,
        fallbackAssetId: null,
        createdAt: '',
        updatedAt: '',
    },
    blocks,
    layers: [],
    mediaAssets: [],
    slideAssets: [],
};
