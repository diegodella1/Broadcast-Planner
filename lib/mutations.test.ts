import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock next/cache before any module import that uses it
// ---------------------------------------------------------------------------
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Supabase builder mock
// Every method returns `this` so callers can chain arbitrarily.
// Terminal operations (.single / awaiting the builder) resolve with
// whatever `_result` was last set by the test via `setResult`.
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
        // All builder methods return `this` and are also awaitable (then/catch/finally)
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
        single: vi.fn().mockImplementation(function () {
            return Promise.resolve(_result);
        }),
        // Make the builder itself thenable so `await supabase.from(...).insert(...)` works
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

vi.mock('@/lib/schedule-builder', () => ({
    buildBulkCardLoop: vi.fn(() => fakeGeneratedCardBlocks),
    buildLongTestSchedule: vi.fn(() => fakeGeneratedBlocks),
}));

// ---------------------------------------------------------------------------
// Mock lib/schedule-health (analyzeSchedule)
// vi.hoisted ensures the fn is available when vi.mock factory is hoisted
// ---------------------------------------------------------------------------
import type { ScheduleHealth } from './schedule-health';

const { analyzeScheduleMock } = vi.hoisted(() => ({
    analyzeScheduleMock: vi.fn(),
}));

vi.mock('@/lib/schedule-health', () => ({
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
import { buildBulkCardLoop, buildLongTestSchedule } from '@/lib/schedule-builder';

import {
    ensureProgramDay,
    createProgramDayFromTemplate,
    createProgramBlock,
    fillProgramBlockContent,
    updateProgramDayStatus,
    updateProgramBlock,
    createBulkCardLoop,
    saveGlobalFallbackCarouselFromSlides,
    createLongTestSchedule,
    createWeatherPlate,
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

import type { GeneratedBlock } from './schedule-builder';
import type { ProgramBlock, ScheduleBundle } from './types';

// Typed references to the mocked functions for easy use in tests
const getScheduleForDateMock = vi.mocked(getScheduleForDate);
const buildBulkCardLoopMock = vi.mocked(buildBulkCardLoop);
const buildLongTestScheduleMock = vi.mocked(buildLongTestSchedule);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function resetMocks() {
    vi.clearAllMocks();
    supabaseMock.setResult({ data: null, error: null });
    // Re-wire the builder chainable methods after clearAllMocks
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
    (supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
        Promise.resolve(supabaseMock._result),
    );
    (supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
        (resolve: (value: MockResult) => void) =>
            Promise.resolve(supabaseMock._result).then(resolve),
    );
    // Re-wire module mocks
    getScheduleForDateMock.mockResolvedValue(mockSchedule);
    analyzeScheduleMock.mockReturnValue(healthClean);
    buildBulkCardLoopMock.mockReturnValue(fakeGeneratedCardBlocks);
    buildLongTestScheduleMock.mockReturnValue(fakeGeneratedBlocks);
}

// ---------------------------------------------------------------------------
// ensureProgramDay
// ---------------------------------------------------------------------------
describe('ensureProgramDay', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('happy path: upserts program_days and returns the id', async () => {
        supabaseMock.setResult({ data: { id: 'day-99' }, error: null });

        const result = await ensureProgramDay('2026-05-08');

        expect(result).toEqual({ success: true, data: 'day-99' });
        expect(supabaseMock.from).toHaveBeenCalledWith('program_days');
        expect(supabaseMock.upsert).toHaveBeenCalledWith(
            expect.objectContaining({ air_date: '2026-05-08', status: 'draft' }),
            { onConflict: 'air_date' },
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/calendar');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
    });

    it('error path: returns failure when supabase returns an error', async () => {
        supabaseMock.setResult({ data: null, error: new Error('DB down') });

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
        supabaseMock.setResult({ data: { id: 'day-1' }, error: null });
    });

    it('happy path: inserts draft placeholder blocks from a built-in template', async () => {
        await createProgramDayFromTemplate({
            date: '2026-05-08',
            templateId: 'short-test-day',
            startTime: '09:00:00',
        });

        const insertCall = (supabaseMock.insert as ReturnType<typeof vi.fn>).mock.calls.find(
            (call) => Array.isArray(call[0]),
        );
        expect(insertCall).toBeDefined();
        const inserted = insertCall![0] as Array<{
            program_day_id: string;
            status: string;
            asset_id: string | null;
            slide_id: string | null;
            start_time: string;
        }>;
        expect(inserted).toHaveLength(4);
        expect(inserted[0]).toEqual(
            expect.objectContaining({
                program_day_id: 'day-1',
                status: 'draft',
                asset_id: null,
                slide_id: null,
                start_time: '09:00:00',
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
                    sourceType: 'vimeo',
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

        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Long Video',
                asset_id: 'asset-video',
                slide_id: null,
                duration_seconds: 900,
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
                    sourceType: 'vimeo',
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

        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'archived' }),
        );
        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({
                start_time: '01:00:00',
                start_time_seconds: 3600,
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

        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ duration_seconds: 430 }),
        );
    });

    it('moves a block to exact seconds', async () => {
        await moveProgramBlock({
            date: '2026-05-08',
            blockId: 'block-3',
            startTimeSeconds: 7201,
        });

        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ start_time: '02:00:01', start_time_seconds: 7201 }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
    });

    it('auto-inserts when moving a block into another block', async () => {
        await moveProgramBlock({
            date: '2026-05-08',
            blockId: 'block-3',
            startTimeSeconds: 3600,
        });

        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'archived' }),
        );
        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ start_time: '01:00:00', start_time_seconds: 3600 }),
        );
        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ start_time: '01:05:00', start_time_seconds: 3900 }),
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

        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ start_time: '23:55:00', start_time_seconds: 86100 }),
        );
    });

    it('duplicates a block and shifts following blocks', async () => {
        await duplicateProgramBlock({ date: '2026-05-08', blockId: 'block-1' });

        expect(supabaseMock.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'A copy',
                start_time: '01:15:00',
                duration_seconds: 900,
                status: 'draft',
            }),
        );
        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ start_time_seconds: 5400 }),
        );
    });

    it('bulk updates selected block status', async () => {
        await bulkUpdateProgramBlockStatus({
            date: '2026-05-08',
            blockIds: ['block-1', 'block-3'],
            status: 'archived',
        });

        expect(supabaseMock.in).toHaveBeenCalledWith('id', ['block-1', 'block-3']);
        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'archived' }),
        );
    });
});

