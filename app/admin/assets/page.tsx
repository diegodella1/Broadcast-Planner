import { AdminShell } from "@/components/admin-shell"
import { ConfirmSubmitButton } from "@/components/confirm-submit-button"
import { MediaUploadForm } from "@/components/media-upload-form"
import { StatusPill } from "@/components/status-pill"
import { EmptyState, Field, FilterLink, FormHeader, MetricTile, Notice } from "@/components/ui"
import { getAssets } from "@/lib/data"
import { createMediaAsset, deleteMediaAsset, updateMediaAsset } from "@/lib/mutations"

import type { MediaAsset } from "@/lib/types"
import type { ReactNode } from "react"

export const dynamic = "force-dynamic"

export default async function AssetsPage({
  searchParams
}: {
  searchParams: Promise<{
    uploaded?: string
    status?: string
    kind?: string
    q?: string
    sort?: string
    show_name?: string
    month?: string
    year?: string
    page?: string
    lifecycle?: string
  }>
}) {
  const params = await searchParams
  const assets = await getAssets()
  const query = (params.q ?? "").trim().toLowerCase()
  const filteredAssets = assets
    .filter((asset) => {
      if (params.status === "attention" && !assetNeedsAttention(asset)) return false
      if (
        params.status &&
        params.status !== "all" &&
        params.status !== "attention" &&
        asset.status !== params.status
      )
        return false
      if (params.lifecycle && lifecycleState(asset) !== params.lifecycle) return false
      if (params.kind === "vimeo" && asset.sourceType !== "vimeo") return false
      if (params.kind === "video" && asset.mediaKind !== "video") return false
      if (params.kind === "image" && asset.mediaKind !== "image") return false
      if (
        params.kind &&
        !["all", "vimeo", "video", "image", "audio"].includes(params.kind) &&
        asset.assetType !== params.kind
      )
        return false
      if (params.kind === "audio" && asset.mediaKind !== "audio" && asset.assetType !== "music")
        return false
      if (
        query &&
        ![
          asset.title,
          asset.description,
          asset.sourceType,
          asset.mediaKind,
          asset.assetType,
          getMetadataText(asset, "vimeo_show_name")
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(query)
      )
        return false
      if (params.show_name && asset.sourceType === "vimeo") {
        const showName = getMetadataText(asset, "vimeo_show_name").toLowerCase()
        if (!showName.includes(params.show_name.toLowerCase())) return false
      }
      if ((params.month || params.year) && asset.sourceType === "vimeo") {
        const date = parseDate(getMetadataText(asset, "vimeo_created_time"))
        if (!date) return false
        if (params.year && String(date.getUTCFullYear()) !== params.year) return false
        if (params.month && String(date.getUTCMonth() + 1).padStart(2, "0") !== params.month) {
          return false
        }
      }
      return true
    })
    .sort((a, b) => sortAssets(a, b, params.sort))
  const pageSize = 50
  const totalPages = Math.max(1, Math.ceil(filteredAssets.length / pageSize))
  const requestedPage = Number.parseInt(params.page ?? "1", 10)
  const currentPage = Math.min(
    Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1),
    totalPages
  )
  const pageStart = (currentPage - 1) * pageSize
  const pageEnd = pageStart + pageSize
  const paginatedAssets = filteredAssets.slice(pageStart, pageEnd)
  const readyCount = assets.filter((asset) => asset.status === "ready").length
  const attentionCount = assets.filter(assetNeedsAttention).length
  async function addAsset(formData: FormData) {
    "use server"
    const durationSeconds = Number(formData.get("duration_seconds") || 0) || undefined
    await createMediaAsset({
      title: String(formData.get("title")),
      sourceType: String(formData.get("source_type")),
      mediaKind: String(formData.get("media_kind")),
      assetType: String(formData.get("asset_type")),
      url: String(formData.get("url") || ""),
      ...(durationSeconds !== undefined ? { durationSeconds } : {})
    })
  }
  async function editAsset(formData: FormData) {
    "use server"
    const durationSeconds = Number(formData.get("duration_seconds") || 0) || undefined
    await updateMediaAsset({
      id: String(formData.get("id")),
      title: String(formData.get("title")),
      description: String(formData.get("description") || ""),
      sourceType: String(formData.get("source_type")),
      mediaKind: String(formData.get("media_kind")),
      assetType: String(formData.get("asset_type")),
      url: String(formData.get("url") || ""),
      thumbnailUrl: String(formData.get("thumbnail_url") || ""),
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      status: String(formData.get("status")),
      lifecycleState: String(formData.get("lifecycle_state") || "reviewed"),
      orientation: String(formData.get("orientation") || "auto")
    })
  }
  async function deleteAsset(formData: FormData) {
    "use server"
    await deleteMediaAsset({
      id: String(formData.get("id")),
      force: formData.get("force_delete") === "on"
    })
  }
  return (
    <AdminShell
      title="Library"
      description="Operational media library for videos, Vimeo sources, stills, ads, promos, music beds and fallbacks."
      actions={
        <a className="btn-primary" href="/admin/vimeo">
          Sync Vimeo
        </a>
      }
    >
      {params.uploaded ? <Notice tone="ok">Media uploaded and saved as an asset.</Notice> : null}
      <section className="mb-5 grid gap-3 lg:grid-cols-3">
        <WorkflowStep
          number="1"
          title="Library"
          detail="Upload media or sync Vimeo. Metadata and duration must be visible here first."
        />
        <WorkflowStep
          number="2"
          title="Schedule show"
          detail="Open Programming, pick the day, then add the asset as a timeline block."
        />
        <WorkflowStep
          number="3"
          title="Control output"
          detail="Use Control to monitor active block, overlays and stop/go-live actions."
        />
      </section>
      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <MetricTile label="Total" value={String(assets.length)} detail="Saved media assets" />
        <MetricTile
          label="Ready"
          value={String(readyCount)}
          detail="Playable or renderable"
          tone="ok"
        />
        <MetricTile
          label="Review"
          value={String(attentionCount)}
          detail="Missing URL, duration or ready status"
          tone={attentionCount ? "warn" : "ok"}
        />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-2">
        <MediaUploadForm
          action="/api/assets/upload"
          title="Upload media"
          detail="Store videos, images or MP3 files up to 500 MB. Browser checks duration, dimensions and file details before upload."
          returnTo="/admin/assets?uploaded=1"
          includeAudio
        />

        <form action={addAsset} className="surface-panel p-4">
          <FormHeader
            title="Add remote URL"
            detail="Register a remote source without uploading a file."
          />
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_130px]">
            <Field label="Title">
              <input
                name="title"
                required
                placeholder="Title"
                className="border border-line px-3 py-2 text-sm font-normal text-ink"
              />
            </Field>
            <Field label="URL">
              <input
                name="url"
                placeholder="Image/video URL"
                className="border border-line px-3 py-2 text-sm font-normal text-ink"
              />
            </Field>
            <Field label="Seconds">
              <input
                name="duration_seconds"
                type="number"
                min="1"
                placeholder="Sec"
                className="border border-line px-3 py-2 text-sm font-normal text-ink"
              />
            </Field>
            <select name="source_type" className="border border-line px-3 py-2 text-sm">
              <option value="remote_image">Remote image</option>
              <option value="remote_mp4">Remote MP4</option>
              <option value="hls">HLS</option>
              <option value="rtmp">RTMP</option>
              <option value="vimeo">Vimeo</option>
            </select>
            <select name="media_kind" className="border border-line px-3 py-2 text-sm">
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="graphic">Graphic</option>
            </select>
            <select name="asset_type" className="border border-line px-3 py-2 text-sm">
              <option value="image">Image</option>
              <option value="video">Video</option>
              <option value="ad">Ad</option>
              <option value="promo">Promo</option>
              <option value="fallback">Fallback</option>
              <option value="music">Music</option>
            </select>
            <button className="btn-primary lg:col-span-3">Add asset</button>
          </div>
        </form>
      </section>

      <section className="mb-4 rounded-lg border border-line bg-surface p-3">
        <form
          className="mb-3 grid gap-3 md:grid-cols-[1fr_150px_150px_110px_110px_140px_110px]"
          action="/admin/assets"
        >
          <input type="hidden" name="status" value={params.status ?? ""} />
          <input type="hidden" name="kind" value={params.kind ?? ""} />
          <Field label="Search">
            <input
              name="q"
              defaultValue={params.q ?? ""}
              placeholder="Title, type, source"
              className="border border-line px-3 py-2 text-sm font-normal text-ink"
            />
          </Field>
          <Field label="Vimeo show">
            <input
              name="show_name"
              defaultValue={params.show_name ?? ""}
              placeholder="Show name"
              className="border border-line px-3 py-2 text-sm font-normal text-ink"
            />
          </Field>
          <Field label="Lifecycle">
            <select
              name="lifecycle"
              defaultValue={params.lifecycle ?? ""}
              className="border border-line px-3 py-2 text-sm font-normal text-ink"
            >
              <option value="">Any</option>
              <option value="synced">Synced</option>
              <option value="reviewed">Reviewed</option>
              <option value="rejected">Rejected</option>
              <option value="stale">Stale</option>
              <option value="expired">Expired</option>
              <option value="scheduled_in_use">Scheduled in use</option>
            </select>
          </Field>
          <Field label="Month">
            <select
              name="month"
              defaultValue={params.month ?? ""}
              className="border border-line px-3 py-2 text-sm font-normal text-ink"
            >
              <option value="">Any</option>
              {Array.from({ length: 12 }, (_, index) => String(index + 1).padStart(2, "0")).map(
                (month) => (
                  <option key={month} value={month}>
                    {month}
                  </option>
                )
              )}
            </select>
          </Field>
          <Field label="Year">
            <input
              name="year"
              defaultValue={params.year ?? ""}
              placeholder="2026"
              inputMode="numeric"
              pattern="[0-9]{4}"
              className="border border-line px-3 py-2 text-sm font-normal text-ink"
            />
          </Field>
          <Field label="Sort">
            <select
              name="sort"
              defaultValue={params.sort ?? "title"}
              className="border border-line px-3 py-2 text-sm font-normal text-ink"
            >
              <option value="title">Title</option>
              <option value="duration">Duration</option>
              <option value="status">Status</option>
              <option value="lifecycle">Lifecycle</option>
            </select>
          </Field>
          <button className="btn-secondary self-end">Apply</button>
        </form>
        <div className="flex flex-wrap items-center gap-2">
          <FilterLink href="/admin/assets" active={!params.status && !params.kind}>
            All
          </FilterLink>
          <FilterLink href="/admin/assets?status=attention" active={params.status === "attention"}>
            Review
          </FilterLink>
          <FilterLink href="/admin/assets?status=ready" active={params.status === "ready"}>
            Ready
          </FilterLink>
          <FilterLink href="/admin/assets?kind=video" active={params.kind === "video"}>
            Videos
          </FilterLink>
          <FilterLink href="/admin/assets?kind=vimeo" active={params.kind === "vimeo"}>
            Vimeo
          </FilterLink>
          <FilterLink href="/admin/assets?kind=fallback" active={params.kind === "fallback"}>
            Fallbacks
          </FilterLink>
          <FilterLink href="/admin/assets?kind=ad" active={params.kind === "ad"}>
            Ads
          </FilterLink>
          <FilterLink href="/admin/assets?kind=promo" active={params.kind === "promo"}>
            Promos
          </FilterLink>
          <FilterLink href="/admin/assets?kind=image" active={params.kind === "image"}>
            Images
          </FilterLink>
          <FilterLink href="/admin/assets?kind=audio" active={params.kind === "audio"}>
            Audio
          </FilterLink>
        </div>
      </section>
      <div className="surface-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm text-muted">
          <span>
            Showing {filteredAssets.length ? pageStart + 1 : 0}-
            {Math.min(pageEnd, filteredAssets.length)} of {filteredAssets.length} assets
          </span>
          <Pagination params={params} currentPage={currentPage} totalPages={totalPages} />
        </div>
        {paginatedAssets.map((asset) => (
          <details
            key={asset.id}
            id={`asset-${asset.id}`}
            className="group border-b border-line p-4 last:border-b-0"
          >
            <summary className="grid cursor-pointer list-none gap-3 md:grid-cols-[84px_1fr_150px_170px_120px_90px] md:items-center">
              <AssetPreview asset={asset} />
              <div className="min-w-0">
                <p className="font-semibold">{asset.title}</p>
                <p className="text-sm text-muted">
                  {asset.sourceType} · {asset.mediaKind} · {asset.assetType}
                  {asset.metadata?.presentation === "vertical_blur" ? " · vertical blur" : ""}
                </p>
                <p className="mt-1 text-xs font-semibold uppercase text-muted">
                  {lifecycleState(asset).replaceAll("_", " ")}
                </p>
              </div>
              <span className="text-sm text-muted">
                {asset.durationSeconds ? `${asset.durationSeconds}s` : "No duration"}
              </span>
              <span
                className={
                  assetNeedsAttention(asset)
                    ? "text-sm font-semibold text-warn"
                    : "text-sm font-semibold text-success"
                }
              >
                {assetNeedsAttention(asset) ? "Review" : "Playable"}
                <span className="block text-xs font-normal text-muted">
                  {assetAttentionReason(asset)}
                </span>
              </span>
              <StatusPill status={asset.status} />
              <span className="rounded-md border border-line px-3 py-2 text-center text-sm font-semibold text-ink group-open:bg-panel-soft">
                Edit
              </span>
            </summary>
            <AssetEditForm asset={asset} action={editAsset} />
            <form
              action={deleteAsset}
              className="mt-3 rounded-md border border-danger-line bg-danger-soft p-4"
            >
              <input type="hidden" name="id" value={asset.id} />
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm font-semibold text-danger-strong">
                  Delete this asset from the library
                </p>
                <ConfirmSubmitButton
                  message={`Delete "${asset.title}" from the library? Scheduled blocks using it will show missing asset warnings.`}
                  className="rounded-md border border-danger-line bg-surface px-4 py-2 text-sm font-semibold text-danger-strong hover:bg-danger-soft"
                >
                  Delete asset
                </ConfirmSubmitButton>
              </div>
              {lifecycleState(asset) === "scheduled_in_use" ? (
                <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-danger-strong">
                  <input name="force_delete" type="checkbox" />
                  Force delete even though this asset is scheduled in use.
                </label>
              ) : null}
            </form>
          </details>
        ))}
        {filteredAssets.length === 0 && (
          <div className="p-4">
            <EmptyState title="No assets for this filter">
              Change the filter or add a video, image, promo, ad, music track or fallback.
            </EmptyState>
          </div>
        )}
        {filteredAssets.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3 text-sm text-muted">
            <span>
              Page {currentPage} of {totalPages}
            </span>
            <Pagination params={params} currentPage={currentPage} totalPages={totalPages} />
          </div>
        )}
      </div>
    </AdminShell>
  )
}

