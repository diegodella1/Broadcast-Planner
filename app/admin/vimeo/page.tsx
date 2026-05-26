import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AdminShell } from '@/components/admin/admin-shell';
import { EmptyState, Field, FilterLink, MetricTile, Notice } from '@/components/ui';
import { VimeoSyncControl } from '@/components/vimeo/vimeo-sync-control';
import { recordAuditEvent } from '@/lib/audit';
import { requireAdmin } from '@/lib/auth';
import { getCsrfToken } from '@/lib/csrf';
import { getAssets } from '@/lib/data';
import { getVimeoSettings, getVimeoToken } from '@/lib/settings';
import { checkVimeoAssetPlayback } from '@/lib/vimeo';

import type { MediaAsset } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function VimeoSyncPage({
    searchParams,
}: {
    searchParams: Promise<{
        q?: string;
        show_name?: string;
        month?: string;
        year?: string;
        status?: string;
        synced?: string;
        count?: string;
        playback?: string;
        error?: string;
        page?: string;
        page_size?: string;
    }>;
}) {
    const params = await searchParams;
    const [settings, token, assets, csrfToken] = await Promise.all([
        getVimeoSettings(),
        getVimeoToken(),
        getAssets(),
        getCsrfToken(),
    ]);
    const vimeoAssets = assets.filter((asset) => asset.sourceType === 'vimeo');
    const filteredAssets = vimeoAssets
        .filter((asset) => matchesVimeoFilters(asset, params))
        .sort((a, b) => newestFirst(a, b));
    const pageSize = pageSizeFromParam(params.page_size);
    const totalPages = Math.max(1, Math.ceil(filteredAssets.length / pageSize));
    const requestedPage = Number.parseInt(params.page ?? '1', 10);
    const currentPage = Math.min(
        Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1),
        totalPages,
    );
    const pageStart = (currentPage - 1) * pageSize;
    const pageEnd = pageStart + pageSize;
    const paginatedAssets = filteredAssets.slice(pageStart, pageEnd);
    const shows = uniqueShowNames(vimeoAssets);
    const readyCount = vimeoAssets.filter((asset) => asset.status === 'ready').length;
    const reviewCount = vimeoAssets.filter((asset) => asset.status !== 'ready').length;
    const lastSyncAt = textSetting(settings?.publicConfig.last_sync_at);
    const lastSyncCount = textSetting(settings?.publicConfig.last_sync_count);
    const staleCount = vimeoAssets.filter(
        (asset) => asset.metadata?.vimeo_sync_status === 'stale',
    ).length;
    async function checkPlayback(formData: FormData) {
        'use server';
        await requireAdmin();
        const assetId = String(formData.get('asset_id') || '');
        const token = await getVimeoToken();

        if (!token) {
            redirect(vimeoPlaybackResultHref('failed', 'Missing Vimeo token'));
        }
        let failureMessage: string | null = null;

        try {
            await checkVimeoAssetPlayback(assetId, token);
            await recordAuditEvent({
                actor: 'vimeo-sync',
                action: 'vimeo.playback_checked',
                entityType: 'media_assets',
                entityId: assetId,
            });
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            failureMessage = message;
            await recordAuditEvent({
                actor: 'vimeo-sync',
                action: 'vimeo.playback_checked',
                entityType: 'media_assets',
                entityId: assetId,
                result: 'failure',
                metadata: { error: message },
            }).catch(() => undefined);
        }
        redirect(
            failureMessage
                ? vimeoPlaybackResultHref('failed', failureMessage)
                : vimeoPlaybackResultHref('ready'),
        );
    }

    return (
        <AdminShell
            title="Vimeo Sync"
            description="Vimeo sync mirrors shows and episodes into Library Videos. Schedule playback from synced Library assets."
            actions={
                <Link className="btn-secondary" href="/admin/assets?kind=videos">
                    Open Videos
                </Link>
            }
        >
            {params.synced ? (
                <Notice tone="ok">
                    Vimeo sync complete. {params.count ? `${params.count} assets updated.` : null}
                </Notice>
            ) : null}
            {!token ? (
                <Notice tone="danger" title="Missing Vimeo token">
                    Add the Vimeo access token in Integrations before syncing.
                </Notice>
            ) : null}
            {settings?.lastError ? (
                <Notice tone="warn" title="Last Vimeo sync error">
                    {settings.lastError}
                </Notice>
            ) : null}
            {params.playback === 'ready' ? (
                <Notice tone="ok" title="Playback ready">
                    Vimeo playback URL resolved successfully.
                </Notice>
            ) : null}
            {params.playback === 'failed' ? (
                <Notice tone="danger" title="Playback check failed">
                    {params.error || 'Vimeo playback URL unavailable'}
                </Notice>
            ) : null}

            <section className="mb-5 grid gap-3 md:grid-cols-4">
                <MetricTile
                    label="Synced"
                    value={String(vimeoAssets.length)}
                    detail="Vimeo library assets"
                />
                <MetricTile
                    label="Ready"
                    value={String(readyCount)}
                    detail="Playable now"
                    tone="ok"
                />
                <MetricTile
                    label="Review"
                    value={String(reviewCount)}
                    detail="Syncing, failed or archived"
                    tone={reviewCount ? 'warn' : 'ok'}
                />
                <MetricTile
                    label="Stale"
                    value={String(staleCount)}
                    detail="Not seen in latest sync"
                    tone={staleCount ? 'warn' : 'neutral'}
                />
            </section>

            <section className="surface-panel mb-5 p-4">
                <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                        <h2 className="font-semibold">Sync status</h2>
                        <p className="mt-1 text-sm text-muted">
                            Last sync: {lastSyncAt || 'never'} · Last count: {lastSyncCount || '0'}{' '}
                            · Shows in library: {shows.length}
                        </p>
                    </div>
                    <VimeoSyncControl
                        csrfToken={csrfToken}
                        disabled={!token}
                        lastSyncCount={Number(lastSyncCount || vimeoAssets.length || 0)}
                        showsCount={shows.length}
                    />
                </div>
            </section>

            <section className="mb-4 rounded-lg border border-line bg-surface p-3">
                <form
                    className="mb-3 grid gap-3 md:grid-cols-[1fr_180px_120px_120px_140px_120px]"
                    action="/admin/vimeo"
                >
                    <Field label="Episode">
                        <input
                            name="q"
                            defaultValue={params.q ?? ''}
                            placeholder="Episode title"
                            className="border border-line px-3 py-2 text-sm font-normal text-ink"
                        />
                    </Field>
                    <Field label="Show">
                        <input
                            name="show_name"
                            defaultValue={params.show_name ?? ''}
                            placeholder="Show name"
                            list="vimeo-shows"
                            className="border border-line px-3 py-2 text-sm font-normal text-ink"
                        />
                        <datalist id="vimeo-shows">
                            {shows.map((show) => (
                                <option key={show} value={show} />
                            ))}
                        </datalist>
                    </Field>
                    <Field label="Month">
                        <select
                            name="month"
                            defaultValue={params.month ?? ''}
                            className="border border-line px-3 py-2 text-sm font-normal text-ink"
                        >
                            <option value="">Any</option>
                            {Array.from({ length: 12 }, (_, index) =>
                                String(index + 1).padStart(2, '0'),
                            ).map((month) => (
                                <option key={month} value={month}>
                                    {month}
                                </option>
                            ))}
                        </select>
                    </Field>
                    <Field label="Year">
                        <input
                            name="year"
                            defaultValue={params.year ?? ''}
                            placeholder="2026"
                            inputMode="numeric"
                            pattern="[0-9]{4}"
                            className="border border-line px-3 py-2 text-sm font-normal text-ink"
                        />
                    </Field>
                    <Field label="Status">
                        <select
                            name="status"
                            defaultValue={params.status ?? ''}
                            className="border border-line px-3 py-2 text-sm font-normal text-ink"
                        >
                            <option value="">Any</option>
                            <option value="ready">Ready</option>
                            <option value="syncing">Syncing</option>
                            <option value="failed">Failed</option>
                            <option value="archived">Archived</option>
                        </select>
                    </Field>
                    <Field label="Per page">
                        <select
                            name="page_size"
                            defaultValue={String(pageSize)}
                            className="border border-line px-3 py-2 text-sm font-normal text-ink"
                        >
                            <option value="10">10</option>
                            <option value="20">20</option>
                            <option value="50">50</option>
                        </select>
                    </Field>
                    <button className="btn-secondary self-end">Filter</button>
                </form>
                <div className="flex flex-wrap gap-2">
                    <FilterLink
                        href="/admin/vimeo"
                        active={!params.status && !params.q && !params.show_name}
                    >
                        All Vimeo
                    </FilterLink>
                    <FilterLink href="/admin/vimeo?status=ready" active={params.status === 'ready'}>
                        Ready
                    </FilterLink>
                    <FilterLink
                        href="/admin/vimeo?status=archived"
                        active={params.status === 'archived'}
                    >
                        Archived
                    </FilterLink>
                </div>
            </section>

            <div className="surface-panel overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3">
                    <div>
                        <h2 className="font-semibold">Synced Vimeo catalog</h2>
                        <p className="mt-1 text-sm text-muted">
                            Showing {filteredAssets.length ? pageStart + 1 : 0}-
                            {Math.min(pageEnd, filteredAssets.length)} of {filteredAssets.length}.
                            Use Schedule to place one on a programming day.
                        </p>
                    </div>
                    <Pagination params={params} currentPage={currentPage} totalPages={totalPages} />
                </div>
                <div className="divide-y divide-line">
                    {paginatedAssets.map((asset) => (
                        <VimeoAssetRow key={asset.id} asset={asset} checkPlayback={checkPlayback} />
                    ))}
                </div>
                {filteredAssets.length === 0 ? (
                    <div className="p-4">
                        <EmptyState title="No synced Vimeo assets">
                            Run Sync now, clear filters, or verify the Vimeo token in Integrations.
                        </EmptyState>
                    </div>
                ) : null}
                {filteredAssets.length > 0 ? (
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
                        <span>
                            Page {currentPage} of {totalPages}
                        </span>
                        <Pagination
                            params={params}
                            currentPage={currentPage}
                            totalPages={totalPages}
                        />
                    </div>
                ) : null}
            </div>
        </AdminShell>
    );
}

