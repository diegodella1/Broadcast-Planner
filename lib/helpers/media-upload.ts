import { eq } from 'drizzle-orm';

import { createMediaAsset } from '../mutations';
import {
    MAX_SHORT_VIDEO_SECONDS,
    SMALL_MEDIA_BUCKET,
    MAX_SMALL_MEDIA_BYTES,
    SMALL_MEDIA_MIME_TYPES,
    formatUploadLimit,
} from './media-upload-constants';
import { publicMediaAssetUrl } from './media-asset-url';
import { parseMusicMetadataJson } from './music-metadata';
import { getDb } from '../db/client';
import { mediaAssets } from '../db/schema';
import { getMediaBucket } from '../storage/r2';

export {
    MAX_SHORT_VIDEO_SECONDS,
    SMALL_MEDIA_BUCKET,
    MAX_SMALL_MEDIA_BYTES,
    SMALL_MEDIA_MIME_TYPES,
};

type MediaKind = 'video' | 'image' | 'audio';
type SourceType = 'remote_mp4' | 'supabase_image' | 'supabase_audio';
type DurationSource = 'manual' | 'detected' | 'image_default';

export type UploadedMediaFields = {
    title: string;
    assetType: string;
    orientation: string;
    durationSeconds?: string | number | null;
    detectedDurationSeconds?: string | number | null;
    detectedWidth?: string | number | null;
    detectedHeight?: string | number | null;
    metadataJson?: string | null;
};

export type FileLike = {
    name: string;
    type: string;
    size: number;
    arrayBuffer(): Promise<ArrayBuffer>;
};

export type ResolvedUploadedMedia = {
    title: string;
    sourceType: SourceType;
    mediaKind: MediaKind;
    assetType: string;
    durationSeconds: number;
    metadata: Record<string, unknown>;
};

export function resolveUploadedMedia(
    file: Pick<FileLike, 'name' | 'type' | 'size'>,
    fields: UploadedMediaFields,
) {
    if (file.size > MAX_SMALL_MEDIA_BYTES) {
        throw new Error(`The file cannot exceed ${formatUploadLimit()}`);
    }

    if (!SMALL_MEDIA_MIME_TYPES.includes(file.type as (typeof SMALL_MEDIA_MIME_TYPES)[number])) {
        throw new Error('Unsupported format. Use MP4, WebM, PNG, JPG, WebP, GIF or MP3');
    }

    const title = fields.title.trim();

    if (!title) {
        throw new Error('Title is required');
    }

    const mediaKind = mediaKindForMime(file.type);
    const sourceType = sourceTypeForKind(mediaKind);
    const rawAssetType = fields.assetType || 'video';
    const assetType =
        mediaKind === 'audio' && !['ad', 'promo', 'fallback', 'music'].includes(rawAssetType)
            ? 'music'
            : rawAssetType;
    const orientation = fields.orientation || 'auto';
    const manualDuration = parseOptionalPositiveNumber(fields.durationSeconds);
    const detectedDuration = parseOptionalPositiveNumber(fields.detectedDurationSeconds);
    const durationSource: DurationSource = manualDuration
        ? 'manual'
        : detectedDuration
          ? 'detected'
          : 'image_default';
    const durationSeconds =
        manualDuration ?? detectedDuration ?? (mediaKind === 'image' ? 25 : undefined);

    if (!durationSeconds) {
        throw new Error('Browser could not read media duration. Enter seconds manually.');
    }

    if (assetType === 'ad' && durationSeconds > 300) {
        throw new Error('Ads cannot be longer than 300 seconds');
    }

    if (
        mediaKind === 'video' &&
        assetType === 'video' &&
        durationSeconds > MAX_SHORT_VIDEO_SECONDS
    ) {
        throw new Error('Uploaded videos cannot be longer than 5 minutes');
    }

    const width = parseOptionalPositiveNumber(fields.detectedWidth);
    const height = parseOptionalPositiveNumber(fields.detectedHeight);
    const aspectRatio = width && height ? Number((width / height).toFixed(4)) : undefined;
    const musicMetadata = assetType === 'music' ? parseMusicMetadataJson(fields.metadataJson) : {};

    return {
        title,
        sourceType,
        mediaKind,
        assetType,
        durationSeconds,
        metadata: {
            presentation:
                mediaKind === 'video' && orientation === 'vertical' ? 'vertical_blur' : 'fit',
            orientation,
            background: mediaKind === 'video' && orientation === 'vertical' ? 'blur' : 'black',
            role: assetType === 'music' ? 'background_music' : 'scheduled_media',
            original_file_name: file.name,
            mime_type: file.type,
            size: file.size,
            media_kind: mediaKind,
            detected_duration_seconds: detectedDuration ?? null,
            manual_duration_seconds: manualDuration ?? null,
            duration_source: durationSource,
            width: width ?? null,
            height: height ?? null,
            aspect_ratio: aspectRatio ?? null,
            ...(Object.keys(musicMetadata).length ? { music: musicMetadata } : {}),
        },
    } satisfies ResolvedUploadedMedia;
}