function Pagination({
  params,
  currentPage,
  totalPages
}: {
  params: Record<string, string | undefined>
  currentPage: number
  totalPages: number
}) {
  if (totalPages <= 1) return null
  const pages = paginationWindow(currentPage, totalPages)
  return (
    <nav className="flex flex-wrap items-center gap-2" aria-label="Assets pagination">
      <PageLink href={assetPageHref(params, currentPage - 1)} disabled={currentPage <= 1}>
        Previous
      </PageLink>
      {pages.map((page) => (
        <PageLink key={page} href={assetPageHref(params, page)} active={page === currentPage}>
          {page}
        </PageLink>
      ))}
      <PageLink href={assetPageHref(params, currentPage + 1)} disabled={currentPage >= totalPages}>
        Next
      </PageLink>
    </nav>
  )
}

function PageLink({
  href,
  active,
  disabled,
  children
}: {
  href: string
  active?: boolean
  disabled?: boolean
  children: ReactNode
}) {
  const className = active
    ? "rounded-md border border-ink bg-ink px-3 py-1.5 text-sm font-semibold text-white"
    : disabled
      ? "pointer-events-none rounded-md border border-line px-3 py-1.5 text-sm font-semibold text-muted opacity-50"
      : "rounded-md border border-line px-3 py-1.5 text-sm font-semibold text-ink hover:bg-panel-soft"
  return (
    <a href={href} aria-current={active ? "page" : undefined} className={className}>
      {children}
    </a>
  )
}

