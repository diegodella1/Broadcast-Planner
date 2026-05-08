import { AdminShell } from "@/components/admin-shell"
import { FormHeader, Notice } from "@/components/ui"
import { getVimeoSettings, getVimeoToken } from "@/lib/settings"
import { listVimeoEpisodes, listVimeoShows, type VimeoShow, type VimeoVideo } from "@/lib/vimeo"

export const dynamic = "force-dynamic"

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string; imported?: string; show_uri?: string }>
}) {
  const params = await searchParams
  const [settings, token] = await Promise.all([getVimeoSettings(), getVimeoToken()])
  const selectedShowUri = params.show_uri ?? ""
  const vimeoState = token
    ? await loadVimeoState(token, selectedShowUri)
    : { shows: [], episodes: [], error: null }
  const currentTimezone = String(
    settings?.publicConfig.timezone ?? "America/Argentina/Buenos_Aires"
  )

  return (
    <AdminShell
      title="Integrations"
      description="Vimeo credentials, operating timezone and import tools."
    >
      {params.saved ? <Notice tone="ok">Settings saved.</Notice> : null}
      {params.imported ? <Notice tone="ok">Episode imported as an asset.</Notice> : null}
      <form action="/rtvtime/api/settings" method="post" className="surface-panel max-w-2xl p-5">
        <FormHeader
          title="Vimeo integration"
          detail="API tokens come from infrastructure config (Cloudflare env var VIMEO_ACCESS_TOKEN or wrangler secret put). They are never entered through this UI."
        />
        <div className="mt-4 rounded-md bg-panel-soft px-3 py-2 text-sm text-muted">
          Vimeo connection: {token ? "token detected from environment" : "no token configured"}
          {token ? <span className="block">Status: {settings?.status ?? "unknown"}</span> : null}
          {settings?.lastError ? (
            <span className="block text-danger">Last error: {settings.lastError}</span>
          ) : null}
          {!token ? (
            <span className="block">
              Set VIMEO_ACCESS_TOKEN in your Cloudflare worker environment (wrangler secret put
              VIMEO_ACCESS_TOKEN) and redeploy.
            </span>
          ) : null}
        </div>
        <label className="mt-5 block text-sm font-medium">
          Optional Vimeo folder/project URI
          <input
            name="vimeo_folder_uri"
            className="mt-2 w-full border border-line px-3 py-2"
            defaultValue={String(settings?.publicConfig.folder_uri ?? "")}
            placeholder="/users/123/projects/456"
          />
        </label>
        <label className="mt-4 block text-sm font-medium">
          Timezone
          <input
            name="timezone"
            className="mt-2 w-full border border-line px-3 py-2"
            defaultValue={currentTimezone}
          />
        </label>
        <button className="btn-primary mt-5">Save settings</button>
      </form>

      <section className="surface-panel mt-6 max-w-2xl p-5">
        <FormHeader
          title="Vimeo shows and episodes"
          detail="Pick a show and convert visible episodes into reviewable assets."
        />
        {!token ? (
          <p className="mt-3 text-sm text-muted">Save a Vimeo API token to list shows.</p>
        ) : null}
        {vimeoState.error ? (
          <p className="mt-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong">
            {vimeoState.error}
          </p>
        ) : null}
        {token && !vimeoState.error ? (
          <>
            <form action="/rtvtime/admin/settings" className="mt-4 grid gap-3">
              <label className="block text-sm font-medium">
                Show
                <select
                  name="show_uri"
                  defaultValue={selectedShowUri}
                  className="mt-2 w-full border border-line px-3 py-2"
                >
                  <option value="">Choose show</option>
                  {vimeoState.shows.map((show) => (
                    <option key={show.uri} value={show.uri}>
                      {show.name}
                      {typeof show.videoCount === "number" ? ` (${show.videoCount})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn-secondary w-fit">View episodes</button>
            </form>
            {selectedShowUri ? (
              <EpisodePicker episodes={vimeoState.episodes} showUri={selectedShowUri} />
            ) : null}
          </>
        ) : null}
      </section>
    </AdminShell>
  )
}

async function loadVimeoState(
  token: string,
  selectedShowUri: string
): Promise<{ shows: VimeoShow[]; episodes: VimeoVideo[]; error: string | null }> {
  try {
    const shows = await listVimeoShows(token)
    const episodes = selectedShowUri ? await listVimeoEpisodes(token, selectedShowUri) : []
    return { shows, episodes, error: null }
  } catch (error) {
    return { shows: [], episodes: [], error: String(error) }
  }
}

function EpisodePicker({ episodes, showUri }: { episodes: VimeoVideo[]; showUri: string }) {
  if (!episodes.length) {
    return (
      <p className="mt-4 text-sm text-muted">This show has no visible episodes for this token.</p>
    )
  }
  return (
    <form
      action="/rtvtime/api/vimeo/import"
      method="post"
      className="mt-5 grid gap-3 rounded-md bg-panel-soft p-4"
    >
      <input
        type="hidden"
        name="return_to"
        value={`/admin/settings?show_uri=${encodeURIComponent(showUri)}&imported=1`}
      />
      <label className="block text-sm font-medium">
        Episode
        <select name="video_uri" className="mt-2 w-full border border-line px-3 py-2">
          {episodes.map((episode) => (
            <option key={episode.uri} value={episode.uri}>
              {episode.name} - {formatDuration(episode.duration)}
            </option>
          ))}
        </select>
      </label>
      <button className="btn-primary w-fit">Import episode as asset</button>
    </form>
  )
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${String(secs).padStart(2, "0")}`
}
