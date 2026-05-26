import { NextResponse } from 'next/server';

import { appUrl } from '@/lib/app-url';
import { requireAdmin } from '@/lib/auth';
import { CSRF_FIELD, verifyCsrfTokenValue } from '@/lib/csrf';
import { uploadMediaFile } from '@/lib/media-upload';
import { attachGuestMediaAsset } from '@/lib/mutations';
import { assertRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { uploadGuestFormSchema } from '@/lib/schemas';

export async function POST(request: Request) {
    try {
        await requireAdmin();
        await assertRateLimit({
            scope: 'api:guests:upload',
            request,
            limit: 30,
            windowSeconds: 60,
        });
        const form = await request.formData();
        await verifyCsrfTokenValue(form.get(CSRF_FIELD));
        const parsed = uploadGuestFormSchema.safeParse({
            guest_id: form.get('guest_id'),
            kind: form.get('kind'),
            media_file: form.get('media_file') ?? form.get('video_file'),
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
        const { guest_id: guestId, kind, media_file: file, return_to: returnToRaw } = parsed.data;

        const title = String(form.get('title') || file.name || 'Guest media').trim();
        const uploaded = await uploadMediaFile(file, {
            title,
            assetType: kind === 'photo' ? 'image' : 'video',
            orientation: String(form.get('orientation') || 'auto'),
            durationSeconds: form.get('duration_seconds') as string | null,
            detectedDurationSeconds: form.get('detected_duration_seconds') as string | null,
            detectedWidth: form.get('detected_width') as string | null,
            detectedHeight: form.get('detected_height') as string | null,
        });
        await attachGuestMediaAsset({
            guestId,
            kind,
            assetId: uploaded.assetId,
            url: uploaded.url,
        });

        const returnTo = returnToRaw || '/admin/guests?uploaded=1';

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
                    error: 'Upload request could not be read. Keep browser uploads under 95 MB, or use URL for larger files.',
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
