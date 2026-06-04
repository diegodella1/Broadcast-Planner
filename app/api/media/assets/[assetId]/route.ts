import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';

import { requireAdmin } from '@/lib/auth/auth';
import { isOutputRequestAllowed, outputAccessDeniedReason } from '@/lib/auth/output-auth';
import { assertRateLimit, rateLimitErrorResponse } from '@/lib/auth/rate-limit';
import { SMALL_MEDIA_BUCKET } from '@/lib/helpers/media-upload-constants';
import { getDb } from '@/lib/db/client';
import { mediaAssets } from '@/lib/db/schema';
import { getMediaBucket } from '@/lib/storage/r2';

export const dynamic = 'force-dynamic';

const MEDIA_ASSET_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type RouteContext = {
    params: Promise<{ assetId: string }>;
};

export async function GET(request: Request, { params }: RouteContext) {
    const { assetId } = await params;

    if (!MEDIA_ASSET_ID_PATTERN.test(assetId)) {
        return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }
    const allowed = await isMediaRequestAllowed(request);

    if (!allowed) {
        return NextResponse.json({ error: outputAccessDeniedReason() }, { status: 401 });
    }

    try {
        await assertRateLimit({
            scope: 'api:media:assets',
            request,
            limit: 240,
            windowSeconds: 60,
        });
    } catch (error) {
        if (error instanceof Error && error.message === 'Rate limit exceeded') {
            const { retryAfterSeconds } = rateLimitErrorResponse(error);

            return NextResponse.json(
                { error: 'Rate limit exceeded' },
                { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
            );
        }
        throw error;
    }

    const db = await getDb();
    const [asset] = await db
        .select({
            id: mediaAssets.id,
            status: mediaAssets.status,
            storageBucket: mediaAssets.storageBucket,
            storagePath: mediaAssets.storagePath,
            metadata: mediaAssets.metadata,
        })
        .from(mediaAssets)
        .where(eq(mediaAssets.id, assetId))
        .limit(1);

    if (!asset) {
        return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    if (asset.status !== 'ready' || !asset.storageBucket || !asset.storagePath) {
        return NextResponse.json({ error: 'Media unavailable' }, { status: 404 });
    }

    if (!isAllowedStorageObject(asset.storageBucket, asset.storagePath)) {
        return NextResponse.json({ error: 'Media unavailable' }, { status: 404 });
    }

    const bucket = await getMediaBucket();
    const rangeOption = parseRangeHeader(request.headers.get('range'));
    const obj = await bucket.get(
        asset.storagePath,
        rangeOption ? { range: rangeOption } : undefined,
    );

    if (!obj) {
        return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    const headers = r2ResponseHeaders(obj.httpMetadata?.contentType, obj.httpEtag, asset.metadata);

    if (obj.range) {
        const { offset, length } = obj.range;
        const end = offset + length - 1;
        headers.set('content-range', `bytes ${offset}-${end}/${obj.size}`);
        headers.set('content-length', String(length));

        return new Response(obj.body, { status: 206, headers });
    }
    headers.set('content-length', String(obj.size));

    return new Response(obj.body, { status: 200, headers });
}

function parseRangeHeader(
    value: string | null,
): { offset?: number; length?: number; suffix?: number } | null {
    if (!value) {
        return null;
    }
    const match = /^bytes=(\d*)-(\d*)$/.exec(value.trim());

    if (!match) {
        return null;
    }
    const [, startRaw, endRaw] = match;

    if (startRaw === '' && endRaw === '') {
        return null;
    }

    if (startRaw === '') {
        return { suffix: Number(endRaw) };
    }
    const offset = Number(startRaw);

    if (endRaw === '') {
        return { offset };
    }

    return { offset, length: Number(endRaw) - offset + 1 };
}

export async function HEAD(request: Request, context: RouteContext) {
    const response = await GET(request, context);

    return new Response(null, { status: response.status, headers: response.headers });
}

async function isMediaRequestAllowed(request: Request) {
    try {
        await requireAdmin();

        return true;
    } catch {
        const { searchParams } = new URL(request.url);

        return isOutputRequestAllowed({ token: searchParams.get('token') ?? undefined });
    }
}

function r2ResponseHeaders(
    contentType: string | undefined,
    etag: string,
    metadata: unknown,
): Headers {
    const headers = new Headers();
    const resolvedContentType = contentType ?? metadataValue(metadata, 'mime_type');

    if (resolvedContentType) {
        headers.set('content-type', resolvedContentType);
    }
    headers.set('etag', etag);
    headers.set('accept-ranges', 'bytes');
    headers.set('cache-control', 'private, max-age=3600');

    return headers;
}

function metadataValue(metadata: unknown, key: string) {
    if (!metadata || typeof metadata !== 'object') {
        return '';
    }
    const value = (metadata as Record<string, unknown>)[key];

    return typeof value === 'string' ? value : '';
}

function isAllowedStorageObject(bucket: string, path: string) {
    return bucket === SMALL_MEDIA_BUCKET && Boolean(path) && !path.includes('..');
}
