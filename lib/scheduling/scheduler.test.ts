import { describe, expect, it } from 'vitest';

import { mockSchedule } from '../mock-data';
import {
    findActiveLayers,
    findActiveSchedule,
    hasBaseBlockConflict,
    validateBlock,
} from './scheduler';

import type { MediaAsset, ProgramBlock, ScheduleBundle } from '../types';

describe('scheduler', () => {
    it('selects the active block by second of day', () => {
        const active = findActiveSchedule(mockSchedule, 10);
        expect(active.block?.id).toBe('block-main');
        expect(active.asset?.id).toBe('asset-vimeo-demo');
    });

    it('selects the ad block at the scheduled timestamp', () => {
        const active = findActiveSchedule(mockSchedule, 900);
        expect(active.block?.id).toBe('block-ad');
        expect(active.layers).toEqual([]);
    });

    it('activates overlays relative to block time', () => {
        const layers = findActiveLayers(mockSchedule.layers, 'block-main', 121);
        expect(layers).toHaveLength(1);
        expect(layers[0]?.title).toBe('Title slide');
    });

    it('falls back when no block is active', () => {
        const active = findActiveSchedule(mockSchedule, 8000);
        expect(active.block).toBeNull();
        expect(active.fallbackAsset?.assetType).toBe('fallback');
    });

    it('selects a fallback asset flagged via metadata.fallback_loop when no assetType fallback exists', () => {
        const timestamp = new Date().toISOString();
        const fallbackByMetadata: MediaAsset = {
            id: 'asset-metadata-fallback',
            title: 'Loopable Standby Reel',
            sourceType: 'remote_mp4',
            mediaKind: 'video',
            assetType: 'video',
            url: 'https://example.com/standby.mp4',
            status: 'ready',
            metadata: { fallback_loop: true },
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        const bundle: ScheduleBundle = {
            ...mockSchedule,
            day: mockSchedule.day ? { ...mockSchedule.day, fallbackAssetId: null } : null,
            mediaAssets: [fallbackByMetadata],
            blocks: [],
        };

        const active = findActiveSchedule(bundle, 8000);
        expect(active.block).toBeNull();
        expect(active.fallbackAsset?.id).toBe('asset-metadata-fallback');
    });

    it('ignores assets with fallback_loop metadata when they are not ready', () => {
        const timestamp = new Date().toISOString();
        const draftFallback: MediaAsset = {
            id: 'asset-draft-fallback',
            title: 'Draft Standby Reel',
            sourceType: 'remote_mp4',
            mediaKind: 'video',
            assetType: 'video',
            url: 'https://example.com/draft.mp4',
            status: 'draft',
            metadata: { fallback_loop: true },
            createdAt: timestamp,
            updatedAt: timestamp,
        };
        const bundle: ScheduleBundle = {
            ...mockSchedule,
            day: mockSchedule.day ? { ...mockSchedule.day, fallbackAssetId: null } : null,
            mediaAssets: [draftFallback],
            blocks: [],
        };

        const active = findActiveSchedule(bundle, 8000);
        expect(active.fallbackAsset).toBeNull();
    });

    it('rejects ads longer than five minutes', () => {
        expect(validateBlock({ blockType: 'ad', durationSeconds: 301 })).toContain(
            'Ads cannot be longer than 300 seconds',
        );
    });

    it('detects overlapping base blocks', () => {
        const firstBlock = mockSchedule.blocks[0] as ProgramBlock;
        const candidate = {
            ...firstBlock,
            id: 'new-block',
            startTimeSeconds: 30,
            durationSeconds: 60,
        };
        expect(hasBaseBlockConflict(mockSchedule.blocks, candidate)).toBe(true);
    });
});
