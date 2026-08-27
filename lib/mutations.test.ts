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
// Drizzle D1 mock
//
// Design constraint: the builder needs a `.then` so that code like
//   `await db.insert(t).values({})` resolves (Drizzle chains are thenable).
// But if the builder is thenable, `Promise.resolve(builder)` would unwrap it,
// meaning `await getDb()` would resolve to `_result.data` not the builder.
//
// Solution: separate the DB handle (non-thenable, returned by getDb) from
// the query builder (thenable, returned by every chain method).
// The DB handle exposes `insert/select/update/delete` whose return values ARE
// the thenable builder.  `getDb()` returns the non-thenable handle directly.
// ---------------------------------------------------------------------------
type MockResult = { data: unknown; error: unknown };

const { dbHandle, drizzleMock } = vi.hoisted(() => {
    let _result: MockResult = { data: null, error: null };

    // Thenable query builder — returned by every chain method.
    // All non-terminal methods return `builder` for further chaining.
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
        // Thenable: makes `await db.insert(...).values(...)` and
        // `await db.select(...).from(...).where(...)` (no limit) work.
        // Always normalises to array so iterating the result is safe;
        // insert/update callers ignore the resolved value anyway.
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

    // Non-thenable DB handle — safe to return from getDb() via Promise.resolve.
    // Each root method records its call and returns the thenable builder.
    const handle = {
        insert: vi.fn(() => builder),
        select: vi.fn(() => builder),
        update: vi.fn(() => builder),
        delete: vi.fn(() => builder),
    };

    return { dbHandle: handle, drizzleMock: builder };
});

vi.mock('@/lib/db/client', () => ({
    // Returning the non-thenable handle avoids thenable-unwrapping by Promise.resolve.
    getDb: vi.fn(async () => dbHandle),
}));

// ---------------------------------------------------------------------------
// Mock lib/data (getScheduleForDate)
// ---------------------------------------------------------------------------

const mockSchedule: ScheduleBundle = {
    day: {
        id: 'day-1',
        airDate: '2026-05-08',
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

vi.mock('@/lib/data', () => ({
    getScheduleForDate: vi.fn(() => Promise.resolve(mockSchedule)),
}));

// ---------------------------------------------------------------------------
// Mock lib/schedule-builder
// ---------------------------------------------------------------------------

const fakeGeneratedBlocks: GeneratedBlock[] = [
    {
        title: 'Programa: Test',
        blockType: 'video',
        assetId: 'asset-1',
        slideId: null,
        startTime: '10:00:00',
        startTimeSeconds: 36000,
        durationSeconds: 1800,
    },
    {
        title: 'Ad: Banner',
        blockType: 'ad',
        assetId: 'asset-2',
        slideId: null,
        startTime: '10:30:00',
        startTimeSeconds: 37800,
        durationSeconds: 30,
    },
];

const fakeGeneratedCardBlocks: GeneratedBlock[] = [
    {
        title: 'Markets Card',
        blockType: 'slide',
        assetId: null,
        slideId: 'slide-1',
        startTime: '10:00:00',
        startTimeSeconds: 36000,
        durationSeconds: 30,
    },
    {
        title: 'Weather Card',
        blockType: 'slide',
        assetId: null,
        slideId: 'slide-2',
        startTime: '10:00:30',
        startTimeSeconds: 36030,
        durationSeconds: 30,
    },
];

vi.mock('@/lib/scheduling/schedule-builder', () => ({
    buildBulkCardLoop: vi.fn(() => fakeGeneratedCardBlocks),
    buildLongTestSchedule: vi.fn(() => fakeGeneratedBlocks),
}));

// ---------------------------------------------------------------------------
// Mock lib/schedule-health (analyzeSchedule)
// vi.hoisted ensures the fn is available when vi.mock factory is hoisted
// ---------------------------------------------------------------------------
import type { ScheduleHealth } from './scheduling/schedule-health';

const { analyzeScheduleMock } = vi.hoisted(() => ({
    analyzeScheduleMock: vi.fn(),
}));

vi.mock('@/lib/scheduling/schedule-health', () => ({
    analyzeSchedule: analyzeScheduleMock,
}));

const healthClean: ScheduleHealth = {
    gaps: [],
    overlaps: [],
    missingAssets: [],
    unreadyAssets: [],
    unsupportedAssets: [],
    fallbackIssues: [],
    layerIssues: [],
    issues: [],
    criticalCount: 0,
    warnCount: 0,
};

// ---------------------------------------------------------------------------
// Now import the module under test + mocked peer modules (static, for reset)
// ---------------------------------------------------------------------------
import { revalidatePath } from 'next/cache';

import { getScheduleForDate } from '@/lib/data';
import { buildBulkCardLoop, buildLongTestSchedule } from '@/lib/scheduling/schedule-builder';

import {
    ensureProgramDay,
    createProgramDayFromTemplate,
    createProgramBlock,
    fillProgramBlockContent,
    updateProgramDayStatus,
    updateProgramBlock,
    createBulkCardLoop,
    activateFallbackCarouselSet,
    deleteFallbackCarouselSet,
    saveFallbackCarouselSet,
    saveGlobalFallbackCarouselFromSlides,
    createLongTestSchedule,
    createWeatherPlate,
    createYouTubeSlide,
    updateWeatherPlate,
    reorderProgramBlocks,
    resizeProgramBlock,
    moveProgramBlock,
    duplicateProgramBlock,
    bulkUpdateProgramBlockStatus,
    updateRunbookCheck,
    createSlideAsset,
    createScheduledLayer,
    setScheduledLayerEnabled,
    createMediaAsset,
    updateMediaAsset,
} from './mutations';

import type { GeneratedBlock } from './scheduling/schedule-builder';
import type { ProgramBlock, ScheduleBundle } from './types';

// Typed references to the mocked functions for easy use in tests
const getScheduleForDateMock = vi.mocked(getScheduleForDate);
const buildBulkCardLoopMock = vi.mocked(buildBulkCardLoop);
const buildLongTestScheduleMock = vi.mocked(buildLongTestSchedule);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function rewireBuilder() {
    // Restore default chain implementations on drizzleMock (the query builder).
    // Called after vi.clearAllMocks() wipes call history (but not impls) and
    // after any test that overrides a method with mockImplementationOnce etc.
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
    // dbHandle root methods always return the builder
    dbHandle.insert.mockReturnValue(drizzleMock);
    dbHandle.select.mockReturnValue(drizzleMock);
    dbHandle.update.mockReturnValue(drizzleMock);
    dbHandle.delete.mockReturnValue(drizzleMock);
}

function resetMocks() {
    vi.clearAllMocks();
    drizzleMock.setResult({ data: null, error: null });
    rewireBuilder();

    // Re-wire module mocks
    getScheduleForDateMock.mockResolvedValue(mockSchedule);
    analyzeScheduleMock.mockReturnValue(healthClean);
    buildBulkCardLoopMock.mockReturnValue(fakeGeneratedCardBlocks);
    buildLongTestScheduleMock.mockReturnValue(fakeGeneratedBlocks);
}

function slideFallbackCard(slideId: string, durationSeconds: number) {
    return {
        kind: 'slide',
        id: slideId,
        slideId,
        durationSeconds,
    };
}

// ---------------------------------------------------------------------------
// ensureProgramDay
// ---------------------------------------------------------------------------
describe('ensureProgramDay', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('happy path: upserts program_days and returns the id', async () => {
        // ensureProgramDay: insert + onConflictDoUpdate, then select().from().where().limit()
        // The select resolves via .limit() → we set data as an array item
        drizzleMock.setResult({ data: { id: 'day-99' }, error: null });

        const result = await ensureProgramDay('2026-05-08');

        expect(result).toEqual({ success: true, data: 'day-99' });
        expect(dbHandle.insert).toHaveBeenCalled();
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({ airDate: '2026-05-08', status: 'draft' }),
        );
        expect(drizzleMock.onConflictDoUpdate).toHaveBeenCalled();
        expect(revalidatePath).toHaveBeenCalledWith('/admin/calendar');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
    });

    it('error path: returns failure when DB returns an error', async () => {
        drizzleMock.setResult({ data: null, error: new Error('DB down') });

        const result = await ensureProgramDay('2026-05-08');

        expect(result).toEqual({ success: false, error: 'DB down' });
    });
});

