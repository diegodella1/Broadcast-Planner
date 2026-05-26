import Link from 'next/link';
import { redirect } from 'next/navigation';

import { AdminShell } from '@/components/admin/admin-shell';
import { ConfirmSubmitButton } from '@/components/forms/confirm-submit-button';
import { PlayoutTime } from '@/components/output/playout-time';
import { StatusPill } from '@/components/ui/status-pill';
import { Timecode } from '@/components/ui/timecode';
import { getScheduleForDate } from '@/lib/data';
import {
    createScheduledLayer,
    deleteProgramBlock,
    setScheduledLayerEnabled,
    updateMediaAsset,
    updateProgramBlock,
} from '@/lib/mutations';
import { analyzeSchedule, getAssetReadiness } from '@/lib/scheduling/schedule-health';
import { formatTimecode } from '@/lib/helpers/time';

import type { MediaAsset } from '@/lib/types';
import type { ReactNode } from 'react';

export default async function BlockPage({
    params,
}: {
    params: Promise<{ date: string; id: string }>;
}) {
    const { date, id } = await params;
    const schedule = await getScheduleForDate(date);
    const block = schedule.blocks.find((item) => item.id === id);

    if (!block) {
        return <AdminShell title="Block not found">This block does not exist.</AdminShell>;
    }

    const layers = schedule.layers
        .filter((layer) => layer.programBlockId === block.id)
        .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || a.zIndex - b.zIndex);
    const asset = schedule.mediaAssets.find((item) => item.id === block.assetId);
    const slide = schedule.slideAssets.find((item) => item.id === block.slideId);
    const fallback = schedule.mediaAssets.find((item) => item.id === block.fallbackAssetId);
    const musicAssets = schedule.mediaAssets.filter((item) => item.assetType === 'music');
    const readyMusicAssets = musicAssets.filter((item) => item.status === 'ready' && item.url);
    const health = analyzeSchedule(schedule, [block]);
    const blockIssues = health.issues.filter(
        (issue) => issue.blockId === block.id || !issue.blockId,
    );

    async function saveBlock(formData: FormData) {
        'use server';
        const result = await updateProgramBlock({
            date,
            blockId: id,
            title: String(formData.get('title')),
            blockType: String(formData.get('block_type')),
            assetId: String(formData.get('asset_id') || ''),
            slideId: String(formData.get('slide_id') || ''),
            startTime: String(formData.get('start_time')),
            durationSeconds: Number(formData.get('duration_seconds')),
            status: String(formData.get('status')),
            hideOverlays: formData.get('hide_overlays') === 'on',
            fallbackAssetId: String(formData.get('fallback_asset_id') || ''),
            notes: String(formData.get('notes') || ''),
            previouslyRecordedEnabled: formData.get('previously_recorded_enabled') === 'on',
            previouslyRecordedPosition: String(formData.get('previously_recorded_position') || ''),
            conflictResolution:
                formData.get('conflict_resolution') === 'archive_conflicts'
                    ? 'archive_conflicts'
                    : 'none',
        });

        if (!result.success) {
            throw new Error(result.error);
        }
    }

    async function addLayer(formData: FormData) {
        'use server';
        const result = await createScheduledLayer({
            date,
            blockId: id,
            title: String(formData.get('title')),
            layerType: String(formData.get('layer_type')),
            assetId: String(formData.get('asset_id') || ''),
            slideId: String(formData.get('slide_id') || ''),
            startTime: String(formData.get('start_time')),
            durationSeconds: Number(formData.get('duration_seconds')),
            zIndex: Number(formData.get('z_index') || 10),
            position: String(formData.get('position')),
        });

        if (!result.success) {
            throw new Error(result.error);
        }
    }

    async function editAssignedAsset(formData: FormData) {
        'use server';
        const durationSeconds = Number(formData.get('duration_seconds') || 0) || undefined;
        const result = await updateMediaAsset({
            id: String(formData.get('id')),
            title: String(formData.get('title')),
            description: String(formData.get('description') || ''),
            sourceType: String(formData.get('source_type')),
            mediaKind: String(formData.get('media_kind')),
            assetType: String(formData.get('asset_type')),
            url: String(formData.get('url') || ''),
            thumbnailUrl: String(formData.get('thumbnail_url') || ''),
            ...(durationSeconds !== undefined ? { durationSeconds } : {}),
            status: String(formData.get('status')),
            lifecycleState: String(formData.get('lifecycle_state') || 'reviewed'),
            orientation: String(formData.get('orientation') || 'auto'),
            revalidatePaths: [
                `/admin/schedule/${date}`,
                `/admin/schedule/${date}/blocks/${id}`,
                `/output/preview/${id}`,
                '/output/live',
            ],
        });

        if (!result.success) {
            throw new Error(result.error);
        }
    }

    async function toggleLayer(formData: FormData) {
        'use server';
        const result = await setScheduledLayerEnabled({
            date,
            blockId: id,
            layerId: String(formData.get('layer_id')),
            enabled: formData.get('enabled') === 'true',
        });

        if (!result.success) {
            throw new Error(result.error);
        }
    }

    async function deleteBlock() {
        'use server';
        const result = await deleteProgramBlock({ date, blockId: id });

        if (!result.success) {
            throw new Error(result.error);
        }
        redirect(`/admin/schedule/${date}`);
    }

    return (
        <AdminShell
            title={block.title}
            description="Block control room for base content, timing, fallback, overlays, graphics and background music behavior."
        >
            <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
                <Link
                    href={`/admin/schedule/${date}`}
                    className="text-sm font-semibold text-zinc-600 hover:text-ink"
                >
                    Back to programming day {date}
                </Link>
                <div className="flex flex-wrap gap-2">
                    <Link className="btn-secondary" href={`/output/preview/${block.id}?debug=true`}>
                        Debug preview
                    </Link>
                    <Link className="btn-primary" href={`/output/preview/${block.id}`}>
                        Clean preview
                    </Link>
                </div>
            </div>

            <section className="mb-5 grid gap-3 lg:grid-cols-3">
                <SignalCard
                    title="Base content"
                    primary={asset?.title ?? slide?.title ?? 'No asset'}
                    meta={
                        asset
                            ? `${asset.sourceType} · ${asset.mediaKind}`
                            : slide
                              ? slide.slideType
                              : 'Assign content'
                    }
                    status={asset?.status ?? slide?.status ?? 'missing'}
                />
                <SignalCard
                    title="Fallback"
                    primary={fallback?.title ?? 'Global fallback'}
                    meta={
                        fallback
                            ? `${fallback.sourceType} · ${fallback.mediaKind}`
                            : 'Uses day/system fallback'
                    }
                    status={fallback?.status ?? 'inherit'}
                />
                <SignalCard
                    title="Health"
                    primary={`${health.criticalCount} critical`}
                    meta={`${health.warnCount} warnings · ${layers.length} overlays`}
                    status={health.criticalCount ? 'failed' : 'ready'}
                />
            </section>

            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_380px]">
                <section className="surface-panel p-5">
                    <div className="flex items-center justify-between gap-3">
                        <div>
                            <p className="text-sm text-muted">Primary block</p>
                            <h2 className="text-2xl font-semibold">{block.title}</h2>
                        </div>
                        <StatusPill status={block.status} />
                    </div>

                    <dl className="mt-6 grid gap-4 sm:grid-cols-3">
                        <Info
                            label="Clock start"
                            value={<PlayoutTime airDate={date} seconds={block.startTimeSeconds} />}
                        />
                        <Info
                            label="Duration"
                            value={<Timecode seconds={block.durationSeconds} />}
                        />
                        <Info label="Type" value={block.blockType} />
                    </dl>

                    <form
                        action={saveBlock}
                        className="mt-6 grid gap-3 rounded-md border border-line bg-panel p-4 lg:grid-cols-2"
                    >
                        <input
                            name="title"
                            required
                            defaultValue={block.title}
                            placeholder="Title"
                            className="border border-line px-3 py-2 text-sm"
                        />
                        <select
                            name="status"
                            defaultValue={block.status}
                            className="border border-line px-3 py-2 text-sm"
                        >
                            <option value="draft">Draft</option>
                            <option value="ready">Ready</option>
                            <option value="active">Active</option>
                            <option value="archived">Archived</option>
                        </select>
                        <input
                            name="start_time"
                            required
                            defaultValue={block.startTime}
                            title="Clock start in 24-hour format"
                            placeholder="13:30:00"
                            className="border border-line px-3 py-2 text-sm"
                        />
                        <input
                            name="duration_seconds"
                            required
                            type="number"
                            min="1"
                            defaultValue={block.durationSeconds}
                            className="border border-line px-3 py-2 text-sm"
                        />
                        <select
                            name="block_type"
                            defaultValue={block.blockType}
                            className="border border-line px-3 py-2 text-sm"
                        >
                            <option value="video">Video</option>
                            <option value="image">Image</option>
                            <option value="slide">Slide</option>
                            <option value="ad">Ad</option>
                            <option value="promo">Promo</option>
                            <option value="fallback">Fallback</option>
                        </select>
                        <select
                            name="fallback_asset_id"
                            defaultValue={block.fallbackAssetId ?? ''}
                            className="border border-line px-3 py-2 text-sm"
                        >
                            <option value="">Global fallback</option>
                            {schedule.mediaAssets
                                .filter((item) => item.assetType === 'fallback')
                                .map((item) => (
                                    <option key={item.id} value={item.id}>
                                        {item.title} · {item.status}
                                    </option>
                                ))}
                        </select>
                        <select
                            name="asset_id"
                            defaultValue={block.assetId ?? ''}
                            className="border border-line px-3 py-2 text-sm"
                        >
                            <option value="">No asset</option>
                            {schedule.mediaAssets.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {assetOptionLabel(item)}
                                </option>
                            ))}
                        </select>
                        <select
                            name="slide_id"
                            defaultValue={block.slideId ?? ''}
                            className="border border-line px-3 py-2 text-sm"
                        >
                            <option value="">No slide</option>
                            {schedule.slideAssets.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.title} · {item.status}
                                </option>
                            ))}
                        </select>
                        <label className="flex min-h-10 items-center gap-2 rounded-md border border-line bg-surface px-3 text-sm lg:col-span-2">
                            <input
                                name="hide_overlays"
                                type="checkbox"
                                defaultChecked={block.hideOverlays}
                            />
                            Hide overlays during this block
                        </label>
                        {block.blockType === 'video' && !block.metadata?.reuters_stream_url ? (
                            <div className="grid gap-3 rounded-md border border-line bg-surface p-3 lg:col-span-2">
                                <label className="flex items-center gap-2 text-sm font-semibold text-ink">
                                    <input
                                        name="previously_recorded_enabled"
                                        type="checkbox"
                                        defaultChecked={
                                            block.metadata?.previously_recorded_enabled === true
                                        }
                                    />
                                    Previously Recorded bug
                                </label>
                                <select
                                    name="previously_recorded_position"
                                    defaultValue={recordedBugPosition(block.metadata)}
                                    className="border border-line px-3 py-2 text-sm"
                                >
                                    <option value="top_right">Top right</option>
                                    <option value="top_left">Top left</option>
                                    <option value="bottom_right">Bottom right</option>
                                    <option value="bottom_left">Bottom left</option>
                                </select>
                            </div>
                        ) : null}
                        <textarea
                            name="notes"
                            defaultValue={block.notes ?? ''}
                            placeholder="Operator notes"
                            className="min-h-20 border border-line px-3 py-2 text-sm lg:col-span-2"
                        />
                        <button className="btn-primary lg:col-span-2">Save block</button>
                        <button
                            className="btn-secondary lg:col-span-2"
                            name="conflict_resolution"
                            value="archive_conflicts"
                        >
                            Archive conflicting blocks and save
                        </button>
                    </form>

                    <section className="mt-6 rounded-md bg-panel p-4">
                        <p className="text-sm font-semibold">Assigned asset</p>
                        <p className="mt-1 text-sm text-zinc-700">
                            {asset?.title ?? 'No asset assigned'}
                        </p>
                        {asset ? <Readiness asset={asset} /> : null}
                        {asset ? (
                            <AssignedAssetEditForm asset={asset} action={editAssignedAsset} />
                        ) : null}
                    </section>

                    <section className="mt-6 rounded-md border border-line bg-surface p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="text-sm font-semibold">Music behavior</p>
                                <p className="mt-1 text-sm text-muted">
                                    Ready music tracks flow across slide, image and visual fallback
                                    blocks. Video, ad, promo and live media pause the playlist.
                                </p>
                            </div>
                            <Link href="/admin/music" className="btn-secondary">
                                Manage music
                            </Link>
                        </div>
                        <dl className="mt-4 grid gap-3 sm:grid-cols-3">
                            <Info
                                label="Playlist"
                                value={`${readyMusicAssets.length}/${musicAssets.length} ready`}
                            />
                            <Info
                                label="This block"
                                value={
                                    block.blockType === 'image' || block.blockType === 'slide'
                                        ? 'Music enabled'
                                        : 'Music suppressed'
                                }
                            />
                            <Info label="Rule" value="Automatic" />
                        </dl>
                    </section>

                    <div className="mt-6 grid gap-2">
                        {blockIssues.map((issue) => (
                            <p
                                key={issue.id}
                                className={
                                    issue.severity === 'critical'
                                        ? 'rounded-md bg-red-50 px-3 py-2 text-sm text-red-900'
                                        : 'rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-900'
                                }
                            >
                                <span className="block font-semibold">{issue.title}</span>
                                {issue.detail}
                            </p>
                        ))}
                        {blockIssues.length === 0 ? (
                            <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
                                No alerts for this block.
                            </p>
                        ) : null}
                    </div>

                    <section className="mt-6 rounded-md border border-danger-line bg-danger-soft p-4">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                            <div>
                                <p className="font-semibold text-danger-strong">Delete block</p>
                                <p className="mt-1 text-sm text-danger-strong">
                                    Deletes this block and its scheduled overlays. This cannot be
                                    undone.
                                </p>
                            </div>
                            <form action={deleteBlock}>
                                <ConfirmSubmitButton
                                    message={`Delete "${block.title}" and its overlays?`}
                                    className="rounded-md border border-danger-line bg-surface px-4 py-2 text-sm font-semibold text-danger-strong hover:bg-danger-soft"
                                >
                                    Delete block
                                </ConfirmSubmitButton>
                            </form>
                        </div>
                    </section>
                </section>

                <section className="surface-panel p-5">
                    <h3 className="font-semibold">Overlays</h3>
                    <form action={addLayer} className="mt-4 grid gap-3 rounded-md bg-panel p-3">
                        <input
                            name="title"
                            required
                            placeholder="Overlay title"
                            className="border border-line px-3 py-2 text-sm"
                        />
                        <div className="grid gap-3 sm:grid-cols-2">
                            <input
                                name="start_time"
                                required
                                defaultValue="00:02:00"
                                title="Offset inside the block"
                                className="border border-line px-3 py-2 text-sm"
                            />
                            <input
                                name="duration_seconds"
                                required
                                type="number"
                                min="1"
                                defaultValue="30"
                                className="border border-line px-3 py-2 text-sm"
                            />
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            <select
                                name="layer_type"
                                className="border border-line px-3 py-2 text-sm"
                            >
                                <option value="slide">Slide</option>
                                <option value="image">Image</option>
                                <option value="logo_bug">Logo bug</option>
                                <option value="promo">Promo</option>
                            </select>
                            <select
                                name="position"
                                className="border border-line px-3 py-2 text-sm"
                            >
                                <option value="top_right">Top right</option>
                                <option value="bottom_bar">Bottom bar</option>
                                <option value="sidebar">Sidebar</option>
                                <option value="fullscreen">Fullscreen</option>
                            </select>
                        </div>
                        <select name="slide_id" className="border border-line px-3 py-2 text-sm">
                            <option value="">No slide</option>
                            {schedule.slideAssets.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {item.title}
                                </option>
                            ))}
                        </select>
                        <select name="asset_id" className="border border-line px-3 py-2 text-sm">
                            <option value="">No asset</option>
                            {schedule.mediaAssets.map((item) => (
                                <option key={item.id} value={item.id}>
                                    {assetOptionLabel(item)}
                                </option>
                            ))}
                        </select>
                        <input
                            name="z_index"
                            type="number"
                            defaultValue="10"
                            className="border border-line px-3 py-2 text-sm"
                        />
                        <button className="btn-secondary">Add overlay</button>
                    </form>

                    <div className="mt-4 grid gap-3">
                        {layers.map((layer) => (
                            <div
                                key={layer.id}
                                className="rounded-md border border-line p-3 text-sm"
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <span className="font-semibold">{layer.title}</span>
                                    <span className="text-zinc-500">z{layer.zIndex}</span>
                                </div>
                                <p className="mt-1 text-zinc-600">
                                    <Timecode seconds={layer.startTimeSeconds} /> ·{' '}
                                    <Timecode seconds={layer.durationSeconds} /> · {layer.position}
                                </p>
                                <form action={toggleLayer} className="mt-3">
                                    <input type="hidden" name="layer_id" value={layer.id} />
                                    <input
                                        type="hidden"
                                        name="enabled"
                                        value={layer.enabled ? 'false' : 'true'}
                                    />
                                    <button className="rounded-md border border-line px-3 py-2 text-xs font-semibold text-ink">
                                        {layer.enabled ? 'Disable' : 'Enable'}
                                    </button>
                                </form>
                            </div>
                        ))}
                        {layers.length === 0 ? (
                            <p className="text-sm text-muted">No overlays scheduled.</p>
                        ) : null}
                    </div>
                </section>
            </div>
        </AdminShell>
    );
}

