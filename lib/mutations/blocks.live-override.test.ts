import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock next/cache before any module import that uses it
// ---------------------------------------------------------------------------
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock audit so mutations don't need a real DB for audit logging
// ---------------------------------------------------------------------------
vi.mock('@/lib/audit/audit', () => ({
    auditedMutation: vi.fn(async (_meta: unknown, fn: () => Promise<void>) => fn()),
    recordAuditEvent: vi.fn(async () => undefined),
}));

// ---------------------------------------------------------------------------
// Drizzle D1 mock (mirrors lib/mutations.test.ts pattern exactly)
//
// Two-object split:
//   dbHandle  — non-thenable, returned by getDb(). Exposes insert/select/update/delete.
//   drizzleMock — thenable query builder, returned by every chain method.
// Keeping them separate prevents Promise.resolve(builder) from unwrapping the
// thenable when resolving getDb().
// ---------------------------------------------------------------------------
type MockResult = { data: unknown; error: unknown };

const { dbHandle, drizzleMock } = vi.hoisted(() => {
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
        values: vi.fn().mockReturnThis(),
        onConflictDoUpdate: vi.fn().mockReturnThis(),
        from: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(() => {
            if (_result.error) {
                return Promise.reject(_result.error);
            }

            return Promise.resolve(
                Array.isArray(_result.data) ? _result.data : _result.data ? [_result.data] : [],
            );
        }),
        set: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        gte: vi.fn().mockReturnThis(),
        lt: vi.fn().mockReturnThis(),
        in: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        orderBy: vi.fn().mockReturnThis(),
        returning: vi.fn().mockImplementation(() => {
            if (_result.error) {
                return Promise.reject(_result.error);
            }

            return Promise.resolve(
                Array.isArray(_result.data) ? _result.data : _result.data ? [_result.data] : [],
            );
        }),
        // Thenable: makes `await db.insert(...).values(...)` and bare
        // `await db.select(...).from(...).where(...)` work without .limit/.returning.
        then: vi
            .fn()
            .mockImplementation(
                (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
                    if (_result.error) {
                        return Promise.reject(_result.error).then(resolve, reject);
                    }

                    const val = Array.isArray(_result.data)
                        ? _result.data
                        : _result.data
                          ? [_result.data]
                          : [];

                    return Promise.resolve(val).then(resolve, reject);
                },
            ),
    };

    const handle = {
        insert: vi.fn(() => builder),
        select: vi.fn(() => builder),
        update: vi.fn(() => builder),
        delete: vi.fn(() => builder),
    };

    return { dbHandle: handle, drizzleMock: builder };
});

