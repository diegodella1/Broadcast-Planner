import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

const ASSET_ID = '11111111-1111-4111-8111-111111111111';

// ---------------------------------------------------------------------------
// Mock the new D1/R2 data layer
// ---------------------------------------------------------------------------
const mockBucketGet = vi.fn();

vi.mock('@/lib/db/client', () => ({
    getDb: vi.fn(async () => makeDbMock(null)),
}));

vi.mock('@/lib/storage/r2', () => ({
    getMediaBucket: vi.fn(async () => ({ get: mockBucketGet })),
}));

vi.mock('@/lib/auth/auth', () => ({
    requireAdmin: vi.fn(async () => {
        throw new Error('Unauthorized');
    }),
}));

vi.mock('@/lib/auth/output-auth', () => ({
    isOutputRequestAllowed: vi.fn(async () => true),
    outputAccessDeniedReason: vi.fn(() => 'Output capture token required'),
}));

vi.mock('@/lib/auth/rate-limit', () => ({
    assertRateLimit: vi.fn(async () => undefined),
    rateLimitErrorResponse: vi.fn(() => ({ retryAfterSeconds: 60 })),
}));

import { getDb } from '@/lib/db/client';
import { getMediaBucket } from '@/lib/storage/r2';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// Minimal Drizzle chain: .select().from().where().limit() → [asset] or []
function makeDbMock(asset: Record<string, unknown> | null) {
    return {
        select: (_fields?: unknown) => ({
            from: (_table: unknown) => ({
                where: (_cond: unknown) => ({
                    limit: async (_n: number) => (asset ? [asset] : []),
                }),
            }),
        }),
    };
}

function readyAsset() {
    return {
        id: ASSET_ID,
        status: 'ready',
        storageBucket: 'small-media-assets',
        storagePath: '2026-05-20/ad spot.mp4',
        metadata: { mime_type: 'video/mp4' },
    };
}

function mockMediaRequest(range: string) {
    return {
        url: `https://broadcast-planner.diegodella.ar/api/media/assets/${ASSET_ID}`,
        headers: {
            get: vi.fn((name: string) => (name.toLowerCase() === 'range' ? range : null)),
        },
    } as unknown as Request;
}

describe('GET /api/media/assets/[assetId]', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.mocked(getDb).mockResolvedValue(makeDbMock(null) as never);
        mockBucketGet.mockResolvedValue(null);
        vi.mocked(getMediaBucket).mockResolvedValue({ get: mockBucketGet } as never);
    });

    it('returns 404 for a missing asset', async () => {
        vi.mocked(getDb).mockResolvedValue(makeDbMock(null) as never);

        const response = await GET(
            new Request(`https://broadcast-planner.diegodella.ar/api/media/assets/${ASSET_ID}`),
            { params: Promise.resolve({ assetId: ASSET_ID }) },
        );

        expect(response.status).toBe(404);
    });

    it('returns 404 for an invalid asset id', async () => {
        const response = await GET(
            new Request('https://broadcast-planner.diegodella.ar/api/media/assets/not-a-uuid'),
            { params: Promise.resolve({ assetId: 'not-a-uuid' }) },
        );

        expect(response.status).toBe(404);
    });

    it('returns 404 for an asset without storage metadata', async () => {
        vi.mocked(getDb).mockResolvedValue(
            makeDbMock({
                id: ASSET_ID,
                status: 'ready',
                storageBucket: null,
                storagePath: null,
                metadata: null,
            }) as never,
        );

        const response = await GET(
            new Request(`https://broadcast-planner.diegodella.ar/api/media/assets/${ASSET_ID}`),
            { params: Promise.resolve({ assetId: ASSET_ID }) },
        );

        expect(response.status).toBe(404);
    });

    it('returns 404 for an asset outside the allowed upload bucket', async () => {
        vi.mocked(getDb).mockResolvedValue(
            makeDbMock({ ...readyAsset(), storageBucket: 'private-assets' }) as never,
        );

        const response = await GET(
            new Request(`https://broadcast-planner.diegodella.ar/api/media/assets/${ASSET_ID}`),
            { params: Promise.resolve({ assetId: ASSET_ID }) },
        );

        expect(response.status).toBe(404);
        expect(mockBucketGet).not.toHaveBeenCalled();
    });

    it('returns 404 when R2 object is not found', async () => {
        vi.mocked(getDb).mockResolvedValue(makeDbMock(readyAsset()) as never);
        mockBucketGet.mockResolvedValue(null);

        const response = await GET(
            new Request(`https://broadcast-planner.diegodella.ar/api/media/assets/${ASSET_ID}`),
            { params: Promise.resolve({ assetId: ASSET_ID }) },
        );

        expect(response.status).toBe(404);
    });

    it('streams a full file response from R2', async () => {
        vi.mocked(getDb).mockResolvedValue(makeDbMock(readyAsset()) as never);
        mockBucketGet.mockResolvedValue({
            body: new ReadableStream({
                start(c) {
                    c.enqueue(new TextEncoder().encode('video'));
                    c.close();
                },
            }),
            httpMetadata: { contentType: 'video/mp4' },
            httpEtag: '"abc123"',
            size: 5,
            range: undefined,
        });

        const response = await GET(
            new Request(`https://broadcast-planner.diegodella.ar/api/media/assets/${ASSET_ID}`),
            { params: Promise.resolve({ assetId: ASSET_ID }) },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('video/mp4');
        expect(response.headers.get('accept-ranges')).toBe('bytes');
        expect(await response.text()).toBe('video');
    });

    it('returns 206 with content-range for Range requests', async () => {
        vi.mocked(getDb).mockResolvedValue(makeDbMock(readyAsset()) as never);
        mockBucketGet.mockResolvedValue({
            body: new ReadableStream({
                start(c) {
                    c.enqueue(new TextEncoder().encode('vid'));
                    c.close();
                },
            }),
            httpMetadata: { contentType: 'video/mp4' },
            httpEtag: '"abc123"',
            size: 5,
            range: { offset: 0, length: 3 },
        });

        const request = mockMediaRequest('bytes=0-2');
        const headerGet = request.headers.get as unknown as ReturnType<typeof vi.fn>;
        expect(request.headers.get('range')).toBe('bytes=0-2');

        const response = await GET(request, {
            params: Promise.resolve({ assetId: ASSET_ID }),
        });

        expect(response.status).toBe(206);
        expect(response.headers.get('content-range')).toBe('bytes 0-2/5');
        expect(headerGet).toHaveBeenCalledWith('range');
        // R2 bucket.get was called with a range option
        const callArgs = mockBucketGet.mock.calls.at(-1);
        expect(callArgs?.[1]).toMatchObject({ range: { offset: 0, length: 3 } });
    });

    it('drops malformed Range requests before fetching R2', async () => {
        vi.mocked(getDb).mockResolvedValue(makeDbMock(readyAsset()) as never);
        mockBucketGet.mockResolvedValue({
            body: new ReadableStream({
                start(c) {
                    c.close();
                },
            }),
            httpMetadata: { contentType: 'video/mp4' },
            httpEtag: '"abc123"',
            size: 5,
            range: undefined,
        });

        await GET(mockMediaRequest('items=0-2'), {
            params: Promise.resolve({ assetId: ASSET_ID }),
        });

        // Malformed range → no range option forwarded to R2
        const callArgs = mockBucketGet.mock.calls.at(-1);
        expect(callArgs?.[1]).toBeUndefined();
    });
});
