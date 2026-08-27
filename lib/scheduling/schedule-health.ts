import { formatTimecode } from '../helpers/time';
import { isLiveObjectBlock } from '../live-object';
import { isFallbackCandidate } from './fallback';

import type {
    MediaAsset,
    ProgramBlock,
    ScheduleBundle,
    ScheduledLayer,
    SlideAsset,
} from '../types';

export type ScheduleIssueSeverity = 'warning' | 'critical';
export type ScheduleIssueKind =
    | 'gap'
    | 'overlap'
    | 'missing_asset'
    | 'unready_asset'
    | 'unsupported_asset'
    | 'ad_duration'
    | 'fallback'
    | 'layer_timing'
    | 'hidden_layer';

export type ScheduleIssueI18n = {
    titleKey: string;
    titleValues?: Record<string, string | number>;
    detailKey?: string;
    detailValues?: Record<string, string | number>;
};

export type ScheduleIssue = {
    id: string;
    blockId?: string;
    layerId?: string;
    assetId?: string;
    slideId?: string;
    targetHref?: string;
    actionHref?: string;
    title: string;
    detail: string;
    severity: ScheduleIssueSeverity;
    kind: ScheduleIssueKind;
    i18n: ScheduleIssueI18n;
};

export type AssetReadiness = {
    ready: boolean;
    severity: ScheduleIssueSeverity;
    messages: string[];
};

export type ScheduleHealth = {
    gaps: ScheduleIssue[];
    overlaps: ScheduleIssue[];
    missingAssets: ScheduleIssue[];
    unreadyAssets: ScheduleIssue[];
    unsupportedAssets: ScheduleIssue[];
    fallbackIssues: ScheduleIssue[];
    layerIssues: ScheduleIssue[];
    issues: ScheduleIssue[];
    criticalCount: number;
    warnCount: number;
};

const SUPPORTED_VIDEO_SOURCES = new Set(['uploaded', 'public_url']);
const SUPPORTED_IMAGE_SOURCES = new Set(['uploaded', 'public_url']);
const SUPPORTED_AUDIO_SOURCES = new Set(['uploaded', 'public_url']);

type BlockIssues = {
    missingAssets: ScheduleIssue[];
    unreadyAssets: ScheduleIssue[];
    unsupportedAssets: ScheduleIssue[];
    layerIssues: ScheduleIssue[];
};

export function analyzeSchedule(
    schedule: ScheduleBundle,
    inputBlocks = schedule.blocks,
): ScheduleHealth {
    const blocks = [...inputBlocks].sort((a, b) => a.startTimeSeconds - b.startTimeSeconds);
    const baseBlocks = blocks.filter((block) => !isLiveObjectBlock(block));
    const { gaps, overlaps } = detectAdjacencyIssues(baseBlocks);
    const blockIssues = collectBlockIssues(schedule, blocks);
    const fallbackIssues = detectFallbackIssues(schedule);

    return assembleScheduleHealth({ gaps, overlaps, fallbackIssues, ...blockIssues });
}

function detectAdjacencyIssues(blocks: ProgramBlock[]): {
    gaps: ScheduleIssue[];
    overlaps: ScheduleIssue[];
} {
    const gaps: ScheduleIssue[] = [];
    const overlaps: ScheduleIssue[] = [];

    for (let index = 0; index < blocks.length - 1; index += 1) {
        const current = blocks[index];
        const next = blocks[index + 1];

        if (!current || !next) {
            continue;
        }
        const currentEnd = current.startTimeSeconds + current.durationSeconds;
        const gap = buildGapIssue(current, next, currentEnd);

        if (gap) {
            gaps.push(gap);
        }
        const overlap = buildOverlapIssue(current, next, currentEnd);

        if (overlap) {
            overlaps.push(overlap);
        }
    }

    return { gaps, overlaps };
}

function buildGapIssue(
    current: ProgramBlock,
    next: ProgramBlock,
    currentEnd: number,
): ScheduleIssue | null {
    if (next.startTimeSeconds <= currentEnd) {
        return null;
    }
    const fromTc = formatTimecode(currentEnd);
    const toTc = formatTimecode(next.startTimeSeconds);

    return {
        id: `gap-${current.id}-${next.id}`,
        blockId: next.id,
        title: 'Programming gap',
        detail: `${fromTc} a ${toTc}`,
        severity: 'warning',
        kind: 'gap',
        i18n: {
            titleKey: 'health.issues.gap.title',
            detailKey: 'health.issues.gap.description',
            detailValues: { from: fromTc, to: toTc },
        },
    };
}

