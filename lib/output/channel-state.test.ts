import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { FallbackCarousel } from '@/lib/fallback-carousel';
import type { MediaAsset, ScheduleBundle, SlideAsset } from '@/lib/types';

const getLiveSchedule = vi.fn();
const getGlobalFallbackCarousel = vi.fn();

vi.mock('@/lib/data', () => ({
    getLiveSchedule: (...args: unknown[]) => getLiveSchedule(...args),
    getPlaybackScheduleForBlock: vi.fn(),
}));

vi.mock('@/lib/fallback-carousel', async () => {
    const actual =
        await vi.importActual<typeof import('@/lib/fallback-carousel')>('@/lib/fallback-carousel');

    return {
        ...actual,
        getGlobalFallbackCarousel: (...args: unknown[]) => getGlobalFallbackCarousel(...args),
    };
});

vi.mock('@/lib/output-overrides', () => ({
    getActiveOutputOverride: vi.fn(async () => null),
}));

vi.mock('@/lib/operator-preferences', () => ({
    getLatestMusicPreference: vi.fn(async () => ({ enabled: false, volume: 1, fade: 0 })),
}));

vi.mock('@/lib/settings', () => ({
    getVimeoToken: vi.fn(async () => null),
}));

vi.mock('@/lib/helpers/app-url', () => ({
    appUrl: (path: string) => new URL(path, 'https://local.rtv'),
}));

import { composeChannelState } from './channel-state';

const TIMESTAMP = '2026-05-29T00:00:00.000Z';

function fallbackLoopAsset(): MediaAsset {
    return {
        id: 'loop-asset-1',
        title: 'glitch',
        sourceType: 'remote_mp4',
        mediaKind: 'video',
        assetType: 'fallback',
        url: 'https://content-scheduler.roxom.tv/media/glitch.mp4',
        durationSeconds: 88,
        status: 'ready',
        metadata: { fallback_loop: true, fallback_muted: true },
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
    };
}

function carouselSlide(): SlideAsset {
    return {
        id: 'slide-1',
        title: 'Market break',
        slideType: 'html',
        htmlContent: '<p>break</p>',
        status: 'ready',
        createdAt: TIMESTAMP,
        updatedAt: TIMESTAMP,
    };
}

function enabledCarousel(): FallbackCarousel {
    return {
        enabled: true,
        activeSetId: null,
        sets: [],
        cards: [{ kind: 'slide', id: 'slide-1', slideId: 'slide-1', durationSeconds: 30 }],
        updatedAt: TIMESTAMP,
    };
}

function bundle(assets: MediaAsset[], slides: SlideAsset[]): ScheduleBundle {
    return {
        day: null,
        blocks: [],
        layers: [],
        mediaAssets: assets,
        slideAssets: slides,
    };
}

function inputs() {
    return {
        now: new Date(TIMESTAMP),
        previewBlockId: null,
        requestedStartAt: 0,
        mediaAccessToken: '',
    };
}

describe('composeChannelState fallback priority', () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it('plays the fallback loop asset instead of the carousel when both exist and no block is active', async () => {
        getLiveSchedule.mockResolvedValue(bundle([fallbackLoopAsset()], [carouselSlide()]));
        getGlobalFallbackCarousel.mockResolvedValue(enabledCarousel());

        const state = (await composeChannelState(inputs())) as Record<string, unknown>;

        expect(state.kind).toBe('mp4');
        expect(state.signature).toBe('fallback-loop:loop-asset-1:' + TIMESTAMP);
        expect('slideId' in state).toBe(false);
        expect(state.muted).toBe(true);
        expect(state.loop).toBe(true);
    });

    it('falls back to the carousel slide when no playable loop asset exists', async () => {
        getLiveSchedule.mockResolvedValue(bundle([], [carouselSlide()]));
        getGlobalFallbackCarousel.mockResolvedValue(enabledCarousel());

        const state = (await composeChannelState(inputs())) as Record<string, unknown>;

        expect(state.kind).toBe('slide');
        expect(state.slideId).toBe('slide-1');
    });
});