function Pagination({
    params,
    currentPage,
    totalPages,
}: {
    params: Record<string, string | undefined>;
    currentPage: number;
    totalPages: number;
}) {
    if (totalPages <= 1) {
        return null;
    }
    const pages = paginationWindow(currentPage, totalPages);

    return (
        <nav className="flex flex-wrap items-center gap-2" aria-label="Vimeo pagination">
            <PageLink href={vimeoPageHref(params, currentPage - 1)} disabled={currentPage <= 1}>
                Previous
            </PageLink>
            {pages.map((page) => (
                <PageLink
                    key={page}
                    href={vimeoPageHref(params, page)}
                    active={page === currentPage}
                >
                    {page}
                </PageLink>
            ))}
            <PageLink
                href={vimeoPageHref(params, currentPage + 1)}
                disabled={currentPage >= totalPages}
            >
                Next
            </PageLink>
        </nav>
    );
}

function PageLink({
    href,
    active,
    disabled,
    children,
}: {
    href: string;
    active?: boolean;
    disabled?: boolean;
    children: React.ReactNode;
}) {
    const className = active
        ? 'rounded-md border border-ink bg-ink px-3 py-1.5 text-sm font-semibold text-white'
        : disabled
          ? 'pointer-events-none rounded-md border border-line px-3 py-1.5 text-sm font-semibold text-muted opacity-50'
          : 'rounded-md border border-line px-3 py-1.5 text-sm font-semibold text-ink hover:bg-panel-soft';

    return (
        <Link href={href} aria-current={active ? 'page' : undefined} className={className}>
            {children}
        </Link>
    );
}