function buildOverlapIssue(
    current: ProgramBlock,
    next: ProgramBlock,
    currentEnd: number,
): ScheduleIssue | null {
    if (next.startTimeSeconds >= currentEnd) {
        return null;
    }

    return {
        id: `overlap-${current.id}-${next.id}`,
        blockId: next.id,
        title: 'Overlapping blocks',
        detail: `${current.title} overlaps ${next.title}`,
        severity: 'critical',
        kind: 'overlap',
        i18n: {
            titleKey: 'health.issues.overlap.title',
            detailKey: 'health.issues.overlap.description',
            detailValues: { current: current.title, next: next.title },
        },
    };
}

function collectBlockIssues(schedule: ScheduleBundle, blocks: ProgramBlock[]): BlockIssues {
    const acc: BlockIssues = {
        missingAssets: [],
        unreadyAssets: [],
        unsupportedAssets: [],
        layerIssues: [],
    };

    for (const block of blocks) {
        const asset = block.assetId ? findAsset(schedule.mediaAssets, block.assetId) : null;
        const slide = block.slideId ? findSlide(schedule.slideAssets, block.slideId) : null;
        const missing = buildMissingBlockAsset(block, asset, slide);

        if (missing) {
            acc.missingAssets.push(missing);
            continue;
        }
        addAssetReadinessIssue(acc, block, asset);
        addSlideReadinessIssue(acc, block, slide);
        addAdDurationIssue(acc, block);
        acc.layerIssues.push(...collectBlockLayerIssues(schedule, block));
    }

    return acc;
}

function buildMissingBlockAsset(
    block: ProgramBlock,
    asset: MediaAsset | null,
    slide: SlideAsset | null,
): ScheduleIssue | null {
    if (isLiveObjectBlock(block)) {
        return null;
    }
    const expectsSlide = block.blockType === 'slide';
    const missing = expectsSlide ? !slide : !asset;

    if (!missing) {
        return null;
    }
    const kindLabel = expectsSlide ? 'slide' : 'media';

    return {
        id: `missing-${block.id}`,
        blockId: block.id,
        title: 'Block missing asset',
        detail: `${block.title} has no assigned ${kindLabel}`,
        severity: 'critical',
        kind: 'missing_asset',
        i18n: {
            titleKey: 'health.issues.missingAsset.title',
            detailKey: 'health.issues.missingAsset.blockDescription',
            detailValues: { block: block.title, kind: kindLabel },
        },
    };
}

function addAssetReadinessIssue(
    acc: BlockIssues,
    block: ProgramBlock,
    asset: MediaAsset | null,
): void {
    if (!asset) {
        return;
    }
    const readiness = getAssetReadiness(asset);

    if (readiness.ready) {
        return;
    }
    const messagesJoined = readiness.messages.join(', ');
    const isCritical = readiness.severity === 'critical';
    const issue: ScheduleIssue = {
        id: `asset-readiness-${block.id}`,
        blockId: block.id,
        assetId: asset.id,
        title: isCritical ? 'Asset cannot play' : 'Asset not ready',
        detail: `${asset.title}: ${messagesJoined}`,
        severity: readiness.severity,
        kind: isCritical ? 'unsupported_asset' : 'unready_asset',
        i18n: {
            titleKey: isCritical
                ? 'health.issues.unsupportedAsset.title'
                : 'health.issues.unreadyAsset.title',
            detailKey: isCritical
                ? 'health.issues.unsupportedAsset.description'
                : 'health.issues.unreadyAsset.description',
            detailValues: { title: asset.title, messages: messagesJoined },
        },
    };

    if (issue.kind === 'unsupported_asset') {
        acc.unsupportedAssets.push(issue);
    } else {
        acc.unreadyAssets.push(issue);
    }
}

