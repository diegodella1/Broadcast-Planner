import { Film, Link as LinkIcon, UploadCloud } from "lucide-react"
import { redirect } from "next/navigation"

import { AdminShell } from "@/components/admin-shell"
import { ConfirmSubmitButton } from "@/components/confirm-submit-button"
import { CsrfInput } from "@/components/csrf-input"
import { MediaUploadForm } from "@/components/media-upload-form"
import { StatusPill } from "@/components/status-pill"
import {
  ButtonLink,
  ClearStateBadge,
  EmptyState,
  Field,
  FilterLink,
  FormHeader,
  MetricTile,
  Notice,
  PrimaryActionPanel
} from "@/components/ui"
import { getAssets, getSlides } from "@/lib/data"
import { createMediaAsset, deleteMediaAsset, updateMediaAsset } from "@/lib/mutations"
import { slidePreviewHref } from "@/lib/slide-preview"
import { isoDateInTimezone, PLAYOUT_TIMEZONE } from "@/lib/time"

import type { MediaAsset, SlideAsset } from "@/lib/types"
import type { ReactNode } from "react"

export const dynamic = "force-dynamic"

type LibraryItem =
  | { kind: "asset"; id: string; title: string; asset: MediaAsset }
  | { kind: "slide"; id: string; title: string; slide: SlideAsset }

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
    imported?: string
    playback?: string
    count?: string
    fallback_loop?: string
  }>
}) {
  const params = await searchParams
  const [assets, slides] = await Promise.all([getAssets(), getSlides()])
  const libraryItems: LibraryItem[] = [
    ...assets.map((asset) => ({ kind: "asset" as const, id: asset.id, title: asset.title, asset })),
    ...slides.map((slide) => ({ kind: "slide" as const, id: slide.id, title: slide.title, slide }))
  ]
  const today = isoDateInTimezone(new Date(), PLAYOUT_TIMEZONE)
  const query = (params.q ?? "").trim().toLowerCase()
  const filteredItems = libraryItems
    .filter((item) => {
      if (params.status === "attention" && !libraryItemNeedsAttention(item)) return false
      if (item.kind === "slide") return slideMatchesFilters(item.slide, params, query)
      const asset = item.asset
      if (params.kind === "slides" || params.kind === "slide") return false
      if (
        params.status &&
        params.status !== "all" &&
        params.status !== "attention" &&
        asset.status !== params.status
      )
        return false
      if (params.lifecycle && lifecycleState(asset) !== params.lifecycle) return false
      if (params.kind === "vimeo" && asset.sourceType !== "vimeo") return false
      if (params.kind === "videos" && asset.mediaKind !== "video") return false
      if (params.kind === "images" && asset.mediaKind !== "image") return false
      if (params.kind === "image" && asset.mediaKind !== "image") return false
      if (
        params.kind &&
        !["all", "vimeo", "videos", "images", "image", "audio"].includes(params.kind) &&
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
    .sort((a, b) => sortLibraryItems(a, b, params.sort))
  const pageSize = 50
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize))
  const requestedPage = Number.parseInt(params.page ?? "1", 10)
  const currentPage = Math.min(
    Math.max(Number.isFinite(requestedPage) ? requestedPage : 1, 1),
    totalPages
  )
  const pageStart = (currentPage - 1) * pageSize
  const pageEnd = pageStart + pageSize
  const paginatedItems = filteredItems.slice(pageStart, pageEnd)
  const readyCount =
    assets.filter((asset) => asset.status === "ready").length +
    slides.filter((slide) => slide.status === "ready").length
  const attentionCount = libraryItems.filter(libraryItemNeedsAttention).length
  const fallbackLoopAsset = assets.find(fallbackLoopEnabled) ?? null
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
      orientation: String(formData.get("orientation") || "auto"),
      fallbackLoop: formData.get("fallback_loop") === "on"
    })
  }
  async function deleteAsset(formData: FormData) {
    "use server"
    await deleteMediaAsset({
      id: String(formData.get("id")),
      force: formData.get("force_delete") === "on"
    })
  }
  async function setFallbackLoop(formData: FormData) {
    "use server"
    const id = String(formData.get("id"))
    const asset = (await getAssets()).find((item) => item.id === id)
    if (!asset) throw new Error("Asset not found")
    await updateMediaAsset({
      id: asset.id,
      title: asset.title,
      description: asset.description ?? "",
      sourceType: asset.sourceType,
      mediaKind: asset.mediaKind,
      assetType: asset.assetType,
      url: asset.url ?? "",
      thumbnailUrl: asset.thumbnailUrl ?? "",
      ...(asset.durationSeconds ? { durationSeconds: asset.durationSeconds } : {}),
      status: asset.status,
      lifecycleState: lifecycleState(asset),
      orientation: String(asset.metadata?.orientation || "auto"),
      fallbackLoop: true
    })
    redirect("/admin/assets?kind=fallback&fallback_loop=1")
  }
  return (
    <AdminShell
      title="Library"
      description="Add and verify the content operators can place on Schedule."
      actions={
        <a className="btn-primary" href="/admin/vimeo">
          Import Vimeo
        </a>
      }
    >
      {params.uploaded ? <Notice tone="ok">Media uploaded and saved as an asset.</Notice> : null}
      {params.fallback_loop ? <Notice tone="ok">Silent fallback loop updated.</Notice> : null}
      {params.imported ? (
        <Notice tone={params.playback === "failed" ? "warn" : "ok"} title="Vimeo imported">
          {params.count ?? "1"} episode added to the library.
          {params.playback === "ready"
            ? " Playback verified: it can be scheduled."
            : params.playback === "failed"
              ? " Check playback before scheduling."
              : null}
        </Notice>
      ) : null}
      <PrimaryActionPanel
        eyebrow="Step 1"
        title={attentionCount ? "Fix content before scheduling" : "Library content is ready"}
        detail={
          attentionCount
            ? `${attentionCount} items need a source, duration or ready status. New blocks should use Ready content.`
            : "Add Vimeo episodes, uploads, images or slides here, then schedule them from each row."
        }
        action={<ButtonLink href="/admin/vimeo">Import Vimeo</ButtonLink>}
        secondary={
          <ButtonLink href={`/admin/schedule/${today}`} variant="secondary">
            Schedule Today
          </ButtonLink>
        }
      />
      <section className="mb-5 grid gap-3 lg:grid-cols-3">
        <WorkflowStep
          number="1"
          title="Add"
          detail="Upload a short video, register a playable URL, or import a Vimeo episode into Videos."
        />
        <WorkflowStep
          number="2"
          title="Verify"
          detail="Ready content can be scheduled. Broken content shows exactly what to fix."
        />
        <WorkflowStep
          number="3"
          title="Schedule"
          detail="Use Schedule today on library content to send it straight into today's rundown."
        />
      </section>
      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <MetricTile
          label="Total"
          value={String(libraryItems.length)}
          detail="Saved library items"
        />
        <MetricTile
          label="Ready"
          value={String(readyCount)}
          detail="Playable or renderable"
          tone="ok"
        />
        <MetricTile
          label="Review"
          value={String(attentionCount)}
          detail="Missing source, duration or ready status"
          tone={attentionCount ? "warn" : "ok"}
        />
      </section>

      <section className="mb-5 rounded-lg border border-line bg-surface p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="eyebrow text-muted">Output safety</p>
            <h2 className="mt-1 text-xl font-semibold">Silent fallback loop</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              {fallbackLoopAsset
                ? `${fallbackLoopAsset.title} is muted and loops whenever the schedule has an empty gap.`
                : "No silent fallback loop is selected. Empty schedule gaps will show the generic fallback screen."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <ButtonLink href="/admin/assets?kind=fallback" variant="secondary">
              Show Fallbacks
            </ButtonLink>
            <ButtonLink href="/admin/assets?kind=videos" variant="secondary">
              Pick Video
            </ButtonLink>
          </div>
        </div>
      </section>

      <section className="mb-5 overflow-hidden rounded-lg border border-accent-positive bg-surface-selected-positive shadow-accent-positive-glow">
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-accent-positive/30 px-4 py-4">
          <div>
            <p className="eyebrow text-accent-positive">Add or Import Content</p>
            <h2 className="mt-1 text-2xl font-semibold">Get media ready for scheduling</h2>
            <p className="mt-1 max-w-3xl text-sm leading-6 text-muted">
              Start here. Import Vimeo for episodes, upload files for local media, or use direct URL
              only for advanced sources.
            </p>
          </div>
          <ButtonLink href={`/admin/schedule/${today}`} variant="secondary">
            Schedule Today
          </ButtonLink>
        </div>
        <div className="grid gap-4 p-4 xl:grid-cols-[1.05fr_1fr]">
          <section className="rounded-md border border-accent-positive bg-surface p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-accent-positive text-surface-elevated-1">
                <Film size={19} aria-hidden="true" />
              </span>
              <FormHeader
                title="Import Vimeo episode"
                detail="Recommended for shows. Paste a Vimeo URL or ID; the episode is added to Library Videos and playback is verified for browser output."
              />
            </div>
            <form
              action="/api/vimeo/import"
              method="post"
              className="mt-5 grid gap-3 md:grid-cols-[minmax(0,1fr)_190px]"
            >
              <CsrfInput />
              <input type="hidden" name="return_to" value="/admin/assets?kind=videos" />
              <Field label="Vimeo URL or ID">
                <input
                  name="video_uri"
                  required
                  placeholder="https://vimeo.com/123456789"
                  className="border border-line px-3 py-2 text-sm font-normal text-ink"
                />
              </Field>
              <button className="btn-primary self-end">Import and verify</button>
            </form>
            <LinkIconRow href="/admin/vimeo" label="Open full Vimeo sync and catalog" />
          </section>

          <section className="grid gap-4">
            <div className="rounded-md border border-line bg-surface p-4">
              <div className="mb-4 flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md border border-line bg-panel-soft text-muted">
                  <UploadCloud size={19} aria-hidden="true" />
                </span>
                <FormHeader
                  title="Upload file"
                  detail="Use for local videos, images and MP3 music. Metadata is checked before the asset is saved."
                />
              </div>
              <MediaUploadForm
                action="/api/assets/upload"
                title="Upload media"
                detail="MP4/WebM videos up to 5 minutes, images or MP3 files up to 95 MB. Use Vimeo or direct URLs for larger videos."
                returnTo="/admin/assets?uploaded=1"
                includeAudio
                compact
              />
            </div>

            <details className="rounded-md border border-line bg-surface p-4">
              <summary className="flex cursor-pointer items-center gap-2 text-sm font-semibold">
                <LinkIcon size={16} aria-hidden="true" />
                Advanced: add direct URL
              </summary>
              <form action={addAsset} className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_130px]">
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
                <button className="btn-secondary lg:col-span-3">Save URL</button>
              </form>
            </details>
          </section>
        </div>
      </section>

      <section className="mb-4 rounded-lg border border-line bg-surface p-3">
        <form
          className="mb-3 grid grid-cols-1 gap-3 md:grid-cols-[1fr_120px]"
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
          <button className="btn-secondary self-end">Apply</button>
        </form>
        <details className="mb-3 rounded-md border border-line bg-panel-soft p-3">
          <summary className="cursor-pointer text-sm font-semibold">Advanced filters</summary>
          <form
            className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-[1fr_150px_110px_110px_140px_110px]"
            action="/admin/assets"
          >
            <input type="hidden" name="status" value={params.status ?? ""} />
            <input type="hidden" name="kind" value={params.kind ?? ""} />
            <input type="hidden" name="q" value={params.q ?? ""} />
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
        </details>
        <div className="flex flex-wrap items-center gap-2">
          <FilterLink href="/admin/assets" active={!params.status && !params.kind}>
            All
          </FilterLink>
          <FilterLink href="/admin/assets?status=attention" active={params.status === "attention"}>
            Needs Fix
          </FilterLink>
          <FilterLink href="/admin/assets?status=ready" active={params.status === "ready"}>
            Ready
          </FilterLink>
          <FilterLink href="/admin/assets?kind=videos" active={params.kind === "videos"}>
            Videos
          </FilterLink>
          <FilterLink
            href="/admin/assets?kind=images"
            active={params.kind === "images" || params.kind === "image"}
          >
            Images
          </FilterLink>
          <FilterLink
            href="/admin/assets?kind=slides"
            active={params.kind === "slides" || params.kind === "slide"}
          >
            Slides
          </FilterLink>
          <FilterLink href="/admin/assets?kind=audio" active={params.kind === "audio"}>
            Music
          </FilterLink>
          <details className="rounded-md border border-line bg-panel-soft px-3 py-2 text-sm">
            <summary className="cursor-pointer font-semibold text-muted">More Types</summary>
            <div className="mt-3 flex flex-wrap gap-2">
              <FilterLink href="/admin/assets?kind=fallback" active={params.kind === "fallback"}>
                Fallbacks
              </FilterLink>
              <FilterLink href="/admin/assets?kind=ad" active={params.kind === "ad"}>
                Ads
              </FilterLink>
              <FilterLink href="/admin/assets?kind=promo" active={params.kind === "promo"}>
                Promos
              </FilterLink>
            </div>
          </details>
        </div>
      </section>
      <div className="surface-panel overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 text-sm text-muted">
          <span>
            Showing {filteredItems.length ? pageStart + 1 : 0}-
            {Math.min(pageEnd, filteredItems.length)} of {filteredItems.length} items
          </span>
          <Pagination params={params} currentPage={currentPage} totalPages={totalPages} />
        </div>
        {paginatedItems.map((item) => (
          <LibraryItemRow
            key={`${item.kind}-${item.id}`}
            item={item}
            today={today}
            params={params}
            editAsset={editAsset}
            deleteAsset={deleteAsset}
            setFallbackLoop={setFallbackLoop}
          />
        ))}
        {filteredItems.length === 0 && (
          <div className="p-4">
            <EmptyState title="No content for this filter">
              Change the filter or add a video, image, promo, ad, music track or fallback.
            </EmptyState>
          </div>
        )}
        {filteredItems.length > 0 && (
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

function LinkIconRow({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="mt-4 inline-flex min-h-9 items-center gap-2 rounded-md border border-line bg-panel-soft px-3 text-sm font-semibold text-ink hover:bg-panel"
    >
      <LinkIcon size={15} aria-hidden="true" />
      {label}
    </a>
  )
}

function scheduleAssetHref(
  date: string,
  asset: MediaAsset,
  params: Record<string, string | undefined>
) {
  const query = new URLSearchParams({ asset: asset.id })
  const source = params.kind === "vimeo" ? "vimeo" : undefined
  const kind = scheduleKind(params.kind)
  const showName = params.show_name || getMetadataText(asset, "vimeo_show_name")
  for (const [key, value] of Object.entries({
    q: params.q,
    kind,
    source,
    show_name: showName,
    month: params.month,
    year: params.year
  })) {
    if (value) query.set(key, value)
  }
  return `/admin/schedule/${date}?${query.toString()}`
}

function scheduleLibraryItemHref(
  date: string,
  item: LibraryItem,
  params: Record<string, string | undefined>
) {
  if (item.kind === "asset") return scheduleAssetHref(date, item.asset, params)
  const query = new URLSearchParams({ slide: item.slide.id, kind: "slide", source: "slide" })
  if (params.q) query.set("q", params.q)
  return `/admin/schedule/${date}?${query.toString()}`
}

function scheduleKind(kind?: string) {
  if (!kind || kind === "all" || kind === "vimeo") return undefined
  if (kind === "videos") return "video"
  if (kind === "images") return "image"
  if (kind === "slides") return "slide"
  if (kind === "audio") return undefined
  return kind
}

function LibraryItemRow({
  item,
  today,
  params,
  editAsset,
  deleteAsset,
  setFallbackLoop
}: {
  item: LibraryItem
  today: string
  params: Record<string, string | undefined>
  editAsset: (formData: FormData) => Promise<void>
  deleteAsset: (formData: FormData) => Promise<void>
  setFallbackLoop: (formData: FormData) => Promise<void>
}) {
  const status = item.kind === "asset" ? item.asset.status : item.slide.status
  const isFallbackLoop = item.kind === "asset" && fallbackLoopEnabled(item.asset)
  const canUseFallbackLoop =
    item.kind === "asset" && canUseAsFallbackLoop(item.asset) && !isFallbackLoop
  return (
    <details
      id={`${item.kind}-${item.id}`}
      className="group border-b border-line p-4 last:border-b-0"
    >
      <summary className="grid cursor-pointer list-none gap-3 xl:grid-cols-[84px_minmax(0,1fr)_150px_170px_120px_90px] xl:items-center">
        <LibraryPreview item={item} />
        <div className="min-w-0">
          <p className="font-semibold">{item.title}</p>
          <p className="text-sm text-muted">{libraryItemMeta(item)}</p>
          <p className="mt-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted">
            {item.kind === "asset" ? (
              <>
                <ClearStateBadge tone="neutral">
                  {assetTypeLabel(item.asset.assetType)}
                </ClearStateBadge>
                <ClearStateBadge tone={item.asset.status === "ready" ? "ok" : "warn"}>
                  {item.asset.status === "ready" ? "Can schedule" : `Status ${item.asset.status}`}
                </ClearStateBadge>
              </>
            ) : (
              <ClearStateBadge tone="info">Slide</ClearStateBadge>
            )}
            {isFallbackLoop ? (
              <ClearStateBadge tone="ok">Fallback loop active</ClearStateBadge>
            ) : null}
          </p>
        </div>
        <span className="text-sm text-muted">{libraryItemDuration(item)}</span>
        <span
          className={
            libraryItemNeedsAttention(item)
              ? "text-sm font-semibold text-warn"
              : "text-sm font-semibold text-success"
          }
        >
          {libraryItemNeedsAttention(item) ? "Needs Fix" : "Ready"}
          <span className="block text-xs font-normal text-muted">
            {libraryItemAttentionReason(item)}
          </span>
        </span>
        <StatusPill status={status} />
        <span className="rounded-md border border-line px-3 py-2 text-center text-sm font-semibold text-ink group-open:bg-panel-soft">
          Edit
        </span>
      </summary>
      <div className="mt-4 flex flex-wrap gap-2">
        {!libraryItemNeedsAttention(item) && libraryItemCanSchedule(item) ? (
          <a className="btn-primary" href={scheduleLibraryItemHref(today, item, params)}>
            Schedule this
          </a>
        ) : libraryItemCanSchedule(item) ? (
          <span className="rounded-md border border-warn-line bg-warn-soft px-3 py-2 text-sm font-semibold text-warn-strong">
            Fix before scheduling
          </span>
        ) : null}
        {libraryItemViewHref(item) ? (
          <a
            className="btn-secondary"
            href={libraryItemViewHref(item)!}
            target="_blank"
            rel="noreferrer"
          >
            View
          </a>
        ) : (
          <span className="rounded-md border border-line bg-panel-soft px-3 py-2 text-sm font-semibold text-muted">
            No preview
          </span>
        )}
        <a className="btn-secondary" href="/admin/calendar">
          Choose Day
        </a>
        {isFallbackLoop ? (
          <span className="rounded-md border border-success/30 bg-success/10 px-3 py-2 text-sm font-semibold text-success">
            Active fallback loop
          </span>
        ) : canUseFallbackLoop ? (
          <form action={setFallbackLoop}>
            <input type="hidden" name="id" value={item.asset.id} />
            <button className="btn-secondary">Use as fallback loop</button>
          </form>
        ) : null}
      </div>
      {item.kind === "asset" ? (
        <>
          <AssetEditForm asset={item.asset} action={editAsset} />
          <form
            action={deleteAsset}
            className="mt-3 rounded-md border border-danger-line bg-danger-soft p-4"
          >
            <input type="hidden" name="id" value={item.asset.id} />
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-danger-strong">
                Delete this asset from the library
              </p>
              <ConfirmSubmitButton
                message={`Delete "${item.asset.title}" from the library? Scheduled blocks using it will show missing asset warnings.`}
                className="rounded-md border border-danger-line bg-surface px-4 py-2 text-sm font-semibold text-danger-strong hover:bg-danger-soft"
              >
                Delete asset
              </ConfirmSubmitButton>
            </div>
            {lifecycleState(item.asset) === "scheduled_in_use" ? (
              <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-danger-strong">
                <input name="force_delete" type="checkbox" />
                Force delete even though this asset is scheduled in use.
              </label>
            ) : null}
          </form>
        </>
      ) : (
        <div className="mt-4 rounded-md border border-line bg-panel-soft p-4 text-sm text-muted">
          Manage slide templates in{" "}
          <a className="font-semibold text-ink underline" href="/admin/slides">
            Graphics
          </a>
          .
        </div>
      )}
    </details>
  )
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
  const isFallbackLoop = fallbackLoopEnabled(asset)
  const canFallbackLoop = asset.mediaKind === "video" && asset.assetType !== "music"
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
        placeholder="Asset name"
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
        aria-label="Library category"
      >
        <option value="image">Image</option>
        <option value="video">Program video</option>
        <option value="ad">Ad</option>
        <option value="promo">Promo</option>
        <option value="fallback">Fallback candidate</option>
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
      <label className="lg:col-span-4 flex items-start gap-3 rounded-md border border-line bg-surface px-3 py-3 text-sm text-ink">
        <input
          name="fallback_loop"
          type="checkbox"
          defaultChecked={isFallbackLoop}
          disabled={!canFallbackLoop}
          className="mt-1"
        />
        <span>
          <span className="block font-semibold">Use as silent fallback loop</span>
          <span className="block text-xs leading-5 text-muted">
            Plays muted in /output/live whenever no scheduled block is active. Only one library
            video can be the fallback loop at a time.
          </span>
          {!canFallbackLoop ? (
            <span className="mt-1 block text-xs font-semibold text-warn">
              Change this item to Video media before enabling fallback loop.
            </span>
          ) : null}
        </span>
      </label>
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

function libraryItemNeedsAttention(item: LibraryItem) {
  if (item.kind === "slide") return item.slide.status !== "ready"
  return assetNeedsAttention(item.asset)
}

function libraryItemAttentionReason(item: LibraryItem) {
  if (item.kind === "slide") {
    return item.slide.status === "ready" ? "Ready" : `Status: ${item.slide.status}`
  }
  return assetAttentionReason(item.asset)
}

function libraryItemMeta(item: LibraryItem) {
  if (item.kind === "slide") {
    return [
      "slide",
      item.slide.slideType,
      item.slide.templateId ? `template ${item.slide.templateId}` : null
    ]
      .filter(Boolean)
      .join(" · ")
  }
  const asset = item.asset
  return `${asset.sourceType} · ${asset.mediaKind} · ${asset.assetType}${
    asset.metadata?.presentation === "vertical_blur" ? " · vertical blur" : ""
  }`
}

function libraryItemDuration(item: LibraryItem) {
  const duration =
    item.kind === "slide" ? item.slide.defaultDurationSeconds : item.asset.durationSeconds
  return duration ? `${duration}s` : "No duration"
}

function libraryItemCanSchedule(item: LibraryItem) {
  if (item.kind === "slide") return true
  return item.asset.assetType !== "music" && item.asset.mediaKind !== "audio"
}

function libraryItemViewHref(item: LibraryItem) {
  if (item.kind === "slide") return slidePreviewHref(item.slide.id)
  const asset = item.asset
  if (asset.url && (asset.mediaKind === "video" || asset.mediaKind === "image")) return asset.url
  if (asset.thumbnailUrl) return asset.thumbnailUrl
  return null
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
  return "Ready"
}

function sortLibraryItems(a: LibraryItem, b: LibraryItem, sort: string | undefined) {
  if (sort === "duration") return durationValue(b) - durationValue(a)
  if (sort === "status")
    return statusValue(a).localeCompare(statusValue(b)) || a.title.localeCompare(b.title)
  if (sort === "lifecycle") return lifecycleValue(a).localeCompare(lifecycleValue(b))
  return a.title.localeCompare(b.title)
}

function durationValue(item: LibraryItem) {
  return item.kind === "slide"
    ? (item.slide.defaultDurationSeconds ?? 0)
    : (item.asset.durationSeconds ?? 0)
}

function statusValue(item: LibraryItem) {
  return item.kind === "slide" ? item.slide.status : item.asset.status
}

function lifecycleValue(item: LibraryItem) {
  return item.kind === "slide" ? "slide" : lifecycleState(item.asset)
}

function lifecycleState(asset: MediaAsset) {
  return asset.lifecycleState ?? "reviewed"
}

function LibraryPreview({ item }: { item: LibraryItem }) {
  if (item.kind === "slide") {
    return (
      <div className="grid aspect-video place-items-center rounded-md border border-line bg-panel-soft text-xs font-semibold uppercase text-muted">
        slide
      </div>
    )
  }
  const asset = item.asset
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

function slideMatchesFilters(
  slide: SlideAsset,
  params: Record<string, string | undefined>,
  query: string
) {
  if (
    params.status &&
    params.status !== "all" &&
    params.status !== "attention" &&
    slide.status !== params.status
  )
    return false
  if (params.lifecycle) return false
  if (params.show_name || params.month || params.year) return false
  if (params.kind && !["all", "slides", "slide"].includes(params.kind)) return false
  if (
    query &&
    ![slide.title, slide.slideType, slide.templateId, "slide", "graphic"]
      .filter(Boolean)
      .join(" ")
      .toLowerCase()
      .includes(query)
  )
    return false
  return true
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

function fallbackLoopEnabled(asset: MediaAsset) {
  return asset.metadata?.fallback_loop === true
}

function assetTypeLabel(value: MediaAsset["assetType"]) {
  if (value === "video") return "Program"
  if (value === "fallback") return "Fallback"
  if (value === "music") return "Music"
  if (value === "ad") return "Ad"
  if (value === "promo") return "Promo"
  if (value === "overlay") return "Overlay"
  return "Image"
}

function canUseAsFallbackLoop(asset: MediaAsset) {
  return (
    asset.status === "ready" && asset.mediaKind === "video" && Boolean(asset.url || asset.vimeoId)
  )
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