// ---------------------------------------------------------------------------
// createProgramDayFromTemplate
// ---------------------------------------------------------------------------
describe('createProgramDayFromTemplate', () => {
    beforeEach(async () => {
        await resetMocks();
        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });
    });

    it('happy path: inserts draft placeholder blocks from a built-in template', async () => {
        await createProgramDayFromTemplate({
            date: '2026-05-08',
            templateId: 'short-test-day',
            startTime: '09:00:00',
        });

        const insertValuesCall = (drizzleMock.values as ReturnType<typeof vi.fn>).mock.calls.find(
            (call) => Array.isArray(call[0]),
        );
        expect(insertValuesCall).toBeDefined();
        const inserted = insertValuesCall![0] as Array<{
            programDayId: string;
            status: string;
            assetId: string | null;
            slideId: string | null;
            startTime: string;
        }>;
        expect(inserted).toHaveLength(4);
        expect(inserted[0]).toEqual(
            expect.objectContaining({
                programDayId: 'day-1',
                status: 'draft',
                assetId: null,
                slideId: null,
                startTime: '09:00:00',
            }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/calendar');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/output');
    });

    it('error path: rejects unknown templates', async () => {
        const result = await createProgramDayFromTemplate({
            date: '2026-05-08',
            templateId: 'missing-template',
            startTime: '09:00:00',
        });

        expect(result).toEqual({ success: false, error: 'Unknown day template' });
    });

    it('error path: rejects days that already have active blocks', async () => {
        getScheduleForDateMock.mockResolvedValue({
            ...mockSchedule,
            blocks: [testBlock({ id: 'block-existing', status: 'ready' })],
        });

        const result = await createProgramDayFromTemplate({
            date: '2026-05-08',
            templateId: 'short-test-day',
            startTime: '09:00:00',
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error).toMatch(/already has blocks/);
        }
    });
});

// ---------------------------------------------------------------------------
// fillProgramBlockContent
// ---------------------------------------------------------------------------
describe('fillProgramBlockContent', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('happy path: assigns a ready asset and expands duration when content is longer', async () => {
        getScheduleForDateMock.mockResolvedValue({
            ...mockSchedule,
            blocks: [
                testBlock({
                    id: 'block-video',
                    title: 'Market video slot',
                    blockType: 'video',
                    status: 'draft',
                    durationSeconds: 300,
                }),
            ],
            mediaAssets: [
                {
                    id: 'asset-video',
                    title: 'Long Video',
                    sourceType: 'public_url',
                    playbackKind: 'embed',
                    mediaKind: 'video',
                    assetType: 'video',
                    durationSeconds: 900,
                    status: 'ready',
                    createdAt: '',
                    updatedAt: '',
                },
            ],
        });

        await fillProgramBlockContent({
            date: '2026-05-08',
            blockId: 'block-video',
            assetId: 'asset-video',
        });

        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Long Video',
                assetId: 'asset-video',
                slideId: null,
                durationSeconds: 900,
                status: 'ready',
            }),
        );
    });

    it('error path: rejects mismatched asset types', async () => {
        getScheduleForDateMock.mockResolvedValue({
            ...mockSchedule,
            blocks: [testBlock({ id: 'block-ad', blockType: 'ad', status: 'draft' })],
            mediaAssets: [
                {
                    id: 'asset-video',
                    title: 'Video',
                    sourceType: 'public_url',
                    playbackKind: 'embed',
                    mediaKind: 'video',
                    assetType: 'video',
                    durationSeconds: 300,
                    status: 'ready',
                    createdAt: '',
                    updatedAt: '',
                },
            ],
        });

        const result = await fillProgramBlockContent({
            date: '2026-05-08',
            blockId: 'block-ad',
            assetId: 'asset-video',
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error).toMatch(/does not match/);
        }
    });
});

