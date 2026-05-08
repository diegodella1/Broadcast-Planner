import { AdminShell } from "@/components/admin-shell"
import { EmptyState, FormHeader, MetricTile, Notice } from "@/components/ui"
import { getAssets } from "@/lib/data"
import { updateMediaAsset } from "@/lib/mutations"
import type { MediaAsset } from "@/lib/types"

export const dynamic = "force-dynamic"

export default async function MusicPage({
  searchParams
}: {
  searchParams: Promise<{ uploaded?: string }>
}) {
  const params = await searchParams
  const assets = await getAssets()
  const tracks = assets
    .filter((asset) => asset.assetType === "music")
    .sort((a, b) => playlistOrder(a) - playlistOrder(b) || a.title.localeCompare(b.title))
  const readyTracks = tracks.filter((asset) => asset.status === "ready" && asset.url)
  const totalDuration = tracks.reduce((total, asset) => total + (asset.durationSeconds ?? 0), 0)

  async function editTrack(formData: FormData) {
    "use server"
    const durationSeconds = Number(formData.get("duration_seconds") || 0) || undefined
    await updateMediaAsset({
      id: String(formData.get("id")),
      title: String(formData.get("title")),
      description: String(formData.get("description") || ""),
      sourceType: String(formData.get("source_type")),
      mediaKind: "audio",
      assetType: "music",
      url: String(formData.get("url") || ""),
      thumbnailUrl: "",
      ...(durationSeconds !== undefined ? { durationSeconds } : {}),
      status: String(formData.get("status")),
      orientation: "auto",
      playlistOrder: Number(formData.get("playlist_order") || 0) || undefined,
      revalidatePaths: ["/output/live"]
    })
  }

  return (
    <AdminShell
      title="Music"
      description="Background playlist tracks used by image, slide and graphic blocks when no primary video audio should lead."
    >
      {params.uploaded ? (
        <Notice tone="ok">Track uploaded and added to the background playlist.</Notice>
      ) : null}
      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <MetricTile label="Tracks" value={String(tracks.length)} detail="Music assets in library" />
        <MetricTile
          label="Ready"
          value={String(readyTracks.length)}
          detail="Available to the output renderer"
          tone={readyTracks.length ? "ok" : "warn"}
        />
        <MetricTile
          label="Runtime"
          value={`${Math.round(totalDuration / 60)}m`}
          detail="Known playlist duration"
          tone="info"
        />
      </section>

      <section className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form
          action="/rtvtime/api/assets/upload"
          method="post"
          encType="multipart/form-data"
          className="surface-panel p-4"
        >
          <FormHeader
            title="Upload music track"
            detail="MP3 files are stored as music assets and join the renderer playlist when marked ready."
          />
          <input type="hidden" name="asset_type" value="music" />
          <input type="hidden" name="return_to" value="/admin/music?uploaded=1" />
          <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_120px_1fr_120px]">
            <input
              name="title"
              required
              placeholder="Track title"
              className="border border-line px-3 py-2 text-sm"
            />
            <input
              name="duration_seconds"
              type="number"
              min="1"
              placeholder="Sec"
              className="border border-line px-3 py-2 text-sm"
            />
            <input
              name="media_file"
              required
              type="file"
              accept="audio/mpeg,audio/mp3"
              className="border border-line bg-surface px-3 py-2 text-sm"
            />
            <button className="btn-primary">Upload</button>
          </div>
        </form>

        <section className="surface-panel p-4">
          <FormHeader
            title="Playback rule"
            detail="The current output plays ready music assets during image and slide blocks only."
          />
          <div className="mt-4 grid gap-2 text-sm">
            <p className="rounded-md bg-panel-soft px-3 py-2 text-muted">
              Video blocks lead with their own media and suppress the playlist.
            </p>
            <p className="rounded-md bg-panel-soft px-3 py-2 text-muted">
              Tracks rotate automatically; one ready track loops.
            </p>
          </div>
        </section>
      </section>

      <div className="surface-panel overflow-hidden">
        {tracks.map((track) => (
          <details key={track.id} className="group border-b border-line p-4 last:border-b-0">
            <summary className="grid cursor-pointer list-none gap-3 md:grid-cols-[1fr_90px_140px_120px_90px] md:items-center">
              <div>
                <p className="font-semibold">{track.title}</p>
                <p className="text-sm text-muted">
                  {track.sourceType} · {track.url ? "source linked" : "missing source"}
                </p>
              </div>
              <span className="text-sm text-muted">#{playlistOrder(track)}</span>
              <span className="text-sm text-muted">
                {track.durationSeconds ? `${track.durationSeconds}s` : "No duration"}
              </span>
              <span
                className={
                  track.status === "ready" && track.url
                    ? "text-sm font-semibold text-success"
                    : "text-sm font-semibold text-warn"
                }
              >
                {track.status === "ready" && track.url ? "In playlist" : "Review"}
              </span>
              <span className="rounded-md border border-line px-3 py-2 text-center text-sm font-semibold text-ink group-open:bg-panel-soft">
                Edit
              </span>
            </summary>
            <MusicEditForm track={track} action={editTrack} />
          </details>
        ))}
        {tracks.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No music tracks yet">
              Upload an MP3 to create the first background playlist track.
            </EmptyState>
          </div>
        ) : null}
      </div>
    </AdminShell>
  )
}

function MusicEditForm({
  track,
  action
}: {
  track: MediaAsset
  action: (formData: FormData) => Promise<void>
}) {
  return (
    <form
      action={action}
      className="mt-4 grid gap-3 rounded-md bg-panel-soft p-4 lg:grid-cols-[1fr_160px_120px_100px_1fr]"
    >
      <input type="hidden" name="id" value={track.id} />
      <input
        name="title"
        required
        defaultValue={track.title}
        placeholder="Track title"
        className="border border-line px-3 py-2 text-sm"
      />
      <select
        name="source_type"
        defaultValue={track.sourceType}
        className="border border-line px-3 py-2 text-sm"
      >
        <option value="supabase_audio">Supabase audio</option>
      </select>
      <select
        name="status"
        defaultValue={track.status}
        className="border border-line px-3 py-2 text-sm"
      >
        <option value="draft">Draft</option>
        <option value="ready">Ready</option>
        <option value="failed">Failed</option>
        <option value="archived">Archived</option>
      </select>
      <input
        name="playlist_order"
        type="number"
        min="1"
        defaultValue={playlistOrder(track)}
        placeholder="Order"
        className="border border-line px-3 py-2 text-sm"
      />
      <input
        name="url"
        defaultValue={track.url ?? ""}
        placeholder="Audio URL"
        className="border border-line px-3 py-2 text-sm"
      />
      <input
        name="duration_seconds"
        type="number"
        min="1"
        defaultValue={track.durationSeconds ?? ""}
        placeholder="Sec"
        className="border border-line px-3 py-2 text-sm"
      />
      <input
        name="description"
        defaultValue={track.description ?? ""}
        placeholder="Notes"
        className="border border-line px-3 py-2 text-sm lg:col-span-2"
      />
      <button className="btn-primary lg:col-span-5">Save track</button>
    </form>
  )
}

function playlistOrder(track: MediaAsset) {
  const value = Number(track.metadata?.playlist_order ?? 999)
  return Number.isFinite(value) ? value : 999
}
