import Image from "next/image"
import Link from "next/link"
import { getTranslations } from "next-intl/server"
import { AdminShell } from "@/components/admin-shell"
import { StatusPill } from "@/components/status-pill"
import { EmptyState, FilterLink, FormHeader, MetricTile, Notice } from "@/components/ui"
import { getAssets } from "@/lib/data"
import { getDurationDisplay } from "@/lib/duration-display"
import { createMediaAsset, updateMediaAsset } from "@/lib/mutations"
import { formatTimecode } from "@/lib/time"
import type { MediaAsset, SourceType } from "@/lib/types"

// ─── i18n keys used / missing ────────────────────────────────────────────────
// assets.tabs.all        → "All"          ✓ exists
// assets.tabs.uploads    → "Uploads"      ✓ exists
// assets.viewMode.list   → "List"         ✗ MISSING — fallback: "List"
// assets.viewMode.tiles  → "Tiles"        ✗ MISSING — fallback: "Tiles"
// assets.sourcePill.upload → "Upload"     ✗ MISSING — fallback: "Upload"
// Brand names "Vimeo" and "Reuters" are NOT translated per spec.

type SearchParams = {
  uploaded?: string
  status?: string
  kind?: string
  view?: string
  source?: string
}

export default async function AssetsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams
  const [t, tAsset, tBlock, assets] = await Promise.all([
    getTranslations("assets"),
    getTranslations("asset"),
    getTranslations("block"),
    getAssets()
  ])

  const view: "list" | "tiles" = params.view === "tiles" ? "tiles" : "list"
  const source: "all" | "vimeo" | "reuters" | "uploads" =
    params.source === "vimeo" || params.source === "reuters" || params.source === "uploads"
      ? params.source
      : "all"

  const filteredAssets = assets.filter((asset) => {
    // existing status / kind filters
    if (params.status === "attention" && !assetNeedsAttention(asset)) return false
    if (params.status && params.status !== "all" && params.status !== "attention" && asset.status !== params.status) return false
    if (params.kind && params.kind !== "all" && asset.assetType !== params.kind) return false
    // new source filter (AND with above)
    if (source === "vimeo" && asset.sourceType !== "vimeo") return false
    if (source === "reuters" && asset.sourceType !== "reuters") return false
    if (source === "uploads" && asset.sourceType !== "supabase_image") return false
    return true
  })

  const readyCount = assets.filter((asset) => asset.status === "ready").length
  const attentionCount = assets.filter(assetNeedsAttention).length

  async function addAsset(formData: FormData) {
    "use server"
    await createMediaAsset({
      title: String(formData.get("title")),
      sourceType: String(formData.get("source_type")),
      mediaKind: String(formData.get("media_kind")),
      assetType: String(formData.get("asset_type")),
      url: String(formData.get("url") || ""),
      durationSeconds: Number(formData.get("duration_seconds") || 0) || undefined
    })
  }

  async function editAsset(formData: FormData) {
    "use server"
    await updateMediaAsset({
      id: String(formData.get("id")),
      title: String(formData.get("title")),
      description: String(formData.get("description") || ""),
      sourceType: String(formData.get("source_type")),
      mediaKind: String(formData.get("media_kind")),
      assetType: String(formData.get("asset_type")),
      url: String(formData.get("url") || ""),
      thumbnailUrl: String(formData.get("thumbnail_url") || ""),
      durationSeconds: Number(formData.get("duration_seconds") || 0) || undefined,
      status: String(formData.get("status")),
      orientation: String(formData.get("orientation") || "auto")
    })
  }

  // Build base query string preserving all existing params except the one being toggled.
  // Used by the view-mode toggle and source tabs to produce server-rendered <Link> hrefs.
  function buildHref(overrides: Partial<SearchParams>): string {
    const merged: SearchParams = {
      ...(params.uploaded ? { uploaded: params.uploaded } : {}),
      ...(params.status ? { status: params.status } : {}),
      ...(params.kind ? { kind: params.kind } : {}),
      view,
      source,
      ...overrides
    }
    // Drop keys with value "all" / default to keep URLs clean
    if (merged.source === "all") delete merged.source
    if (merged.view === "list") delete merged.view
    const qs = new URLSearchParams(merged as Record<string, string>).toString()
    return qs ? `/admin/assets?${qs}` : "/admin/assets"
  }

  return (
    <AdminShell
      title={t("title")}
      description={t("description")}
      actions={
        <form action="/rtvtime/api/vimeo/import" method="post">
          <button className="btn-primary">{t("importVimeo")}</button>
        </form>
      }
    >
      {params.uploaded ? <Notice tone="ok">{t("uploadedNotice")}</Notice> : null}

      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <MetricTile label={t("metrics.total")} value={String(assets.length)} detail={t("metrics.totalDetail")} />
        <MetricTile label={t("metrics.ready")} value={String(readyCount)} detail={t("metrics.readyDetail")} tone="ok" />
        <MetricTile label={t("metrics.review")} value={String(attentionCount)} detail={t("metrics.reviewDetail")} tone={attentionCount ? "warn" : "ok"} />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-2">
        <form action="/rtvtime/api/assets/upload" method="post" encType="multipart/form-data" className="surface-panel p-4">
          <FormHeader title={t("uploadVideo.title")} detail={t("uploadVideo.detail")} />
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_170px_140px_120px]">
            <input name="title" required placeholder={t("uploadVideo.videoTitle")} className="border border-line px-3 py-2 text-sm" />
            <select name="asset_type" className="border border-line px-3 py-2 text-sm">
              <option value="video">Video</option>
              <option value="ad">Ad</option>
              <option value="promo">Promo</option>
              <option value="fallback">Fallback</option>
            </select>
            <select name="orientation" className="border border-line px-3 py-2 text-sm">
              <option value="auto">Auto</option>
              <option value="horizontal">Horizontal</option>
              <option value="vertical">Vertical blur</option>
            </select>
            <input name="duration_seconds" type="number" min="1" placeholder={t("secondsShort")} className="border border-line px-3 py-2 text-sm" />
            <input name="video_file" required type="file" accept="video/mp4,video/webm,application/vnd.apple.mpegurl,application/x-mpegURL" className="border border-line bg-surface px-3 py-2 text-sm lg:col-span-3" />
            <button className="btn-primary">{t("uploadVideo.submit")}</button>
          </div>
        </form>

        <form action={addAsset} className="surface-panel p-4">
          <FormHeader title={t("addUrl.title")} detail={t("addUrl.detail")} />
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_130px]">
            <input name="title" required placeholder={t("addUrl.title2")} className="border border-line px-3 py-2 text-sm" />
            <input name="url" placeholder={t("addUrl.url")} className="border border-line px-3 py-2 text-sm" />
            <input name="duration_seconds" type="number" min="1" placeholder={t("secondsShort")} className="border border-line px-3 py-2 text-sm" />
            <select name="source_type" className="border border-line px-3 py-2 text-sm">
              <option value="remote_image">Remote image</option>
              <option value="remote_mp4">Remote MP4</option>
              <option value="hls">HLS</option>
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
            </select>
            <button className="btn-primary lg:col-span-3">{t("addUrl.submit")}</button>
          </div>
        </form>
      </section>

      {/* ── Status filter chips (existing) ── */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <FilterLink href={buildHref({ status: undefined, kind: undefined })} active={!params.status && !params.kind}>{t("tabs.all")}</FilterLink>
        <FilterLink href={buildHref({ status: "attention", kind: undefined })} active={params.status === "attention"}>{t("tabs.review")}</FilterLink>
        <FilterLink href={buildHref({ status: "ready", kind: undefined })} active={params.status === "ready"}>{t("tabs.ready")}</FilterLink>
        <FilterLink href={buildHref({ kind: "fallback", status: undefined })} active={params.kind === "fallback"}>{t("tabs.fallbacks")}</FilterLink>
        <FilterLink href={buildHref({ kind: "ad", status: undefined })} active={params.kind === "ad"}>{t("tabs.ads")}</FilterLink>
        <FilterLink href={buildHref({ kind: "promo", status: undefined })} active={params.kind === "promo"}>{t("tabs.promos")}</FilterLink>
      </div>

      {/* ── Source tabs + view-mode toggle row ── */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {/* Source tabs */}
        <SourceTab href={buildHref({ source: "all" })} active={source === "all"}>
          {t("tabs.all")}
        </SourceTab>
        <SourceTab href={buildHref({ source: "vimeo" })} active={source === "vimeo"}>
          Vimeo
        </SourceTab>
        <SourceTab href={buildHref({ source: "reuters" })} active={source === "reuters"}>
          Reuters
        </SourceTab>
        <SourceTab href={buildHref({ source: "uploads" })} active={source === "uploads"}>
          {t("tabs.uploads")}
        </SourceTab>

        {/* Spacer */}
        <div className="flex-1" />

        {/* View-mode toggle — server-rendered Links, no JS state */}
        <div className="flex items-center gap-1 rounded-md border border-line p-0.5">
          <Link
            href={buildHref({ view: "list" })}
            aria-label="List view"
            aria-pressed={view === "list"}
            className={viewToggleClass(view === "list")}
          >
            {/* Rows3 icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </Link>
          <Link
            href={buildHref({ view: "tiles" })}
            aria-label="Tile grid view"
            aria-pressed={view === "tiles"}
            className={viewToggleClass(view === "tiles")}
          >
            {/* LayoutGrid icon */}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="3" y="3" width="7" height="7" />
              <rect x="14" y="3" width="7" height="7" />
              <rect x="14" y="14" width="7" height="7" />
              <rect x="3" y="14" width="7" height="7" />
            </svg>
          </Link>
        </div>
      </div>

      {/* ── Asset list or tile grid ── */}
      {view === "tiles" ? (
        <div
          className="grid auto-rows-min gap-3"
          style={{ gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))" }}
        >
          {filteredAssets.map((asset) => (
            <AssetTile key={asset.id} asset={asset} liveLabel={tBlock("live")} />
          ))}
          {filteredAssets.length === 0 && (
            <div className="col-span-full p-4">
              <EmptyState title={t("empty.title")}>{t("empty.body")}</EmptyState>
            </div>
          )}
        </div>
      ) : (
        <div className="surface-panel overflow-hidden">
          {filteredAssets.map((asset) => (
            <details key={asset.id} id={`asset-${asset.id}`} className="group border-b border-line p-4 last:border-b-0">
              <summary className="grid cursor-pointer list-none gap-3 md:grid-cols-[1fr_150px_140px_120px_90px] md:items-center">
                <div>
                  <p className="font-semibold">{asset.title}</p>
                  <p className="text-sm text-muted">{asset.sourceType} · {asset.mediaKind} · {asset.assetType}{asset.metadata?.presentation === "vertical_blur" ? ` · ${t("verticalBlur")}` : ""}</p>
                </div>
                <AssetDurationCell asset={asset} liveLabel={tBlock("live")} />
                <span className={assetNeedsAttention(asset) ? "text-sm font-semibold text-warn" : "text-sm font-semibold text-success"}>
                  {assetNeedsAttention(asset) ? tAsset("review") : tAsset("playable")}
                </span>
                <StatusPill status={asset.status} />
                <span className="rounded-md border border-line px-3 py-2 text-center text-sm font-semibold text-ink group-open:bg-panel-soft">{t("edit")}</span>
              </summary>
              <AssetEditForm asset={asset} action={editAsset} saveLabel={t("saveChanges")} secondsShort={t("secondsShort")} />
            </details>
          ))}
          {filteredAssets.length === 0 && (
            <div className="p-4">
              <EmptyState title={t("empty.title")}>{t("empty.body")}</EmptyState>
            </div>
          )}
        </div>
      )}
    </AdminShell>
  )
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function viewToggleClass(active: boolean): string {
  return active
    ? "flex items-center justify-center rounded p-1.5 bg-surface-selected-positive text-accent-positive"
    : "flex items-center justify-center rounded p-1.5 text-muted hover:text-ink transition-colors"
}

function SourceTab({
  href,
  active,
  children
}: {
  href: string
  active: boolean
  children: React.ReactNode
}) {
  return (
    <Link
      href={href}
      role="tab"
      aria-selected={active}
      className={
        active
          ? "rounded-md px-3 py-1.5 text-sm font-medium bg-surface-selected-positive text-accent-positive"
          : "rounded-md px-3 py-1.5 text-sm font-medium text-muted hover:text-ink transition-colors"
      }
    >
      {children}
    </Link>
  )
}

function AssetTile({ asset, liveLabel }: { asset: MediaAsset; liveLabel: string }) {
  const display = getDurationDisplay({
    durationSeconds: asset.durationSeconds ?? null,
    sourceType: asset.sourceType
  })

  return (
    <div className="group flex flex-col overflow-hidden rounded-md border border-line bg-surface-elevated-1">
      {/* Thumbnail area — 16:9 aspect */}
      <div className="relative aspect-video w-full overflow-hidden bg-surface-elevated-2">
        {asset.thumbnailUrl ? (
          <Image
            src={asset.thumbnailUrl}
            alt={asset.title}
            fill
            sizes="(max-width: 640px) 50vw, (max-width: 1024px) 25vw, 180px"
            loading="lazy"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <TileIcon sourceType={asset.sourceType} />
          </div>
        )}
        {/* Duration/Live overlay — bottom-right */}
        <div className="absolute bottom-1 right-1">
          {display.kind === "live" ? (
            <span className="rounded-full bg-accent-positive px-1.5 py-0.5 text-[10px] font-semibold leading-none text-surface-elevated-1">
              {liveLabel}
            </span>
          ) : display.seconds > 0 ? (
            <span className="rounded-full bg-black/70 px-1.5 py-0.5 text-[10px] font-medium leading-none text-white/90">
              {formatTimecode(display.seconds)}
            </span>
          ) : null}
        </div>
        {/* Source pill — bottom-left */}
        <div className="absolute bottom-1 left-1">
          <SourcePill sourceType={asset.sourceType} />
        </div>
      </div>
      {/* Asset name */}
      <div className="px-2 py-1.5">
        <p className="truncate text-xs text-white/90" title={asset.title}>
          {asset.title}
        </p>
      </div>
    </div>
  )
}

function TileIcon({ sourceType }: { sourceType: SourceType }) {
  const cls = "opacity-30"
  if (sourceType === "supabase_image" || sourceType === "remote_image") {
    // Image icon
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden="true">
        <rect x="3" y="3" width="18" height="18" rx="2" />
        <circle cx="8.5" cy="8.5" r="1.5" />
        <polyline points="21 15 16 10 5 21" />
      </svg>
    )
  }
  if (sourceType === "vimeo" || sourceType === "remote_mp4" || sourceType === "hls") {
    // Video icon
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden="true">
        <polygon points="23 7 16 12 23 17 23 7" />
        <rect x="1" y="5" width="15" height="14" rx="2" />
      </svg>
    )
  }
  if (sourceType === "reuters") {
    // Radio/broadcast icon
    return (
      <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden="true">
        <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
        <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
        <circle cx="12" cy="12" r="2" />
        <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
        <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
      </svg>
    )
  }
  // Fallback: generic file icon
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className={cls} aria-hidden="true">
      <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
      <polyline points="13 2 13 9 20 9" />
    </svg>
  )
}

