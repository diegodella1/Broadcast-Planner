import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

import { createServiceClient } from '@/lib/supabase/server';

vi.mock('@/lib/settings', () => ({
    getVimeoSettings: vi.fn(async () => ({ status: 'ready', hasSecret: true })),
    getVimeoToken: vi.fn(async () => 'vimeo-token'),
}));

vi.mock('@/lib/supabase/server', () => ({
    createServiceClient: vi.fn(),
}));

vi.mock('@/lib/reuters-credentials', () => ({
    getReutersSettings: vi.fn(async () => ({ hasSecret: true })),
}));

vi.mock('@/lib/data', () => ({
    getLiveSchedule: vi.fn(async () => ({
        day: { id: 'day-1', airDate: '2026-05-18', status: 'active' },
        blocks: [],
        layers: [],
        mediaAssets: [],
        slideAssets: [],
    })),
}));

vi.mock('@/lib/output-overrides', () => ({
    getActiveOutputOverride: vi.fn(async () => null),
}));

const originalEnv = { ...process.env };

describe('GET /api/health', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        process.env = { ...originalEnv };
        process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.supabase.co';
        process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role';
        process.env.APP_ENCRYPTION_KEY = 'encryption-key';
        process.env.ADMIN_BOOTSTRAP_TOKEN = 'admin-token';
        process.env.OUTPUT_CAPTURE_TOKEN = 'output-token';
        delete process.env.ALLOW_DEMO_DATA;
        vi.mocked(createServiceClient).mockReturnValue(
            mockSupabase({ schemaError: null, storageError: null }),
        );
    });

    it('fails when required storage buckets cannot be verified', async () => {
        vi.mocked(createServiceClient).mockReturnValue(
            mockSupabase({ schemaError: null, storageError: new Error('storage unavailable') }),
        );

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(503);
        expect(payload.ok).toBe(false);
        expect(payload.checks.storage.status).toBe('fail');
        expect(payload.checks.storage.message).toBe('Check failed');
    });

    it('fails when demo data is enabled for a production-like origin', async () => {
        process.env.ALLOW_DEMO_DATA = 'true';
        process.env.APP_BASE_URL = 'https://rtvtime.diegodella.ar';

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(503);
        expect(payload.ok).toBe(false);
        expect(payload.checks.env.message).toBe('Check failed');
    });

    it('reports degraded schema when Vimeo readiness columns are missing', async () => {
        vi.mocked(createServiceClient).mockReturnValue(
            mockSupabase({
                schemaError: {
                    code: '42703',
                    message: 'column media_assets.playback_readiness_status does not exist',
                },
                storageError: null,
            }),
        );

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.ok).toBe(true);
        expect(payload.status).toBe('degraded');
        expect(payload.checks.schema.status).toBe('degraded');
        expect(payload.checks.schema.message).toBe('Check degraded');
    });
});

function mockSupabase({
    schemaError = null,
    storageError,
}: {
    schemaError?: Error | { code: string; message: string } | null;
    storageError: Error | null;
}) {
    return {
        from: () => ({
            select: (columns: string) => ({
                limit: async () => ({
                    data: [],
                    error: columns.includes('playback_readiness_status') ? schemaError : null,
                }),
            }),
        }),
        storage: {
            listBuckets: async () =>
                storageError
                    ? { data: null, error: storageError }
                    : {
                          data: [
                              { id: 'slide-assets' },
                              { id: 'graphics' },
                              { id: 'video-assets' },
                              { id: 'small-media-assets' },
                          ],
                          error: null,
                      },
        },
    } as unknown as ReturnType<typeof createServiceClient>;
}