function AssignedAssetEditForm({
    asset,
    action,
}: {
    asset: MediaAsset;
    action: (formData: FormData) => Promise<void>;
}) {
    const orientation = String(
        asset.metadata?.orientation ||
            (asset.metadata?.presentation === 'vertical_blur' ? 'vertical' : 'auto'),
    );

    return (
        <details className="mt-4">
            <summary className="cursor-pointer text-sm font-semibold text-ink">
                Edit assigned asset
            </summary>
            <form action={action} className="mt-3 grid gap-3">
                <input type="hidden" name="id" value={asset.id} />
                <input
                    name="title"
                    required
                    defaultValue={asset.title}
                    placeholder="Title"
                    className="border border-line px-3 py-2 text-sm"
                />
                <input
                    name="url"
                    defaultValue={asset.url ?? ''}
                    placeholder="URL"
                    className="border border-line px-3 py-2 text-sm"
                />
                <div className="grid gap-3 sm:grid-cols-2">
                    <select
                        name="source_type"
                        defaultValue={asset.sourceType}
                        className="border border-line px-3 py-2 text-sm"
                    >
                        <option value="remote_image">Remote image</option>
                        <option value="remote_mp4">Remote MP4</option>
                        <option value="hls">HLS</option>
                        <option value="vimeo">Vimeo</option>
                        <option value="supabase_image">Supabase image</option>
                        <option value="supabase_audio">Supabase audio</option>
                    </select>
                    <select
                        name="media_kind"
                        defaultValue={asset.mediaKind}
                        className="border border-line px-3 py-2 text-sm"
                    >
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                        <option value="graphic">Graphic</option>
                        <option value="audio">Audio</option>
                    </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <select
                        name="asset_type"
                        defaultValue={asset.assetType}
                        className="border border-line px-3 py-2 text-sm"
                    >
                        <option value="image">Image</option>
                        <option value="video">Video</option>
                        <option value="ad">Ad</option>
                        <option value="promo">Promo</option>
                        <option value="fallback">Fallback</option>
                        <option value="overlay">Overlay</option>
                        <option value="music">Music</option>
                    </select>
                    <select
                        name="status"
                        defaultValue={asset.status}
                        className="border border-line px-3 py-2 text-sm"
                    >
                        <option value="draft">Draft</option>
                        <option value="syncing">Syncing</option>
                        <option value="ready">Ready</option>
                        <option value="failed">Failed</option>
                        <option value="archived">Archived</option>
                    </select>
                    <select
                        name="lifecycle_state"
                        defaultValue={asset.lifecycleState ?? 'reviewed'}
                        className="border border-line px-3 py-2 text-sm"
                    >
                        <option value="synced">Synced</option>
                        <option value="reviewed">Reviewed</option>
                        <option value="rejected">Rejected</option>
                        <option value="stale">Stale</option>
                        <option value="expired">Expired</option>
                        <option value="scheduled_in_use">Scheduled in use</option>
                    </select>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                    <select
                        name="orientation"
                        defaultValue={orientation}
                        className="border border-line px-3 py-2 text-sm"
                    >
                        <option value="auto">Auto</option>
                        <option value="horizontal">Horizontal</option>
                        <option value="vertical">Vertical blur</option>
                    </select>
                    <input
                        name="duration_seconds"
                        type="number"
                        min="1"
                        defaultValue={asset.durationSeconds ?? ''}
                        placeholder="Sec"
                        className="border border-line px-3 py-2 text-sm"
                    />
                </div>
                <input
                    name="thumbnail_url"
                    defaultValue={asset.thumbnailUrl ?? ''}
                    placeholder="Thumbnail URL"
                    className="border border-line px-3 py-2 text-sm"
                />
                <input
                    name="description"
                    defaultValue={asset.description ?? ''}
                    placeholder="Description"
                    className="border border-line px-3 py-2 text-sm"
                />
                <button className="btn-primary">Save asset</button>
            </form>
        </details>
    );
}