describe('operator runbook mutations', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('upserts a persisted per-day runbook check', async () => {
        await updateRunbookCheck({
            date: '2026-05-08',
            programDayId: 'day-1',
            section: 'preflight',
            itemKey: 'health-green',
            checked: true,
            notes: 'OK',
        });

        expect(supabaseMock.from).toHaveBeenCalledWith('operator_runbook_checks');
        expect(supabaseMock.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                program_day_id: 'day-1',
                section: 'preflight',
                item_key: 'health-green',
                checked: true,
                notes: 'OK',
            }),
            { onConflict: 'program_day_id,section,item_key' },
        );
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
        (supabaseMock.single as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({ data: { id: 'day-1' }, error: null })
            .mockResolvedValueOnce({
                data: { id: 'block-created', start_time_seconds: 36000 },
                error: null,
            });

        const result = await createProgramBlock({
            date: '2026-05-08',
            title: 'Mercados en Vivo',
            blockType: 'video',
            category: 'mercados',
            startTime: '10:00:00',
            durationSeconds: 1800,
            hideOverlays: false,
        });

        expect(supabaseMock.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Mercados en Vivo',
                block_type: 'video',
                category: 'mercados',
                start_time: '10:00:00',
                duration_seconds: 1800,
            }),
        );
        expect(supabaseMock.select).toHaveBeenCalledWith('id,start_time_seconds');
        expect(result).toEqual({
            success: true,
            data: { id: 'block-created', startTimeSeconds: 36000 },
        });
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
    });

    it('auto-inserts when a conflicting block exists', async () => {
        supabaseMock.setResult({ data: { id: 'day-1' }, error: null });
        // Existing block occupying 10:00 - 10:30
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

        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'archived' }),
        );
        expect(supabaseMock.insert).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Overlap Block', start_time: '10:15:00' }),
        );
        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ start_time: '10:25:00', start_time_seconds: 37500 }),
        );
    });

    it('allows exact short blocks over archived time ranges', async () => {
        supabaseMock.setResult({ data: { id: 'day-1' }, error: null });
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

        expect(supabaseMock.insert).toHaveBeenCalledWith(
            expect.objectContaining({ title: '57 second ad', duration_seconds: 57 }),
        );
    });

    it('archives conflicting blocks when replacement is explicit', async () => {
        supabaseMock.setResult({ data: { id: 'day-1' }, error: null });
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

        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'archived' }),
        );
        expect(supabaseMock.insert).toHaveBeenCalledWith(
            expect.objectContaining({ title: 'Replacement' }),
        );
    });

    it('error path: returns failure when supabase insert fails', async () => {
        // ensureProgramDay resolves via .single(); the program_blocks insert is
        // awaited directly on the builder (via .then) — so make single succeed
        // and then always return an error.
        (supabaseMock.single as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce({ data: { id: 'day-1' }, error: null })
            .mockResolvedValueOnce({ data: null, error: new Error('Insert failed') });

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
        supabaseMock.setResult({ data: { id: 'day-1' }, error: null });

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
        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'ready' }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/calendar');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
    });

    it('happy path: allows archiving without health check blocking', async () => {
        analyzeScheduleMock.mockReturnValue({ ...healthClean, criticalCount: 2, warnCount: 5 });

        await updateProgramDayStatus({ date: '2026-05-08', status: 'archived' });

        expect(supabaseMock.update).toHaveBeenCalledWith(
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

        expect(supabaseMock.update).toHaveBeenCalled();
    });

    it('error path: returns failure when day not found in schedule', async () => {
        getScheduleForDateMock.mockResolvedValue({ ...mockSchedule, day: null });

        const result = await updateProgramDayStatus({ date: '2026-05-08', status: 'draft' });

        expect(result).toEqual({ success: false, error: 'Dia no encontrado' });
    });

    it('error path: returns failure when supabase update fails', async () => {
        (supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: MockResult) => void) =>
                Promise.resolve({ data: null, error: new Error('Update error') }).then(resolve),
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

        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Updated Block',
                block_type: 'video',
                start_time: '10:00:00',
                duration_seconds: 1800,
            }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08/blocks/block-1');
    });

    it('includes category in payload when provided', async () => {
        await updateProgramBlock({ ...baseInput, category: 'broadcast' });

        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ category: 'broadcast' }),
        );
    });

    it('stores previously recorded bug metadata for video blocks', async () => {
        await updateProgramBlock({
            ...baseInput,
            previouslyRecordedEnabled: true,
            previouslyRecordedPosition: 'bottom_right',
        });

        expect(supabaseMock.update).toHaveBeenCalledWith(
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

        expect(supabaseMock.update).toHaveBeenCalledWith(
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

    it('error path: returns failure when supabase update fails', async () => {
        (supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: MockResult) => void) =>
                Promise.resolve({ data: null, error: new Error('Update block error') }).then(
                    resolve,
                ),
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
        supabaseMock.setResult({ data: { id: 'day-1' }, error: null });

        await createLongTestSchedule(baseInput);

        const insertCall = (supabaseMock.insert as ReturnType<typeof vi.fn>).mock.calls.find(
            (call) => Array.isArray(call[0]) && call[0][0]?.category === 'broadcast',
        );
        expect(insertCall).toBeDefined();
        const inserted = insertCall![0] as Array<{ category: string; program_day_id: string }>;
        expect(inserted.length).toBe(fakeGeneratedBlocks.length);
        inserted.forEach((row) => expect(row.category).toBe('broadcast'));
    });

    it('happy path: calls revalidatePath for schedule and calendar', async () => {
        supabaseMock.setResult({ data: { id: 'day-1' }, error: null });

        await createLongTestSchedule(baseInput);

        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/calendar');
    });

    it('happy path: deletes window blocks when replaceWindow=true', async () => {
        supabaseMock.setResult({ data: { id: 'day-1' }, error: null });

        await createLongTestSchedule({ ...baseInput, replaceWindow: true });

        expect(supabaseMock.delete).toHaveBeenCalled();
        expect(supabaseMock.gte).toHaveBeenCalledWith(
            'start_time_seconds',
            fakeGeneratedBlocks[0]!.startTimeSeconds,
        );
    });

    it('error path: returns failure when buildLongTestSchedule returns empty array', async () => {
        supabaseMock.setResult({ data: { id: 'day-1' }, error: null });
        buildLongTestScheduleMock.mockReturnValue([]);

        const result = await createLongTestSchedule(baseInput);

        expect(result.success).toBe(false);

        if (!result.success) {
            expect(result.error).toMatch(/No se pudo generar/);
        }
    });

    it('error path: returns failure when supabase insert fails', async () => {
        // ensureProgramDay resolves via .single(); the bulk insert is awaited
        // directly on the builder (via .then) — make single succeed, then fail.
        (supabaseMock.single as ReturnType<typeof vi.fn>).mockResolvedValue({
            data: { id: 'day-1' },
            error: null,
        });
        (supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: MockResult) => void) =>
                Promise.resolve({ data: null, error: new Error('Bulk insert failed') }).then(
                    resolve,
                ),
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
        supabaseMock.setResult({ data: { id: 'day-1' }, error: null });
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
        const insertCall = (supabaseMock.insert as ReturnType<typeof vi.fn>).mock.calls.find(
            (call) => Array.isArray(call[0]) && call[0][0]?.block_type === 'slide',
        );
        expect(insertCall).toBeDefined();
        const inserted = insertCall![0] as Array<{
            slide_id: string;
            block_type: string;
            duration_seconds: number;
            status: string;
        }>;
        expect(inserted.map((row) => row.slide_id)).toEqual(['slide-1', 'slide-2']);
        inserted.forEach((row) => {
            expect(row.block_type).toBe('slide');
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

        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ status: 'archived' }),
        );
        expect(supabaseMock.in).toHaveBeenCalledWith('id', ['block-1']);
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
        await saveGlobalFallbackCarouselFromSlides({
            cards: [
                { slideId: 'slide-1', durationSeconds: 12 },
                { slideId: 'slide-2', durationSeconds: 18 },
            ],
        });

        expect(supabaseMock.from).toHaveBeenCalledWith('integration_settings');
        expect(supabaseMock.upsert).toHaveBeenCalledWith(
            expect.objectContaining({
                provider: 'fallback_carousel',
                public_config: {
                    enabled: true,
                    cards: [
                        { slideId: 'slide-1', durationSeconds: 12 },
                        { slideId: 'slide-2', durationSeconds: 18 },
                    ],
                },
                status: 'connected',
            }),
            { onConflict: 'provider' },
        );
    });

    it('rejects empty fallback carousel cards', async () => {
        await expect(saveGlobalFallbackCarouselFromSlides({ cards: [] })).rejects.toThrow(
            'Selecciona al menos una card',
        );
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
            title: 'Breaking News',
            slideType: 'html',
            htmlContent: '<p>test</p>',
            defaultDurationSeconds: 15,
            status: 'ready',
        });

        expect(result).toEqual({ success: true, data: undefined });
        expect(supabaseMock.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Breaking News',
                slide_type: 'html',
                html_content: '<p>test</p>',
                default_duration_seconds: 15,
            }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/slides');
    });

    it('error path: returns err when supabase insert fails', async () => {
        (supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: MockResult) => void) =>
                Promise.resolve({ data: null, error: new Error('Slide insert failed') }).then(
                    resolve,
                ),
        );

        const result = await createSlideAsset({ title: 'Bad Slide', slideType: 'html' });

        expect(result).toEqual({ success: false, error: 'Slide insert failed' });
    });
});

