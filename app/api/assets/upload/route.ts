import { NextResponse } from 'next/server';

import { appUrl } from '@/lib/helpers/app-url';
import { requireAdmin } from '@/lib/auth/auth';
import { CSRF_FIELD, verifyCsrfTokenValue } from '@/lib/auth/csrf';
import { uploadedMediaFieldsFromForm, uploadMediaFile } from '@/lib/helpers/media-upload';
import { assertRateLimit, rateLimitErrorResponse } from '@/lib/auth/rate-limit';
import { uploadAssetFormSchema } from '@/lib/schemas';

export async function POST(request: Request) {
    try {
        await requireAdmin();
        await assertRateLimit({
            scope: 'api:assets:upload',
            request,
            limit: 100,
            windowSeconds: 60,
        });
        const form = await request.formData();
        await verifyCsrfTokenValue(form.get(CSRF_FIELD));
        const parsed = uploadAssetFormSchema.safeParse({
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
        const { media_file: file, return_to: returnToRaw } = parsed.data;
        const returnTo = returnToRaw || '/admin/assets?uploaded=1';
        const uploaded = await uploadMediaFile(file, uploadedMediaFieldsFromForm(form));

        if (wantsJson(request)) {
            return NextResponse.json({
                ok: true,
                assetId: uploaded.assetId,
                url: uploaded.url,
                title: uploaded.title,
                durationSeconds: uploaded.durationSeconds,
            });
        }

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

function wantsJson(request: Request) {
    return request.headers.get('accept')?.includes('application/json') ?? false;
}