function SignalCard({
    title,
    primary,
    meta,
    status,
}: {
    title: string;
    primary: string;
    meta: string;
    status: string;
}) {
    return (
        <section className="surface-card p-4">
            <p className="eyebrow">{title}</p>
            <p className="mt-2 truncate text-xl font-semibold">{primary}</p>
            <p className="mt-1 text-sm text-muted">{meta}</p>
            <div className="mt-3">
                <StatusPill status={status} />
            </div>
        </section>
    );
}

function Readiness({ asset }: { asset: MediaAsset }) {
    const readiness = getAssetReadiness(asset);

    return (
        <p
            className={
                readiness.ready
                    ? 'mt-3 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900'
                    : 'mt-3 rounded-md bg-red-50 px-3 py-2 text-sm text-red-900'
            }
        >
            {readiness.ready ? 'Ready to render' : readiness.messages.join(', ')}
        </p>
    );
}

function Info({ label, value }: { label: string; value: ReactNode }) {
    return (
        <div>
            <dt className="text-xs font-semibold uppercase text-zinc-500">{label}</dt>
            <dd className="mt-1 text-lg font-semibold">{value}</dd>
        </div>
    );
}

function assetOptionLabel(asset: MediaAsset) {
    const showName =
        typeof asset.metadata?.vimeo_show_name === 'string'
            ? `${asset.metadata.vimeo_show_name} · `
            : '';

    return `${showName}${asset.title} · ${asset.sourceType} · ${asset.status}${
        asset.durationSeconds ? ` · ${formatTimecode(asset.durationSeconds)}` : ''
    }`;
}

function recordedBugPosition(metadata: Record<string, unknown> | null | undefined) {
    const value = metadata?.previously_recorded_position;

    return value === 'top_left' ||
        value === 'top_right' ||
        value === 'bottom_left' ||
        value === 'bottom_right'
        ? value
        : 'top_right';
}
