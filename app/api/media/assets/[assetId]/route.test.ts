import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createServiceClient } from '@/lib/supabase/server';

import { GET } from './route';

const ASSET_ID = '11111111-1111-4111-8111-111111111111';

vi.mock('@/lib/supabase/server', () => ({
    createServiceClient: vi.fn(),
}));

vi.mock('@/lib/auth', () => ({
    requireAdmin: vi.fn(async () => {
        throw new Error('Unauthorized');
    }),
}));

vi.mock('@/lib/output-auth', () => ({
    isOutputRequestAllowed: vi.fn(async () => true),
    outputAccessDeniedReason: vi.fn(() => 'Output capture token required'),
}));

vi.mock('@/lib/rate-limit', () => ({
    assertRateLimit: vi.fn(async () => undefined),
    rateLimitErrorResponse: vi.fn(() => ({ retryAfterSeconds: 60 })),
}));

describe('GET /api/media/assets/[assetId]', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
        vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://127.0.0.1:54321');
        vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'service-role');
        global.fetch = vi.fn();
    });

    it('returns 404 for a missing asset', async () => {
        vi.mocked(createServiceClient).mockReturnValue(mockSupabase(null));

        const response = await GET(
            new Request(`https://rtvtime.diegodella.ar/api/media/assets/${ASSET_ID}`),
            {
                params: Promise.resolve({ assetId: ASSET_ID }),
            },
        );

        expect(response.status).toBe(404);
    });

    it('returns 404 for an invalid asset id', async () => {
        const response = await GET(
            new Request('https://rtvtime.diegodella.ar/api/media/assets/not-a-uuid'),
            {
                params: Promise.resolve({ assetId: 'not-a-uuid' }),
            },
        );

        expect(response.status).toBe(404);
    });

    it('returns 404 for an asset without storage metadata', async () => {
        vi.mocked(createServiceClient).mockReturnValue(
            mockSupabase({
                id: ASSET_ID,
                status: 'ready',
                storage_bucket: null,
                storage_path: null,
            }),
        );

        const response = await GET(
            new Request(`https://rtvtime.diegodella.ar/api/media/assets/${ASSET_ID}`),
            {
                params: Promise.resolve({ assetId: ASSET_ID }),
            },
        );

        expect(response.status).toBe(404);
    });

    it('returns 404 for an asset outside the allowed upload bucket', async () => {
        vi.mocked(createServiceClient).mockReturnValue(
            mockSupabase({ ...readyAsset(), storage_bucket: 'private-assets' }),
        );

        const response = await GET(
            new Request(`https://rtvtime.diegodella.ar/api/media/assets/${ASSET_ID}`),
            {
                params: Promise.resolve({ assetId: ASSET_ID }),
            },
        );

        expect(response.status).toBe(404);
        expect(global.fetch).not.toHaveBeenCalled();
    });

    it('streams a full file response from local Supabase storage', async () => {
        vi.mocked(createServiceClient).mockReturnValue(mockSupabase(readyAsset()));
        vi.mocked(global.fetch).mockResolvedValue(
            new Response('video', {
                status: 200,
                headers: { 'content-type': 'video/mp4', 'content-length': '5' },
            }),
        );

        const response = await GET(
            new Request(`https://rtvtime.diegodella.ar/api/media/assets/${ASSET_ID}`),
            {
                params: Promise.resolve({ assetId: ASSET_ID }),
            },
        );

        expect(response.status).toBe(200);
        expect(response.headers.get('content-type')).toBe('video/mp4');
        expect(response.headers.get('accept-ranges')).toBe('bytes');
        expect(await response.text()).toBe('video');
    });

    it('forwards Range requests and returns partial content', async () => {
        vi.mocked(createServiceClient).mockReturnValue(mockSupabase(readyAsset()));
        vi.mocked(global.fetch).mockResolvedValue(
            new Response('vid', {
                status: 206,
                headers: {
                    'content-type': 'video/mp4',
                    'content-range': 'bytes 0-2/5',
                    'content-length': '3',
                    'accept-ranges': 'bytes',
                },
            }),
        );

        const request = mockMediaRequest('bytes=0-2');
        const headerGet = request.headers.get as unknown as ReturnType<typeof vi.fn>;
        expect(request.headers.get('range')).toBe('bytes=0-2');
        const response = await GET(request, {
            params: Promise.resolve({ assetId: ASSET_ID }),
        });

        expect(response.status).toBe(206);
        expect(response.headers.get('content-range')).toBe('bytes 0-2/5');
        expect(headerGet).toHaveBeenCalledWith('range');
        const headers = vi.mocked(global.fetch).mock.calls.at(-1)?.[1]?.headers as Record<
            string,
            string
        >;
        expect(headers.Range).toBe('bytes=0-2');
    });

    it('drops malformed Range requests before fetching storage', async () => {
        vi.mocked(createServiceClient).mockReturnValue(mockSupabase(readyAsset()));
        vi.mocked(global.fetch).mockResolvedValue(new Response('video', { status: 200 }));

        await GET(mockMediaRequest('items=0-2'), {
            params: Promise.resolve({ assetId: ASSET_ID }),
        });

        const headers = vi.mocked(global.fetch).mock.calls.at(-1)?.[1]?.headers as Record<
            string,
            string
        >;
        expect(headers.Range).toBeUndefined();
    });
});

function readyAsset() {
    return {
        id: ASSET_ID,
        status: 'ready',
        storage_bucket: 'small-media-assets',
        storage_path: '2026-05-20/ad spot.mp4',
        metadata: { mime_type: 'video/mp4' },
    };
}

function mockSupabase(asset: Record<string, unknown> | null) {
    return {
        from: () => ({
            select: () => ({
                eq: () => ({
                    single: async () => ({
                        data: asset,
                        error: asset ? null : new Error('not found'),
                    }),
                }),
            }),
        }),
    } as unknown as ReturnType<typeof createServiceClient>;
}

function mockMediaRequest(range: string) {
    return {
        url: `https://rtvtime.diegodella.ar/api/media/assets/${ASSET_ID}`,
        headers: {
            get: vi.fn((name: string) => (name.toLowerCase() === 'range' ? range : null)),
        },
    } as unknown as Request;
}
