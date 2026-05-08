import { getTranslations } from "next-intl/server"
import { AdminShell } from "@/components/admin-shell"
import { FormHeader, Notice } from "@/components/ui"
import { getVimeoSettings, getVimeoToken } from "@/lib/settings"
import { listVimeoEpisodes, listVimeoShows, type VimeoShow, type VimeoVideo } from "@/lib/vimeo"

export const dynamic = "force-dynamic"

export default async function SettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string; imported?: string; show_uri?: string }> }) {
  const params = await searchParams
  const [t, settings, token] = await Promise.all([
    getTranslations("settings"),
    getVimeoSettings(),
    getVimeoToken()
  ])
  const selectedShowUri = params.show_uri ?? ""
  const vimeoState = token ? await loadVimeoState(token, selectedShowUri) : { shows: [], episodes: [], error: null }
  const currentTimezone = String(settings?.publicConfig.timezone ?? "America/Argentina/Buenos_Aires")

  return (
    <AdminShell title={t("title")} description={t("description")}>
      {params.saved ? <Notice tone="ok">{t("savedNotice")}</Notice> : null}
      {params.imported ? <Notice tone="ok">{t("importedNotice")}</Notice> : null}
      <form action="/rtvtime/api/settings" method="post" className="surface-panel max-w-2xl p-5">
        <FormHeader title={t("integrations.title")} detail={t("integrations.detail")} />
        <div className="mt-4 rounded-md bg-panel-soft px-3 py-2 text-sm text-muted">
          {settings?.hasSecret
            ? t("integrations.vimeoStateSaved", { status: settings.status })
            : t("integrations.vimeoStateMissing")}
          {settings?.lastError ? <span className="block text-danger">{t("integrations.lastError", { error: settings.lastError })}</span> : null}
        </div>
        <label className="mt-5 block text-sm font-medium">
          {t("tokenLabel")}
          <input name="vimeo_token" type="password" className="mt-2 w-full border border-line px-3 py-2" placeholder={t("tokenPlaceholder")} />
        </label>
        <label className="mt-4 block text-sm font-medium">
          {t("folderUriLabel")}
          <input name="vimeo_folder_uri" className="mt-2 w-full border border-line px-3 py-2" defaultValue={String(settings?.publicConfig.folder_uri ?? "")} placeholder="/users/123/projects/456" />
        </label>
        <label className="mt-4 block text-sm font-medium">
          {t("timezoneLabel")}
          <input name="timezone" className="mt-2 w-full border border-line px-3 py-2" defaultValue={currentTimezone} />
        </label>
        <button className="btn-primary mt-5">{t("save")}</button>
      </form>

      <section className="surface-panel mt-6 max-w-2xl p-5">
        <FormHeader title={t("vimeoShows.title")} detail={t("vimeoShows.detail")} />
        {!token ? <p className="mt-3 text-sm text-muted">{t("vimeoShows.missingToken")}</p> : null}
        {vimeoState.error ? <p className="mt-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong">{vimeoState.error}</p> : null}
        {token && !vimeoState.error ? (
          <>
            <form action="/rtvtime/admin/settings" className="mt-4 grid gap-3">
              <label className="block text-sm font-medium">
                {t("vimeoShows.showLabel")}
                <select name="show_uri" defaultValue={selectedShowUri} className="mt-2 w-full border border-line px-3 py-2">
                  <option value="">{t("vimeoShows.pickShow")}</option>
                  {vimeoState.shows.map((show) => (
                    <option key={show.uri} value={show.uri}>
                      {show.name}{typeof show.videoCount === "number" ? ` (${show.videoCount})` : ""}
                    </option>
                  ))}
                </select>
              </label>
              <button className="btn-secondary w-fit">{t("vimeoShows.viewEpisodes")}</button>
            </form>
            {selectedShowUri ? <EpisodePicker episodes={vimeoState.episodes} showUri={selectedShowUri} noEpisodesLabel={t("vimeoShows.noEpisodes")} episodeLabel={t("vimeoShows.episodeLabel")} importLabel={t("vimeoShows.importEpisode")} /> : null}
          </>
        ) : null}
      </section>
    </AdminShell>
  )
}

async function loadVimeoState(token: string, selectedShowUri: string): Promise<{ shows: VimeoShow[]; episodes: VimeoVideo[]; error: string | null }> {
  try {
    const shows = await listVimeoShows(token)
    const episodes = selectedShowUri ? await listVimeoEpisodes(token, selectedShowUri) : []
    return { shows, episodes, error: null }
  } catch (error) {
    return { shows: [], episodes: [], error: String(error) }
  }
}

function EpisodePicker({
  episodes,
  showUri,
  noEpisodesLabel,
  episodeLabel,
  importLabel
}: {
  episodes: VimeoVideo[]
  showUri: string
  noEpisodesLabel: string
  episodeLabel: string
  importLabel: string
}) {
  if (!episodes.length) {
    return <p className="mt-4 text-sm text-muted">{noEpisodesLabel}</p>
  }
  return (
    <form action="/rtvtime/api/vimeo/import" method="post" className="mt-5 grid gap-3 rounded-md bg-panel-soft p-4">
      <input type="hidden" name="return_to" value={`/admin/settings?show_uri=${encodeURIComponent(showUri)}&imported=1`} />
      <label className="block text-sm font-medium">
        {episodeLabel}
        <select name="video_uri" className="mt-2 w-full border border-line px-3 py-2">
          {episodes.map((episode) => (
            <option key={episode.uri} value={episode.uri}>
              {episode.name} - {formatDuration(episode.duration)}
            </option>
          ))}
        </select>
      </label>
      <button className="btn-primary w-fit">{importLabel}</button>
    </form>
  )
}

function formatDuration(seconds: number) {
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${String(secs).padStart(2, "0")}`
}