function paginationWindow(currentPage: number, totalPages: number) {
  const start = Math.max(1, Math.min(currentPage - 2, totalPages - 4))
  const end = Math.min(totalPages, start + 4)
  return Array.from({ length: end - start + 1 }, (_, index) => start + index)
}

function assetPageHref(params: Record<string, string | undefined>, page: number) {
  const query = new URLSearchParams()
  for (const key of ["status", "kind", "q", "sort", "show_name", "month", "year", "lifecycle"]) {
    const value = params[key]
    if (value) query.set(key, value)
  }
  if (page > 1) query.set("page", String(page))
  const text = query.toString()
  return `/admin/assets${text ? `?${text}` : ""}`
}

function AssetEditForm({
  asset,
  action
}: {
  asset: MediaAsset
  action: (formData: FormData) => Promise<void>
}) {
  const orientation = String(
    asset.metadata?.orientation ||
      (asset.metadata?.presentation === "vertical_blur" ? "vertical" : "auto")
  )
  return (
    <form
      action={action}
      className="mt-4 grid gap-3 rounded-md bg-panel-soft p-4 lg:grid-cols-[1fr_1fr_130px_130px]"
    >
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
        defaultValue={asset.url ?? ""}
        placeholder="URL"
        className="border border-line px-3 py-2 text-sm"
      />
      <select
        name="source_type"
        defaultValue={asset.sourceType}
        className="border border-line px-3 py-2 text-sm"
      >
        <option value="remote_image">Remote image</option>
        <option value="remote_mp4">Remote MP4</option>
        <option value="hls">HLS</option>
        <option value="rtmp">RTMP</option>
        <option value="vimeo">Vimeo</option>
        <option value="supabase_image">Supabase image</option>
        <option value="supabase_audio">Supabase audio</option>
        <option value="reuters">Reuters</option>
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
        defaultValue={lifecycleState(asset)}
        className="border border-line px-3 py-2 text-sm"
      >
        <option value="synced">Synced</option>
        <option value="reviewed">Reviewed</option>
        <option value="rejected">Rejected</option>
        <option value="stale">Stale</option>
        <option value="expired">Expired</option>
        <option value="scheduled_in_use">Scheduled in use</option>
      </select>
      <select
        name="orientation"
        defaultValue={orientation}
        className="border border-line px-3 py-2 text-sm"
      >
        <option value="auto">Auto</option>
        <option value="horizontal">Horizontal</option>
        <option value="vertical">Vertical blur</option>
      </select>
      <label className="grid gap-1 text-xs font-semibold text-muted">
        On-air seconds
        <input
          name="duration_seconds"
          type="number"
          min="1"
          defaultValue={asset.durationSeconds ?? ""}
          placeholder="Sec"
          className="border border-line px-3 py-2 text-sm font-normal text-ink"
        />
      </label>
      <input
        name="thumbnail_url"
        defaultValue={asset.thumbnailUrl ?? ""}
        placeholder="Thumbnail URL"
        className="border border-line px-3 py-2 text-sm lg:col-span-2"
      />
      <input
        name="description"
        defaultValue={asset.description ?? ""}
        placeholder="Description"
        className="border border-line px-3 py-2 text-sm lg:col-span-2"
      />
      <button className="btn-primary lg:col-span-4">Save changes</button>
      <div className="lg:col-span-4 rounded-md border border-line bg-surface px-3 py-2 text-xs leading-5 text-muted">
        <span className="font-semibold text-ink">File details:</span> {fileDetailLine(asset)}
      </div>
    </form>
  )
}

