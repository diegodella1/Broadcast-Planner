import { Film, FolderOpen, Link as LinkIcon, UploadCloud } from 'lucide-react';
import Link from 'next/link';

import { AdminShell } from '@/components/admin/admin-shell';
import { MediaUploadForm } from '@/components/media/media-upload-form';
import { PublicUrlAssetForm, RefreshAssetButton } from '@/components/media/public-url-asset-form';
import { ButtonLink, EmptyState, MetricTile, Notice } from '@/components/ui';
import { getAssets } from '@/lib/data';

import type { MediaAsset } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function AssetsPage({
    searchParams,
}: {
    searchParams: Promise<{
        q?: string;
        status?: string;
        source?: string;
        kind?: string;
        asset?: string;
        uploaded?: string;
    }>;
}) {
    const params = await searchParams;
    const assets = await getAssets();
    const query = params.q?.trim().toLowerCase() ?? '';
    const visibleAssets = assets.filter((asset) => {
        if (params.status && params.status !== 'all' && asset.status !== params.status) {
            return false;
        }

        if (params.source && params.source !== 'all' && asset.sourceType !== params.source) {
            return false;
        }

        if (params.kind && params.kind !== 'all' && asset.mediaKind !== params.kind) {
            return false;
        }

        return !query || searchableText(asset).includes(query);
    });
    const selectedAsset =
        visibleAssets.find((asset) => asset.id === params.asset) ?? visibleAssets[0] ?? null;
    const ready = assets.filter((asset) => asset.status === 'ready').length;
    const review = assets.filter((asset) => asset.status === 'needs_review').length;
    const stale = assets.filter((asset) => asset.metadataStatus === 'stale').length;

    return (
        <AdminShell
            title="Asset library"
            description="Search, verify and inspect every source before it reaches the rundown."
            actions={<ButtonLink href="#ingest">Ingest media</ButtonLink>}
        >
            {params.uploaded ? <Notice tone="ok">File uploaded and server-verified.</Notice> : null}

            <section className="mb-5 grid gap-3 md:grid-cols-3">
                <MetricTile
                    label="Ready"
                    value={String(ready)}
                    detail="Schedulable assets"
                    tone="ok"
                />
                <MetricTile
                    label="Needs review"
                    value={String(review)}
                    detail="Blocked from scheduling"
                    tone={review ? 'warn' : 'ok'}
                />
                <MetricTile
                    label="Stale metadata"
                    value={String(stale)}
                    detail="Last valid values preserved"
                    tone={stale ? 'warn' : 'ok'}
                />
            </section>

            <section className="grid min-h-[640px] overflow-hidden border border-line bg-panel xl:grid-cols-[220px_minmax(0,1fr)_320px]">
                <aside className="border-b border-line bg-surface xl:border-b-0 xl:border-r">
                    <div className="border-b border-line px-4 py-3">
                        <p className="technical-label text-muted">Library facets</p>
                    </div>
                    <FacetGroup title="Status">
                        <FacetLink
                            href={assetHref(params, { status: 'all' })}
                            active={!params.status || params.status === 'all'}
                            label="All assets"
                            count={assets.length}
                        />
                        <FacetLink
                            href={assetHref(params, { status: 'ready' })}
                            active={params.status === 'ready'}
                            label="Ready"
                            count={ready}
                        />
                        <FacetLink
                            href={assetHref(params, { status: 'needs_review' })}
                            active={params.status === 'needs_review'}
                            label="Needs review"
                            count={review}
                        />
                    </FacetGroup>
                    <FacetGroup title="Media">
                        <FacetLink
                            href={assetHref(params, { kind: 'video' })}
                            active={params.kind === 'video'}
                            label="Video"
                        />
                        <FacetLink
                            href={assetHref(params, { kind: 'image' })}
                            active={params.kind === 'image'}
                            label="Images"
                        />
                        <FacetLink
                            href={assetHref(params, { kind: 'audio' })}
                            active={params.kind === 'audio'}
                            label="Audio"
                        />
                    </FacetGroup>
                    <FacetGroup title="Source">
                        <FacetLink
                            href={assetHref(params, { source: 'uploaded' })}
                            active={params.source === 'uploaded'}
                            label="Uploaded"
                        />
                        <FacetLink
                            href={assetHref(params, { source: 'public_url' })}
                            active={params.source === 'public_url'}
                            label="Public URL"
                        />
                    </FacetGroup>
                </aside>

                <section className="min-w-0 border-b border-line xl:border-b-0 xl:border-r">
                    <form
                        className="flex gap-2 border-b border-line bg-surface px-3 py-3"
                        method="get"
                    >
                        <input type="hidden" name="status" value={params.status ?? 'all'} />
                        <input type="hidden" name="source" value={params.source ?? 'all'} />
                        <input type="hidden" name="kind" value={params.kind ?? 'all'} />
                        <input
                            name="q"
                            defaultValue={params.q}
                            placeholder="Search filename, URL or metadata"
                            className="min-w-0 flex-1 border border-line px-3 py-2 text-sm"
                        />
                        <button className="btn-secondary">Search</button>
                    </form>
                    <div className="grid grid-cols-[44px_minmax(180px,1fr)_100px_110px_100px] border-b border-line bg-panel-soft px-3 py-2 text-muted">
                        <span />
                        <span className="technical-label">Asset</span>
                        <span className="technical-label">Duration</span>
                        <span className="technical-label">Format</span>
                        <span className="technical-label">State</span>
                    </div>
                    {visibleAssets.length ? (
                        <div>
                            {visibleAssets.map((asset) => (
                                <Link
                                    key={asset.id}
                                    href={assetHref(params, { asset: asset.id })}
                                    className={[
                                        'data-row grid min-h-16 grid-cols-[44px_minmax(180px,1fr)_100px_110px_100px] items-center border-b border-line px-3 py-2 text-sm hover:bg-panel-soft',
                                        selectedAsset?.id === asset.id
                                            ? 'border-l-2 border-l-accent-positive bg-surface-selected-positive'
                                            : '',
                                    ].join(' ')}
                                >
                                    <span className="text-muted">
                                        {asset.sourceType === 'uploaded' ? (
                                            <UploadCloud size={17} />
                                        ) : asset.sourceType === 'public_url' ? (
                                            <LinkIcon size={17} />
                                        ) : (
                                            <Film size={17} />
                                        )}
                                    </span>
                                    <span className="min-w-0">
                                        <span className="block truncate font-semibold">
                                            {asset.title}
                                        </span>
                                        <span className="block truncate text-xs text-muted">
                                            {asset.canonicalUrl ?? asset.url ?? 'Stored file'}
                                        </span>
                                    </span>
                                    <span className="font-technical text-xs">
                                        {formatDuration(asset.durationSeconds)}
                                    </span>
                                    <span className="truncate text-xs text-muted">
                                        {asset.playbackKind ?? asset.mediaKind}
                                    </span>
                                    <StateBadge value={asset.status} />
                                </Link>
                            ))}
                        </div>
                    ) : (
                        <div className="p-4">
                            <EmptyState title="No matching assets">
                                Change filters or ingest a new source.
                            </EmptyState>
                        </div>
                    )}
                </section>

                <aside className="bg-surface">
                    <div className="border-b border-line px-4 py-3">
                        <p className="technical-label text-muted">Asset inspector</p>
                    </div>
                    {selectedAsset ? (
                        <div className="p-4">
                            <div className="grid aspect-video place-items-center border border-line bg-panel text-muted">
                                <Film size={32} />
                            </div>
                            <h2 className="mt-4 break-words font-display text-lg font-semibold">
                                {selectedAsset.title}
                            </h2>
                            <div className="mt-2 flex flex-wrap gap-2">
                                <StateBadge value={selectedAsset.status} />
                                <StateBadge value={selectedAsset.metadataStatus ?? 'pending'} />
                            </div>
                            <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-4 text-xs text-muted">
                                <Metadata
                                    label="Type"
                                    value={selectedAsset.playbackKind ?? selectedAsset.mediaKind}
                                />
                                <Metadata
                                    label="Duration"
                                    value={formatDuration(selectedAsset.durationSeconds)}
                                />
                                <Metadata
                                    label="Size"
                                    value={formatBytes(selectedAsset.fileSizeBytes)}
                                />
                                <Metadata
                                    label="Resolution"
                                    value={formatResolution(selectedAsset)}
                                />
                                <Metadata
                                    label="Updated"
                                    value={formatDate(
                                        selectedAsset.metadataCheckedAt ?? selectedAsset.updatedAt,
                                    )}
                                />
                                <Metadata label="Source" value={selectedAsset.sourceType} />
                            </dl>
                            {selectedAsset.metadataError ? (
                                <p className="mt-4 border border-danger-line bg-danger-soft p-3 text-xs text-danger-strong">
                                    {selectedAsset.metadataError}
                                </p>
                            ) : null}
                            {durationChanged(selectedAsset) ? (
                                <p className="mt-4 border border-warn-line bg-warn-soft p-3 text-xs text-warn-strong">
                                    Duration changed during metadata refresh. Scheduled blocks were
                                    preserved.
                                </p>
                            ) : null}
                            {selectedAsset.sourceType === 'public_url' &&
                            selectedAsset.status !== 'archived' ? (
                                <div className="mt-5">
                                    <RefreshAssetButton assetId={selectedAsset.id} />
                                </div>
                            ) : null}
                        </div>
                    ) : (
                        <div className="p-4 text-sm text-muted">Select an asset to inspect it.</div>
                    )}
                </aside>
            </section>

            <details id="ingest" className="surface-panel mt-4 p-4">
                <summary className="cursor-pointer font-display font-semibold">
                    Ingest media
                </summary>
                <div className="mt-4 grid gap-4 xl:grid-cols-2">
                    <MediaUploadForm
                        action="/api/assets/upload"
                        title="Upload file"
                        detail="Images, MP4/WebM and MP3 up to 95 MB. Media is verified server-side."
                        submitLabel="Upload file"
                        returnTo="/admin/assets?uploaded=1"
                    />
                    <PublicUrlAssetForm />
                </div>
            </details>
        </AdminShell>
    );
}

