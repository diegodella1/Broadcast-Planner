import Link from "next/link"
import type { ReactNode } from "react"
import { getTranslations } from "next-intl/server"
import { AdminShell } from "@/components/admin-shell"
import { StatusPill } from "@/components/status-pill"
import { Timecode } from "@/components/timecode"
import { getScheduleForDate } from "@/lib/data"
import { createLowerThirdLayer, createScheduledLayer, setScheduledLayerEnabled, updateMediaAsset, updateProgramBlock } from "@/lib/mutations"
import { analyzeSchedule, getAssetReadiness } from "@/lib/schedule-health"
import { formatTimecode } from "@/lib/time"
import type { MediaAsset } from "@/lib/types"

export default async function BlockPage({ params }: { params: Promise<{ date: string; id: string }> }) {
  const { date, id } = await params
  const [schedule, t, tBlock, tAsset, tActions] = await Promise.all([
    getScheduleForDate(date),
    getTranslations("blockDetail"),
    getTranslations("block"),
    getTranslations("asset"),
    getTranslations("actions")
  ])
  const block = schedule.blocks.find((item) => item.id === id)
  if (!block) {
    return <AdminShell title={t("notFound.title")}>{t("notFound.body")}</AdminShell>
  }
  const layers = schedule.layers.filter((layer) => layer.programBlockId === block.id).sort((a, b) => a.startTimeSeconds - b.startTimeSeconds || a.zIndex - b.zIndex)
  const asset = schedule.mediaAssets.find((item) => item.id === block.assetId)
  const slide = schedule.slideAssets.find((item) => item.id === block.slideId)
  const fallback = schedule.mediaAssets.find((item) => item.id === block.fallbackAssetId)
  const health = analyzeSchedule(schedule, [block])
  const blockIssues = health.issues.filter((issue) => issue.blockId === block.id || !issue.blockId)
  async function saveBlock(formData: FormData) {
    "use server"
    await updateProgramBlock({
      date,
      blockId: id,
      title: String(formData.get("title")),
      blockType: String(formData.get("block_type")),
      assetId: String(formData.get("asset_id") || ""),
      slideId: String(formData.get("slide_id") || ""),
      startTime: String(formData.get("start_time")),
      durationSeconds: Number(formData.get("duration_seconds")),
      status: String(formData.get("status")),
      hideOverlays: formData.get("hide_overlays") === "on",
      fallbackAssetId: String(formData.get("fallback_asset_id") || ""),
      notes: String(formData.get("notes") || "")
    })
  }
  async function addLayer(formData: FormData) {
    "use server"
    await createScheduledLayer({
      date,
      blockId: id,
      title: String(formData.get("title")),
      layerType: String(formData.get("layer_type")),
      assetId: String(formData.get("asset_id") || ""),
      slideId: String(formData.get("slide_id") || ""),
      startTime: String(formData.get("start_time")),
      durationSeconds: Number(formData.get("duration_seconds")),
      zIndex: Number(formData.get("z_index") || 10),
      position: String(formData.get("position"))
    })
  }
  async function addLowerThird(formData: FormData) {
    "use server"
    await createLowerThirdLayer({
      date,
      blockId: id,
      title: String(formData.get("title") || formData.get("primary_text") || "Lower third"),
      primaryText: String(formData.get("primary_text")),
      secondaryText: String(formData.get("secondary_text") || ""),
      startTime: String(formData.get("start_time")),
      durationSeconds: Number(formData.get("duration_seconds") || 0)
    })
  }
  async function editAssignedAsset(formData: FormData) {
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
      orientation: String(formData.get("orientation") || "auto"),
      revalidatePaths: [`/admin/schedule/${date}`, `/admin/schedule/${date}/blocks/${id}`, `/output/preview/${id}`, "/output/live"]
    })
  }
  async function toggleLayer(formData: FormData) {
    "use server"
    await setScheduledLayerEnabled({
      date,
      blockId: id,
      layerId: String(formData.get("layer_id")),
      enabled: formData.get("enabled") === "true"
    })
  }
  return (
    <AdminShell title={block.title}>
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <Link href={`/admin/schedule/${date}`} className="text-sm font-semibold text-white/60 hover:text-ink">
          {t("backToAgenda", { date })}
        </Link>
        <div className="flex flex-wrap gap-2">
          <Link className="rounded-md border border-line bg-white px-4 py-2 text-sm font-semibold text-ink" href={`/output/preview/${block.id}?debug=true`}>
            {t("previewDebug")}
          </Link>
          <Link className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white" href={`/output/preview/${block.id}`}>
            {t("previewClean")}
          </Link>
        </div>
      </div>
      <section className="mb-5 grid gap-3 lg:grid-cols-3">
        <SignalCard
          title={t("signal.base")}
          primary={asset?.title ?? slide?.title ?? t("signal.noContent")}
          meta={asset ? `${asset.sourceType} · ${asset.mediaKind}` : slide ? slide.slideType : t("signal.noContent")}
          status={asset?.status ?? slide?.status ?? "missing"}
        />
        <SignalCard
          title={t("signal.fallback")}
          primary={fallback?.title ?? t("signal.fallbackGlobal")}
          meta={fallback ? `${fallback.sourceType} · ${fallback.mediaKind}` : t("signal.fallbackInherited")}
          status={fallback?.status ?? "inherit"}
        />
        <SignalCard
          title={t("signal.health")}
          primary={t("signal.criticals", { count: health.criticalCount })}
          meta={`${t("signal.warnings", { count: health.warnCount })} · ${t("signal.overlays", { count: layers.length })}`}
          status={health.criticalCount ? "failed" : "ready"}
        />
      </section>
      <div className="grid gap-5 lg:grid-cols-[1fr_360px]">
        <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-white/60">{t("main")}</p>
              <h2 className="text-2xl font-semibold">{block.title}</h2>
            </div>
            <StatusPill status={block.status} />
          </div>
          <dl className="mt-6 grid gap-4 sm:grid-cols-3">
            <Info label={t("fields.start")} value={<Timecode seconds={block.startTimeSeconds} />} />
            <Info label={t("fields.duration")} value={<Timecode seconds={block.durationSeconds} />} />
            <Info label={t("fields.type")} value={block.blockType} />
          </dl>
          <form action={saveBlock} className="mt-6 grid gap-3 rounded-md border border-line bg-panel p-4 lg:grid-cols-2">
            <input name="title" required defaultValue={block.title} placeholder={t("fields.title")} className="rounded-md border border-line px-3 py-2 text-sm" />
            <select name="status" defaultValue={block.status} className="rounded-md border border-line px-3 py-2 text-sm">
              <option value="draft">Draft</option>
              <option value="ready">Ready</option>
              <option value="active">Active</option>
              <option value="archived">Archived</option>
            </select>
            <input name="start_time" required defaultValue={block.startTime} className="rounded-md border border-line px-3 py-2 text-sm" />
            <input name="duration_seconds" required type="number" min="1" defaultValue={block.durationSeconds} className="rounded-md border border-line px-3 py-2 text-sm" />
            <select name="block_type" defaultValue={block.blockType} className="rounded-md border border-line px-3 py-2 text-sm">
              <option value="video">Video</option>
              <option value="image">Image</option>
              <option value="slide">Slide</option>
              <option value="ad">Ad</option>
              <option value="promo">Promo</option>
              <option value="fallback">Fallback</option>
            </select>
            <select name="fallback_asset_id" defaultValue={block.fallbackAssetId ?? ""} className="rounded-md border border-line px-3 py-2 text-sm">
              <option value="">{t("fields.fallbackGlobal")}</option>
              {schedule.mediaAssets.filter((item) => item.assetType === "fallback").map((item) => (
                <option key={item.id} value={item.id}>{item.title} · {item.status}</option>
              ))}
            </select>
            <select name="asset_id" defaultValue={block.assetId ?? ""} className="rounded-md border border-line px-3 py-2 text-sm">
              <option value="">{t("fields.noAsset")}</option>
              {schedule.mediaAssets.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} · {item.status}{item.durationSeconds ? ` · ${formatTimecode(item.durationSeconds)}` : ""}
                </option>
              ))}
            </select>
            <select name="slide_id" defaultValue={block.slideId ?? ""} className="rounded-md border border-line px-3 py-2 text-sm">
              <option value="">{t("fields.noSlide")}</option>
              {schedule.slideAssets.map((item) => (
                <option key={item.id} value={item.id}>{item.title} · {item.status}</option>
              ))}
            </select>
            <label className="flex items-center gap-2 rounded-md border border-line bg-white px-3 py-2 text-sm lg:col-span-2">
              <input name="hide_overlays" type="checkbox" defaultChecked={block.hideOverlays} />
              {t("fields.hideOverlays")}
            </label>
            <textarea name="notes" defaultValue={block.notes ?? ""} placeholder={t("fields.notes")} className="min-h-20 rounded-md border border-line px-3 py-2 text-sm lg:col-span-2" />
            <button className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white lg:col-span-2">{t("fields.save")}</button>
          </form>
          <div className="mt-6 rounded-md bg-panel p-4">
            <p className="text-sm font-semibold">{t("asset.title")}</p>
            <p className="mt-1 text-sm text-white/70">{asset?.title ?? t("asset.noAsset")}</p>
            {asset ? <Readiness asset={asset} readyLabel={t("asset.ready")} /> : null}
            {asset ? <AssignedAssetEditForm asset={asset} action={editAssignedAsset} editLabel={t("asset.edit")} saveLabel={t("asset.save")} fieldLabels={{
              title: t("asset.fields.title"),
              url: t("asset.fields.url"),
              thumbnailUrl: t("asset.fields.thumbnailUrl"),
              description: t("asset.fields.description"),
              durationSec: t("asset.fields.durationSec")
            }} /> : null}
          </div>
          <div className="mt-6 grid gap-2">
            {blockIssues.map((issue) => (
              <p key={issue.id} className={issue.severity === "critical" ? "rounded-md bg-negative-red/10 px-3 py-2 text-sm text-negative-red" : "rounded-md bg-warn-amber/10 px-3 py-2 text-sm text-warn-amber"}>
                <span className="block font-semibold">{t(issue.i18n.titleKey as Parameters<typeof t>[0], issue.i18n.titleValues)}</span>
                {t(issue.i18n.detailKey as Parameters<typeof t>[0], issue.i18n.detailValues)}
              </p>
            ))}
            {blockIssues.length === 0 && <p className="rounded-md bg-accent-positive/10 px-3 py-2 text-sm text-accent-positive">{t("alerts.none")}</p>}
          </div>
        </section>
        <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
          <h3 className="font-semibold">{t("overlays.title")}</h3>
          <form action={addLowerThird} className="mt-4 grid gap-3 rounded-md border border-line bg-white p-3">
            <p className="text-sm font-semibold">{t("overlays.lowerThirdQuick")}</p>
            <input name="title" placeholder={t("overlays.internalName")} className="rounded-md border border-line px-3 py-2 text-sm" />
            <input name="primary_text" required placeholder={t("overlays.primaryText")} className="rounded-md border border-line px-3 py-2 text-sm" />
            <input name="secondary_text" placeholder={t("overlays.secondaryText")} className="rounded-md border border-line px-3 py-2 text-sm" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="start_time" required defaultValue="00:00:05" className="rounded-md border border-line px-3 py-2 text-sm" />
              <input name="duration_seconds" required type="number" min="1" defaultValue="12" className="rounded-md border border-line px-3 py-2 text-sm" />
            </div>
            <button className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">{t("overlays.addLowerThird")}</button>
          </form>
          <form action={addLayer} className="mt-4 grid gap-3 rounded-md bg-panel p-3">
            <input name="title" required placeholder={t("overlays.overlayTitle")} className="rounded-md border border-line px-3 py-2 text-sm" />
            <div className="grid gap-3 sm:grid-cols-2">
              <input name="start_time" required defaultValue="00:02:00" className="rounded-md border border-line px-3 py-2 text-sm" />
              <input name="duration_seconds" required type="number" min="1" defaultValue="30" className="rounded-md border border-line px-3 py-2 text-sm" />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <select name="layer_type" className="rounded-md border border-line px-3 py-2 text-sm">
                <option value="slide">{t("layerType.slide")}</option>
                <option value="image">{t("layerType.image")}</option>
                <option value="lower_third">{t("layerType.lowerThird")}</option>
                <option value="logo_bug">{t("layerType.logoBug")}</option>
                <option value="promo">{t("layerType.promo")}</option>
              </select>
              <select name="position" className="rounded-md border border-line px-3 py-2 text-sm">
                <option value="lower_third">{t("position.lowerThird")}</option>
                <option value="top_right">{t("position.topRight")}</option>
                <option value="bottom_bar">{t("position.bottomBar")}</option>
                <option value="sidebar">{t("position.sidebar")}</option>
                <option value="fullscreen">{t("position.fullscreen")}</option>
              </select>
            </div>
            <select name="slide_id" className="rounded-md border border-line px-3 py-2 text-sm">
              <option value="">{t("overlays.empty")}</option>
              {schedule.slideAssets.map((slide) => (
                <option key={slide.id} value={slide.id}>{slide.title}</option>
              ))}
            </select>
            <select name="asset_id" className="rounded-md border border-line px-3 py-2 text-sm">
              <option value="">{tBlock("noAsset")}</option>
              {schedule.mediaAssets.map((mediaAsset) => (
                <option key={mediaAsset.id} value={mediaAsset.id}>{mediaAsset.title}</option>
              ))}
            </select>
            <input name="z_index" type="number" defaultValue="10" className="rounded-md border border-line px-3 py-2 text-sm" />
            <button className="rounded-md bg-signal px-4 py-2 text-sm font-semibold text-white">{t("overlays.addOverlay")}</button>
          </form>
          <div className="mt-4 grid gap-3">
            {layers.map((layer) => (
              <div key={layer.id} className="rounded-md border border-line p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold">{layer.title}</span>
                  <span className="text-white/50">z{layer.zIndex}</span>
                </div>
                <p className="mt-1 text-white/60">
                  <Timecode seconds={layer.startTimeSeconds} /> · <Timecode seconds={layer.durationSeconds} /> · {layer.position}
                </p>
                <form action={toggleLayer} className="mt-3">
                  <input type="hidden" name="layer_id" value={layer.id} />
                  <input type="hidden" name="enabled" value={layer.enabled ? "false" : "true"} />
                  <button className="rounded-md border border-line px-3 py-2 text-xs font-semibold text-ink">
                    {layer.enabled ? t("overlays.disable") : t("overlays.enable")}
                  </button>
                </form>
              </div>
            ))}
            {layers.length === 0 && <p className="text-sm text-white/60">{t("overlays.empty")}</p>}
          </div>
        </section>
      </div>
    </AdminShell>
  )
}