describe('weather plate mutations', () => {
    beforeEach(async () => {
        await resetMocks();
    });

    it('creates weather plates with city coordinates in metadata', async () => {
        await createWeatherPlate({
            title: 'Miami Weather',
            locationName: 'Miami',
            lat: 25.7617,
            lon: -80.1918,
            defaultDurationSeconds: 45,
            status: 'ready',
        });

        expect(supabaseMock.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Miami Weather',
                slide_type: 'template',
                template_id: 'weather',
                default_duration_seconds: 45,
                metadata: {
                    weatherLocationName: 'Miami',
                    weatherLat: 25.7617,
                    weatherLon: -80.1918,
                },
            }),
        );
    });

    it('updates only weather template plates', async () => {
        await updateWeatherPlate({
            slideId: 'slide-weather-1',
            title: 'Madrid Weather',
            locationName: 'Madrid',
            lat: 40.4168,
            lon: -3.7038,
            defaultDurationSeconds: 30,
            status: 'draft',
        });

        expect(supabaseMock.update).toHaveBeenCalledWith(
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
        expect(supabaseMock.eq).toHaveBeenCalledWith('template_id', 'weather');
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
        await createScheduledLayer({
            date: '2026-05-08',
            blockId: 'block-1',
            title: 'Logo',
            layerType: 'logo_bug',
            startTime: '10:05:00',
            durationSeconds: 1740,
            zIndex: 10,
            position: 'top_right',
        });

        expect(supabaseMock.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                program_block_id: 'block-1',
                title: 'Logo',
                layer_type: 'logo_bug',
                start_time_seconds: 36300,
                duration_seconds: 1740,
                z_index: 10,
                position: 'top_right',
                enabled: true,
            }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08/blocks/block-1');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
    });

    it('error path: throws when supabase insert fails', async () => {
        (supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: MockResult) => void) =>
                Promise.resolve({ data: null, error: new Error('Layer insert failed') }).then(
                    resolve,
                ),
        );

        await expect(
            createScheduledLayer({
                date: '2026-05-08',
                blockId: 'block-1',
                title: 'Layer',
                layerType: 'overlay',
                startTime: '10:00:00',
                durationSeconds: 60,
                zIndex: 5,
                position: 'fullscreen',
            }),
        ).rejects.toThrow('Layer insert failed');
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
        await setScheduledLayerEnabled({
            date: '2026-05-08',
            blockId: 'block-1',
            layerId: 'layer-1',
            enabled: true,
        });

        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ enabled: true }),
        );
        expect(supabaseMock.eq).toHaveBeenCalledWith('id', 'layer-1');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08/blocks/block-1');
    });

    it('happy path: disables a layer', async () => {
        await setScheduledLayerEnabled({
            date: '2026-05-08',
            blockId: 'block-1',
            layerId: 'layer-1',
            enabled: false,
        });

        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({ enabled: false }),
        );
    });

    it('error path: throws when supabase update fails', async () => {
        (supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: MockResult) => void) =>
                Promise.resolve({ data: null, error: new Error('Layer update failed') }).then(
                    resolve,
                ),
        );

        await expect(
            setScheduledLayerEnabled({
                date: '2026-05-08',
                blockId: 'b',
                layerId: 'l',
                enabled: true,
            }),
        ).rejects.toThrow('Layer update failed');
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
        supabaseMock.setResult({ data: { id: 'asset-1' }, error: null });

        const result = await createMediaAsset({
            title: 'Roxom Intro',
            sourceType: 'vimeo',
            mediaKind: 'video',
            assetType: 'video',
            url: 'https://vimeo.com/1234',
            durationSeconds: 120,
        });

        expect(result).toEqual({ success: true, data: 'asset-1' });
        expect(supabaseMock.insert).toHaveBeenCalledWith(
            expect.objectContaining({
                title: 'Roxom Intro',
                source_type: 'vimeo',
                media_kind: 'video',
                asset_type: 'video',
                duration_seconds: 120,
                status: 'ready',
            }),
        );
        expect(revalidatePath).toHaveBeenCalledWith('/admin/assets');
    });

    it('validation: returns err for ad assets longer than 300s', async () => {
        const result = await createMediaAsset({
            title: 'Long Ad',
            sourceType: 'remote_mp4',
            mediaKind: 'video',
            assetType: 'ad',
            durationSeconds: 400,
        });

        expect(result).toEqual({ success: false, error: 'Ads cannot be longer than 300 seconds' });
    });

    it('error path: returns err when supabase insert fails', async () => {
        supabaseMock.setResult({ data: null, error: new Error('Media insert failed') });

        const result = await createMediaAsset({
            title: 'Asset',
            sourceType: 'vimeo',
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
        sourceType: 'vimeo',
        mediaKind: 'video' as const,
        assetType: 'video' as const,
        status: 'ready',
        durationSeconds: 180,
    };

    beforeEach(async () => {
        await resetMocks();
        // The first supabase call fetches current metadata via .select().eq().single()
        supabaseMock.setResult({ data: { metadata: { orientation: 'horizontal' } }, error: null });
    });

    it('happy path: updates asset and derives orientation metadata', async () => {
        // First single() call returns current asset; subsequent await (update) resolves cleanly
        let singleCallCount = 0;
        (supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
            singleCallCount += 1;

            if (singleCallCount === 1) {
                return Promise.resolve({
                    data: { metadata: { orientation: 'horizontal' } },
                    error: null,
                });
            }

            return Promise.resolve({ data: null, error: null });
        });
        (supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: MockResult) => void) =>
                Promise.resolve({ data: null, error: null }).then(resolve),
        );

        const result = await updateMediaAsset({ ...baseInput, orientation: 'vertical' });

        expect(result).toEqual({ success: true, data: undefined });
        expect(supabaseMock.update).toHaveBeenCalledWith(
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
        let singleCallCount = 0;
        (supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() => {
            singleCallCount += 1;

            if (singleCallCount === 1) {
                return Promise.resolve({ data: { metadata: {} }, error: null });
            }

            return Promise.resolve({ data: null, error: null });
        });
        (supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: MockResult) => void) =>
                Promise.resolve({ data: null, error: null }).then(resolve),
        );

        const result = await updateMediaAsset({
            ...baseInput,
            revalidatePaths: ['/admin/schedule/2026-05-08', '/admin/calendar'],
        });

        expect(result).toEqual({ success: true, data: undefined });
        expect(revalidatePath).toHaveBeenCalledWith('/admin/schedule/2026-05-08');
        expect(revalidatePath).toHaveBeenCalledWith('/admin/calendar');
    });

    it('happy path: marks one asset as the silent fallback loop', async () => {
        (supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
            Promise.resolve({ data: { metadata: { orientation: 'horizontal' } }, error: null }),
        );
        let thenCallCount = 0;
        (supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: MockResult) => void) => {
                thenCallCount += 1;

                if (thenCallCount === 2) {
                    return Promise.resolve({
                        data: [
                            { id: 'asset-1', metadata: { fallback_loop: true } },
                            { id: 'asset-2', metadata: { fallback_loop: true, note: 'old' } },
                        ],
                        error: null,
                    }).then(resolve);
                }

                return Promise.resolve({ data: null, error: null }).then(resolve);
            },
        );

        const result = await updateMediaAsset({ ...baseInput, fallbackLoop: true });

        expect(result).toEqual({ success: true, data: undefined });
        expect(supabaseMock.update).toHaveBeenCalledWith(
            expect.objectContaining({
                metadata: expect.objectContaining({
                    fallback_loop: true,
                    fallback_muted: true,
                }),
            }),
        );
        expect(supabaseMock.select).toHaveBeenCalledWith('id,metadata');
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
        (supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
            Promise.resolve({ data: null, error: new Error('Fetch asset failed') }),
        );

        const result = await updateMediaAsset(baseInput);

        expect(result).toEqual({ success: false, error: 'Fetch asset failed' });
    });

    it('error path: returns err when update fails', async () => {
        (supabaseMock.single as ReturnType<typeof vi.fn>).mockImplementation(() =>
            Promise.resolve({ data: { metadata: {} }, error: null }),
        );
        (supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
            (resolve: (value: MockResult) => void) =>
                Promise.resolve({ data: null, error: new Error('Update asset failed') }).then(
                    resolve,
                ),
        );

        const result = await updateMediaAsset(baseInput);

        expect(result).toEqual({ success: false, error: 'Update asset failed' });
    });
});
