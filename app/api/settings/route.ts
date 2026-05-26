import { NextResponse } from 'next/server';

import { appUrl } from '@/lib/helpers/app-url';
import { requireAdmin } from '@/lib/auth/auth';
import { verifyCsrfToken } from '@/lib/auth/csrf';
import { assertRateLimit, rateLimitErrorResponse } from '@/lib/auth/rate-limit';
import { updateVimeoSettingsSchema } from '@/lib/schemas';
import { saveVimeoSettings } from '@/lib/settings';

export async function POST(request: Request) {
    try {
        await requireAdmin();
        await assertRateLimit({ scope: 'api:settings', request, limit: 10, windowSeconds: 60 });
        await verifyCsrfToken(request);
        const form = await request.formData();
        const parsed = updateVimeoSettingsSchema.safeParse({
            vimeo_token: form.get('vimeo_token'),
            vimeo_folder_uri: form.get('vimeo_folder_uri'),
            timezone: form.get('timezone'),
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
        const { vimeo_token: token, vimeo_folder_uri: folderUri, timezone } = parsed.data;
        await saveVimeoSettings({
            ...(token !== undefined ? { token } : {}),
            ...(folderUri !== undefined ? { folderUri } : {}),
            ...(timezone !== undefined ? { timezone } : {}),
        });

        return NextResponse.redirect(appUrl('/admin/settings?saved=1'), 303);
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

        return NextResponse.json({ ok: false, error: String(error) }, { status: 500 });
    }
}
