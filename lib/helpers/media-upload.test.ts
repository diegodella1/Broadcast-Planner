import { describe, expect, it } from 'vitest';

import { publicMediaAssetUrl } from './media-asset-url';
import { assertFileSignature, resolveUploadedMedia } from './media-upload';

const baseFile = {
    name: 'clip.mp4',
    type: 'video/mp4',
    size: 1024,
};
const videoProbe = {
    durationSeconds: 10,
    fileSizeBytes: 1024,
    width: 1920,
    height: 1080,
    videoCodec: 'h264',
    audioCodec: 'aac',
    bitRate: 1_000_000,
    frameRate: 30,
    qualityLabel: 'FHD',
    formatName: 'mov,mp4',
};

describe('resolveUploadedMedia', () => {
    it('defaults image uploads to 25 seconds', () => {
        const resolved = resolveUploadedMedia(
            { ...baseFile, name: 'still.jpg', type: 'image/jpeg' },
            { title: 'Still', assetType: 'image', orientation: 'auto' },
        );

        expect(resolved.mediaKind).toBe('image');
        expect(resolved.durationSeconds).toBe(25);
        expect(resolved.metadata.duration_source).toBe('image_default');
    });

    it('uses server-probed duration and dimensions', () => {
        const resolved = resolveUploadedMedia(
            baseFile,
            {
                title: 'Clip',
                assetType: 'video',
                orientation: 'auto',
                durationSeconds: '0',
                detectedDurationSeconds: '9.2',
            },
            videoProbe,
        );

        expect(resolved.durationSeconds).toBe(10);
        expect(resolved.metadata.duration_source).toBe('server_probe');
        expect(resolved.metadata.aspect_ratio).toBe(1.7778);
    });

    it('keeps browser duration advisory and server duration authoritative', () => {
        const resolved = resolveUploadedMedia(
            baseFile,
            {
                title: 'Clip',
                assetType: 'promo',
                orientation: 'vertical',
                durationSeconds: '15',
                detectedDurationSeconds: '9',
            },
            videoProbe,
        );

        expect(resolved.durationSeconds).toBe(10);
        expect(resolved.metadata.duration_source).toBe('server_probe');
        expect(resolved.metadata.presentation).toBe('vertical_blur');
    });

    it('requires audio or video duration', () => {
        expect(() =>
            resolveUploadedMedia(
                { ...baseFile, name: 'track.mp3', type: 'audio/mpeg' },
                { title: 'Track', assetType: 'music', orientation: 'auto' },
            ),
        ).toThrow('Server could not verify media duration');
    });

    it('stores sanitized music metadata when uploading tracks', () => {
        const resolved = resolveUploadedMedia(
            { ...baseFile, name: 'track.mp3', type: 'audio/mpeg' },
            {
                title: 'Track',
                assetType: 'music',
                orientation: 'auto',
                detectedDurationSeconds: '184',
                metadataJson: JSON.stringify({
                    music_title: 'Tagged title',
                    artist: 'Tagged artist',
                    album: 'Tagged album',
                    ignored: 'not stored',
                }),
            },
            {
                ...videoProbe,
                durationSeconds: 184,
                videoCodec: null,
                audioCodec: 'mp3',
                width: null,
                height: null,
            },
        );

        expect(resolved.durationSeconds).toBe(184);
        expect(resolved.metadata.music).toEqual({
            music_title: 'Tagged title',
            artist: 'Tagged artist',
            album: 'Tagged album',
        });
    });

    it('accepts uploaded videos longer than five minutes', () => {
        const resolved = resolveUploadedMedia(
            baseFile,
            {
                title: 'Long local clip',
                assetType: 'video',
                orientation: 'auto',
                detectedDurationSeconds: '301',
            },
            { ...videoProbe, durationSeconds: 3601 },
        );

        expect(resolved.durationSeconds).toBe(3601);
    });
});

describe('assertFileSignature', () => {
    it('accepts an MP4 file signature', () => {
        const bytes = new Uint8Array([
            0x00, 0x00, 0x00, 0x18, 0x66, 0x74, 0x79, 0x70, 0x69, 0x73, 0x6f, 0x6d,
        ]);

        expect(() => assertFileSignature(baseFile, bytes)).not.toThrow();
    });

    it('rejects files whose bytes do not match their declared MIME type', () => {
        const bytes = new Uint8Array([0x47, 0x49, 0x46, 0x38]);

        expect(() => assertFileSignature(baseFile, bytes)).toThrow(
            'File content does not match its MIME type',
        );
    });
});

describe('publicMediaAssetUrl', () => {
    it('builds public app proxy URLs without using localhost', () => {
        const url = publicMediaAssetUrl('asset-1', {
            NEXT_PUBLIC_APP_BASE_URL: 'https://broadcast-planner.diegodella.ar',
            NODE_ENV: 'production',
        });

        expect(url).toBe('https://broadcast-planner.diegodella.ar/api/media/assets/asset-1');
    });

    it('prefers an explicit app base URL', () => {
        const url = publicMediaAssetUrl('asset-1', {
            APP_BASE_URL: 'https://broadcast.example.com',
            NEXT_PUBLIC_APP_BASE_URL: 'https://broadcast-planner.diegodella.ar',
            NODE_ENV: 'production',
        });

        expect(url).toBe('https://broadcast.example.com/api/media/assets/asset-1');
    });

    it('rejects local app URLs in production', () => {
        expect(() =>
            publicMediaAssetUrl('asset-1', {
                NEXT_PUBLIC_APP_BASE_URL: 'http://127.0.0.1:3450',
                NODE_ENV: 'production',
            }),
        ).toThrow('public HTTPS app URL');
    });
});