describe('rundown editor mutations', () => {
    beforeEach(async () => {
        await resetMocks();
        getScheduleForDateMock.mockResolvedValue({
            ...mockSchedule,
            blocks: [
                testBlock({
                    id: 'block-1',
                    title: 'A',
                    startTimeSeconds: 3600,
                    durationSeconds: 900,
                }),
                testBlock({
                    id: 'block-2',
                    title: 'B',
                    startTimeSeconds: 4500,
                    durationSeconds: 600,
                }),
                testBlock({
                    id: 'block-3',
                    title: 'C',
                    startTimeSeconds: 5100,
                    durationSeconds: 300,
                }),
            ],
        });
    });

    it('reorders blocks by temporarily archiving them to avoid overlap checks', async () => {
        await reorderProgramBlocks({
            date: '2026-05-08',
            orderedBlockIds: ['block-2', 'block-1', 'block-3'],
        });

        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'archived' }),
        );
        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({
                startTime: '01:00:00',
                startTimeSeconds: 3600,
                status: 'ready',
            }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
    });

    it('resizes a block to exact seconds', async () => {
        await resizeProgramBlock({
            date: '2026-05-08',
            blockId: 'block-3',
            durationSeconds: 430,
        });

        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ durationSeconds: 430 }),
        );
    });

    it('moves a block to exact seconds', async () => {
        await moveProgramBlock({
            date: '2026-05-08',
            blockId: 'block-3',
            startTimeSeconds: 7201,
        });

        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ startTime: '02:00:01', startTimeSeconds: 7201 }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
    });

    it('auto-inserts when moving a block into another block', async () => {
        await moveProgramBlock({
            date: '2026-05-08',
            blockId: 'block-3',
            startTimeSeconds: 3600,
        });

        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'archived' }),
        );
        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ startTime: '01:00:00', startTimeSeconds: 3600 }),
        );
        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ startTime: '01:05:00', startTimeSeconds: 3900 }),
        );
    });

    it('rejects moving a missing block', async () => {
        const result = await moveProgramBlock({
            date: '2026-05-08',
            blockId: 'missing',
            startTimeSeconds: 7200,
        });

        expect(result).toEqual({ success: false, error: 'Bloque no encontrado' });
    });

    it('clamps moves to the end of the day', async () => {
        await moveProgramBlock({
            date: '2026-05-08',
            blockId: 'block-3',
            startTimeSeconds: 999999,
        });

        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ startTime: '23:55:00', startTimeSeconds: 86100 }),
        );
    });

    it('duplicates a block and shifts following blocks', async () => {
        await duplicateProgramBlock({ date: '2026-05-08', blockId: 'block-1' });

        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'A copy',
                startTime: '01:15:00',
                durationSeconds: 900,
                status: 'draft',
            }),
        );
        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ startTimeSeconds: 5400 }),
        );
    });

    it('bulk updates selected block status', async () => {
        await bulkUpdateProgramBlockStatus({
            date: '2026-05-08',
            blockIds: ['block-1', 'block-3'],
            status: 'archived',
        });

        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'archived' }),
        );
    });
});

describe('operator runbook mutations', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('upserts a persisted per-day runbook check', async () => {
        const result = await updateRunbookCheck({
            date: '2026-05-08',
            programDayId: 'day-1',
            section: 'preflight',
            itemKey: 'health-green',
            checked: true,
            notes: 'OK',
        });

        expect(result).toEqual({ success: true, data: undefined });
        expect(dbHandle.insert).toHaveBeenCalled();
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                programDayId: 'day-1',
                section: 'preflight',
                itemKey: 'health-green',
                checked: true,
                notes: 'OK',
            }),
        );
        expect(drizzleMock.onConflictDoUpdate).toHaveBeenCalled();
        expect(revalidatePath).toHaveBeenCalledWith('/admin/runbook/2026-05-08');
    });
});

function testBlock(input: Partial<ProgramBlock>): ProgramBlock {
    return {
        id: input.id ?? 'block',
        programDayId: input.programDayId ?? 'day-1',
        title: input.title ?? 'Block',
        blockType: input.blockType ?? 'video',
        category: input.category ?? 'broadcast',
        assetId: input.assetId ?? null,
        slideId: input.slideId ?? null,
        startTime: input.startTime ?? formatSeconds(input.startTimeSeconds ?? 0),
        startTimeSeconds: input.startTimeSeconds ?? 0,
        durationSeconds: input.durationSeconds ?? 300,
        status: input.status ?? 'ready',
        hideOverlays: input.hideOverlays ?? false,
        fallbackAssetId: input.fallbackAssetId ?? null,
        notes: input.notes ?? null,
        createdAt: '',
        updatedAt: '',
    };
}

function formatSeconds(seconds: number) {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = seconds % 60;

    return [hours, minutes, remainingSeconds]
        .map((part) => String(part).padStart(2, '0'))
        .join(':');
}

// ---------------------------------------------------------------------------
// createProgramBlock
// ---------------------------------------------------------------------------
describe('createProgramBlock', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('happy path: inserts a block for a non-conflicting time slot', async () => {
        // ensureProgramDay: insert resolves ok, then select returns the day row
        // createProgramBlock insert: .returning() returns the new block row
        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });
        (drizzleMock.returning as ReturnType<typeof vi.fn>).mockResolvedValueOnce([
            { id: 'block-created', start_time_seconds: 36000 },
        ]);

        const result = await createProgramBlock({
            date: '2026-05-08',
            title: 'Mercados en Vivo',
            blockType: 'video',
            category: 'mercados',
            startTime: '10:00:00',
            durationSeconds: 1800,
            hideOverlays: false,
        });

        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Mercados en Vivo',
                blockType: 'video',
                category: expect.stringContaining(''),
                startTime: '10:00:00',
                durationSeconds: 1800,
            }),
        );
        expect(result).toEqual({
            success: true,
            data: { id: 'block-created', startTimeSeconds: 36000 },
        });
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
    });

    it('auto-inserts when a conflicting block exists', async () => {
        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });
        (drizzleMock.returning as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 'block-created', start_time_seconds: 37500 },
        ]);
        getScheduleForDateMock.mockResolvedValue({
            ...mockSchedule,
            day: mockSchedule.day,
            blocks: [
                {
                    id: 'block-existing',
                    programDayId: 'day-1',
                    title: 'Existing',
                    blockType: 'video',
                    category: 'mercados',
                    startTime: '10:00:00',
                    startTimeSeconds: 36000,
                    durationSeconds: 1800,
                    status: 'ready',
                    hideOverlays: false,
                    createdAt: '',
                    updatedAt: '',
                },
            ],
        });

        await createProgramBlock({
            date: '2026-05-08',
            title: 'Overlap Block',
            blockType: 'video',
            startTime: '10:15:00',
            durationSeconds: 600,
            hideOverlays: false,
        });

        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'archived' }),
        );
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Overlap Block', startTime: '10:15:00' }),
        );
    });

    it('allows exact short blocks over archived time ranges', async () => {
        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });
        (drizzleMock.returning as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 'block-created', start_time_seconds: 37500 },
        ]);
        getScheduleForDateMock.mockResolvedValue({
            ...mockSchedule,
            day: mockSchedule.day,
            blocks: [
                testBlock({
                    id: 'block-archived',
                    title: 'Archived',
                    startTimeSeconds: 36000,
                    durationSeconds: 1800,
                    status: 'archived',
                }),
            ],
        });

        await createProgramBlock({
            date: '2026-05-08',
            title: '57 second ad',
            blockType: 'ad',
            startTime: '10:15:00',
            durationSeconds: 57,
            hideOverlays: false,
        });

        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({ title: '57 second ad', durationSeconds: 57 }),
        );
    });

    it('archives conflicting blocks when replacement is explicit', async () => {
        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });
        (drizzleMock.returning as ReturnType<typeof vi.fn>).mockResolvedValue([
            { id: 'block-created', start_time_seconds: 37500 },
        ]);
        getScheduleForDateMock.mockResolvedValue({
            ...mockSchedule,
            day: mockSchedule.day,
            blocks: [
                {
                    id: 'block-existing',
                    programDayId: 'day-1',
                    title: 'Existing',
                    blockType: 'video',
                    category: 'mercados',
                    startTime: '10:00:00',
                    startTimeSeconds: 36000,
                    durationSeconds: 1800,
                    status: 'ready',
                    hideOverlays: false,
                    createdAt: '',
                    updatedAt: '',
                },
            ],
        });

        await createProgramBlock({
            date: '2026-05-08',
            title: 'Replacement',
            blockType: 'video',
            startTime: '10:15:00',
            durationSeconds: 600,
            hideOverlays: false,
            conflictResolution: 'archive_conflicts',
        });

        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'archived' }),
        );
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Replacement' }),
        );
    });

    it('error path: returns failure when DB insert fails', async () => {
        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });
        (drizzleMock.returning as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
            new Error('Insert failed'),
        );

        const result = await createProgramBlock({
            date: '2026-05-08',
            title: 'Block',
            blockType: 'video',
            startTime: '11:00:00',
            durationSeconds: 600,
            hideOverlays: false,
        });

        expect(result).toEqual({ success: false, error: 'Insert failed' });
    });

    it('validation: returns failure for ad blocks longer than 300s', async () => {
        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });

        const result = await createProgramBlock({
            date: '2026-05-08',
            title: 'Long Ad',
            blockType: 'ad',
            startTime: '12:00:00',
            durationSeconds: 400,
            hideOverlays: false,
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error).toMatch(/300 seconds/);
        }
    });
});

