import { AdminShell } from "@/components/admin-shell"
import { StatusPill } from "@/components/status-pill"
import { EmptyState, FilterLink, FormHeader, MetricTile, Notice } from "@/components/ui"
import { getAssets } from "@/lib/data"
import { createMediaAsset, updateMediaAsset } from "@/lib/mutations"
import type { MediaAsset } from "@/lib/types"

export default async function AssetsPage({ searchParams }: { searchParams: Promise<{ uploaded?: string; status?: string; kind?: string }> }) {
  const params = await searchParams
  const assets = await getAssets()
  const filteredAssets = assets.filter((asset) => {
    if (params.status === "attention" && !assetNeedsAttention(asset)) return false
    if (params.status && params.status !== "all" && params.status !== "attention" && asset.status !== params.status) return false
    if (params.kind && params.kind !== "all" && asset.assetType !== params.kind) return false
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
  return (
    <AdminShell
      title="Assets"
      description="Biblioteca operativa de videos, imagenes, promos, ads y fallbacks para la grilla."
      actions={
        <form action="/rtvtime/api/vimeo/import" method="post">
          <button className="btn-primary">Importar Vimeo</button>
        </form>
      }
    >
      {params.uploaded ? <Notice tone="ok">Video subido y guardado como asset.</Notice> : null}
      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <MetricTile label="Total" value={String(assets.length)} detail="Assets guardados" />
        <MetricTile label="Ready" value={String(readyCount)} detail="Listos para usar" tone="ok" />
        <MetricTile label="Revisar" value={String(attentionCount)} detail="Sin URL, duracion o ready" tone={attentionCount ? "warn" : "ok"} />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-2">
        <form action="/rtvtime/api/assets/upload" method="post" encType="multipart/form-data" className="surface-panel p-4">
          <FormHeader title="Subir video" detail="Guarda MP4, WebM o HLS como asset operativo." />
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_170px_140px_120px]">
            <input name="title" required placeholder="Titulo video" className="border border-line px-3 py-2 text-sm" />
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
            <input name="duration_seconds" type="number" min="1" placeholder="Seg" className="border border-line px-3 py-2 text-sm" />
            <input name="video_file" required type="file" accept="video/mp4,video/webm,application/vnd.apple.mpegurl,application/x-mpegURL" className="border border-line bg-surface px-3 py-2 text-sm lg:col-span-3" />
            <button className="btn-primary">Subir</button>
          </div>
        </form>

        <form action={addAsset} className="surface-panel p-4">
          <FormHeader title="Agregar URL" detail="Registra una fuente remota sin subir archivo." />
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_1fr_130px]">
            <input name="title" required placeholder="Titulo" className="border border-line px-3 py-2 text-sm" />
            <input name="url" placeholder="URL imagen/video" className="border border-line px-3 py-2 text-sm" />
            <input name="duration_seconds" type="number" min="1" placeholder="Seg" className="border border-line px-3 py-2 text-sm" />
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
            <button className="btn-primary lg:col-span-3">Agregar asset</button>
          </div>
        </form>
      </section>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <FilterLink href="/admin/assets" active={!params.status && !params.kind}>Todos</FilterLink>
        <FilterLink href="/admin/assets?status=attention" active={params.status === "attention"}>Revisar</FilterLink>
        <FilterLink href="/admin/assets?status=ready" active={params.status === "ready"}>Ready</FilterLink>
        <FilterLink href="/admin/assets?kind=fallback" active={params.kind === "fallback"}>Fallbacks</FilterLink>
        <FilterLink href="/admin/assets?kind=ad" active={params.kind === "ad"}>Ads</FilterLink>
        <FilterLink href="/admin/assets?kind=promo" active={params.kind === "promo"}>Promos</FilterLink>
      </div>
      <div className="surface-panel overflow-hidden">
        {filteredAssets.map((asset) => (
          <details key={asset.id} id={`asset-${asset.id}`} className="group border-b border-line p-4 last:border-b-0">
            <summary className="grid cursor-pointer list-none gap-3 md:grid-cols-[1fr_150px_140px_120px_90px] md:items-center">
              <div>
                <p className="font-semibold">{asset.title}</p>
                <p className="text-sm text-muted">{asset.sourceType} · {asset.mediaKind} · {asset.assetType}{asset.metadata?.presentation === "vertical_blur" ? " · vertical blur" : ""}</p>
              </div>
              <span className="text-sm text-muted">{asset.durationSeconds ? `${asset.durationSeconds}s` : "Sin duracion"}</span>
              <span className={assetNeedsAttention(asset) ? "text-sm font-semibold text-warn" : "text-sm font-semibold text-success"}>
                {assetNeedsAttention(asset) ? "Revisar" : "Playable"}
              </span>
              <StatusPill status={asset.status} />
              <span className="rounded-md border border-line px-3 py-2 text-center text-sm font-semibold text-ink group-open:bg-panel-soft">Editar</span>
            </summary>
            <AssetEditForm asset={asset} action={editAsset} />
          </details>
        ))}
        {filteredAssets.length === 0 && <div className="p-4"><EmptyState title="Sin assets para este filtro">Cambiá el filtro o cargá un video, imagen, promo, ad o fallback.</EmptyState></div>}
      </div>
    </AdminShell>
  )
}

function AssetEditForm({
  asset,
  action
}: {
  asset: MediaAsset
  action: (formData: FormData) => Promise<void>
}) {
  const orientation = String(asset.metadata?.orientation || (asset.metadata?.presentation === "vertical_blur" ? "vertical" : "auto"))
  return (
    <form action={action} className="mt-4 grid gap-3 rounded-md bg-panel-soft p-4 lg:grid-cols-[1fr_1fr_130px_130px]">
      <input type="hidden" name="id" value={asset.id} />
      <input name="title" required defaultValue={asset.title} placeholder="Titulo" className="border border-line px-3 py-2 text-sm" />
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
      <input name="duration_seconds" type="number" min="1" defaultValue={asset.durationSeconds ?? ""} placeholder="Seg" className="border border-line px-3 py-2 text-sm" />
      <input name="thumbnail_url" defaultValue={asset.thumbnailUrl ?? ""} placeholder="Thumbnail URL" className="border border-line px-3 py-2 text-sm lg:col-span-2" />
      <input name="description" defaultValue={asset.description ?? ""} placeholder="Descripcion" className="border border-line px-3 py-2 text-sm lg:col-span-2" />
      <button className="btn-primary lg:col-span-4">Guardar cambios</button>
    </form>
  )
}

function assetNeedsAttention(asset: MediaAsset) {
  if (asset.status !== "ready") return true
  if ((asset.sourceType === "remote_image" || asset.sourceType === "remote_mp4" || asset.sourceType === "hls") && !asset.url) return true
  if (asset.mediaKind === "video" && !asset.durationSeconds) return true
  if (asset.assetType === "ad" && asset.durationSeconds && asset.durationSeconds > 300) return true
  return false
}
