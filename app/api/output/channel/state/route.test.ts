import { beforeEach, describe, expect, it, vi } from 'vitest';

import { GET } from './route';

import { getLiveSchedule } from '@/lib/data';
import { getGlobalFallbackCarousel } from '@/lib/fallback-carousel';
import { getLatestMusicPreference } from '@/lib/operator-preferences';
import type { MediaAsset, ProgramBlock, ScheduleBundle } from '@/lib/types';

vi.mock('@/lib/data', () => ({
    getLiveSchedule: vi.fn(),
    getPlaybackScheduleForBlock: vi.fn(),
}));

vi.mock('@/lib/operator-preferences', () => ({
    getLatestMusicPreference: vi.fn(),
}));

vi.mock('@/lib/fallback-carousel', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@/lib/fallback-carousel')>();

    return {
        ...actual,
        getGlobalFallbackCarousel: vi.fn(async () => null),
    };
});

vi.mock('@/lib/auth/output-auth', () => ({
    isOutputRequestAllowed: vi.fn(async () => true),
    outputAccessDeniedReason: vi.fn(() => 'denied'),
}));

vi.mock('@/lib/output-overrides', () => ({
    getActiveOutputOverride: vi.fn(async () => null),
}));

vi.mock('@/lib/settings', () => ({
    getVimeoToken: vi.fn(async () => 'vimeo-token'),
}));

vi.mock('@/lib/services/vimeo', () => ({
    getVimeoPlayback: vi.fn(async () => ({
        title: 'Vimeo clip',
        hlsUrl: 'https://example.com/video.m3u8',
        durationSeconds: 60,
    })),
}));

describe('GET /api/output/channel/state background music', () => {
    beforeEach(() => {
        vi.resetAllMocks();
        vi.mocked(getGlobalFallbackCarousel).mockResolvedValue(null);
        vi.mocked(getLatestMusicPreference).mockResolvedValue({
            enabled: true,
            volume: 42,
            fade: 'short',
        });
    });

    it('enables music for slide blocks', async () => {
        vi.mocked(getLiveSchedule).mockResolvedValue(
            bundleWith({ blockType: 'slide', slideId: 'slide-1' }),
        );

        const payload = await outputState();

        expect(payload.kind).toBe('slide');
        expect(payload.backgroundMusic).toMatchObject({
            enabled: true,
            volume: 42,
            tracks: [{ id: 'music-1', title: 'Music bed', url: 'https://example.com/music.mp3' }],
        });
    });

    it('keeps the playlist but pauses it for video blocks', async () => {
        vi.mocked(getLiveSchedule).mockResolvedValue(
            bundleWith({ blockType: 'video', assetId: 'video-1' }),
        );

        const payload = await outputState();

        expect(payload.kind).toBe('mp4');
        expect(payload.backgroundMusic).toMatchObject({
            enabled: false,
            tracks: [{ id: 'music-1', title: 'Music bed', url: 'https://example.com/music.mp3' }],
        });
    });

    it('returns the previously recorded bug for eligible video blocks', async () => {
        vi.mocked(getLiveSchedule).mockResolvedValue(
            bundleWith({
                blockType: 'video',
                assetId: 'video-1',
                metadata: {
                    previously_recorded_enabled: true,
                    previously_recorded_position: 'bottom_left',
                },
            }),
        );

        const payload = await outputState();

        expect(payload.kind).toBe('mp4');
        expect(payload.recordedBug).toEqual({
            label: 'PREVIOUSLY RECORDED',
            position: 'bottom_left',
        });
    });

    it('returns lower-third state for live blocks without adding it to the media signature', async () => {
        vi.mocked(getLiveSchedule).mockResolvedValue(
            bundleWith({
                blockType: 'video',
                metadata: {
                    live_object: true,
                    live_source_type: 'youtube',
                    live_url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
                    youtube_video_id: 'dQw4w9WgXcQ',
                    live_status: 'scheduled',
                    lower_third_visible: true,
                    lower_third_text: 'Markets live',
                },
            }),
        );

        const payload = await outputState();

        expect(payload.kind).toBe('youtube_live');
        expect(payload.signature).toBe('youtube-live:block-1:dQw4w9WgXcQ:scheduled');
        expect(payload.lowerThird).toEqual({
            visible: true,
            text: 'Markets live',
            assetUrl: '/l3/l32026full.png',
        });
    });

    it('does not return the previously recorded bug for Reuters streams', async () => {
        vi.mocked(getLiveSchedule).mockResolvedValue(
            bundleWith({
                blockType: 'video',
                metadata: {
                    previously_recorded_enabled: true,
                    previously_recorded_position: 'bottom_left',
                    reuters_stream_url: 'https://example.com/reuters.m3u8',
                },
            }),
        );

        const payload = await outputState();

        expect(payload.kind).toBe('hls');
        expect(payload.sourceType).toBe('reuters');
        expect(payload.recordedBug).toBeUndefined();
    });

    it('does not return the previously recorded bug for non-program block types', async () => {
        vi.mocked(getLiveSchedule).mockResolvedValue(
            bundleWith({
                blockType: 'ad',
                assetId: 'video-1',
                metadata: {
                    previously_recorded_enabled: true,
                    previously_recorded_position: 'bottom_left',
                },
            }),
        );

        const payload = await outputState();

        expect(payload.kind).toBe('mp4');
        expect(payload.recordedBug).toBeUndefined();
    });

    it('enables music for visual fallback slates', async () => {
        vi.mocked(getLiveSchedule).mockResolvedValue(bundleWith({ blocks: [] }));

        const payload = await outputState();

        expect(payload.kind).toBe('fallback');
        expect(payload.backgroundMusic).toMatchObject({ enabled: true });
    });

    it('plays a fallback carousel slide with music when no fallback loop video exists', async () => {
        vi.mocked(getGlobalFallbackCarousel).mockResolvedValue({
            enabled: true,
            cards: [{ slideId: 'slide-1', durationSeconds: 30 }],
            updatedAt: '2026-05-25T00:00:00.000Z',
        });
        vi.mocked(getLiveSchedule).mockResolvedValue(bundleWith({ blocks: [] }));

        const payload = await outputState();

        expect(payload.kind).toBe('slide');
        expect(payload.signature).toContain('fallback-carousel:slide-1');
        expect(payload.backgroundMusic).toMatchObject({ enabled: true });
    });

    it('does not add music over fallback loop videos', async () => {
        vi.mocked(getLiveSchedule).mockResolvedValue(
            bundleWith({
                blocks: [],
                extraMediaAssets: [
                    {
                        id: 'fallback-video',
                        title: 'Fallback loop',
                        sourceType: 'remote_mp4',
                        mediaKind: 'video',
                        assetType: 'fallback',
                        url: 'https://example.com/fallback.mp4',
                        durationSeconds: 60,
                        status: 'ready',
                        metadata: { fallback_loop: true },
                        createdAt: '2026-05-25T00:00:00.000Z',
                        updatedAt: '2026-05-25T00:00:00.000Z',
                    },
                ],
            }),
        );

        const payload = await outputState();

        expect(payload.kind).toBe('mp4');
        expect(payload.backgroundMusic).toBeNull();
    });

    it('returns null music when no ready tracks exist', async () => {
        vi.mocked(getLiveSchedule).mockResolvedValue(
            bundleWith({ blockType: 'slide', slideId: 'slide-1', includeMusic: false }),
        );

        const payload = await outputState();

        expect(payload.kind).toBe('slide');
        expect(payload.backgroundMusic).toBeNull();
    });
});

