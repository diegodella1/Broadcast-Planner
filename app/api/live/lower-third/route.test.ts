import { beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from './route';

import { requireAdmin } from '@/lib/auth/auth';
import { getLiveSchedule } from '@/lib/data';
import { updateLiveObjectLowerThird } from '@/lib/mutations';

import type { OperatorSession } from '@/lib/auth/auth';
import type { ProgramBlock, ScheduleBundle } from '@/lib/types';

vi.mock('@/lib/auth/auth', () => ({
    requireAdmin: vi.fn(async () => undefined),
}));

vi.mock('@/lib/data', () => ({
    getLiveSchedule: vi.fn(),
}));

vi.mock('@/lib/mutations', () => ({
    updateLiveObjectLowerThird: vi.fn(async () => ({ success: true })),
}));

describe('POST /api/live/lower-third', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(requireAdmin).mockResolvedValue(operatorSession());
        vi.mocked(updateLiveObjectLowerThird).mockResolvedValue({
            success: true,
            data: undefined,
        });
    });

    it('updates the active live lower third', async () => {
        vi.mocked(getLiveSchedule).mockResolvedValue(bundleWithLive());

        const response = await POST(jsonRequest({ visible: true, text: 'Markets live' }));

        expect(response.status).toBe(200);
        expect(updateLiveObjectLowerThird).toHaveBeenCalledWith({
            blockId: 'block-live',
            visible: true,
            text: 'Markets live',
        });
    });

    it('rejects when no live is active', async () => {
        vi.mocked(getLiveSchedule).mockResolvedValue(bundleWithLive({ live: false }));

        const response = await POST(jsonRequest({ visible: true, text: 'Markets live' }));
        const payload = await response.json();

        expect(response.status).toBe(400);
        expect(payload.error).toBe('No active live on air');
    });

    it('requires admin auth', async () => {
        vi.mocked(requireAdmin).mockRejectedValue(new Error('Unauthorized'));

        const response = await POST(jsonRequest({ visible: true, text: 'Markets live' }));

        expect(response.status).toBe(401);
    });
});

function jsonRequest(payload: unknown) {
    return new Request('http://local.test/api/live/lower-third', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
    });
}

function operatorSession(): OperatorSession {
    return {
        operatorId: 'operator-1',
        handle: 'admin',
        displayName: 'Admin',
        role: 'admin',
        sessionId: 'session-1',
    };
}

function bundleWithLive(input: { live?: boolean } = {}): ScheduleBundle {
    const live = input.live !== false;
    const block: ProgramBlock = {
        id: 'block-live',
        programDayId: 'day-1',
        title: 'Live',
        blockType: 'video',
        category: 'broadcast',
        startTime: '00:00:00',
        startTimeSeconds: 0,
        durationSeconds: 86_400,
        status: 'ready',
        hideOverlays: true,
        metadata: live
            ? {
                  live_object: true,
                  live_source_type: 'youtube',
                  live_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                  youtube_video_id: 'dQw4w9WgXcQ',
                  live_status: 'scheduled',
              }
            : null,
        createdAt: '2026-06-03T00:00:00.000Z',
        updatedAt: '2026-06-03T00:00:00.000Z',
    };

    return {
        day: {
            id: 'day-1',
            airDate: '2026-06-03',
            timezone: 'America/Argentina/Buenos_Aires',
            status: 'active',
            createdAt: '2026-06-03T00:00:00.000Z',
            updatedAt: '2026-06-03T00:00:00.000Z',
        },
        blocks: [block],
        layers: [],
        mediaAssets: [],
        slideAssets: [],
    };
}