function addSlideReadinessIssue(
    acc: BlockIssues,
    block: ProgramBlock,
    slide: SlideAsset | null,
): void {
    if (!slide || slide.status === 'ready') {
        return;
    }
    acc.unreadyAssets.push({
        id: `slide-status-${block.id}`,
        blockId: block.id,
        slideId: slide.id,
        title: 'Slide not ready',
        detail: `${slide.title} is ${slide.status}`,
        severity: 'warning',
        kind: 'unready_asset',
        i18n: {
            titleKey: 'health.issues.unreadySlide.title',
            detailKey: 'health.issues.unreadySlide.description',
            detailValues: { title: slide.title, status: slide.status },
        },
    });
}

function addAdDurationIssue(acc: BlockIssues, block: ProgramBlock): void {
    if (block.blockType !== 'ad' || block.durationSeconds <= 300) {
        return;
    }
    const durationTc = formatTimecode(block.durationSeconds);
    acc.unsupportedAssets.push({
        id: `ad-duration-${block.id}`,
        blockId: block.id,
        title: 'Ad too long',
        detail: `${block.title} runs ${durationTc} and the maximum is 00:05:00`,
        severity: 'critical',
        kind: 'ad_duration',
        i18n: {
            titleKey: 'health.issues.adDuration.title',
            detailKey: 'health.issues.adDuration.description',
            detailValues: { title: block.title, duration: durationTc },
        },
    });
}

function collectBlockLayerIssues(schedule: ScheduleBundle, block: ProgramBlock): ScheduleIssue[] {
    const blockLayers = schedule.layers.filter((layer) => layer.programBlockId === block.id);
    const issues: ScheduleIssue[] = [];

    for (const layer of blockLayers) {
        issues.push(...analyzeLayer(schedule, block, layer));
        const hidden = buildHiddenLayerIssue(block, layer);

        if (hidden) {
            issues.push(hidden);
        }
    }

    return issues;
}

function buildHiddenLayerIssue(block: ProgramBlock, layer: ScheduledLayer): ScheduleIssue | null {
    if (!block.hideOverlays || !layer.enabled) {
        return null;
    }

    return {
        id: `hidden-layer-${layer.id}`,
        blockId: block.id,
        layerId: layer.id,
        title: 'Overlay hidden by block',
        detail: `${layer.title} is enabled but the block hides overlays`,
        severity: 'warning',
        kind: 'hidden_layer',
        i18n: {
            titleKey: 'health.issues.hiddenLayer.title',
            detailKey: 'health.issues.hiddenLayer.description',
            detailValues: { title: layer.title },
        },
    };
}

function detectFallbackIssues(schedule: ScheduleBundle): ScheduleIssue[] {
    const readyFallback = schedule.mediaAssets.some(isFallbackCandidate);

    if (readyFallback) {
        return [];
    }

    return [
        {
            id: 'fallback-missing',
            title: 'No ready fallback',
            detail: 'No fallback asset is ready to cover output errors',
            severity: 'warning',
            kind: 'fallback',
            i18n: {
                titleKey: 'health.issues.fallbackMissing.title',
                detailKey: 'health.issues.fallbackMissing.description',
            },
        },
    ];
}

function assembleScheduleHealth(parts: {
    gaps: ScheduleIssue[];
    overlaps: ScheduleIssue[];
    missingAssets: ScheduleIssue[];
    unreadyAssets: ScheduleIssue[];
    unsupportedAssets: ScheduleIssue[];
    fallbackIssues: ScheduleIssue[];
    layerIssues: ScheduleIssue[];
}): ScheduleHealth {
    const {
        gaps,
        overlaps,
        missingAssets,
        unreadyAssets,
        unsupportedAssets,
        fallbackIssues,
        layerIssues,
    } = parts;
    const issues = [
        ...overlaps,
        ...missingAssets,
        ...unsupportedAssets,
        ...unreadyAssets,
        ...layerIssues,
        ...gaps,
        ...fallbackIssues,
    ];

    return {
        gaps,
        overlaps,
        missingAssets,
        unreadyAssets,
        unsupportedAssets,
        fallbackIssues,
        layerIssues,
        issues,
        criticalCount: issues.filter((issue) => issue.severity === 'critical').length,
        warnCount: issues.filter((issue) => issue.severity === 'warning').length,
    };
}

