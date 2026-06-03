import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock next/cache before any module import that uses it
// ---------------------------------------------------------------------------
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Supabase builder mock (mirrors lib/mutations.test.ts pattern exactly)
// ---------------------------------------------------------------------------
type MockResult = { data: unknown; error: unknown };

function makeSupabaseMock() {
    let _result: MockResult = { data: null, error: null };

    const builder: Record<string, unknown> & {
        setResult: (r: MockResult) => void;
        _result: MockResult;
    } = {
        setResult(r: MockResult) {
            _result = r;
        },
        get _result() {
            return _result;
        },
        from: vi.fn().mockReturnThis(),
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockReturnThis(),
        update: vi.fn().mockReturnThis(),
        upsert: vi.fn().mockReturnThis(),
        delete: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockImplementation(function () {
            return Promise.resolve(_result);
        }),
        single: vi.fn().mockImplementation(function () {
            return Promise.resolve(_result);
        }),
        then: vi.fn().mockImplementation(function (resolve: (value: MockResult) => void) {
            return Promise.resolve(_result).then(resolve);
        }),
    };

    return builder;
}

const supabaseMock = makeSupabaseMock();

vi.mock('@/lib/supabase/server', () => ({
    createServiceClient: vi.fn(() => supabaseMock),
}));

// ---------------------------------------------------------------------------
// Mock lib/data (getScheduleForDate)
// ---------------------------------------------------------------------------
import type { ProgramBlock, ScheduleBundle } from '../types';

const baseBlock: ProgramBlock = {
    id: 'block-scheduled',
    programDayId: 'day-1',
    title: 'Morning Show',
    blockType: 'video',
    category: 'mercados',
    assetId: 'asset-video',
    slideId: null,
    startTime: '09:00:00',
    startTimeSeconds: 32400,
    durationSeconds: 3600,
    status: 'ready',
    hideOverlays: false,
    fallbackAssetId: null,
    createdAt: '',
    updatedAt: '',
};

const emptySchedule: ScheduleBundle = {
    day: {
        id: 'day-1',
        airDate: '2026-06-03',
        timezone: 'UTC',
        status: 'draft',
        title: null,
        createdAt: '',
        updatedAt: '',
    },
    blocks: [],
    layers: [],
    mediaAssets: [],
    slideAssets: [],
};

const scheduleWithConflict: ScheduleBundle = {
    ...emptySchedule,
    blocks: [baseBlock],
};

const { getScheduleForDateMock } = vi.hoisted(() => ({
    getScheduleForDateMock: vi.fn(),
}));

vi.mock('@/lib/data', () => ({
    getScheduleForDate: getScheduleForDateMock,
}));