function Metadata({ label, value }: { label: string; value: string }) {
    return (
        <div>
            <dt className="inline font-medium text-ink">{label}: </dt>
            <dd className="inline">{value}</dd>
        </div>
    );
}

function StateBadge({ value }: { value: string }) {
    return (
        <span className="rounded-full border border-line bg-panel-soft px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
            {value.replaceAll('_', ' ')}
        </span>
    );
}

function FacetGroup({ title, children }: { title: string; children: React.ReactNode }) {
    return (
        <section className="border-b border-line p-3">
            <p className="technical-label px-2 text-muted">{title}</p>
            <div className="mt-2 grid gap-1">{children}</div>
        </section>
    );
}

function FacetLink({
    href,
    active,
    label,
    count,
}: {
    href: string;
    active: boolean;
    label: string;
    count?: number;
}) {
    return (
        <Link
            href={href}
            className={[
                'flex min-h-9 items-center gap-2 rounded px-2 text-sm',
                active
                    ? 'bg-surface-selected-positive text-accent-positive'
                    : 'text-muted hover:bg-panel-soft hover:text-ink',
            ].join(' ')}
        >
            <FolderOpen size={15} />
            <span>{label}</span>
            {typeof count === 'number' ? (
                <span className="ml-auto font-technical text-[10px]">{count}</span>
            ) : null}
        </Link>
    );
}