async function outputState() {
    const response = await GET(
        new Request('http://local.test/api/output/channel/state?startAt=10'),
    );
    expect(response.status).toBe(200);

    return response.json();
}

function bundleWith(input: {
    blockType?: string;
    assetId?: string;
    slideId?: string;
    blocks?: ProgramBlock[];
    includeMusic?: boolean;
    extraMediaAssets?: MediaAsset[];
    metadata?: Record<string, unknown> | null;
}): ScheduleBundle {
    const blocks =
        input.blocks ??
        (input.blockType
            ? [
                  {
                      id: 'block-1',
                      programDayId: 'day-1',
                      title: 'Active block',
                      blockType: input.blockType as ProgramBlock['blockType'],
                      category: 'broadcast',
                      assetId: input.assetId ?? null,
                      slideId: input.slideId ?? null,
                      startTime: '00:00:00',
                      startTimeSeconds: 0,
                      durationSeconds: 60,
                      status: 'ready' as const,
                      hideOverlays: false,
                      metadata: input.metadata ?? null,
                      createdAt: '2026-05-25T00:00:00.000Z',
                      updatedAt: '2026-05-25T00:00:00.000Z',
                  },
              ]
            : []);

    return {
        day: {
            id: 'day-1',
            airDate: '2026-05-25',
            timezone: 'America/Argentina/Buenos_Aires',
            status: 'active' as const,
            createdAt: '2026-05-25T00:00:00.000Z',
            updatedAt: '2026-05-25T00:00:00.000Z',
        },
        blocks,
        layers: [],
        mediaAssets: [
            ...(input.includeMusic === false
                ? []
                : [
                      {
                          id: 'music-1',
                          title: 'Music bed',
                          sourceType: 'supabase_audio' as const,
                          mediaKind: 'audio' as const,
                          assetType: 'music' as const,
                          url: 'https://example.com/music.mp3',
                          durationSeconds: 180,
                          status: 'ready' as const,
                          metadata: null,
                          createdAt: '2026-05-25T00:00:00.000Z',
                          updatedAt: '2026-05-25T00:00:00.000Z',
                      },
                  ]),
            {
                id: 'video-1',
                title: 'Video',
                sourceType: 'remote_mp4' as const,
                mediaKind: 'video' as const,
                assetType: 'video' as const,
                url: 'https://example.com/video.mp4',
                durationSeconds: 60,
                status: 'ready' as const,
                metadata: null,
                createdAt: '2026-05-25T00:00:00.000Z',
                updatedAt: '2026-05-25T00:00:00.000Z',
            },
            ...(input.extraMediaAssets ?? []),
        ],
        slideAssets: [
            {
                id: 'slide-1',
                title: 'Slide',
                slideType: 'html' as const,
                content: 'Slide content',
                status: 'ready' as const,
                metadata: null,
                createdAt: '2026-05-25T00:00:00.000Z',
                updatedAt: '2026-05-25T00:00:00.000Z',
            },
        ],
    };
}