export function scheduleIssueHref(date: string, issue: ScheduleIssue) {
    if (issue.blockId) {
        return `/admin/schedule/${date}/blocks/${issue.blockId}`;
    }

    if (issue.slideId) {
        return '/admin/slides';
    }

    if (issue.assetId || issue.kind === 'fallback') {
        return '/admin/assets';
    }

    return `/admin/schedule/${date}`;
}

export function withScheduleIssueLinks(date: string, issue: ScheduleIssue): ScheduleIssue {
    const actionHref = issue.actionHref ?? actionHrefForIssue(issue);

    return {
        ...issue,
        targetHref: issue.targetHref ?? scheduleIssueHref(date, issue),
        ...(actionHref ? { actionHref } : {}),
    };
}

function actionHrefForIssue(issue: ScheduleIssue) {
    if (issue.kind === 'fallback') {
        return '/admin/assets?kind=fallback';
    }

    if (issue.kind === 'missing_asset' && issue.slideId) {
        return '/admin/slides';
    }

    if (issue.kind === 'missing_asset' || issue.assetId) {
        return '/admin/assets';
    }

    return issue.blockId ? undefined : '/admin/assets';
}

type ReadinessCheck = { critical: boolean; message: string };

export function getAssetReadiness(asset: MediaAsset): AssetReadiness {
    const messages: string[] = [];
    let severity: ScheduleIssueSeverity = 'warning';
    const checks: ReadinessCheck[] = [
        ...checkAssetStatus(asset),
        ...checkMediaKindSourceSupport(asset),
        ...checkMetadataReadiness(asset),
        ...checkRemoteUrlPresence(asset),
        ...checkGraphicSupport(asset),
    ];

    for (const check of checks) {
        messages.push(check.message);

        if (check.critical) {
            severity = 'critical';
        }
    }

    return {
        ready: messages.length === 0,
        severity,
        messages,
    };
}

function checkAssetStatus(asset: MediaAsset): ReadinessCheck[] {
    if (asset.status === 'ready') {
        return [];
    }

    return [{ critical: false, message: `status ${asset.status}` }];
}

function checkMediaKindSourceSupport(asset: MediaAsset): ReadinessCheck[] {
    if (asset.mediaKind === 'video' && !SUPPORTED_VIDEO_SOURCES.has(asset.sourceType)) {
        return [
            { critical: true, message: `source ${asset.sourceType} is not supported for video` },
        ];
    }

    if (asset.mediaKind === 'image' && !SUPPORTED_IMAGE_SOURCES.has(asset.sourceType)) {
        return [
            { critical: true, message: `source ${asset.sourceType} is not supported for images` },
        ];
    }

    if (asset.mediaKind === 'audio' && !SUPPORTED_AUDIO_SOURCES.has(asset.sourceType)) {
        return [
            { critical: true, message: `source ${asset.sourceType} is not supported for audio` },
        ];
    }

    return [];
}

function checkMetadataReadiness(asset: MediaAsset): ReadinessCheck[] {
    const checks: ReadinessCheck[] = [];

    if (!asset.playbackKind) {
        checks.push({ critical: true, message: 'missing playback kind' });
    }

    if (asset.playbackReadinessStatus === 'failed' || asset.playbackReadinessStatus === 'review') {
        checks.push({
            critical: true,
            message: asset.playbackError || 'playback needs review',
        });
    }

    if (asset.metadataStatus === 'failed' || asset.metadataStatus === 'stale') {
        checks.push({
            critical: true,
            message: asset.metadataError || `metadata ${asset.metadataStatus}`,
        });
    }

    return checks;
}

function checkRemoteUrlPresence(asset: MediaAsset): ReadinessCheck[] {
    if (asset.sourceType === 'public_url' && !asset.url) {
        return [{ critical: true, message: 'missing URL' }];
    }

    if (asset.sourceType === 'uploaded' && !asset.url && !asset.storagePath) {
        return [{ critical: true, message: 'missing URL' }];
    }

    return [];
}

function checkGraphicSupport(asset: MediaAsset): ReadinessCheck[] {
    if (asset.mediaKind !== 'graphic') {
        return [];
    }

    return [{ critical: true, message: 'graphics are not supported as base media yet' }];
}