function AssignedAssetEditForm({
  asset,
  action,
  editLabel,
  saveLabel,
  fieldLabels
}: {
  asset: MediaAsset
  action: (formData: FormData) => Promise<void>
  editLabel: string
  saveLabel: string
  fieldLabels: { title: string; url: string; thumbnailUrl: string; description: string; durationSec: string }
}) {
  const orientation = String(asset.metadata?.orientation || (asset.metadata?.presentation === "vertical_blur" ? "vertical" : "auto"))
  return (
    <details className="mt-4">
      <summary className="cursor-pointer text-sm font-semibold text-ink">{editLabel}</summary>
      <form action={action} className="mt-3 grid gap-3">
        <input type="hidden" name="id" value={asset.id} />
        <input name="title" required defaultValue={asset.title} placeholder={fieldLabels.title} className="rounded-md border border-line px-3 py-2 text-sm" />
        <input name="url" defaultValue={asset.url ?? ""} placeholder={fieldLabels.url} className="rounded-md border border-line px-3 py-2 text-sm" />
        <div className="grid gap-3 sm:grid-cols-2">
          <select name="source_type" defaultValue={asset.sourceType} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="remote_image">Remote image</option>
            <option value="remote_mp4">Remote MP4</option>
            <option value="hls">HLS</option>
            <option value="vimeo">Vimeo</option>
            <option value="supabase_image">Supabase image</option>
          </select>
          <select name="media_kind" defaultValue={asset.mediaKind} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="graphic">Graphic</option>
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <select name="asset_type" defaultValue={asset.assetType} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="image">Image</option>
            <option value="video">Video</option>
            <option value="ad">Ad</option>
            <option value="promo">Promo</option>
            <option value="fallback">Fallback</option>
            <option value="overlay">Overlay</option>
          </select>
          <select name="status" defaultValue={asset.status} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="draft">Draft</option>
            <option value="syncing">Syncing</option>
            <option value="ready">Ready</option>
            <option value="failed">Failed</option>
            <option value="archived">Archived</option>
          </select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <select name="orientation" defaultValue={orientation} className="rounded-md border border-line px-3 py-2 text-sm">
            <option value="auto">Auto</option>
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical blur</option>
          </select>
          <input name="duration_seconds" type="number" min="1" defaultValue={asset.durationSeconds ?? ""} placeholder={fieldLabels.durationSec} className="rounded-md border border-line px-3 py-2 text-sm" />
        </div>
        <input name="thumbnail_url" defaultValue={asset.thumbnailUrl ?? ""} placeholder={fieldLabels.thumbnailUrl} className="rounded-md border border-line px-3 py-2 text-sm" />
        <input name="description" defaultValue={asset.description ?? ""} placeholder={fieldLabels.description} className="rounded-md border border-line px-3 py-2 text-sm" />
        <button className="rounded-md bg-ink px-4 py-2 text-sm font-semibold text-white">{saveLabel}</button>
      </form>
    </details>
  )
}

function SignalCard({ title, primary, meta, status }: { title: string; primary: string; meta: string; status: string }) {
  return (
    <section className="rounded-lg border border-line bg-white p-4 shadow-sm">
      <p className="text-xs font-semibold uppercase text-white/50">{title}</p>
      <p className="mt-2 truncate text-xl font-semibold">{primary}</p>
      <p className="mt-1 text-sm text-white/60">{meta}</p>
      <div className="mt-3"><StatusPill status={status} /></div>
    </section>
  )
}

function Readiness({ asset, readyLabel }: { asset: MediaAsset; readyLabel: string }) {
  const readiness = getAssetReadiness(asset)
  return (
    <p className={readiness.ready ? "mt-3 rounded-md bg-accent-positive/10 px-3 py-2 text-sm text-accent-positive" : "mt-3 rounded-md bg-negative-red/10 px-3 py-2 text-sm text-negative-red"}>
      {readiness.ready ? readyLabel : readiness.messages.join(", ")}
    </p>
  )
}

function Info({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase text-white/50">{label}</dt>
      <dd className="mt-1 text-lg font-semibold">{value}</dd>
    </div>
  )
}