function assetHref(
    current: { q?: string; status?: string; source?: string; kind?: string; asset?: string },
    change: Partial<{ q: string; status: string; source: string; kind: string; asset: string }>,
) {
    const params = new URLSearchParams();
    const next = { ...current, ...change };

    for (const [key, value] of Object.entries(next)) {
        if (value && value !== 'all' && key !== 'uploaded') {
            params.set(key, value);
        }
    }

    return `/admin/assets${params.size ? `?${params.toString()}` : ''}`;
}

function formatDuration(seconds?: number | null) {
    if (!seconds) {
        return '—';
    }

    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const rest = seconds % 60;

    return [hours, minutes, rest].map((part) => String(part).padStart(2, '0')).join(':');
}

function formatBytes(bytes?: number | null) {
    if (!bytes) {
        return '—';
    }

    if (bytes >= 1024 ** 2) {
        return `${(bytes / 1024 ** 2).toFixed(1)} MB`;
    }

    return `${Math.round(bytes / 1024)} KB`;
}

function formatResolution(asset: MediaAsset) {
    if (!asset.width || !asset.height) {
        return asset.qualityLabel ?? '—';
    }

    return `${asset.width}×${asset.height}${asset.qualityLabel ? ` · ${asset.qualityLabel}` : ''}`;
}

function formatDate(value?: string | null) {
    if (!value) {
        return 'Never';
    }

    const date = new Date(value);

    return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function searchableText(asset: MediaAsset) {
    return [
        asset.title,
        asset.description,
        asset.sourceType,
        asset.playbackKind,
        asset.canonicalUrl,
        JSON.stringify(asset.metadata ?? {}),
    ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
}

function durationChanged(asset: MediaAsset) {
    const previous = asset.metadata?.previous_duration_seconds;

    return (
        typeof previous === 'number' &&
        asset.durationSeconds !== null &&
        previous !== asset.durationSeconds
    );
}