function paginationWindow(currentPage: number, totalPages: number) {
    const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);

    return Array.from({ length: end - start + 1 }, (_, index) => start + index);
}

function vimeoPageHref(params: Record<string, string | undefined>, page: number) {
    const query = new URLSearchParams();

    for (const key of ['q', 'show_name', 'month', 'year', 'status', 'page_size']) {
        const value = params[key];

        if (value) {
            query.set(key, value);
        }
    }

    if (page > 1) {
        query.set('page', String(page));
    }
    const text = query.toString();

    return `/admin/vimeo${text ? `?${text}` : ''}`;
}

function pageSizeFromParam(value?: string) {
    const parsed = Number.parseInt(value ?? '20', 10);

    return [10, 20, 50].includes(parsed) ? parsed : 20;
}

function VimeoAssetRow({
    asset,
    checkPlayback,
}: {
    asset: MediaAsset;
    checkPlayback: (formData: FormData) => Promise<void>;
}) {
    const showName = getMetadataText(asset, 'vimeo_show_name');
    const created = getMetadataText(asset, 'vimeo_created_time');
    const syncedAt = getMetadataText(asset, 'vimeo_last_synced_at');
    const thumbnail = asset.thumbnailUrl;

    return (
        <div className="grid gap-3 p-4 md:grid-cols-[120px_1fr_150px] md:items-center">
            {thumbnail ? (
                <img
                    src={thumbnail}
                    alt=""
                    className="aspect-video w-full rounded-md border border-line object-cover"
                />
            ) : (
                <div className="grid aspect-video place-items-center rounded-md border border-line bg-panel-soft text-xs font-semibold text-muted">
                    Vimeo
                </div>
            )}
            <div className="min-w-0">
                <p className="truncate font-semibold">{asset.title}</p>
                <p className="mt-1 text-sm text-muted">
                    {showName || 'No show'} · {asset.durationSeconds ?? 0}s ·{' '}
                    {formatVimeoDate(created)} · {asset.status}
                </p>
                <p className="mt-1 text-xs text-muted">Last synced {formatVimeoDate(syncedAt)}</p>
                <p className="mt-1 text-xs text-muted">
                    Playback: {asset.playbackReadinessStatus ?? 'unchecked'}
                    {asset.playbackCheckedAt
                        ? ` · checked ${formatVimeoDate(asset.playbackCheckedAt)}`
                        : ''}
                    {asset.playbackError ? ` · ${asset.playbackError}` : ''}
                </p>
            </div>
            <div className="grid gap-2">
                <form action={checkPlayback}>
                    <input type="hidden" name="asset_id" value={asset.id} />
                    <button className="btn-secondary w-full">Check playback</button>
                </form>
                <Link
                    className="btn-secondary"
                    href={`/admin/assets?kind=videos&q=${encodeURIComponent(asset.title)}#asset-${asset.id}`}
                >
                    Edit in Library
                </Link>
                <Link className="btn-primary" href="/admin/calendar">
                    Schedule this
                </Link>
            </div>
        </div>
    );
}

