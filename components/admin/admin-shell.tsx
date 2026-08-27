import { CircleUserRound, MonitorPlay, RadioTower, Tv } from 'lucide-react';
import { headers } from 'next/headers';
import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AdminNav } from '@/components/admin/admin-nav';
import { getBroadcastStatus } from '@/lib/admin/broadcast-status';
import { requireAdmin, revokeCurrentOperatorSession, safeAdminReturnTo } from '@/lib/auth/auth';
import { PRODUCT_DESCRIPTOR, PRODUCT_NAME } from '@/lib/brand';
import { formatPlayoutTimeLabel } from '@/lib/helpers/time';

import type { ReactNode } from 'react';

export async function AdminShell({
    title,
    description,
    actions,
    children,
}: {
    title: string;
    description?: string;
    actions?: ReactNode;
    children: ReactNode;
}) {
    const requestHeaders = await headers();
    const returnTo = safeAdminReturnTo(requestHeaders.get('x-broadcast-planner-current-path'));
    const session = await requireAdmin().catch((error) => {
        if (error instanceof Error && error.message === 'Unauthorized') {
            redirect(`/admin/login?return_to=${encodeURIComponent(returnTo)}`);
        }
        throw error;
    });
    const status = await getBroadcastStatus();

    async function logout() {
        'use server';
        await revokeCurrentOperatorSession();
        redirect('/admin/login?logged_out=1');
    }

    return (
        <div className="min-h-screen bg-panel text-ink">
            <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 border-r border-line bg-panel px-4 py-5 lg:block">
                <Link
                    href="/admin"
                    className="flex items-center gap-3 rounded px-2 py-2 text-base font-semibold hover:bg-panel-soft"
                >
                    <span className="grid h-9 w-9 place-items-center rounded bg-accent-positive text-panel">
                        <Tv size={18} aria-hidden="true" />
                    </span>
                    <span>
                        <span className="block font-display leading-tight">{PRODUCT_NAME}</span>
                        <span className="technical-label mt-1 block text-muted">
                            {PRODUCT_DESCRIPTOR}
                        </span>
                    </span>
                </Link>
                <AdminNav />
                <div className="absolute bottom-5 left-4 right-4 border-t border-line pt-4 text-xs text-muted">
                    <div className="flex items-center gap-2">
                        <CircleUserRound size={22} className="text-accent-positive" />
                        <div className="min-w-0">
                            <p className="truncate font-semibold text-ink">{session.displayName}</p>
                            <p className="technical-label mt-0.5 truncate text-muted">
                                {session.handle} · {session.role}
                            </p>
                        </div>
                    </div>
                    <div className="mt-3 flex flex-wrap gap-2">
                        <Link
                            href="/admin/output"
                            className="inline-flex min-h-8 items-center gap-2 rounded border border-line bg-surface px-2 font-semibold text-ink hover:border-line-strong"
                        >
                            <MonitorPlay size={14} aria-hidden="true" />
                            Open output
                        </Link>
                        <form action={logout}>
                            <button className="inline-flex min-h-8 items-center rounded border border-line bg-surface px-2 font-semibold text-ink hover:border-line-strong">
                                Logout
                            </button>
                        </form>
                    </div>
                </div>
            </aside>
            <main className="min-w-0 lg:pl-64">
                <header className="sticky top-0 z-30 border-b border-line bg-panel/95 px-4 backdrop-blur lg:px-5">
                    <div className="flex min-h-16 items-center justify-between gap-3">
                        <div className="min-w-0">
                            <div className="flex items-center gap-3">
                                <AdminNav mobile />
                                <h1 className="truncate font-display text-xl font-semibold tracking-tight">
                                    {title}
                                </h1>
                            </div>
                            {description ? (
                                <p className="mt-0.5 hidden max-w-3xl truncate text-xs text-muted md:block lg:text-sm">
                                    {description}
                                </p>
                            ) : null}
                        </div>
                        <div className="flex min-w-0 items-center gap-2">
                            <div
                                className={[
                                    'hidden min-h-8 items-center gap-2 rounded border px-3 sm:flex',
                                    status.activeTitle
                                        ? 'border-danger-line bg-danger-soft text-danger-strong'
                                        : 'border-success-line bg-success-soft text-success-strong',
                                ].join(' ')}
                            >
                                <span
                                    className={[
                                        'h-2 w-2 rounded-full',
                                        status.activeTitle ? 'bg-danger' : 'bg-success',
                                    ].join(' ')}
                                />
                                <span className="technical-label">
                                    {status.activeTitle ? 'On air' : 'Standby'}
                                </span>
                            </div>
                            {actions ? (
                                <div className="flex min-w-0 flex-wrap items-center gap-2">
                                    {actions}
                                </div>
                            ) : null}
                        </div>
                    </div>
                </header>
                <BroadcastStatusStrip status={status} />
                <div className="admin-grid min-h-[calc(100vh-105px)] min-w-0 p-3 sm:p-4 xl:p-5">
                    {children}
                </div>
            </main>
        </div>
    );
}

function BroadcastStatusStrip({
    status,
}: {
    status: Awaited<ReturnType<typeof getBroadcastStatus>>;
}) {
    const healthTone =
        status.health === 'ok'
            ? 'text-success'
            : status.health === 'fail'
              ? 'text-danger'
              : 'text-warn';

    return (
        <section className="border-b border-line bg-surface px-4 py-1.5 lg:px-5">
            <div className="flex min-h-8 flex-nowrap items-center gap-x-4 overflow-x-auto text-xs">
                <RadioTower
                    size={14}
                    className="shrink-0 text-accent-positive"
                    aria-hidden="true"
                />
                <StatusItem
                    label="Now"
                    value={
                        status.ok
                            ? (status.activeTitle ?? 'Nothing scheduled')
                            : 'Status unavailable'
                    }
                    tone={status.activeTitle ? 'ok' : 'warn'}
                />
                <StatusItem
                    label="Next"
                    value={
                        status.nextTitle && status.nextSeconds !== null
                            ? `${formatPlayoutTimeLabel(status.nextSeconds)} · ${status.nextTitle}`
                            : 'No next block'
                    }
                    tone={status.nextTitle ? 'neutral' : 'warn'}
                />
                <StatusItem
                    label="Fallback"
                    value={status.fallbackTitle ?? 'Missing'}
                    tone={status.fallbackTitle ? 'ok' : 'warn'}
                />
                <div className="ml-auto flex min-w-fit items-center gap-3 font-semibold uppercase text-muted">
                    <span className={healthTone}>Health {status.health}</span>
                    <span>Day {status.dayStatus}</span>
                </div>
            </div>
        </section>
    );
}

function StatusItem({
    label,
    value,
    tone,
}: {
    label: string;
    value: string;
    tone: 'neutral' | 'ok' | 'warn';
}) {
    const toneClass = tone === 'ok' ? 'text-success' : tone === 'warn' ? 'text-warn' : 'text-ink';

    return (
        <div className="flex min-w-0 items-center gap-1.5">
            <p className="font-bold uppercase text-muted">{label}</p>
            <p className={`max-w-[22rem] truncate font-semibold ${toneClass}`}>{value}</p>
        </div>
    );
}
