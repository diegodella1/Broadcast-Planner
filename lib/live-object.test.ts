import { describe, expect, it } from 'vitest';

import { buildLiveObjectMetadata, getLiveObjectConfig, parseYouTubeVideoId } from './live-object';

import type { ProgramBlock } from './types';

describe('live object helpers', () => {
    it('parses exact YouTube video links', () => {
        expect(parseYouTubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe(
            'dQw4w9WgXcQ',
        );
        expect(parseYouTubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    });

    it('rejects channel live links for v1', () => {
        expect(parseYouTubeVideoId('https://www.youtube.com/@some-channel/live')).toBeNull();
    });

    it('builds YouTube live metadata', () => {
        expect(
            buildLiveObjectMetadata({
                sourceType: 'youtube',
                url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                title: 'Market live',
            }),
        ).toMatchObject({
            live_object: true,
            live_source_type: 'youtube',
            live_status: 'scheduled',
            youtube_video_id: 'dQw4w9WgXcQ',
        });
    });

    it('builds HLS live metadata', () => {
        expect(
            buildLiveObjectMetadata({
                sourceType: 'hls',
                url: 'https://example.com/live/index.m3u8',
            }),
        ).toMatchObject({
            live_object: true,
            live_source_type: 'hls',
            hls_url: 'https://example.com/live/index.m3u8',
        });
    });

    it('extracts live config from a scheduled block', () => {
        const block: ProgramBlock = {
            id: 'block-live',
            programDayId: 'day',
            title: 'Third-party live',
            blockType: 'video',
            category: 'broadcast',
            startTime: '00:00:00',
            startTimeSeconds: 0,
            durationSeconds: 3600,
            status: 'ready',
            hideOverlays: false,
            metadata: {
                live_object: true,
                live_source_type: 'youtube',
                live_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                youtube_video_id: 'dQw4w9WgXcQ',
                live_status: 'scheduled',
            },
            createdAt: '',
            updatedAt: '',
        };

        expect(getLiveObjectConfig(block)).toMatchObject({
            sourceType: 'youtube',
            youtubeVideoId: 'dQw4w9WgXcQ',
            status: 'scheduled',
        });
    });
});