export async function uploadMediaFile(file: FileLike, fields: UploadedMediaFields) {
    const resolved = resolveUploadedMedia(file, fields);
    const bytes = await file.arrayBuffer();
    assertFileSignature(file, new Uint8Array(bytes.slice(0, 32)));

    const extension = extensionFor(file);
    const storagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${extension}`;

    const bucket = await getMediaBucket();

    // Upsert:false semantics — the key includes a UUID so collisions are near-impossible,
    // but we guard with a head check to surface a clear error if one ever occurs.
    const existing = await bucket.head(storagePath);

    if (existing) {
        throw new Error(`Object already exists at path: ${storagePath}`);
    }

    await bucket.put(storagePath, bytes, { httpMetadata: { contentType: file.type } });

    let assetId = '';

    try {
        const createResult = await createMediaAsset({
            title: resolved.title,
            sourceType: resolved.sourceType,
            mediaKind: resolved.mediaKind,
            assetType: resolved.assetType,
            storageBucket: SMALL_MEDIA_BUCKET,
            storagePath,
            durationSeconds: resolved.durationSeconds,
            metadata: resolved.metadata,
        });

        if (!createResult.success) {
            throw new Error(createResult.error);
        }
        assetId = createResult.data;
    } catch (error) {
        await removeUploadedObject(storagePath);
        throw error;
    }

    const url = publicMediaAssetUrl(assetId);

    try {
        const db = await getDb();
        await db
            .update(mediaAssets)
            .set({ url, updatedAt: new Date().toISOString() })
            .where(eq(mediaAssets.id, assetId));
    } catch (urlError) {
        await markUploadedAssetFailed(assetId, urlError);
        throw urlError;
    }

    return { ...resolved, assetId, url, storagePath };
}

export function uploadedMediaFieldsFromForm(form: FormData): UploadedMediaFields {
    return {
        title: String(form.get('title') ?? '').trim(),
        assetType: String(form.get('asset_type') || 'video'),
        orientation: String(form.get('orientation') || 'auto'),
        durationSeconds: form.get('duration_seconds') as string | null,
        detectedDurationSeconds: form.get('detected_duration_seconds') as string | null,
        detectedWidth: form.get('detected_width') as string | null,
        detectedHeight: form.get('detected_height') as string | null,
        metadataJson: form.get('metadata_json') as string | null,
    };
}

export function assertFileSignature(file: Pick<FileLike, 'name' | 'type'>, bytes: Uint8Array) {
    const valid =
        (file.type === 'video/mp4' && hasMp4Signature(bytes)) ||
        (file.type === 'video/webm' && startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) ||
        (file.type === 'image/png' &&
            startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) ||
        (file.type === 'image/jpeg' && startsWith(bytes, [0xff, 0xd8, 0xff])) ||
        (file.type === 'image/webp' && hasWebpSignature(bytes)) ||
        (file.type === 'image/gif' && hasAsciiSignature(bytes, 'GIF8')) ||
        ((file.type === 'audio/mpeg' || file.type === 'audio/mp3') && hasMp3Signature(bytes));

    if (!valid) {
        throw new Error('File content does not match its MIME type');
    }
}

function mediaKindForMime(mimeType: string): MediaKind {
    if (mimeType.startsWith('image/')) {
        return 'image';
    }

    if (mimeType.startsWith('audio/')) {
        return 'audio';
    }

    return 'video';
}

function sourceTypeForKind(mediaKind: MediaKind): SourceType {
    if (mediaKind === 'image') {
        return 'supabase_image';
    }

    if (mediaKind === 'audio') {
        return 'supabase_audio';
    }

    return 'remote_mp4';
}

function parseOptionalPositiveNumber(value: string | number | null | undefined) {
    if (value === null || value === undefined || value === '') {
        return undefined;
    }
    const numeric = Number(value);

    if (!Number.isFinite(numeric) || numeric <= 0) {
        return undefined;
    }

    return Math.ceil(numeric);
}

async function removeUploadedObject(storagePath: string) {
    try {
        const bucket = await getMediaBucket();
        await bucket.delete(storagePath);
    } catch {
        // The database row failed, so the upload route should not be blocked by best-effort cleanup.
    }
}

async function markUploadedAssetFailed(assetId: string, error: unknown) {
    const message = error instanceof Error ? error.message : String(error);

    try {
        const db = await getDb();
        await db
            .update(mediaAssets)
            .set({
                status: 'failed',
                playbackReadinessStatus: 'failed',
                playbackError: message,
                updatedAt: new Date().toISOString(),
            })
            .where(eq(mediaAssets.id, assetId));
    } catch {
        // Preserve the original upload error for the caller.
    }
}

function extensionFor(file: Pick<FileLike, 'name' | 'type'>) {
    const nameExtension = file.name.match(/\.[a-z0-9]+$/i)?.[0];

    if (nameExtension) {
        return nameExtension.toLowerCase();
    }

    if (file.type === 'video/webm') {
        return '.webm';
    }

    if (file.type === 'image/png') {
        return '.png';
    }

    if (file.type === 'image/webp') {
        return '.webp';
    }

    if (file.type === 'image/gif') {
        return '.gif';
    }

    if (file.type === 'image/jpeg') {
        return '.jpg';
    }

    if (file.type === 'audio/mpeg' || file.type === 'audio/mp3') {
        return '.mp3';
    }

    return '.mp4';
}

function startsWith(bytes: Uint8Array, signature: number[]) {
    return signature.every((value, index) => bytes[index] === value);
}

function hasAsciiSignature(bytes: Uint8Array, signature: string, offset = 0) {
    return signature.split('').every((char, index) => bytes[offset + index] === char.charCodeAt(0));
}

function hasMp4Signature(bytes: Uint8Array) {
    return bytes.length >= 12 && hasAsciiSignature(bytes, 'ftyp', 4);
}

function hasWebpSignature(bytes: Uint8Array) {
    return (
        bytes.length >= 12 &&
        hasAsciiSignature(bytes, 'RIFF', 0) &&
        hasAsciiSignature(bytes, 'WEBP', 8)
    );
}

function hasMp3Signature(bytes: Uint8Array) {
    return (
        hasAsciiSignature(bytes, 'ID3') ||
        (bytes.length >= 2 && bytes[0] === 0xff && ((bytes[1] ?? 0) & 0xe0) === 0xe0)
    );
}