// ---------------------------------------------------------------------------
// Import module under test
// ---------------------------------------------------------------------------
import { revalidatePath } from 'next/cache';
import { scheduleLiveObjectOverride } from './blocks';
import { LIVE_ESTIMATED_DURATION_SECONDS } from '../live-object';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resetMocks() {
    vi.clearAllMocks();
    supabaseMock.setResult({ data: null, error: null });
    (supabaseMock.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (supabaseMock.select as ReturnType<typeof vi.fn>).mockReturnThis();
    (supabaseMock.insert as ReturnType<typeof vi.fn>).mockReturnThis();
    (supabaseMock.update as ReturnType<typeof vi.fn>).mockReturnThis();
    (supabaseMock.upsert as ReturnType<typeof vi.fn>).mockReturnThis();
    (supabaseMock.delete as ReturnType<typeof vi.fn>).mockReturnThis();
    (supabaseMock.eq as ReturnType<typeof vi.fn>).mockReturnThis();
    (supabaseMock.gte as ReturnType<typeof vi.fn>).mockReturnThis();
    (supabaseMock.lt as ReturnType<typeof vi.fn>).mockReturnThis();
    (supabaseMock.in as ReturnType<typeof vi.fn>).mockReturnThis();
    (supabaseMock.maybeSingle as ReturnType<typeof vi.fn>).mockImplementation(() =>
        Promise.resolve(supabaseMock._result),
    );
    (supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
        Promise.resolve(supabaseMock._result),
    );
    (supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
        (resolve: (value: MockResult) => void) =>
            Promise.resolve(supabaseMock._result).then(resolve),
    );
    getScheduleForDateMock.mockResolvedValue(emptySchedule);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('scheduleLiveObjectOverride', () => {
    beforeEach(() => {
        resetMocks();
    });

    it('happy path: creates the live block when no overlap exists', async () => {
        supabaseMock.setResult({ data: { id: 'day-1' }, error: null });
        getScheduleForDateMock.mockResolvedValue(emptySchedule);

        // Second call (insert) returns the created block
        let callCount = 0;
        (supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
            callCount++;

            if (callCount === 1) {
                return Promise.resolve({ data: { id: 'day-1' }, error: null });
            }

            return Promise.resolve({
                data: { id: 'live-block-1', start_time_seconds: 32400 },
                error: null,
            });
        });

        const result = await scheduleLiveObjectOverride({
            date: '2026-06-03',
            title: 'Breaking Live',
            startTime: '09:00:00',
            liveSourceType: 'youtube',
            liveUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });

        expect(result.success).toBe(true);

        if (result.success) {
            expect(result.data.id).toBe('live-block-1');
        }
        expect(supabaseMock.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                block_type: 'video',
                category: 'broadcast',
                duration_seconds: LIVE_ESTIMATED_DURATION_SECONDS,
                status: 'ready',
                hide_overlays: true,
                metadata: expect.objectContaining({ live_object: true }),
            }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/live');
        expect(revalidatePath).toHaveBeenCalledWith('/output/live');
    });

    it('overlays the live block without archiving the overlapping scheduled block', async () => {
        // Simulate: one scheduled block overlaps the live window. As an overlay,
        // the live block must coexist on top and the schedule must be untouched.
        getScheduleForDateMock.mockResolvedValue(scheduleWithConflict);

        let callCount = 0;
        (supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
            callCount++;

            if (callCount === 1) {
                // ensureProgramDay upsert
                return Promise.resolve({ data: { id: 'day-1' }, error: null });
            }

            // live block insert
            return Promise.resolve({
                data: { id: 'live-block-new', start_time_seconds: 32400 },
                error: null,
            });
        });

        const result = await scheduleLiveObjectOverride({
            date: '2026-06-03',
            title: 'Breaking Live',
            startTime: '09:00:00',
            liveSourceType: 'youtube',
            liveUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });

        expect(result.success).toBe(true);

        // No scheduled block may be archived or otherwise updated by the overlay.
        const updateCalls = (supabaseMock.update as ReturnType<typeof vi.fn>).mock.calls;
        const archiveCall = updateCalls.find(
            (call) =>
                typeof call[0] === 'object' &&
                call[0] !== null &&
                (call[0] as Record<string, unknown>).status === 'archived',
        );
        expect(archiveCall).toBeUndefined();
        expect(supabaseMock.update).not.toHaveBeenCalled();

        // The live block is inserted on top of the existing schedule.
        expect(supabaseMock.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                category: 'broadcast',
                duration_seconds: LIVE_ESTIMATED_DURATION_SECONDS,
                metadata: expect.objectContaining({
                    live_object: true,
                    live_source_type: 'youtube',
                }),
            }),
        );
    });

    it('error path: returns err when supabase insert fails (no blocks archived without live block)', async () => {
        getScheduleForDateMock.mockResolvedValue(scheduleWithConflict);

        let callCount = 0;
        (supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
            callCount++;

            if (callCount === 1) {
                return Promise.resolve({ data: { id: 'day-1' }, error: null });
            }

            // Live block insert fails
            return Promise.resolve({ data: null, error: new Error('DB constraint violation') });
        });

        const result = await scheduleLiveObjectOverride({
            date: '2026-06-03',
            title: 'Breaking Live',
            startTime: '09:00:00',
            liveSourceType: 'youtube',
            liveUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error).toMatch(/DB constraint violation/);
        }
    });

    it('error path: returns err for invalid live URL', async () => {
        supabaseMock.setResult({ data: { id: 'day-1' }, error: null });

        const result = await scheduleLiveObjectOverride({
            date: '2026-06-03',
            title: 'Bad URL',
            startTime: '09:00:00',
            liveSourceType: 'youtube',
            liveUrl: 'https://not-a-youtube-url.com/watch?v=',
        });

        expect(result).toEqual({
            success: false,
            error: 'Live URL must be a YouTube video link or HLS .m3u8 URL',
        });
        expect(supabaseMock.insert).not.toHaveBeenCalled();
    });

    it('leaves every existing scheduled block untouched (no archive, no shift)', async () => {
        // Two blocks: one overlapping at same start, one at a later non-overlapping time.
        // As an overlay, neither must be archived nor shifted.
        const laterBlock: ProgramBlock = {
            ...baseBlock,
            id: 'block-later',
            title: 'Afternoon Show',
            startTime: '10:00:00',
            startTimeSeconds: 36000,
            durationSeconds: 1800,
        };
        getScheduleForDateMock.mockResolvedValue({
            ...emptySchedule,
            blocks: [baseBlock, laterBlock],
        });

        let callCount = 0;
        (supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
            callCount++;

            if (callCount === 1) {
                return Promise.resolve({ data: { id: 'day-1' }, error: null });
            }

            return Promise.resolve({
                data: { id: 'live-block-new', start_time_seconds: 32400 },
                error: null,
            });
        });

        const result = await scheduleLiveObjectOverride({
            date: '2026-06-03',
            title: 'Breaking Live',
            startTime: '09:00:00',
            liveSourceType: 'youtube',
            liveUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });

        expect(result.success).toBe(true);

        // No existing block is updated in any way (no archive, no shift).
        expect(supabaseMock.update).not.toHaveBeenCalled();
        // The live overlay block is inserted.
        expect(supabaseMock.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                duration_seconds: LIVE_ESTIMATED_DURATION_SECONDS,
                metadata: expect.objectContaining({ live_object: true }),
            }),
        );
    });
});
