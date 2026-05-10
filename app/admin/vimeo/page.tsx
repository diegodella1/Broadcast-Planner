import Link from "next/link"

import { AdminShell } from "@/components/admin-shell"
import { EmptyState, Field, Notice } from "@/components/ui"
import { getVimeoToken } from "@/lib/settings"
import {
  listVimeoAccountVideos,
  listVimeoEpisodes,
  listVimeoShows,
  searchVimeoAccountVideos
} from "@/lib/vimeo"

import type { VimeoShow, VimeoVideo } from "@/lib/vimeo"

export const dynamic = "force-dynamic"

export default async function VimeoImportPage({
  searchParams
}: {
  searchParams: Promise<{
    q?: string
    show_uri?: string
    show_name?: string
    month?: string
    year?: string
    imported?: string
  }>
}) {
  const params = await searchParams
  const token = await getVimeoToken()

  let shows: VimeoShow[] = []
  let videos: VimeoVideo[] = []
  let error: string | null = null

  if (token) {
    try {
      const q = (params.q ?? "").trim()
      shows = await listVimeoShows(token)
      videos = params.show_uri
        ? await listVimeoEpisodes(token, params.show_uri)
        : q
          ? await searchVimeoAccountVideos(token, q)
          : await listVimeoAccountVideos(token)
      videos = filterVideos(videos, params)
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
    }
  }

  const selectedShow = shows.find((show) => show.uri === params.show_uri)
  const filteredShows = filterShows(shows, params.show_name)

  return (
    <AdminShell
      title="Import Vimeo episode"
      description="Choose exactly one Vimeo video, inspect duration/privacy, then import it into the media library."
      actions={
        <Link className="btn-secondary" href="/admin/assets?kind=vimeo">
          Back to library
        </Link>
      }
    >
      {params.imported ? <Notice tone="ok">Vimeo episode imported to the library.</Notice> : null}
      {!token ? (
        <Notice tone="danger" title="Missing Vimeo token">
          Add the Vimeo access token in Integrations before importing episodes.
        </Notice>
      ) : null}
      {error ? (
        <Notice tone="danger" title="Vimeo API error">
          {error}
        </Notice>
      ) : null}

      <section className="mb-5 grid gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="surface-panel p-4">
          <h2 className="font-semibold">Shows / folders</h2>
          <p className="mt-1 text-sm text-muted">
            Pick a show first when possible. Then import one episode from the list.
          </p>
          <div className="mt-4 grid gap-2">
            <Link
              href="/admin/vimeo"
              className={[
                "rounded-md border px-3 py-2 text-sm font-semibold",
                !params.show_uri
                  ? "border-accent-positive bg-surface-selected-positive text-accent-positive"
                  : "border-line bg-surface text-ink"
              ].join(" ")}
            >
              Recent account videos
            </Link>
            <form action="/admin/vimeo" className="grid gap-2">
              <Field label="Filter show name">
                <input
                  name="show_name"
                  defaultValue={params.show_name ?? ""}
                  placeholder="Show folder"
                  className="border border-line px-3 py-2 text-sm font-normal text-ink"
                />
              </Field>
              <button className="btn-secondary">Filter shows</button>
            </form>
            {filteredShows.map((show) => (
              <Link
                key={show.uri}
                href={`/admin/vimeo?show_uri=${encodeURIComponent(show.uri)}${params.q ? `&q=${encodeURIComponent(params.q)}` : ""}${params.month ? `&month=${encodeURIComponent(params.month)}` : ""}${params.year ? `&year=${encodeURIComponent(params.year)}` : ""}`}
                className={[
                  "rounded-md border px-3 py-2 text-sm",
                  params.show_uri === show.uri
                    ? "border-accent-positive bg-surface-selected-positive text-accent-positive"
                    : "border-line bg-surface text-ink hover:bg-panel-soft"
                ].join(" ")}
              >
                <span className="block font-semibold">{show.name}</span>
                <span className="text-xs text-muted">{show.videoCount ?? 0} videos</span>
              </Link>
            ))}
            {filteredShows.length === 0 && token && !error ? (
              <p className="rounded-md border border-line bg-panel-soft px-3 py-2 text-sm text-muted">
                No Vimeo shows found. Use search or recent videos.
              </p>
            ) : null}
          </div>
        </aside>

        <section className="min-w-0">
          <form
            action="/admin/vimeo"
            className="surface-panel mb-5 grid gap-3 p-4 md:grid-cols-[1fr_140px_120px_120px_130px]"
          >
            {params.show_uri ? (
              <input type="hidden" name="show_uri" value={params.show_uri} />
            ) : null}
            <Field label="Search Vimeo account">
              <input
                name="q"
                defaultValue={params.q ?? ""}
                placeholder="Episode title"
                className="border border-line px-3 py-2 text-sm font-normal text-ink"
              />
            </Field>
            <Field label="Show name">
              <input
                name="show_name"
                defaultValue={params.show_name ?? ""}
                placeholder="Filter sidebar"
                className="border border-line px-3 py-2 text-sm font-normal text-ink"
              />
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
            <button className="btn-secondary self-end">Search</button>
          </form>

          <div className="surface-panel overflow-hidden">
            <div className="border-b border-line px-4 py-3">
              <h2 className="font-semibold">
                {selectedShow
                  ? selectedShow.name
                  : params.q
                    ? `Episode search: ${params.q}`
                    : "Recent videos"}
              </h2>
              <p className="mt-1 text-sm text-muted">
                Import is one episode at a time. Filters apply by episode title and Vimeo created
                month/year.
              </p>
            </div>
            <div className="divide-y divide-line">
              {videos.map((video) => (
                <VimeoVideoRow key={video.uri} video={video} />
              ))}
            </div>
            {videos.length === 0 ? (
              <div className="p-4">
                <EmptyState title="No Vimeo videos found">
                  Search by title or pick a show from the left.
                </EmptyState>
              </div>
            ) : null}
          </div>
        </section>
      </section>
    </AdminShell>
  )
}