// ---------------------------------------------------------------------------
// updateProgramDayStatus
// ---------------------------------------------------------------------------
describe('updateProgramDayStatus', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('happy path: updates status to ready when schedule is healthy', async () => {
        await updateProgramDayStatus({ date: '2026-05-08', status: 'ready' });

        expect(analyzeScheduleMock).toHaveBeenCalledWith(mockSchedule);
        expect(drizzleMock.set).toHaveBeenCalledWith(expect.objectContaining({ status: 'ready' }));
        expect(revalidatePath).toHaveBeenCalledWith('/admin/calendar');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
    });

    it('happy path: allows archiving without health check blocking', async () => {
        analyzeScheduleMock.mockReturnValue({ ...healthClean, criticalCount: 2, warnCount: 5 });

        await updateProgramDayStatus({ date: '2026-05-08', status: 'archived' });

        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'archived' }),
        );
    });

    it('error path: returns failure for invalid status', async () => {
        const result = await updateProgramDayStatus({
            date: '2026-05-08',
            status: 'invalid-status',
        });

        expect(result).toEqual({ success: false, error: 'Estado invalido' });
    });

    it('error path: returns failure when schedule has critical issues and status is ready', async () => {
        analyzeScheduleMock.mockReturnValue({ ...healthClean, criticalCount: 1, warnCount: 0 });

        const result = await updateProgramDayStatus({ date: '2026-05-08', status: 'ready' });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error).toMatch(/criticas/);
        }
    });

    it('error path: returns failure on warnings without allowWarnings flag', async () => {
        analyzeScheduleMock.mockReturnValue({ ...healthClean, criticalCount: 0, warnCount: 2 });

        const result = await updateProgramDayStatus({ date: '2026-05-08', status: 'ready' });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error).toMatch(/advertencias/);
        }
    });

    it('happy path: allows ready when warnings present and allowWarnings=true', async () => {
        analyzeScheduleMock.mockReturnValue({ ...healthClean, criticalCount: 0, warnCount: 3 });

        await updateProgramDayStatus({ date: '2026-05-08', status: 'ready', allowWarnings: true });

        expect(drizzleMock.set).toHaveBeenCalled();
    });

    it('error path: returns failure when day not found in schedule', async () => {
        getScheduleForDateMock.mockResolvedValue({ ...mockSchedule, day: null });

        const result = await updateProgramDayStatus({ date: '2026-05-08', status: 'draft' });

        expect(result).toEqual({ success: false, error: 'Dia no encontrado' });
    });

    it('error path: returns failure when DB update fails', async () => {
        (drizzleMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
                Promise.reject(new Error('Update error')).then(resolve, reject),
        );

        const result = await updateProgramDayStatus({ date: '2026-05-08', status: 'draft' });

        expect(result).toEqual({ success: false, error: 'Update error' });
    });
});

// ---------------------------------------------------------------------------
// updateProgramBlock
// ---------------------------------------------------------------------------
describe('updateProgramBlock', () => {
    const baseInput = {
        date: '2026-05-08',
        blockId: 'block-1',
        title: 'Updated Block',
        blockType: 'video' as const,
        category: 'mercados' as const,
        startTime: '10:00:00',
        durationSeconds: 1800,
        status: 'ready',
        hideOverlays: false,
    };

    beforeEach(async () => {
        await resetMocks();
        getScheduleForDateMock.mockResolvedValue({
            ...mockSchedule,
            blocks: [
                {
                    id: 'block-1',
                    programDayId: 'day-1',
                    title: 'Original',
                    blockType: 'video',
                    category: 'mercados',
                    startTime: '10:00:00',
                    startTimeSeconds: 36000,
                    durationSeconds: 1800,
                    status: 'ready',
                    hideOverlays: false,
                    createdAt: '',
                    updatedAt: '',
                },
            ],
        });
    });

    it('happy path: updates block fields', async () => {
        await updateProgramBlock(baseInput);

        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Updated Block',
                blockType: 'video',
                startTime: '10:00:00',
                durationSeconds: 1800,
            }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08/blocks/block-1');
    });

    it('includes category in payload when provided', async () => {
        await updateProgramBlock({ ...baseInput, category: 'broadcast' });

        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ category: 'broadcast' }),
        );
    });

    it('stores previously recorded bug metadata for video blocks', async () => {
        await updateProgramBlock({
            ...baseInput,
            previouslyRecordedEnabled: true,
            previouslyRecordedPosition: 'bottom_right',
        });

        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    previously_recorded_enabled: true,
                    previously_recorded_position: 'bottom_right',
                }),
            }),
        );
    });

    it('removes previously recorded bug metadata from non-video blocks', async () => {
        getScheduleForDateMock.mockResolvedValue({
            ...mockSchedule,
            blocks: [
                {
                    id: 'block-1',
                    programDayId: 'day-1',
                    title: 'Original',
                    blockType: 'video',
                    category: 'mercados',
                    startTime: '10:00:00',
                    startTimeSeconds: 36000,
                    durationSeconds: 1800,
                    status: 'ready',
                    hideOverlays: false,
                    metadata: {
                        previously_recorded_enabled: true,
                        previously_recorded_position: 'top_left',
                        keep: 'value',
                    },
                    createdAt: '',
                    updatedAt: '',
                },
            ],
        });

        await updateProgramBlock({
            ...baseInput,
            blockType: 'promo',
            previouslyRecordedEnabled: true,
            previouslyRecordedPosition: 'bottom_right',
        });

        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: { keep: 'value' },
            }),
        );
    });

    it('error path: returns failure for invalid block type', async () => {
        const result = await updateProgramBlock({
            ...baseInput,
            blockType: 'unknown' as 'video',
        });

        expect(result).toEqual({ success: false, error: 'Tipo de bloque invalido' });
    });

    it('error path: returns failure for invalid status', async () => {
        const result = await updateProgramBlock({ ...baseInput, status: 'invalid' });

        expect(result).toEqual({ success: false, error: 'Estado invalido' });
    });

    it('error path: returns failure when block not found', async () => {
        const result = await updateProgramBlock({ ...baseInput, blockId: 'nonexistent' });

        expect(result).toEqual({ success: false, error: 'Bloque no encontrado' });
    });

    it('error path: returns failure for ad > 300s', async () => {
        const result = await updateProgramBlock({
            ...baseInput,
            blockType: 'ad',
            durationSeconds: 400,
        });

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error).toMatch(/300 seconds/);
        }
    });

    it('error path: returns failure when DB update fails', async () => {
        (drizzleMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
                Promise.reject(new Error('Update block error')).then(resolve, reject),
        );

        const result = await updateProgramBlock(baseInput);

        expect(result).toEqual({ success: false, error: 'Update block error' });
    });
});

