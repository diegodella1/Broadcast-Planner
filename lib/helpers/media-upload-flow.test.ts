import { beforeEach, describe, expect, it, vi } from 'vitest';

const { createMediaAssetMock } = vi.hoisted(() => ({
    createMediaAssetMock: vi.fn(),
}));

vi.mock('../mutations', () => ({
    createMediaAsset: createMediaAssetMock,
}));

vi.mock('../media/ffprobe', () => ({
    probeMediaInput: vi.fn(async () => ({
        durationSeconds: 30,
        fileSizeBytes: 1024,
        width: 1920,
        height: 1080,
        videoCodec: 'h264',
        audioCodec: 'aac',
        bitRate: 1_000_000,
        frameRate: 30,
        qualityLabel: 'FHD',
        formatName: 'mov,mp4',
    })),
}));

// ---------------------------------------------------------------------------
// Mock the new D1/R2 data layer
// ---------------------------------------------------------------------------
const mockBucketHead = vi.fn();
const mockBucketPut = vi.fn();
const mockBucketDelete = vi.fn();
const mockDbUpdate = vi.fn().mockReturnThis();
const mockDbSet = vi.fn().mockReturnThis();
const mockDbWhere = vi.fn().mockResolvedValue(undefined);

vi.mock('../db/client', () => ({
    getDb: vi.fn(async () => ({
        update: mockDbUpdate,
        set: mockDbSet,
        where: mockDbWhere,
    })),
}));

vi.mock('../storage/r2', () => ({
    getMediaBucket: vi.fn(async () => ({
        head: mockBucketHead,
        put: mockBucketPut,
        delete: mockBucketDelete,
    })),
}));

import { uploadMediaFile } from './media-upload';

describe('uploadMediaFile', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        vi.stubEnv('NEXT_PUBLIC_APP_BASE_URL', 'https://broadcast-planner.diegodella.ar');
        vi.stubEnv('NODE_ENV', 'production');

        createMediaAssetMock.mockResolvedValue({ success: true, data: 'asset-1' });

        // head() → no existing object (safe to upload)
        mockBucketHead.mockResolvedValue(null);
        // put() → success
        mockBucketPut.mockResolvedValue(undefined);
        mockBucketDelete.mockResolvedValue(undefined);

        // Re-wire DB chain after clearAllMocks
        mockDbUpdate.mockReturnThis();
        mockDbSet.mockReturnThis();
        mockDbWhere.mockResolvedValue(undefined);
    });

    it('stores a public app proxy URL for uploaded media assets', async () => {
        const result = await uploadMediaFile(
            {
                name: 'ad spot.mp4',
                type: 'video/mp4',
                size: 1024,
                arrayBuffer: async () =>
                    new Uint8Array([
                        0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
                    ]).buffer,
            },
            {
                title: 'Ad spot',
                assetType: 'ad',
                orientation: 'auto',
                detectedDurationSeconds: '30',
            },
        );

        expect(createMediaAssetMock).toHaveBeenCalledWith(
            expect.objectContaining({
                assetType: 'ad',
            }),
        );
        expect(createMediaAssetMock.mock.calls[0]?.[0]).not.toHaveProperty('url');
        expect(result.url).toBe('https://broadcast-planner.diegodella.ar/api/media/assets/asset-1');

        // R2 put was called with the storage path and content type
        expect(mockBucketPut).toHaveBeenCalledWith(
            expect.stringMatching(/\.mp4$/),
            expect.any(ArrayBuffer),
            expect.objectContaining({ httpMetadata: { contentType: 'video/mp4' } }),
        );
    });

    it('deletes the stored object when database creation fails', async () => {
        createMediaAssetMock.mockResolvedValue({ success: false, error: 'database failed' });

        await expect(
            uploadMediaFile(
                {
                    name: 'rollback.mp4',
                    type: 'video/mp4',
                    size: 1024,
                    arrayBuffer: async () =>
                        new Uint8Array([
                            0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
                        ]).buffer,
                },
                { title: 'Rollback', assetType: 'video', orientation: 'auto' },
            ),
        ).rejects.toThrow('database failed');
        expect(mockBucketDelete).toHaveBeenCalledOnce();
    });
});
