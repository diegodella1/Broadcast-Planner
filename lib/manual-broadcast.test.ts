import { beforeEach, describe, expect, it, vi } from 'vitest';

// ---------------------------------------------------------------------------
// Mock next/cache before any module import that uses it
// ---------------------------------------------------------------------------
vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/settings
// ---------------------------------------------------------------------------
vi.mock('@/lib/settings', () => ({
    getVimeoToken: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/vimeo
// ---------------------------------------------------------------------------
vi.mock('@/lib/vimeo', () => ({
    searchVimeoAccountVideos: vi.fn(),
    getVimeoVideo: vi.fn(),
    upsertVimeoVideos: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/data
// ---------------------------------------------------------------------------
vi.mock('@/lib/data', () => ({
    getMediaAssetByVimeoUri: vi.fn(),
    getMediaAssetById: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock @/lib/mutations/blocks (createProgramBlock lives in blocks module after
// the Phase 3.1 migration). The manual-broadcast functions live in
// @/lib/mutations/output and import createProgramBlock directly from blocks.
// ---------------------------------------------------------------------------
vi.mock('@/lib/mutations/blocks', () => ({
    createProgramBlock: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Supabase builder mock — mirrors mutations.test.ts pattern.
// fetchInsertedBlockId and logManualBroadcast both call createServiceClient.
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
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockImplementation(function () {
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
// Static imports — after all vi.mock calls
// ---------------------------------------------------------------------------
import { revalidatePath } from 'next/cache';

import { getMediaAssetByVimeoUri, getMediaAssetById } from './data';
import {
    goLiveWithReuters,
    goLiveWithVimeo,
    scheduleReutersBlock,
    scheduleVimeoBlock,
    searchVimeoCatalog,
} from './manual-broadcast';
import { createProgramBlock } from './mutations/blocks';
import { getVimeoToken } from './settings';
import { searchVimeoAccountVideos, getVimeoVideo, upsertVimeoVideos } from './vimeo';

import type { MediaAsset } from './types';
import type { VimeoVideo } from './vimeo';

// ---------------------------------------------------------------------------
// Shared fixture builders
// ---------------------------------------------------------------------------
function makeAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
    return {
        id: 'asset-1',
        title: 'Test Video',
        sourceType: 'vimeo',
        mediaKind: 'video',
        assetType: 'video',
        durationSeconds: 600,
        status: 'ready',
        createdAt: '2026-01-01T00:00:00Z',
        updatedAt: '2026-01-01T00:00:00Z',
        ...overrides,
    };
}

function makeVimeoVideo(overrides: Partial<VimeoVideo> = {}): VimeoVideo {
    return {
        uri: '/videos/123',
        name: 'Test Video',
        link: 'https://vimeo.com/123',
        duration: 600,
        ...overrides,
    };
}

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
    (supabaseMock.order as ReturnType<typeof vi.fn>).mockReturnThis();
    (supabaseMock.limit as ReturnType<typeof vi.fn>).mockReturnThis();
    (supabaseMock.maybeSingle as ReturnType<typeof vi.fn>).mockImplementation(() =>
        Promise.resolve(supabaseMock._result),
    );
    (supabaseMock.then as ReturnType<typeof vi.fn>).mockImplementation(
        (resolve: (value: MockResult) => void) =>
            Promise.resolve(supabaseMock._result).then(resolve),
    );
}

// ---------------------------------------------------------------------------
// searchVimeoCatalog
// ---------------------------------------------------------------------------
describe('searchVimeoCatalog', () => {
    beforeEach(resetMocks);

    it('returns err when no token is configured', async () => {
        vi.mocked(getVimeoToken).mockResolvedValue(null);
        const result = await searchVimeoCatalog('test');

        expect(result.success).toBe(false);
        expect(result.success ? '' : result.error).toMatch(/no token/i);
    });

    it('returns search results when token is present', async () => {
        vi.mocked(getVimeoToken).mockResolvedValue('fake-token');
        const videos = [makeVimeoVideo()];
        vi.mocked(searchVimeoAccountVideos).mockResolvedValue(videos);

        const result = await searchVimeoCatalog('test');

        expect(result.success).toBe(true);

        if (result.success) {
            expect(result.data).toHaveLength(1);
            expect(result.data[0]!.uri).toBe('/videos/123');
        }
        expect(searchVimeoAccountVideos).toHaveBeenCalledWith('fake-token', 'test');
    });

    it('captures errors from searchVimeoAccountVideos as err', async () => {
        vi.mocked(getVimeoToken).mockResolvedValue('fake-token');
        vi.mocked(searchVimeoAccountVideos).mockRejectedValue(new Error('Vimeo returned 401'));

        const result = await searchVimeoCatalog('query');

        expect(result.success).toBe(false);
        expect(result.success ? '' : result.error).toBe('Vimeo returned 401');
    });
});

// ---------------------------------------------------------------------------
// goLiveWithVimeo
// ---------------------------------------------------------------------------
describe('goLiveWithVimeo', () => {
    beforeEach(resetMocks);

    it('returns err when no token is configured', async () => {
        vi.mocked(getVimeoToken).mockResolvedValue(null);
        const result = await goLiveWithVimeo({ vimeoUri: '/videos/123' });

        expect(result.success).toBe(false);
        expect(result.success ? '' : result.error).toMatch(/no token/i);
    });

    it('creates a ProgramBlock with category broadcast using the asset duration', async () => {
        vi.mocked(getVimeoToken).mockResolvedValue('fake-token');
        vi.mocked(getMediaAssetByVimeoUri).mockResolvedValue({ id: 'asset-1' } as MediaAsset);
        vi.mocked(getMediaAssetById).mockResolvedValue(makeAsset({ durationSeconds: 600 }));
        vi.mocked(createProgramBlock).mockResolvedValue({
            success: true,
            data: { id: 'block-created', startTimeSeconds: 0 },
        });
        // fetchInsertedBlockId: program_days query returns null, so programBlockId falls back to ""
        supabaseMock.setResult({ data: null, error: null });

        const result = await goLiveWithVimeo({ vimeoUri: '/videos/123' });

        expect(createProgramBlock).toHaveBeenCalledWith(
            expect.objectContaining({
                category: 'broadcast',
                blockType: 'video',
                durationSeconds: 600,
                assetId: 'asset-1',
                title: 'Test Video',
            }),
        );
        expect(result).toEqual({ success: true, data: { programBlockId: '' } });
    });

    it('uses asset durationSeconds for the ProgramBlock duration', async () => {
        vi.mocked(getVimeoToken).mockResolvedValue('fake-token');
        vi.mocked(getMediaAssetByVimeoUri).mockResolvedValue({ id: 'asset-2' } as MediaAsset);
        vi.mocked(getMediaAssetById).mockResolvedValue(makeAsset({ durationSeconds: 3600 }));
        vi.mocked(createProgramBlock).mockResolvedValue({
            success: true,
            data: { id: 'block-created', startTimeSeconds: 0 },
        });
        supabaseMock.setResult({ data: null, error: null });

        await goLiveWithVimeo({ vimeoUri: '/videos/999' });

        expect(createProgramBlock).toHaveBeenCalledWith(
            expect.objectContaining({ durationSeconds: 3600 }),
        );
    });

    it('falls back to 1800s default when asset durationSeconds is null', async () => {
        vi.mocked(getVimeoToken).mockResolvedValue('fake-token');
        vi.mocked(getMediaAssetByVimeoUri).mockResolvedValue({ id: 'asset-3' } as MediaAsset);
        vi.mocked(getMediaAssetById).mockResolvedValue(makeAsset({ durationSeconds: null }));
        vi.mocked(createProgramBlock).mockResolvedValue({
            success: true,
            data: { id: 'block-created', startTimeSeconds: 0 },
        });
        supabaseMock.setResult({ data: null, error: null });

        await goLiveWithVimeo({ vimeoUri: '/videos/999' });

        expect(createProgramBlock).toHaveBeenCalledWith(
            expect.objectContaining({ durationSeconds: 1800 }),
        );
    });

    it('caches the Vimeo asset when not already present', async () => {
        vi.mocked(getVimeoToken).mockResolvedValue('fake-token');
        // First call: not cached; second call (after upsert): returns inserted row
        vi.mocked(getMediaAssetByVimeoUri)
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({ id: 'asset-new' } as MediaAsset);
        vi.mocked(getVimeoVideo).mockResolvedValue(makeVimeoVideo());
        vi.mocked(upsertVimeoVideos).mockResolvedValue(undefined);
        vi.mocked(getMediaAssetById).mockResolvedValue(makeAsset({ id: 'asset-new' }));
        vi.mocked(createProgramBlock).mockResolvedValue({
            success: true,
            data: { id: 'block-created', startTimeSeconds: 0 },
        });
        supabaseMock.setResult({ data: null, error: null });

        await goLiveWithVimeo({ vimeoUri: '/videos/123' });

        expect(getVimeoVideo).toHaveBeenCalledWith('fake-token', '/videos/123');
        expect(upsertVimeoVideos).toHaveBeenCalled();
        expect(createProgramBlock).toHaveBeenCalledWith(
            expect.objectContaining({ assetId: 'asset-new' }),
        );
    });

    it('calls revalidatePath for the output and schedule routes', async () => {
        vi.mocked(getVimeoToken).mockResolvedValue('fake-token');
        vi.mocked(getMediaAssetByVimeoUri).mockResolvedValue({ id: 'asset-1' } as MediaAsset);
        vi.mocked(getMediaAssetById).mockResolvedValue(makeAsset());
        vi.mocked(createProgramBlock).mockResolvedValue({
            success: true,
            data: { id: 'block-created', startTimeSeconds: 0 },
        });
        supabaseMock.setResult({ data: null, error: null });

        await goLiveWithVimeo({ vimeoUri: '/videos/123' });

        expect(revalidatePath).toHaveBeenCalledWith('/admin/output');
        expect(
            vi.mocked(revalidatePath).mock.calls.some((c) => c[0].startsWith('/admin/schedule/')),
        ).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// scheduleVimeoBlock
// ---------------------------------------------------------------------------
describe('scheduleVimeoBlock', () => {
    beforeEach(resetMocks);

    it('returns err when no token is configured', async () => {
        vi.mocked(getVimeoToken).mockResolvedValue(null);
        const result = await scheduleVimeoBlock({ vimeoUri: '/videos/123', startAt: '14:30' });

        expect(result.success).toBe(false);
        expect(result.success ? '' : result.error).toMatch(/no token/i);
    });

    it('parses HH:MM startAt to correct startTimeSeconds in ProgramBlock', async () => {
        vi.mocked(getVimeoToken).mockResolvedValue('fake-token');
        vi.mocked(getMediaAssetByVimeoUri).mockResolvedValue({ id: 'asset-1' } as MediaAsset);
        vi.mocked(getMediaAssetById).mockResolvedValue(makeAsset());
        vi.mocked(createProgramBlock).mockResolvedValue({
            success: true,
            data: { id: 'block-created', startTimeSeconds: 0 },
        });
        supabaseMock.setResult({ data: null, error: null });

        await scheduleVimeoBlock({ vimeoUri: '/videos/123', startAt: '14:30' });

        // The createProgramBlock receives startTime "14:30:00" (normalised)
        expect(createProgramBlock).toHaveBeenCalledWith(
            expect.objectContaining({ startTime: '14:30:00' }),
        );
    });

    it('uses the provided airDate', async () => {
        vi.mocked(getVimeoToken).mockResolvedValue('fake-token');
        vi.mocked(getMediaAssetByVimeoUri).mockResolvedValue({ id: 'asset-1' } as MediaAsset);
        vi.mocked(getMediaAssetById).mockResolvedValue(makeAsset());
        vi.mocked(createProgramBlock).mockResolvedValue({
            success: true,
            data: { id: 'block-created', startTimeSeconds: 0 },
        });
        supabaseMock.setResult({ data: null, error: null });

        await scheduleVimeoBlock({
            vimeoUri: '/videos/123',
            startAt: '09:00',
            airDate: '2026-05-20',
        });

        expect(createProgramBlock).toHaveBeenCalledWith(
            expect.objectContaining({ date: '2026-05-20' }),
        );
    });

    it('defaults airDate to today in TZ when not supplied', async () => {
        vi.mocked(getVimeoToken).mockResolvedValue('fake-token');
        vi.mocked(getMediaAssetByVimeoUri).mockResolvedValue({ id: 'asset-1' } as MediaAsset);
        vi.mocked(getMediaAssetById).mockResolvedValue(makeAsset());
        vi.mocked(createProgramBlock).mockResolvedValue({
            success: true,
            data: { id: 'block-created', startTimeSeconds: 0 },
        });
        supabaseMock.setResult({ data: null, error: null });

        // Freeze time to a known instant so the derived date is predictable
        const fakeNow = new Date('2026-05-08T12:00:00Z');
        vi.setSystemTime(fakeNow);

        await scheduleVimeoBlock({ vimeoUri: '/videos/123', startAt: '08:00' });

        vi.useRealTimers();

        const [call] = vi.mocked(createProgramBlock).mock.calls;
        // The date must be a valid ISO date string (YYYY-MM-DD) — exact value
        // depends on the TZ offset for America/Argentina/Buenos_Aires (-3h)
        expect(call?.[0].date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });
});

// ---------------------------------------------------------------------------
// goLiveWithReuters
// ---------------------------------------------------------------------------
describe('goLiveWithReuters', () => {
    beforeEach(resetMocks);

    function makeReutersAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
        return makeAsset({
            id: '11111111-1111-1111-1111-111111111111',
            sourceType: 'reuters',
            durationSeconds: null,
            title: 'Reuters Top News HD',
            ...overrides,
        });
    }

    it('returns err when the asset id does not resolve to a media asset', async () => {
        vi.mocked(getMediaAssetById).mockResolvedValue(null);
        const result = await goLiveWithReuters({
            assetId: '11111111-1111-1111-1111-111111111111',
        });

        expect(result.success).toBe(false);
        expect(result.success ? '' : result.error).toMatch(/reuters asset not found/i);
    });

    it('returns err when the asset is not a reuters source', async () => {
        vi.mocked(getMediaAssetById).mockResolvedValue(makeAsset({ sourceType: 'vimeo' }));
        const result = await goLiveWithReuters({
            assetId: '11111111-1111-1111-1111-111111111111',
        });

        expect(result.success).toBe(false);
        expect(result.success ? '' : result.error).toMatch(/not a reuters channel/i);
    });

    it('creates a ProgramBlock with category=reuters and 1800s default for live channels', async () => {
        vi.mocked(getMediaAssetById).mockResolvedValue(makeReutersAsset());
        vi.mocked(createProgramBlock).mockResolvedValue({
            success: true,
            data: { id: 'block-created', startTimeSeconds: 0 },
        });
        supabaseMock.setResult({ data: null, error: null });

        await goLiveWithReuters({ assetId: '11111111-1111-1111-1111-111111111111' });

        expect(createProgramBlock).toHaveBeenCalledWith(
            expect.objectContaining({
                category: 'reuters',
                blockType: 'video',
                durationSeconds: 1800,
                assetId: '11111111-1111-1111-1111-111111111111',
                title: 'Reuters Top News HD',
            }),
        );
    });

    it('calls revalidatePath for /admin/output and /admin/schedule/<date>', async () => {
        vi.mocked(getMediaAssetById).mockResolvedValue(makeReutersAsset());
        vi.mocked(createProgramBlock).mockResolvedValue({
            success: true,
            data: { id: 'block-created', startTimeSeconds: 0 },
        });
        supabaseMock.setResult({ data: null, error: null });

        await goLiveWithReuters({ assetId: '11111111-1111-1111-1111-111111111111' });

        expect(revalidatePath).toHaveBeenCalledWith('/admin/output');
        expect(
            vi.mocked(revalidatePath).mock.calls.some((c) => c[0].startsWith('/admin/schedule/')),
        ).toBe(true);
    });
});

// ---------------------------------------------------------------------------
// scheduleReutersBlock
// ---------------------------------------------------------------------------
describe('scheduleReutersBlock', () => {
    beforeEach(resetMocks);

    function makeReutersAsset(overrides: Partial<MediaAsset> = {}): MediaAsset {
        return makeAsset({
            id: '22222222-2222-2222-2222-222222222222',
            sourceType: 'reuters',
            durationSeconds: null,
            title: 'Reuters Markets HD',
            ...overrides,
        });
    }

    it('normalizes HH:MM startAt to HH:MM:SS in the ProgramBlock', async () => {
        vi.mocked(getMediaAssetById).mockResolvedValue(makeReutersAsset());
        vi.mocked(createProgramBlock).mockResolvedValue({
            success: true,
            data: { id: 'block-created', startTimeSeconds: 0 },
        });
        supabaseMock.setResult({ data: null, error: null });

        await scheduleReutersBlock({
            assetId: '22222222-2222-2222-2222-222222222222',
            startAt: '09:30',
            durationSeconds: 1800,
        });

        expect(createProgramBlock).toHaveBeenCalledWith(
            expect.objectContaining({ startTime: '09:30:00', category: 'reuters' }),
        );
    });

    it('uses the supplied airDate', async () => {
        vi.mocked(getMediaAssetById).mockResolvedValue(makeReutersAsset());
        vi.mocked(createProgramBlock).mockResolvedValue({
            success: true,
            data: { id: 'block-created', startTimeSeconds: 0 },
        });
        supabaseMock.setResult({ data: null, error: null });

        await scheduleReutersBlock({
            assetId: '22222222-2222-2222-2222-222222222222',
            startAt: '08:00',
            airDate: '2026-06-15',
            durationSeconds: 3600,
        });

        expect(createProgramBlock).toHaveBeenCalledWith(
            expect.objectContaining({
                date: '2026-06-15',
                durationSeconds: 3600,
                category: 'reuters',
            }),
        );
    });
});