// ---------------------------------------------------------------------------
// createLongTestSchedule
// ---------------------------------------------------------------------------
describe('createLongTestSchedule', () => {
    const baseInput = {
        date: '2026-05-08',
        startTime: '10:00:00',
        totalHours: 1,
        programMinutes: 30,
        adBreakMinutes: 5,
        imageBumperSeconds: 10,
        replaceWindow: false,
    };

    beforeEach(async () => {
        await resetMocks();
    });

    it('happy path: inserts generated blocks with category broadcast', async () => {
        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });

        await createLongTestSchedule(baseInput);

        const bulkInsertCall = (drizzleMock.values as ReturnType<typeof vi.fn>).mock.calls.find(
            (call) =>
                Array.isArray(call[0]) &&
                (call[0] as Array<{ category: string }>)[0]?.category === 'broadcast',
        );
        expect(bulkInsertCall).toBeDefined();
        const inserted = bulkInsertCall![0] as Array<{ category: string; programDayId: string }>;
        expect(inserted.length).toBe(fakeGeneratedBlocks.length);
        inserted.forEach((row) => expect(row.category).toBe('broadcast'));
    });

    it('happy path: calls revalidatePath for schedule and calendar', async () => {
        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });

        await createLongTestSchedule(baseInput);

        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/calendar');
    });

    it('happy path: deletes window blocks when replaceWindow=true', async () => {
        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });

        await createLongTestSchedule({ ...baseInput, replaceWindow: true });

        expect(dbHandle.delete).toHaveBeenCalled();
    });

    it('error path: returns failure when buildLongTestSchedule returns empty array', async () => {
        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });
        buildLongTestScheduleMock.mockReturnValue([]);

        const result = await createLongTestSchedule(baseInput);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error).toMatch(/No se pudo generar/);
        }
    });

    it('error path: returns failure when DB insert fails', async () => {
        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });
        (drizzleMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
                Promise.reject(new Error('Bulk insert failed')).then(resolve, reject),
        );

        const result = await createLongTestSchedule(baseInput);

        expect(result).toEqual({ success: false, error: 'Bulk insert failed' });
    });
});

// ---------------------------------------------------------------------------
// createBulkCardLoop
// ---------------------------------------------------------------------------
describe('createBulkCardLoop', () => {
    const readySlide = {
        id: 'slide-1',
        title: 'Markets Card',
        slideType: 'template',
        templateId: 'markets',
        defaultDurationSeconds: 30,
        status: 'ready',
        createdAt: '',
        updatedAt: '',
    } as const;
    const secondSlide = {
        ...readySlide,
        id: 'slide-2',
        title: 'Weather Card',
        templateId: 'weather',
    } as const;
    const baseInput = {
        date: '2026-05-08',
        startTime: '10:00:00',
        endTime: '10:01:00',
        cards: [
            { slideId: 'slide-1', durationSeconds: 30 },
            { slideId: 'slide-2', durationSeconds: 30 },
        ],
        replaceWindow: false,
    };

    beforeEach(async () => {
        await resetMocks();
        drizzleMock.setResult({ data: { id: 'day-1' }, error: null });
        getScheduleForDateMock.mockResolvedValue({
            ...mockSchedule,
            slideAssets: [readySlide, secondSlide],
            blocks: [],
        } as ScheduleBundle);
    });

    it('happy path: inserts ready slide blocks in generated order', async () => {
        await createBulkCardLoop(baseInput);

        expect(buildBulkCardLoopMock).toHaveBeenCalledWith({
            cards: [
                { slideId: 'slide-1', title: 'Markets Card', durationSeconds: 30 },
                { slideId: 'slide-2', title: 'Weather Card', durationSeconds: 30 },
            ],
            startTime: '10:00:00',
            endTime: '10:01:00',
        });
        const bulkInsertCall = (drizzleMock.values as ReturnType<typeof vi.fn>).mock.calls.find(
            (call) =>
                Array.isArray(call[0]) &&
                (call[0] as Array<{ blockType: string }>)[0]?.blockType === 'slide',
        );
        expect(bulkInsertCall).toBeDefined();
        const inserted = bulkInsertCall![0] as Array<{
            slideId: string;
            blockType: string;
            durationSeconds: number;
            status: string;
        }>;
        expect(inserted.map((row) => row.slideId)).toEqual(['slide-1', 'slide-2']);
        inserted.forEach((row) => {
            expect(row.blockType).toBe('slide');
            expect(row.status).toBe('ready');
        });
    });

    it('error path: blocks conflicts unless replaceWindow=true', async () => {
        getScheduleForDateMock.mockResolvedValue({
            ...mockSchedule,
            slideAssets: [readySlide, secondSlide],
            blocks: [
                {
                    id: 'block-1',
                    programDayId: 'day-1',
                    title: 'Existing',
                    blockType: 'video',
                    category: 'broadcast',
                    assetId: null,
                    slideId: null,
                    startTime: '10:00:00',
                    startTimeSeconds: 36000,
                    durationSeconds: 300,
                    status: 'ready',
                    hideOverlays: false,
                    createdAt: '',
                    updatedAt: '',
                },
            ],
        } as ScheduleBundle);

        const result = await createBulkCardLoop(baseInput);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error).toMatch(/se solapa/);
        }
    });

    it('happy path: archives conflicts when replaceWindow=true', async () => {
        getScheduleForDateMock.mockResolvedValue({
            ...mockSchedule,
            slideAssets: [readySlide, secondSlide],
            blocks: [
                {
                    id: 'block-1',
                    programDayId: 'day-1',
                    title: 'Existing',
                    blockType: 'video',
                    category: 'broadcast',
                    assetId: null,
                    slideId: null,
                    startTime: '10:00:00',
                    startTimeSeconds: 36000,
                    durationSeconds: 300,
                    status: 'ready',
                    hideOverlays: false,
                    createdAt: '',
                    updatedAt: '',
                },
            ],
        } as ScheduleBundle);

        await createBulkCardLoop({ ...baseInput, replaceWindow: true });

        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'archived' }),
        );
    });

    it('error path: returns failure when no complete card fits', async () => {
        buildBulkCardLoopMock.mockReturnValue([]);

        const result = await createBulkCardLoop(baseInput);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error).toMatch(/ninguna card completa/);
        }
    });
});

