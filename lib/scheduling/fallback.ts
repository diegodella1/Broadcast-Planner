import type { MediaAsset } from '../types';

export function isFallbackCandidate(asset: MediaAsset): boolean {
    return (
        asset.status === 'ready' &&
        asset.mediaKind === 'video' &&
        (asset.assetType === 'fallback' || asset.metadata?.fallback_loop === true)
    );
}

export function isPlayableFallback(asset: MediaAsset): boolean {
    if (!isFallbackCandidate(asset)) {
        return false;
    }

    return Boolean(asset.url || asset.storagePath || asset.vimeoId);
}

export function findFallbackCandidate(assets: MediaAsset[]): MediaAsset | null {
    return assets.find(isFallbackCandidate) ?? null;
}

export function findPlayableFallback(assets: MediaAsset[]): MediaAsset | null {
    return assets.find(isPlayableFallback) ?? null;
}
