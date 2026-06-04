import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

// ---------------------------------------------------------------------------
// Mock the new D1/R2 data layer
// ---------------------------------------------------------------------------
const mockList = vi.fn();

vi.mock('@/lib/db/client', () => ({
    getDb: vi.fn(async () => makeDbMock()),
}));

vi.mock('@/lib/storage/r2', () => ({
    getMediaBucket: vi.fn(async () => ({ list: mockList })),
}));

vi.mock('@/lib/settings', () => ({
    getVimeoSettings: vi.fn(async () => ({ status: 'ready', hasSecret: true })),
    getVimeoToken: vi.fn(async () => 'vimeo-token'),
}));

vi.mock('@/lib/services/reuters-credentials', () => ({
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

vi.mock('@/lib/health/smoke-status', () => ({
    readSmokeStatus: vi.fn(async () => null),
    isSmokeStatusOk: vi.fn(() => false),
    isSmokeStatusStale: vi.fn(() => false),
    smokeStatusMessage: vi.fn(() => 'No smoke status'),
}));

vi.mock('@/lib/audit/alerts', () => ({
    notifyHealthFailures: vi.fn(async () => undefined),
}));

vi.mock('@/lib/auth/auth', () => ({
    requireAdmin: vi.fn(async () => {
        throw new Error('Unauthorized');
    }),
}));

const originalEnv = { ...process.env };

// Build a minimal Drizzle-shaped chainable object.
// Each select() returns a chain that resolves via await with { rows }.
// schemaErrorOnTable lets a test inject an error for the mediaAssets schema check.
function makeDbMock(schemaErrorOnTable?: string) {
    return {
        select: (_fields?: unknown) => ({
            from: (table: unknown) => ({
                limit: async (_n: number) => {
                    if (schemaErrorOnTable && table === schemaErrorOnTable) {
                        throw new Error(`column does not exist: ${schemaErrorOnTable}`);
                    }

                    return [];
                },
            }),
        }),
    };
}

import { getDb } from '@/lib/db/client';
import { getMediaBucket } from '@/lib/storage/r2';

describe('GET /api/health', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        process.env = { ...originalEnv };
        process.env.APP_ENCRYPTION_KEY = 'encryption-key';
        process.env.ADMIN_BOOTSTRAP_TOKEN = 'admin-token';
        process.env.OUTPUT_CAPTURE_TOKEN = 'output-token';
        delete process.env.ALLOW_DEMO_DATA;

        // Default: happy-path — DB and storage both succeed
        vi.mocked(getDb).mockResolvedValue(makeDbMock() as never);
        mockList.mockResolvedValue({ objects: [] });
        vi.mocked(getMediaBucket).mockResolvedValue({ list: mockList } as never);
    });

    it('fails when required storage bucket cannot be reached', async () => {
        vi.mocked(getMediaBucket).mockRejectedValue(new Error('storage unavailable'));

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

    it('reports degraded schema when Vimeo readiness columns cause an error', async () => {
        // Simulate a schema-drift error only for schema-check selects.
        // checkSupabase selects only { id }, checkSchema selects { id, playbackReadinessStatus, ... }.
        // We detect schema-check queries by the presence of a key beyond just "id" in the fields arg.
        vi.mocked(getDb).mockResolvedValue({
            select: (fields: Record<string, unknown>) => ({
                from: () => ({
                    limit: async () => {
                        const keys = Object.keys(fields ?? {});
                        // Only fields unique to checkSchema queries — NOT checkMigrations.
                        const isSchemaCheck =
                            keys.includes('playbackReadinessStatus') ||
                            keys.includes('photoAssetId') ||
                            keys.includes('templateId');

                        if (isSchemaCheck) {
                            throw new Error(
                                'column media_assets.playback_readiness_status does not exist',
                            );
                        }

                        return [];
                    },
                }),
            }),
        } as never);

        const response = await GET();
        const payload = await response.json();

        expect(response.status).toBe(200);
        expect(payload.ok).toBe(true);
        expect(payload.status).toBe('degraded');
        expect(payload.checks.schema.status).toBe('degraded');
        expect(payload.checks.schema.message).toBe('Check degraded');
    });
});