// ---------------------------------------------------------------------------
// saveGlobalFallbackCarouselFromSlides
// ---------------------------------------------------------------------------
describe('saveGlobalFallbackCarouselFromSlides', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('stores ordered fallback carousel cards in integration settings', async () => {
        const result = await saveGlobalFallbackCarouselFromSlides({
            cards: [
                { slideId: 'slide-1', durationSeconds: 12 },
                { slideId: 'slide-2', durationSeconds: 18 },
            ],
        });

        expect(result).toEqual({ success: true, data: undefined });
        expect(dbHandle.insert).toHaveBeenCalled();
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'fallback_carousel',
                publicConfig: expect.objectContaining({
                    activeSetId: expect.any(String),
                    sets: [
                        expect.objectContaining({
                            name: 'Loop Builder fallback',
                            cards: [
                                slideFallbackCard('slide-1', 12),
                                slideFallbackCard('slide-2', 18),
                            ],
                        }),
                    ],
                    enabled: true,
                    cards: [slideFallbackCard('slide-1', 12), slideFallbackCard('slide-2', 18)],
                }),
                status: 'connected',
            }),
        );
        expect(drizzleMock.onConflictDoUpdate).toHaveBeenCalled();
    });

    it('rejects empty fallback carousel cards', async () => {
        const result = await saveGlobalFallbackCarouselFromSlides({ cards: [] });

        expect(result).toEqual({
            success: false,
            error: 'Selecciona al menos una card para fallback',
        });
    });
});

describe('fallback carousel set mutations', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('saves and activates a named fallback set', async () => {
        const result = await saveFallbackCarouselSet({
            name: 'Market break',
            cards: [
                { slideId: 'slide-1', durationSeconds: 30 },
                { slideId: 'slide-2', durationSeconds: 45 },
            ],
        });

        expect(result).toEqual({ success: true, data: undefined });
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'fallback_carousel',
                publicConfig: expect.objectContaining({
                    enabled: true,
                    activeSetId: expect.any(String),
                    sets: [
                        expect.objectContaining({
                            name: 'Market break',
                            cards: [
                                slideFallbackCard('slide-1', 30),
                                slideFallbackCard('slide-2', 45),
                            ],
                        }),
                    ],
                    cards: [slideFallbackCard('slide-1', 30), slideFallbackCard('slide-2', 45)],
                }),
            }),
        );
        expect(drizzleMock.onConflictDoUpdate).toHaveBeenCalled();
    });

    it('activates an existing set and copies its cards to the legacy active cards field', async () => {
        drizzleMock.setResult({
            data: {
                publicConfig: {
                    enabled: true,
                    activeSetId: 'set-1',
                    cards: [{ slideId: 'slide-1', durationSeconds: 30 }],
                    sets: [
                        {
                            id: 'set-1',
                            name: 'Primary',
                            cards: [{ slideId: 'slide-1', durationSeconds: 30 }],
                            createdAt: '2026-05-25T00:00:00.000Z',
                            updatedAt: '2026-05-25T00:00:00.000Z',
                        },
                        {
                            id: 'set-2',
                            name: 'Markets',
                            cards: [{ slideId: 'slide-2', durationSeconds: 20 }],
                            createdAt: '2026-05-25T00:00:00.000Z',
                            updatedAt: '2026-05-25T00:00:00.000Z',
                        },
                    ],
                },
                updatedAt: '2026-05-25T00:00:00.000Z',
            },
            error: null,
        });

        const result = await activateFallbackCarouselSet('set-2');

        expect(result).toEqual({ success: true, data: undefined });
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                publicConfig: expect.objectContaining({
                    activeSetId: 'set-2',
                    cards: [slideFallbackCard('slide-2', 20)],
                }),
            }),
        );
        expect(drizzleMock.onConflictDoUpdate).toHaveBeenCalled();
    });

    it('deletes the active set and promotes the next set', async () => {
        drizzleMock.setResult({
            data: {
                publicConfig: {
                    enabled: true,
                    activeSetId: 'set-1',
                    cards: [{ slideId: 'slide-1', durationSeconds: 30 }],
                    sets: [
                        {
                            id: 'set-1',
                            name: 'Primary',
                            cards: [{ slideId: 'slide-1', durationSeconds: 30 }],
                            createdAt: '2026-05-25T00:00:00.000Z',
                            updatedAt: '2026-05-25T00:00:00.000Z',
                        },
                        {
                            id: 'set-2',
                            name: 'Markets',
                            cards: [{ slideId: 'slide-2', durationSeconds: 20 }],
                            createdAt: '2026-05-25T00:00:00.000Z',
                            updatedAt: '2026-05-25T00:00:00.000Z',
                        },
                    ],
                },
                updatedAt: '2026-05-25T00:00:00.000Z',
            },
            error: null,
        });

        const result = await deleteFallbackCarouselSet('set-1');

        expect(result).toEqual({ success: true, data: undefined });
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                publicConfig: expect.objectContaining({
                    activeSetId: 'set-2',
                    cards: [slideFallbackCard('slide-2', 20)],
                }),
            }),
        );
        expect(drizzleMock.onConflictDoUpdate).toHaveBeenCalled();
    });
});