function assetNeedsAttention(asset: MediaAsset) {
  if (["rejected", "stale", "expired"].includes(lifecycleState(asset))) return true
  if (asset.status !== "ready") return true
  if (
    (asset.sourceType === "remote_image" ||
      asset.sourceType === "remote_mp4" ||
      asset.sourceType === "hls" ||
      asset.sourceType === "rtmp" ||
      asset.sourceType === "supabase_audio") &&
    !asset.url
  )
    return true
  if (
    (asset.mediaKind === "video" || asset.mediaKind === "audio" || asset.mediaKind === "image") &&
    !asset.durationSeconds
  )
    return true
  if (asset.assetType === "ad" && asset.durationSeconds && asset.durationSeconds > 300) return true
  return false
}

function assetAttentionReason(asset: MediaAsset) {
  if (["rejected", "stale", "expired"].includes(lifecycleState(asset))) {
    return `Lifecycle: ${lifecycleState(asset).replaceAll("_", " ")}`
  }
  if (asset.status !== "ready") return `Status: ${asset.status}`
  if (
    (asset.sourceType === "remote_image" ||
      asset.sourceType === "remote_mp4" ||
      asset.sourceType === "hls" ||
      asset.sourceType === "rtmp" ||
      asset.sourceType === "supabase_audio") &&
    !asset.url
  )
    return "Missing URL"
  if (
    (asset.mediaKind === "video" || asset.mediaKind === "audio" || asset.mediaKind === "image") &&
    !asset.durationSeconds
  )
    return "Missing duration"
  if (asset.assetType === "ad" && asset.durationSeconds && asset.durationSeconds > 300)
    return "Ad over 5 min"
  return "Ready for schedule"
}

