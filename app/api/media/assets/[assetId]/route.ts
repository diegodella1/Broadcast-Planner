import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/auth';
import { isOutputRequestAllowed, outputAccessDeniedReason } from '@/lib/output-auth';
import { assertRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { SMALL_MEDIA_BUCKET } from '@/lib/media-upload-constants';
import { createServiceClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const MEDIA_ASSET_ID_PATTERN =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const STORAGE_FETCH_TIMEOUT_MS = 15_000;
const SIMPLE_RANGE_PATTERN = /^bytes=[0-9]*-[0-9]*$/;

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

    const supabase = createServiceClient();
    const { data: asset, error } = await supabase
        .from('media_assets')
        .select('id,status,storage_bucket,storage_path,metadata')
        .eq('id', assetId)
        .single();

    if (error || !asset) {
        return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    if (asset.status !== 'ready' || !asset.storage_bucket || !asset.storage_path) {
        return NextResponse.json({ error: 'Media unavailable' }, { status: 404 });
    }

    if (!isAllowedStorageObject(String(asset.storage_bucket), String(asset.storage_path))) {
        return NextResponse.json({ error: 'Media unavailable' }, { status: 404 });
    }

    const upstream = await fetchStorageObject({
        bucket: String(asset.storage_bucket),
        path: String(asset.storage_path),
        range: validRangeHeader(request.headers.get('range')),
    });

    if (upstream.status === 404) {
        return NextResponse.json({ error: 'Media not found' }, { status: 404 });
    }

    if (!upstream.ok && upstream.status !== 206) {
        return NextResponse.json({ error: 'Media unavailable' }, { status: upstream.status });
    }

    const headers = responseHeaders(upstream.headers, asset.metadata);

    return new Response(upstream.body, { status: upstream.status, headers });
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

async function fetchStorageObject({
    bucket,
    path,
    range,
}: {
    bucket: string;
    path: string;
    range: string | null;
}) {
    const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!baseUrl || !key) {
        throw new Error('Missing Supabase service environment');
    }
    const url = new URL(
        `/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`,
        baseUrl,
    );
    const headers: Record<string, string> = {
        apikey: key,
        Authorization: `Bearer ${key}`,
    };

    if (range) {
        headers.Range = range;
    }
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), STORAGE_FETCH_TIMEOUT_MS);

    try {
        return await fetch(url, { headers, cache: 'no-store', signal: controller.signal });
    } finally {
        clearTimeout(timeout);
    }
}

function responseHeaders(upstream: Headers, metadata: unknown) {
    const headers = new Headers();
    copyHeader(upstream, headers, 'content-type');
    copyHeader(upstream, headers, 'content-length');
    copyHeader(upstream, headers, 'content-range');
    copyHeader(upstream, headers, 'accept-ranges');
    copyHeader(upstream, headers, 'etag');
    copyHeader(upstream, headers, 'last-modified');

    if (!headers.has('content-type')) {
        const mimeType = metadataValue(metadata, 'mime_type');

        if (mimeType) {
            headers.set('content-type', mimeType);
        }
    }

    if (!headers.has('accept-ranges')) {
        headers.set('accept-ranges', 'bytes');
    }
    headers.set('cache-control', 'private, max-age=3600');

    return headers;
}

function copyHeader(from: Headers, to: Headers, name: string) {
    const value = from.get(name);

    if (value) {
        to.set(name, value);
    }
}

function metadataValue(metadata: unknown, key: string) {
    if (!metadata || typeof metadata !== 'object') {
        return '';
    }
    const value = (metadata as Record<string, unknown>)[key];

    return typeof value === 'string' ? value : '';
}

function encodeStoragePath(path: string) {
    return path
        .split('/')
        .filter(Boolean)
        .map((part) => encodeURIComponent(part))
        .join('/');
}

function isAllowedStorageObject(bucket: string, path: string) {
    return bucket === SMALL_MEDIA_BUCKET && Boolean(path) && !path.includes('..');
}

function validRangeHeader(range: string | null) {
    if (!range) {
        return null;
    }
    const normalized = range.trim();

    return SIMPLE_RANGE_PATTERN.test(normalized) ? normalized : null;
}
