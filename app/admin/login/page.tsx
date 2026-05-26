import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getTranslations } from 'next-intl/server';

import {
    ADMIN_SESSION_COOKIE,
    createOperatorSession,
    getCurrentOperatorSession,
    hashSecret,
    isAdminTokenValid,
    safeAdminReturnTo,
} from '@/lib/auth';
import { assertRateLimit } from '@/lib/rate-limit';
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

        if (parsed.success) {
            const handle = parsed.data.handle?.trim().toLowerCase() || 'bootstrap';
            await assertRateLimit({
                scope: `login:${handle === 'bootstrap' ? handle : hashSecret(handle)}`,
                limit: 10,
                windowSeconds: 60,
            });
        }
        const session = parsed.success
            ? await createOperatorSession({
                  ...(parsed.data.handle ? { handle: parsed.data.handle } : {}),
                  token: parsed.data.token,
              })
            : null;

        if (!parsed.success || !session) {
            redirect(`/admin/login?error=1&return_to=${encodeURIComponent(formReturnTo)}`);
        }
        const cookieStore = await cookies();
        const secureCookie =
            process.env.NODE_ENV === 'production' &&
            Boolean(process.env.NEXT_PUBLIC_APP_BASE_URL?.startsWith('https://'));

        if (session.session.operatorId === 'bootstrap' && isAdminTokenValid(parsed.data.token)) {
            cookieStore.set('rpm_admin_token', parsed.data.token, {
                httpOnly: true,
                sameSite: 'lax',
                secure: secureCookie,
                path: '/',
                maxAge: 60 * 60 * 12,
            });
        } else {
            cookieStore.delete('rpm_admin_token');
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
        <main className="grid min-h-screen place-items-center bg-panel px-6">
            <form action={login} className="surface-panel w-full max-w-sm p-6">
                <p className="eyebrow text-signal">{t('eyebrow')}</p>
                <h1 className="mt-2 text-2xl font-semibold">{t('title')}</h1>
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

    return (
        <p className="mt-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong">
            {errorText}
        </p>
    );
}