function matchesVimeoFilters(
    asset: MediaAsset,
    params: { q?: string; show_name?: string; month?: string; year?: string; status?: string },
) {
    const q = (params.q ?? '').trim().toLowerCase();
    const showName = (params.show_name ?? '').trim().toLowerCase();

    if (params.status && asset.status !== params.status) {
        return false;
    }

    if (q && !asset.title.toLowerCase().includes(q)) {
        return false;
    }

    if (showName && !getMetadataText(asset, 'vimeo_show_name').toLowerCase().includes(showName)) {
        return false;
    }

    if (!params.month && !params.year) {
        return true;
    }
    const date = parseVimeoDate(getMetadataText(asset, 'vimeo_created_time'));

    if (!date) {
        return false;
    }

    if (params.year && String(date.getUTCFullYear()) !== params.year) {
        return false;
    }

    if (params.month && String(date.getUTCMonth() + 1).padStart(2, '0') !== params.month) {
        return false;
    }

    return true;
}

function uniqueShowNames(assets: MediaAsset[]) {
    return [
        ...new Set(
            assets.map((asset) => getMetadataText(asset, 'vimeo_show_name')).filter(Boolean),
        ),
    ].sort();
}

function newestFirst(a: MediaAsset, b: MediaAsset) {
    return getMetadataText(b, 'vimeo_created_time').localeCompare(
        getMetadataText(a, 'vimeo_created_time'),
    );
}

function getMetadataText(asset: MediaAsset, key: string) {
    const value = asset.metadata?.[key];

    return typeof value === 'string' ? value : '';
}

function textSetting(value: unknown) {
    if (value === null || value === undefined) {
        return '';
    }

    return String(value);
}

function parseVimeoDate(value: string | undefined) {
    if (!value) {
        return null;
    }
    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? null : date;
}

function formatVimeoDate(value: string | undefined) {
    const date = parseVimeoDate(value);

    if (!date) {
        return 'no date';
    }

    return new Intl.DateTimeFormat('en', {
        year: 'numeric',
        month: 'short',
        day: '2-digit',
        timeZone: 'UTC',
    }).format(date);
}

function vimeoPlaybackResultHref(status: 'ready' | 'failed', error?: string) {
    const params = new URLSearchParams({ playback: status });

    if (error) {
        params.set('error', error.slice(0, 240));
    }

    return `/admin/vimeo?${params.toString()}`;
}
