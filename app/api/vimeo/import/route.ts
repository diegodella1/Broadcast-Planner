import { NextResponse } from 'next/server';

import { appUrl } from '@/lib/app-url';
import { requireAdmin } from '@/lib/auth';
import { verifyCsrfToken } from '@/lib/csrf';
import { assertRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { getVimeoToken, markVimeoStatus, recordVimeoSyncStatus } from '@/lib/settings';
import { createServiceClient } from '@/lib/supabase/server';
import {
    checkVimeoAssetPlayback,
    getVimeoVideo,
    listVimeoAccountVideos,
    upsertVimeoVideos,
} from '@/lib/vimeo';

export async function POST(request: Request) {
    try {
        await requireAdmin();
        await assertRateLimit({ scope: 'api:vimeo:import', request, limit: 20, windowSeconds: 60 });
        await verifyCsrfToken(request);
        const form = await request.formData();
        const videoUri = normalizeVimeoUri(String(form.get('video_uri') ?? ''));
        const returnTo = String(form.get('return_to') ?? '');
        const token = await getVimeoToken();

        if (!token) {
            await markVimeoStatus('invalid', 'Missing Vimeo token');

            return NextResponse.json({ ok: false, error: 'Missing Vimeo token' }, { status: 400 });
        }

        const videos = videoUri
            ? [await getVimeoVideo(token, videoUri)]
            : await listVimeoAccountVideos(token);
        await upsertVimeoVideos(videos);
        const playback = videoUri ? await checkImportedPlayback(videos[0]?.uri ?? '', token) : null;
        await markVimeoStatus('connected');
        await recordVimeoSyncStatus({
            status: 'connected',
            syncedCount: videos.length,
            staleCount: 0,
            failedCount: 0,
        });

        return NextResponse.redirect(
            appUrl(importResultHref(returnTo || '/admin/assets', videos.length, playback)),
            303,
        );
    } catch (error) {
        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 });
        }

        if (error instanceof Error && error.message === 'Rate limit exceeded') {
            const { retryAfterSeconds } = rateLimitErrorResponse(error);

            return NextResponse.json(
                { ok: false, error: 'Rate limit exceeded' },
                { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } },
            );
        }
        await markVimeoStatus('failed', String(error)).catch(() => undefined);

        return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
}

function normalizeVimeoUri(value: string) {
    const trimmed = value.trim();

    if (!trimmed) {
        return '';
    }

    if (trimmed.startsWith('/videos/')) {
        return trimmed;
    }
    const match = trimmed.match(/(?:videos\/|vimeo\.com\/)(\d+)/);

    if (match?.[1]) {
        return `/videos/${match[1]}`;
    }

    if (/^\d+$/.test(trimmed)) {
        return `/videos/${trimmed}`;
    }

    return trimmed;
}

async function checkImportedPlayback(videoUri: string, token: string) {
    const vimeoId = videoUri.split('/').pop();

    if (!vimeoId) {
        return 'failed';
    }
    const supabase = createServiceClient();
    const { data, error } = await supabase
        .from('media_assets')
        .select('id')
        .eq('source_type', 'vimeo')
        .eq('vimeo_id', vimeoId)
        .maybeSingle();

    if (error || !data?.id) {
        return 'failed';
    }

    try {
        await checkVimeoAssetPlayback(String(data.id), token);

        return 'ready';
    } catch {
        return 'failed';
    }
}

function importResultHref(baseHref: string, count: number, playback: string | null) {
    const url = new URL(baseHref, 'http://local');
    url.searchParams.set('imported', '1');
    url.searchParams.set('count', String(count));

    if (playback) {
        url.searchParams.set('playback', playback);
    }

    return `${url.pathname}${url.search}`;
}