// ---------------------------------------------------------------------------
// createSlideAsset
// ---------------------------------------------------------------------------
describe('createSlideAsset', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('happy path: inserts slide_assets and revalidates /admin/slides', async () => {
        const result = await createSlideAsset({
            title: 'Weather Plate',
            slideType: 'template',
            templateId: 'weather',
            content: 'Weather plate',
            defaultDurationSeconds: 15,
            status: 'ready',
        });

        expect(result).toEqual({ success: true, data: undefined });
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Weather Plate',
                slideType: 'template',
                templateId: 'weather',
                content: 'Weather plate',
                defaultDurationSeconds: 15,
            }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/slides');
    });

    it('error path: returns err when DB insert fails', async () => {
        (drizzleMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
                Promise.reject(new Error('Slide insert failed')).then(resolve, reject),
        );

        const result = await createSlideAsset({ title: 'Bad Slide', slideType: 'template' });

        expect(result).toEqual({ success: false, error: 'Slide insert failed' });
    });

    it('accepts html slide types for special embeds', async () => {
        const result = await createSlideAsset({
            title: 'Embedded Slide',
            slideType: 'html',
            content: 'Embedded content',
        });

        expect(result).toEqual({ success: true, data: undefined });
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Embedded Slide',
                slideType: 'html',
                content: 'Embedded content',
            }),
        );
    });

    it('rejects unsupported slide types before inserting', async () => {
        const result = await createSlideAsset({ title: 'Bad Slide', slideType: 'bogus' });

        expect(result).toEqual({ success: false, error: 'Unsupported slide type' });
        expect(dbHandle.insert).not.toHaveBeenCalled();
    });
});

describe('youtube slide mutations', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('creates youtube slides as html slides with parsed metadata', async () => {
        const result = await createYouTubeSlide({
            title: 'Promo YouTube',
            url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
            zoom: '1.25',
            muted: true,
            loop: true,
            startSeconds: 12,
            defaultDurationSeconds: 45,
            status: 'ready',
        });

        expect(result).toEqual({ success: true, data: undefined });
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Promo YouTube',
                slideType: 'html',
                defaultDurationSeconds: 45,
                metadata: expect.objectContaining({
                    youtubeVideoId: 'dQw4w9WgXcQ',
                    youtubeZoom: 1.25,
                    youtubeMuted: true,
                    youtubeLoop: true,
                    youtubeStartSeconds: 12,
                }),
            }),
        );
    });

    it('rejects invalid youtube urls', async () => {
        const result = await createYouTubeSlide({
            title: 'Broken YouTube',
            url: 'https://example.com/not-youtube',
        });

        expect(result).toEqual({ success: false, error: 'YouTube URL is invalid' });
        expect(dbHandle.insert).not.toHaveBeenCalled();
    });
});

describe('weather plate mutations', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('creates weather plates with city coordinates in metadata', async () => {
        const result = await createWeatherPlate({
            title: 'Miami Weather',
            locationName: 'Miami',
            lat: 25.7617,
            lon: -80.1918,
            defaultDurationSeconds: 45,
            status: 'ready',
        });

        expect(result).toEqual({ success: true, data: undefined });
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Miami Weather',
                slideType: 'template',
                templateId: 'weather',
                defaultDurationSeconds: 45,
                metadata: {
                    weatherLocationName: 'Miami',
                    weatherLat: 25.7617,
                    weatherLon: -80.1918,
                },
            }),
        );
    });

    it('updates only weather template plates', async () => {
        const result = await updateWeatherPlate({
            slideId: 'slide-weather-1',
            title: 'Madrid Weather',
            locationName: 'Madrid',
            lat: 40.4168,
            lon: -3.7038,
            defaultDurationSeconds: 30,
            status: 'draft',
        });

        expect(result).toEqual({ success: true, data: undefined });
        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Madrid Weather',
                status: 'draft',
                metadata: {
                    weatherLocationName: 'Madrid',
                    weatherLat: 40.4168,
                    weatherLon: -3.7038,
                },
            }),
        );
    });

    it('rejects weather plates with missing city name', async () => {
        const result = await createWeatherPlate({
            title: 'Bad',
            locationName: '   ',
            lat: 10,
            lon: 20,
        });

        expect(result).toEqual({ success: false, error: 'City name is required' });
    });

    it('rejects weather plates with invalid latitude', async () => {
        const result = await updateWeatherPlate({
            slideId: 'slide-weather-1',
            title: 'Bad',
            locationName: 'Atlantis',
            lat: 999,
            lon: 0,
        });

        expect(result).toEqual({ success: false, error: 'Latitude is invalid' });
    });
});

// ---------------------------------------------------------------------------
// createScheduledLayer
// ---------------------------------------------------------------------------
describe('createScheduledLayer', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('happy path: inserts scheduled_layers with correct payload', async () => {
        const result = await createScheduledLayer({
            date: '2026-05-08',
            blockId: 'block-1',
            title: 'Logo',
            layerType: 'logo_bug',
            startTime: '10:05:00',
            durationSeconds: 1740,
            zIndex: 10,
            position: 'top_right',
        });

        expect(result).toEqual({ success: true, data: undefined });
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                programBlockId: 'block-1',
                title: 'Logo',
                layerType: 'logo_bug',
                startTimeSeconds: 36300,
                durationSeconds: 1740,
                zIndex: 10,
                position: 'top_right',
                enabled: true,
            }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08/blocks/block-1');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
    });

    it('error path: returns err when DB insert fails', async () => {
        (drizzleMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
                Promise.reject(new Error('Layer insert failed')).then(resolve, reject),
        );

        const result = await createScheduledLayer({
            date: '2026-05-08',
            blockId: 'block-1',
            title: 'Layer',
            layerType: 'overlay',
            startTime: '10:00:00',
            durationSeconds: 60,
            zIndex: 5,
            position: 'fullscreen',
        });

        expect(result).toEqual({ success: false, error: 'Layer insert failed' });
    });
});