function VimeoVideoRow({ video }: { video: VimeoVideo }) {
  const thumbnail = video.pictures?.sizes?.sort((a, b) => b.width - a.width)[0]?.link
  return (
    <div className="grid gap-3 p-4 md:grid-cols-[120px_1fr_150px] md:items-center">
      {thumbnail ? (
        <img
          src={thumbnail}
          alt=""
          className="aspect-video w-full rounded-md border border-line object-cover"
        />
      ) : (
        <div className="grid aspect-video place-items-center rounded-md border border-line bg-panel-soft text-xs font-semibold text-muted">
          Vimeo
        </div>
      )}
      <div className="min-w-0">
        <p className="truncate font-semibold">{video.name}</p>
        <p className="mt-1 text-sm text-muted">
          {video.duration}s · {formatVimeoDate(video.created_time)} · {video.status ?? "unknown"} ·
          privacy {video.privacy?.view ?? "n/a"}
        </p>
        <a
          className="mt-1 block truncate text-xs text-info"
          href={video.link}
          target="_blank"
          rel="noreferrer"
        >
          {video.link}
        </a>
      </div>
      <form action="/api/vimeo/import" method="post" className="grid gap-2">
        <input type="hidden" name="video_uri" value={video.uri} />
        <input type="hidden" name="return_to" value="/admin/vimeo?imported=1" />
        <button className="btn-primary">Import this episode</button>
      </form>
    </div>
  )
}

function filterShows(shows: VimeoShow[], showName: string | undefined) {
  const query = (showName ?? "").trim().toLowerCase()
  if (!query) return shows
  return shows.filter((show) => show.name.toLowerCase().includes(query))
}

function filterVideos(videos: VimeoVideo[], params: { q?: string; month?: string; year?: string }) {
  const q = (params.q ?? "").trim().toLowerCase()
  return videos.filter((video) => {
    if (q && !video.name.toLowerCase().includes(q)) return false
    if (!params.month && !params.year) return true
    const date = parseVimeoDate(video.created_time)
    if (!date) return false
    if (params.year && String(date.getUTCFullYear()) !== params.year) return false
    if (params.month && String(date.getUTCMonth() + 1).padStart(2, "0") !== params.month) {
      return false
    }
    return true
  })
}

function parseVimeoDate(value: string | undefined) {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date
}

function formatVimeoDate(value: string | undefined) {
  const date = parseVimeoDate(value)
  if (!date) return "no date"
  return new Intl.DateTimeFormat("en", {
    year: "numeric",
    month: "short",
    day: "2-digit",
    timeZone: "UTC"
  }).format(date)
}
