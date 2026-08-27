import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';
import { RadioTower, ShieldCheck } from 'lucide-react';

import {
    ADMIN_BOOTSTRAP_COOKIE,
    ADMIN_SESSION_COOKIE,
    createOperatorSession,
    getCurrentOperatorSession,
    hashSecret,
    isAdminTokenValid,
    safeAdminReturnTo,
} from '@/lib/auth/auth';
import { PRODUCT_DESCRIPTOR, PRODUCT_NAME } from '@/lib/brand';
import { assertRateLimit } from '@/lib/auth/rate-limit';
import { loginSchema } from '@/lib/schemas';

export default async function LoginPage({
    searchParams,
}: {
    searchParams: Promise<{ error?: string; logged_out?: string; return_to?: string }>;
}) {
    const params = await searchParams;
    const returnTo = safeAdminReturnTo(params.return_to);

    if (await getCurrentOperatorSession()) {
        redirect(returnTo);
    }
    const t = await getTranslations('login');

    async function login(formData: FormData) {
        'use server';
        const parsed = loginSchema.safeParse({
            handle: String(formData.get('handle') ?? '').trim() || undefined,
            token: formData.get('token') ?? '',
        });
        const formReturnTo = safeAdminReturnTo(String(formData.get('return_to') ?? ''));

        let session: Awaited<ReturnType<typeof createOperatorSession>> = null;

        try {
            if (parsed.success) {
                const handle = parsed.data.handle?.trim().toLowerCase() || 'bootstrap';
                await assertRateLimit({
                    scope: `login:${handle === 'bootstrap' ? handle : hashSecret(handle)}`,
                    limit: 10,
                    windowSeconds: 60,
                });
                session = await createOperatorSession({
                    ...(parsed.data.handle ? { handle: parsed.data.handle } : {}),
                    token: parsed.data.token,
                });
            }
        } catch (error) {
            if (error instanceof Error && error.message === 'Rate limit exceeded') {
                redirect(`/admin/login?error=rate&return_to=${encodeURIComponent(formReturnTo)}`);
            }
            console.error('[app/admin/login] auth backend error', error);
            redirect(`/admin/login?error=backend&return_to=${encodeURIComponent(formReturnTo)}`);
        }

        if (!parsed.success || !session) {
            redirect(`/admin/login?error=1&return_to=${encodeURIComponent(formReturnTo)}`);
        }
        const cookieStore = await cookies();
        const secureCookie =
            process.env.NODE_ENV === 'production' &&
            Boolean(process.env.NEXT_PUBLIC_APP_BASE_URL?.startsWith('https://'));

        if (session.session.operatorId === 'bootstrap' && isAdminTokenValid(parsed.data.token)) {
            cookieStore.set(ADMIN_BOOTSTRAP_COOKIE, parsed.data.token, {
                httpOnly: true,
                sameSite: 'lax',
                secure: secureCookie,
                path: '/',
                maxAge: 60 * 60 * 12,
            });
        } else {
            cookieStore.delete(ADMIN_BOOTSTRAP_COOKIE);
        }
        cookieStore.set(ADMIN_SESSION_COOKIE, session.token, {
            httpOnly: true,
            sameSite: 'lax',
            secure: secureCookie,
            path: '/',
            maxAge: 60 * 60 * 12,
        });
        redirect(formReturnTo);
    }

    return (
        <main className="grid min-h-screen bg-panel lg:grid-cols-[minmax(0,1.25fr)_minmax(420px,0.75fr)]">
            <section className="admin-grid relative hidden overflow-hidden border-r border-line p-12 lg:flex lg:flex-col lg:justify-between">
                <div>
                    <div className="inline-flex items-center gap-3">
                        <span className="grid h-10 w-10 place-items-center rounded bg-accent-positive text-panel">
                            <RadioTower size={20} />
                        </span>
                        <div>
                            <p className="font-display text-lg font-semibold">{PRODUCT_NAME}</p>
                            <p className="technical-label text-muted">{PRODUCT_DESCRIPTOR}</p>
                        </div>
                    </div>
                </div>
                <div className="max-w-2xl">
                    <p className="technical-label text-accent-positive">Operator access</p>
                    <h1 className="mt-4 font-display text-5xl font-semibold leading-[1.05] tracking-tight">
                        Precision starts before the signal goes live.
                    </h1>
                    <p className="mt-5 max-w-xl text-base leading-7 text-muted">
                        Secure control for programming, media verification and browser playout.
                    </p>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted">
                    <ShieldCheck size={17} className="text-success" />
                    Authenticated operator sessions · audited critical actions
                </div>
            </section>
            <section className="grid place-items-center bg-surface px-6 py-12">
                <form
                    action={login}
                    className="w-full max-w-sm border border-line bg-surface-elevated-2 p-6"
                >
                    <p className="technical-label text-accent-positive">{t('eyebrow')}</p>
                    <h2 className="mt-2 font-display text-2xl font-semibold">{t('title')}</h2>
                    <p className="mt-2 text-sm leading-6 text-muted">{t('body')}</p>
                    <label className="mt-6 block text-sm font-medium">
                        Operator handle
                        <input
                            name="handle"
                            className="mt-2 w-full border border-line px-3 py-2"
                            placeholder="operator"
                            autoComplete="username"
                        />
                        <span className="mt-1 block text-xs text-muted">
                            Leave blank only for emergency bootstrap-token login.
                        </span>
                    </label>
                    <label className="mt-6 block text-sm font-medium">
                        {t('tokenLabel')}
                        <input
                            name="token"
                            type="password"
                            className="mt-2 w-full border border-line px-3 py-2"
                            autoComplete="current-password"
                        />
                    </label>
                    <input type="hidden" name="return_to" value={returnTo} />
                    <LoginNotice params={params} errorText={t('errorInvalid')} />
                    <button className="btn-primary mt-5 w-full">{t('submit')}</button>
                </form>
            </section>
        </main>
    );
}

function LoginNotice({
    params,
    errorText,
}: {
    params: { error?: string; logged_out?: string };
    errorText: string;
}) {
    if (params.logged_out) {
        return (
            <p className="mt-3 rounded-md border border-accent-positive/40 bg-surface-selected-positive px-3 py-2 text-sm text-accent-positive">
                Signed out.
            </p>
        );
    }

    if (!params.error) {
        return null;
    }

    if (params.error === 'rate') {
        return (
            <p className="mt-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong">
                Too many attempts. Wait a minute and try again.
            </p>
        );
    }

    if (params.error === 'backend') {
        return (
            <p className="mt-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong">
                Login service is temporarily unavailable. Check server configuration and try again.
            </p>
        );
    }

    return (
        <p className="mt-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong">
            {errorText}
        </p>
    );
}