// ---------------------------------------------------------------------------
// setScheduledLayerEnabled
// ---------------------------------------------------------------------------
describe('setScheduledLayerEnabled', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('happy path: enables a layer', async () => {
        const result = await setScheduledLayerEnabled({
            date: '2026-05-08',
            blockId: 'block-1',
            layerId: 'layer-1',
            enabled: true,
        });

        expect(result).toEqual({ success: true, data: undefined });
        expect(drizzleMock.set).toHaveBeenCalledWith(expect.objectContaining({ enabled: true }));
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08/blocks/block-1');
    });

    it('happy path: disables a layer', async () => {
        const result = await setScheduledLayerEnabled({
            date: '2026-05-08',
            blockId: 'block-1',
            layerId: 'layer-1',
            enabled: false,
        });

        expect(result).toEqual({ success: true, data: undefined });
        expect(drizzleMock.set).toHaveBeenCalledWith(expect.objectContaining({ enabled: false }));
    });

    it('error path: returns err when DB update fails', async () => {
        (drizzleMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
                Promise.reject(new Error('Layer update failed')).then(resolve, reject),
        );

        const result = await setScheduledLayerEnabled({
            date: '2026-05-08',
            blockId: 'b',
            layerId: 'l',
            enabled: true,
        });

        expect(result).toEqual({ success: false, error: 'Layer update failed' });
    });
});

// ---------------------------------------------------------------------------
// createMediaAsset
// ---------------------------------------------------------------------------
describe('createMediaAsset', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('happy path: inserts media_assets and revalidates /admin/assets', async () => {
        const result = await createMediaAsset({
            title: 'Broadcast Planner Intro',
            sourceType: 'public_url',
            playbackKind: 'embed',
            mediaKind: 'video',
            assetType: 'video',
            url: 'https://video.example/1234',
            durationSeconds: 120,
        });

        // ID is generated via crypto.randomUUID() before insert — match any uuid
        expect(result.success).toBe(true);
        expect(typeof (result as { success: true; data: string }).data).toBe('string');
        expect(drizzleMock.values).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Broadcast Planner Intro',
                sourceType: 'public_url',
                playbackKind: 'embed',
                mediaKind: 'video',
                assetType: 'video',
                durationSeconds: 120,
                status: 'ready',
            }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/assets');
    });

    it('validation: returns err for ad assets longer than 300s', async () => {
        const result = await createMediaAsset({
            title: 'Long Ad',
            sourceType: 'uploaded',
            playbackKind: 'video_file',
            mediaKind: 'video',
            assetType: 'ad',
            durationSeconds: 400,
        });

        expect(result).toEqual({ success: false, error: 'Ads cannot be longer than 300 seconds' });
    });

    it('error path: returns err when DB insert fails', async () => {
        drizzleMock.setResult({ data: null, error: new Error('Media insert failed') });

        const result = await createMediaAsset({
            title: 'Asset',
            sourceType: 'public_url',
            playbackKind: 'embed',
            mediaKind: 'video',
            assetType: 'video',
        });

        expect(result).toEqual({ success: false, error: 'Media insert failed' });
    });
});

// ---------------------------------------------------------------------------
// updateMediaAsset
// ---------------------------------------------------------------------------
describe('updateMediaAsset', () => {
    const baseInput = {
        id: 'asset-1',
        title: 'Updated Asset',
        sourceType: 'public_url',
        playbackKind: 'embed',
        mediaKind: 'video' as const,
        assetType: 'video' as const,
        status: 'ready',
        durationSeconds: 180,
    };

    beforeEach(async () => {
        await resetMocks();
        // First limit() call fetches current asset metadata
        drizzleMock.setResult({ data: { metadata: { orientation: 'horizontal' } }, error: null });
    });

    it('happy path: updates asset and derives orientation metadata', async () => {
        let limitCallCount = 0;
        (drizzleMock.limit as ReturnType<typeof vi.fn>).mockImplementation(() => {
            limitCallCount += 1;

            if (limitCallCount === 1) {
                return Promise.resolve([{ metadata: { orientation: 'horizontal' } }]);
            }

            return Promise.resolve([]);
        });

        const result = await updateMediaAsset({ ...baseInput, orientation: 'vertical' });

        expect(result).toEqual({ success: true, data: undefined });
        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Updated Asset',
                metadata: expect.objectContaining({
                    orientation: 'vertical',
                    presentation: 'vertical_blur',
                    background: 'blur',
                }),
            }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/assets');
    });

    it('happy path: revalidates additional paths when provided', async () => {
        (drizzleMock.limit as ReturnType<typeof vi.fn>).mockResolvedValue([{ metadata: {} }]);

        const result = await updateMediaAsset({
            ...baseInput,
            revalidatePaths: ['/admin/schedule/2026-05-08', '/admin/calendar'],
        });

        expect(result).toEqual({ success: true, data: undefined });
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/calendar');
    });

    it('happy path: marks one asset as the silent fallback loop', async () => {
        (drizzleMock.limit as ReturnType<typeof vi.fn>).mockResolvedValue([
            { metadata: { orientation: 'horizontal' } },
        ]);
        // The second awaited query (select all fallback_loop assets) resolves via .then
        let thenCallCount = 0;
        (drizzleMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: unknown) => void, reject: (reason: unknown) => void) => {
                thenCallCount += 1;

                if (thenCallCount === 2) {
                    return Promise.resolve([
                        { id: 'asset-1', metadata: { fallback_loop: true } },
                        { id: 'asset-2', metadata: { fallback_loop: true, note: 'old' } },
                    ]).then(resolve, reject);
                }

                return Promise.resolve(null).then(resolve, reject);
            },
        );

        const result = await updateMediaAsset({ ...baseInput, fallbackLoop: true });

        expect(result).toEqual({ success: true, data: undefined });
        expect(drizzleMock.set).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    fallback_loop: true,
                    fallback_muted: true,
                }),
            }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/output');
    });

    it('error path: returns err when id is missing', async () => {
        const result = await updateMediaAsset({ ...baseInput, id: '' });

        expect(result).toEqual({ success: false, error: 'Asset missing' });
    });

    it('error path: returns err for ad > 300s', async () => {
        const result = await updateMediaAsset({
            ...baseInput,
            assetType: 'ad',
            durationSeconds: 400,
        });

        expect(result).toEqual({ success: false, error: 'Ads cannot be longer than 300 seconds' });
    });

    it('error path: returns err when fetching current asset fails', async () => {
        (drizzleMock.limit as ReturnType<typeof vi.fn>).mockRejectedValue(
            new Error('Fetch asset failed'),
        );

        const result = await updateMediaAsset(baseInput);

        expect(result).toEqual({ success: false, error: 'Fetch asset failed' });
    });

    it('error path: returns err when update fails', async () => {
        (drizzleMock.limit as ReturnType<typeof vi.fn>).mockResolvedValue([{ metadata: {} }]);
        (drizzleMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: unknown) => void, reject: (reason: unknown) => void) =>
                Promise.reject(new Error('Update asset failed')).then(resolve, reject),
        );

        const result = await updateMediaAsset(baseInput);

        expect(result).toEqual({ success: false, error: 'Update asset failed' });
    });
});