function SourcePill({ sourceType }: { sourceType: SourceType }) {
  // i18n note: "Vimeo" and "Reuters" are brand names — NOT translated per spec.
  // "Upload" label: assets.sourcePill.upload key is MISSING — falling back to literal "Upload".
  if (sourceType === "vimeo") {
    return (
      <span className="rounded-full bg-info-blue/10 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-info-blue">
        Vimeo
      </span>
    )
  }
  if (sourceType === "reuters") {
    return (
      <span className="rounded-full bg-negative-red/10 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-negative-red">
        Reuters
      </span>
    )
  }
  // supabase_image, remote_image, remote_mp4, hls → "Upload" bucket
  return (
    <span className="rounded-full bg-white/5 px-1.5 py-0.5 text-[9px] font-semibold leading-none text-white/60">
      Upload
    </span>
  )
}

function AssetEditForm({
  asset,
  action,
  saveLabel,
  secondsShort
}: {
  asset: MediaAsset
  action: (formData: FormData) => Promise<void>
  saveLabel: string
  secondsShort: string
}) {
  const orientation = String(asset.metadata?.orientation || (asset.metadata?.presentation === "vertical_blur" ? "vertical" : "auto"))
  return (
    <form action={action} className="mt-4 grid gap-3 rounded-md bg-panel-soft p-4 lg:grid-cols-[1fr_1fr_130px_130px]">
      <input type="hidden" name="id" value={asset.id} />
      <input name="title" required defaultValue={asset.title} placeholder="Title" className="border border-line px-3 py-2 text-sm" />
      <input name="url" defaultValue={asset.url ?? ""} placeholder="URL" className="border border-line px-3 py-2 text-sm" />
      <select name="source_type" defaultValue={asset.sourceType} className="border border-line px-3 py-2 text-sm">
        <option value="remote_image">Remote image</option>
        <option value="remote_mp4">Remote MP4</option>
        <option value="hls">HLS</option>
        <option value="vimeo">Vimeo</option>
        <option value="supabase_image">Supabase image</option>
      </select>
      <select name="media_kind" defaultValue={asset.mediaKind} className="border border-line px-3 py-2 text-sm">
        <option value="image">Image</option>
        <option value="video">Video</option>
        <option value="graphic">Graphic</option>
      </select>
      <select name="asset_type" defaultValue={asset.assetType} className="border border-line px-3 py-2 text-sm">
        <option value="image">Image</option>
        <option value="video">Video</option>
        <option value="ad">Ad</option>
        <option value="promo">Promo</option>
        <option value="fallback">Fallback</option>
        <option value="overlay">Overlay</option>
      </select>
      <select name="status" defaultValue={asset.status} className="border border-line px-3 py-2 text-sm">
        <option value="draft">Draft</option>
        <option value="syncing">Syncing</option>
        <option value="ready">Ready</option>
        <option value="failed">Failed</option>
        <option value="archived">Archived</option>
      </select>
      <select name="orientation" defaultValue={orientation} className="border border-line px-3 py-2 text-sm">
        <option value="auto">Auto</option>
        <option value="horizontal">Horizontal</option>
        <option value="vertical">Vertical blur</option>
      </select>
      <input name="duration_seconds" type="number" min="1" defaultValue={asset.durationSeconds ?? ""} placeholder={secondsShort} className="border border-line px-3 py-2 text-sm" />
      <input name="thumbnail_url" defaultValue={asset.thumbnailUrl ?? ""} placeholder="Thumbnail URL" className="border border-line px-3 py-2 text-sm lg:col-span-2" />
      <input name="description" defaultValue={asset.description ?? ""} placeholder="Description" className="border border-line px-3 py-2 text-sm lg:col-span-2" />
      <button className="btn-primary lg:col-span-4">{saveLabel}</button>
    </form>
  )
}

function AssetDurationCell({ asset, liveLabel }: { asset: MediaAsset; liveLabel: string }) {
  const display = getDurationDisplay({
    durationSeconds: asset.durationSeconds ?? null,
    sourceType: asset.sourceType
  })
  if (display.kind === "live") {
    return <span className="text-sm text-muted">{liveLabel}</span>
  }
  return <span className="text-sm text-muted">{formatTimecode(display.seconds)}</span>
}

function assetNeedsAttention(asset: MediaAsset) {
  if (asset.status !== "ready") return true
  if ((asset.sourceType === "remote_image" || asset.sourceType === "remote_mp4" || asset.sourceType === "hls") && !asset.url) return true
  if (asset.mediaKind === "video" && !asset.durationSeconds) return true
  if (asset.assetType === "ad" && asset.durationSeconds && asset.durationSeconds > 300) return true
  return false
}