function analyzeLayer(
    schedule: ScheduleBundle,
    block: ProgramBlock,
    layer: ScheduledLayer,
): ScheduleIssue[] {
    const issues: ScheduleIssue[] = [];
    const timing = buildLayerTimingIssue(block, layer);

    if (timing) {
        issues.push(timing);
    }
    const asset = layer.assetId ? findAsset(schedule.mediaAssets, layer.assetId) : null;
    const slide = layer.slideId ? findSlide(schedule.slideAssets, layer.slideId) : null;
    const missing = buildLayerMissingIssue(block, layer, asset, slide);

    if (missing) {
        issues.push(missing);
    }
    const assetIssue = buildLayerAssetReadinessIssue(block, layer, asset);

    if (assetIssue) {
        issues.push(assetIssue);
    }
    const slideIssue = buildLayerSlideReadinessIssue(block, layer, slide);

    if (slideIssue) {
        issues.push(slideIssue);
    }

    return issues;
}

function buildLayerTimingIssue(block: ProgramBlock, layer: ScheduledLayer): ScheduleIssue | null {
    if (layer.startTimeSeconds + layer.durationSeconds <= block.durationSeconds) {
        return null;
    }
    const durationTc = formatTimecode(block.durationSeconds);

    return {
        id: `layer-window-${layer.id}`,
        blockId: block.id,
        layerId: layer.id,
        title: 'Overlay outside block',
        detail: `${layer.title} ends after ${durationTc}`,
        severity: 'critical',
        kind: 'layer_timing',
        i18n: {
            titleKey: 'health.issues.layerOutOfRange.title',
            detailKey: 'health.issues.layerOutOfRange.description',
            detailValues: { title: layer.title, duration: durationTc },
        },
    };
}

function buildLayerMissingIssue(
    block: ProgramBlock,
    layer: ScheduledLayer,
    asset: MediaAsset | null,
    slide: SlideAsset | null,
): ScheduleIssue | null {
    if (asset || slide) {
        return null;
    }

    return {
        id: `layer-missing-${layer.id}`,
        blockId: block.id,
        layerId: layer.id,
        title: 'Overlay missing asset',
        detail: `${layer.title} has no assigned media or slide`,
        severity: 'critical',
        kind: 'missing_asset',
        i18n: {
            titleKey: 'health.issues.layerMissing.title',
            detailKey: 'health.issues.layerMissing.description',
            detailValues: { title: layer.title },
        },
    };
}

function buildLayerAssetReadinessIssue(
    block: ProgramBlock,
    layer: ScheduledLayer,
    asset: MediaAsset | null,
): ScheduleIssue | null {
    if (!asset) {
        return null;
    }
    const readiness = getAssetReadiness(asset);

    if (readiness.ready) {
        return null;
    }
    const messagesJoined = readiness.messages.join(', ');
    const isCritical = readiness.severity === 'critical';

    return {
        id: `layer-asset-${layer.id}`,
        blockId: block.id,
        layerId: layer.id,
        assetId: asset.id,
        title: 'Overlay not ready',
        detail: `${asset.title}: ${messagesJoined}`,
        severity: readiness.severity,
        kind: isCritical ? 'unsupported_asset' : 'unready_asset',
        i18n: {
            titleKey: 'health.issues.layerUnready.title',
            detailKey: 'health.issues.layerUnready.description',
            detailValues: { title: asset.title, messages: messagesJoined },
        },
    };
}

function buildLayerSlideReadinessIssue(
    block: ProgramBlock,
    layer: ScheduledLayer,
    slide: SlideAsset | null,
): ScheduleIssue | null {
    if (!slide || slide.status === 'ready') {
        return null;
    }

    return {
        id: `layer-slide-${layer.id}`,
        blockId: block.id,
        layerId: layer.id,
        slideId: slide.id,
        title: 'Overlay slide not ready',
        detail: `${slide.title} is ${slide.status}`,
        severity: 'warning',
        kind: 'unready_asset',
        i18n: {
            titleKey: 'health.issues.layerUnreadySlide.title',
            detailKey: 'health.issues.layerUnreadySlide.description',
            detailValues: { title: slide.title, status: slide.status },
        },
    };
}

function findAsset(assets: MediaAsset[], id: string): MediaAsset | null {
    return assets.find((asset) => asset.id === id) ?? null;
}

function findSlide(slides: SlideAsset[], id: string): SlideAsset | null {
    return slides.find((slide) => slide.id === id) ?? null;
}