vi.mock('@/lib/db/client', () => ({
    getDb: vi.fn(async () => dbHandle),
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
function rewireBuilder() {
    (drizzleMock.values as ReturnType<typeof vi.fn>).mockReturnThis();
    (drizzleMock.onConflictDoUpdate as ReturnType<typeof vi.fn>).mockReturnThis();
    (drizzleMock.from as ReturnType<typeof vi.fn>).mockReturnThis();
    (drizzleMock.where as ReturnType<typeof vi.fn>).mockReturnThis();
    (drizzleMock.set as ReturnType<typeof vi.fn>).mockReturnThis();
    (drizzleMock.eq as ReturnType<typeof vi.fn>).mockReturnThis();
    (drizzleMock.gte as ReturnType<typeof vi.fn>).mockReturnThis();
    (drizzleMock.lt as ReturnType<typeof vi.fn>).mockReturnThis();
    (drizzleMock.in as ReturnType<typeof vi.fn>).mockReturnThis();
    (drizzleMock.order as ReturnType<typeof vi.fn>).mockReturnThis();
    (drizzleMock.orderBy as ReturnType<typeof vi.fn>).mockReturnThis();
    (drizzleMock.limit as ReturnType<typeof vi.fn>).mockImplementation(() => {
        const r = drizzleMock._result;

        if (r.error) {
            return Promise.reject(r.error);
        }

        return Promise.resolve(Array.isArray(r.data) ? r.data : r.data ? [r.data] : []);
    });
    (drizzleMock.returning as ReturnType<typeof vi.fn>).mockImplementation(() => {
        const r = drizzleMock._result;

        if (r.error) {
            return Promise.reject(r.error);
        }

        return Promise.resolve(Array.isArray(r.data) ? r.data : r.data ? [r.data] : []);
    });
    (drizzleMock.then as ReturnType<typeof vi.fn>).mockImplementation(
        (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
            const r = drizzleMock._result;

            if (r.error) {
                return Promise.reject(r.error).then(resolve, reject);
            }

            const val = Array.isArray(r.data) ? r.data : r.data ? [r.data] : [];

            return Promise.resolve(val).then(resolve, reject);
        },
    );
    dbHandle.insert.mockReturnValue(drizzleMock);
    dbHandle.select.mockReturnValue(drizzleMock);
    dbHandle.update.mockReturnValue(drizzleMock);
    dbHandle.delete.mockReturnValue(drizzleMock);
}

function resetMocks() {
    vi.clearAllMocks();
    drizzleMock.setResult({ data: null, error: null });
    rewireBuilder();
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
        // ensureProgramDay: insert+onConflictDoUpdate resolves ok, then select returns day row.
        // The live block insert: .returning() returns the created block row.
        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });
        (drizzleMock.returning as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
            { id: 'live-block-1', start_time_seconds: 32400 },
        ]);

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
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                blockType: 'video',
                category: 'broadcast',
                durationSeconds: LIVE_ESTIMATED_DURATION_SECONDS,
                status: 'ready',
                hideOverlays: true,
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

        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });
        (drizzleMock.returning as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
            { id: 'live-block-new', start_time_seconds: 32400 },
        ]);

        const result = await scheduleLiveObjectOverride({
            date: '2026-06-03',
            title: 'Breaking Live',
            startTime: '09:00:00',
            liveSourceType: 'youtube',
            liveUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });

        expect(result.success).toBe(true);

        // No scheduled block may be archived or otherwise updated by the overlay.
        const updateCalls = (dbHandle.update as ReturnType<typeof vi.fn>).mock.calls;
        const archiveCall = updateCalls.find(
            (call) =>
                typeof call[0] === 'object' &&
                call[0] !== null &&
                (call[0] as Record<string, unknown>).status === 'archived',
        );
        expect(archiveCall).toBeUndefined();

        // The live block is inserted on top of the existing schedule.
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                category: 'broadcast',
                durationSeconds: LIVE_ESTIMATED_DURATION_SECONDS,
                metadata: expect.objectContaining({
                    live_object: true,
                    live_source_type: 'youtube',
                }),
            }),
        );
    });

    it('error path: returns err when D1 insert fails (no blocks archived without live block)', async () => {
        getScheduleForDateMock.mockResolvedValue(scheduleWithConflict);

        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });
        // Live block insert fails — returning() rejects
        (drizzleMock.returning as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
            new Error('DB constraint violation'),
        );

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
        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });

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
        // ensureProgramDay runs before URL validation, so programDays insert fires once.
        // The live block insert (programBlocks with blockType: 'video') must NOT happen.
        const liveBlockInsertCalls = (
            drizzleMock.values as ReturnType<typeof vi.fn>
        ).mock.calls.filter(
            (call) =>
                typeof call[0] === 'object' &&
                call[0] !== null &&
                !Array.isArray(call[0]) &&
                (call[0] as Record<string, unknown>).blockType === 'video',
        );
        expect(liveBlockInsertCalls).toHaveLength(0);
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

        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });
        (drizzleMock.returning as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
            { id: 'live-block-new', start_time_seconds: 32400 },
        ]);

        const result = await scheduleLiveObjectOverride({
            date: '2026-06-03',
            title: 'Breaking Live',
            startTime: '09:00:00',
            liveSourceType: 'youtube',
            liveUrl: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        });

        expect(result.success).toBe(true);

        // No existing block is updated with status archived (no archive, no shift).
        const setArchiveCalls = (drizzleMock.set as ReturnType<typeof vi.fn>).mock.calls.filter(
            (call) =>
                typeof call[0] === 'object' &&
                call[0] !== null &&
                (call[0] as Record<string, unknown>).status === 'archived',
        );
        expect(setArchiveCalls).toHaveLength(0);

        // The live overlay block is inserted.
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                durationSeconds: LIVE_ESTIMATED_DURATION_SECONDS,
                metadata: expect.objectContaining({ live_object: true }),
            }),
        );
    });
});
