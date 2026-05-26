import { NextResponse } from 'next/server';

import { appUrl } from '@/lib/app-url';
import { requireAdmin } from '@/lib/auth';
import { CSRF_FIELD, verifyCsrfTokenValue } from '@/lib/csrf';
import { uploadedMediaFieldsFromForm, uploadMediaFile } from '@/lib/media-upload';
import { createProgramBlock } from '@/lib/mutations';
import { assertRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { uploadScheduleFormSchema } from '@/lib/schemas';

export async function POST(request: Request) {
    try {
        await requireAdmin();
        await assertRateLimit({
            scope: 'api:assets:upload-schedule',
            request,
            limit: 20,
            windowSeconds: 60,
        });
        const form = await request.formData();
        await verifyCsrfTokenValue(form.get(CSRF_FIELD));
        const parsed = uploadScheduleFormSchema.safeParse({
            media_file: form.get('media_file') ?? form.get('video_file'),
            date: form.get('date'),
            start_time: form.get('start_time'),
            hide_overlays: form.get('hide_overlays'),
            return_to: form.get('return_to'),
        });

        if (!parsed.success) {
            return NextResponse.json(
                {
                    ok: false,
                    error: parsed.error.flatten().formErrors.join(', ') || 'Invalid input',
                },
                { status: 400 },
            );
        }
        const {
            media_file: file,
            date,
            start_time: startTime,
            hide_overlays: hideOverlays,
            return_to: returnToRaw,
        } = parsed.data;

        const uploaded = await uploadMediaFile(file, uploadedMediaFieldsFromForm(form));
        const created = await createProgramBlock({
            date,
            title: uploaded.title,
            blockType: blockTypeFor(uploaded.assetType, uploaded.mediaKind),
            assetId: uploaded.assetId,
            startTime,
            durationSeconds: uploaded.durationSeconds,
            hideOverlays,
        });

        const returnTo = returnToRaw || `/admin/schedule/${date}?uploaded=1&created=${created.id}`;

        return NextResponse.redirect(appUrl(returnTo), 303);
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

        if (isUnreadableMultipartError(error)) {
            return NextResponse.json(
                {
                    ok: false,
                    error: 'Upload request could not be read. Keep browser uploads under 95 MB, or use Vimeo/remote URL for larger videos.',
                },
                { status: 413 },
            );
        }

        return NextResponse.json({ ok: false, error: String(error) }, { status: 400 });
    }
}

function isUnreadableMultipartError(error: unknown) {
    return error instanceof TypeError && error.message.includes('Failed to parse body as FormData');
}

function blockTypeFor(assetType: string, mediaKind: string) {
    if (assetType === 'ad' || assetType === 'promo' || assetType === 'fallback') {
        return assetType;
    }

    if (mediaKind === 'image') {
        return 'image';
    }

    return 'video';
}