function sortAssets(a: MediaAsset, b: MediaAsset, sort: string | undefined) {
  if (sort === "duration") return (b.durationSeconds ?? 0) - (a.durationSeconds ?? 0)
  if (sort === "status") return a.status.localeCompare(b.status) || a.title.localeCompare(b.title)
  if (sort === "lifecycle")
    return lifecycleState(a).localeCompare(lifecycleState(b)) || a.title.localeCompare(b.title)
  return a.title.localeCompare(b.title)
}

function lifecycleState(asset: MediaAsset) {
  return asset.lifecycleState ?? "reviewed"
}

function AssetPreview({ asset }: { asset: MediaAsset }) {
  const src = asset.thumbnailUrl || (asset.mediaKind === "image" ? asset.url : "")
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="aspect-video w-full rounded-md border border-line bg-panel-soft object-cover"
      />
    )
  }
  return (
    <div className="grid aspect-video place-items-center rounded-md border border-line bg-panel-soft text-xs font-semibold uppercase text-muted">
      {asset.mediaKind}
    </div>
  )
}

function fileDetailLine(asset: MediaAsset) {
  const metadata = asset.metadata ?? {}
  const parts = [
    metadata.vimeo_show_name ? `show ${metadata.vimeo_show_name}` : null,
    metadata.vimeo_created_time
      ? `vimeo date ${formatDate(String(metadata.vimeo_created_time))}`
      : null,
    metadata.vimeo_last_synced_at
      ? `synced ${formatDate(String(metadata.vimeo_last_synced_at))}`
      : null,
    metadata.original_file_name ? `file ${metadata.original_file_name}` : null,
    metadata.mime_type ? `mime ${metadata.mime_type}` : null,
    typeof metadata.size === "number" ? `size ${formatBytes(metadata.size)}` : null,
    metadata.detected_duration_seconds ? `detected ${metadata.detected_duration_seconds}s` : null,
    metadata.duration_source ? `duration source ${metadata.duration_source}` : null,
    metadata.width && metadata.height ? `${metadata.width}x${metadata.height}` : null,
    metadata.aspect_ratio ? `ratio ${metadata.aspect_ratio}` : null
  ].filter(Boolean)
  return parts.length ? parts.join(" · ") : "No uploaded file metadata yet."
}

function getMetadataText(asset: MediaAsset, key: string) {
  const value = asset.metadata?.[key]
  return typeof value === "string" ? value : ""
}

function parseDate(value: string) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatDate(value: string) {
  const date = parseDate(value)
  if (!date) return value
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC"
  }).format(date)
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit += 1
  }
  return `${value.toFixed(value >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`
}

function WorkflowStep({
  number,
  title,
  detail
}: {
  number: string
  title: string
  detail: string
}) {
  return (
    <div className="rounded-lg border border-line bg-surface p-4">
      <div className="flex items-center gap-3">
        <span className="grid h-8 w-8 place-items-center rounded-md border border-accent-positive bg-surface-selected-positive text-sm font-bold text-accent-positive">
          {number}
        </span>
        <p className="font-semibold">{title}</p>
      </div>
      <p className="mt-2 text-sm leading-5 text-muted">{detail}</p>
    </div>
  )
}
