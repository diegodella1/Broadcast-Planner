import { NextResponse } from 'next/server';

import { appUrl } from '@/lib/app-url';
import { recordAuditEvent } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth';
import { verifyCsrfToken } from '@/lib/csrf';
import { assertRateLimit, rateLimitErrorResponse } from '@/lib/rate-limit';
import { syncVimeoCatalogSchema } from '@/lib/schemas';
import { getVimeoSettings, getVimeoToken, recordVimeoSyncStatus } from '@/lib/settings';
import { syncVimeoCatalog } from '@/lib/vimeo';

export async function POST(request: Request) {
    try {
        await requireAdmin();
        await assertRateLimit({ scope: 'api:vimeo:sync', request, limit: 10, windowSeconds: 60 });
        await verifyCsrfToken(request);
        const form = await request.formData().catch(() => new FormData());
        const parsed = syncVimeoCatalogSchema.safeParse({
            return_to: form.get('return_to'),
            scope_uri: form.get('scope_uri'),
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
        const returnTo = parsed.data.return_to;
        const requestedScope = parsed.data.scope_uri;
        const [token, settings] = await Promise.all([getVimeoToken(), getVimeoSettings()]);

        if (!token) {
            await recordVimeoSyncStatus({
                status: 'invalid',
                errorMessage: 'Missing Vimeo token',
            });

            return NextResponse.json({ ok: false, error: 'Missing Vimeo token' }, { status: 400 });
        }

        const configuredScope = String(settings?.publicConfig.folder_uri ?? '');
        const result = await syncVimeoCatalog(
            token,
            requestedScope || configuredScope || undefined,
        );
        await recordVimeoSyncStatus({ status: 'connected', ...result });
        await recordAuditEvent({
            actor: 'vimeo-sync',
            action: 'vimeo.sync',
            entityType: 'media_assets',
            result: result.failedCount ? 'failure' : 'success',
            metadata: {
                scope_uri: requestedScope || configuredScope || null,
                synced_count: result.syncedCount,
                stale_count: result.staleCount,
                failed_count: result.failedCount,
                readiness_checked_count: result.readinessCheckedCount ?? 0,
            },
        });

        if (returnTo) {
            return NextResponse.redirect(
                appUrl(
                    `${returnTo}${returnTo.includes('?') ? '&' : '?'}synced=1&count=${result.syncedCount}`,
                ),
                303,
            );
        }

        return NextResponse.json({ ok: true, ...result });
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
        const message = errorMessage(error);
        await recordAuditEvent({
            actor: 'vimeo-sync',
            action: 'vimeo.sync',
            entityType: 'media_assets',
            result: 'failure',
            metadata: { error: message },
        }).catch(() => undefined);
        await recordVimeoSyncStatus({
            status: 'failed',
            errorMessage: message,
        }).catch(() => undefined);

        return NextResponse.json({ ok: false, error: message }, { status: 500 });
    }
}

function errorMessage(error: unknown) {
    if (error instanceof Error) {
        return error.message;
    }

    if (typeof error === 'object' && error !== null) {
        return JSON.stringify(error);
    }

    return String(error);
}
