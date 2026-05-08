import { revalidatePath } from "next/cache"

import { createServiceClient } from "./supabase/server"

const VIMEO_API = "https://api.vimeo.com"
const VIMEO_ACCEPT = "application/vnd.vimeo.*+json;version=3.4"

export type VimeoShow = {
  uri: string
  name: string
  link?: string
  description?: string
  videoCount?: number
}

export type VimeoVideo = {
  uri: string
  name: string
  link: string
  duration: number
  pictures?: { sizes?: Array<{ link: string; width: number }> }
  privacy?: { view?: string; embed?: string }
  status?: string
}

type VimeoPage<T> = {
  data?: T[]
}

export async function listVimeoShows(token: string): Promise<VimeoShow[]> {
  const page = await vimeoFetch<
    VimeoPage<{
      uri: string
      name: string
      link?: string
      description?: string
      metadata?: { connections?: { videos?: { total?: number } } }
    }>
  >(
    "/me/albums?per_page=100&fields=uri,name,link,description,metadata.connections.videos.total",
    token
  )
  return (page.data ?? []).map((show) => {
    const videoCount = show.metadata?.connections?.videos?.total
    return {
      uri: show.uri,
      name: show.name,
      ...(show.link !== undefined ? { link: show.link } : {}),
      ...(show.description !== undefined ? { description: show.description } : {}),
      ...(videoCount !== undefined ? { videoCount } : {})
    }
  })
}

export async function listVimeoEpisodes(token: string, showUri: string): Promise<VimeoVideo[]> {
  return listVimeoVideos(token, `${showUri}/videos?per_page=100&fields=${videoFields()}`)
}

export async function listVimeoAccountVideos(token: string): Promise<VimeoVideo[]> {
  return listVimeoVideos(token, `/me/videos?per_page=25&fields=${videoFields()}`)
}

export async function getVimeoVideo(token: string, videoUri: string): Promise<VimeoVideo> {
  return vimeoFetch<VimeoVideo>(`${videoUri}?fields=${videoFields()}`, token)
}

export async function upsertVimeoVideos(videos: VimeoVideo[]) {
  const supabase = createServiceClient()
  const rows = videos.map(vimeoVideoToAssetRow)
  if (rows.length) {
    const { error } = await supabase.from("media_assets").upsert(rows, { onConflict: "vimeo_id" })
    if (error) throw error
  }
  revalidatePath("/admin/assets")
}

function vimeoVideoToAssetRow(video: VimeoVideo) {
  const vimeoId = video.uri.split("/").pop()
  const thumbnail = video.pictures?.sizes?.sort((a, b) => b.width - a.width)[0]?.link ?? null
  return {
    title: video.name,
    source_type: "vimeo",
    media_kind: "video",
    asset_type: video.duration <= 300 ? "ad" : "video",
    url: video.link,
    thumbnail_url: thumbnail,
    duration_seconds: video.duration,
    status: video.status === "available" ? "ready" : "syncing",
    vimeo_id: vimeoId,
    vimeo_uri: video.uri,
    vimeo_privacy: video.privacy?.view ?? null,
    vimeo_embed_status: video.privacy?.embed ?? null,
    metadata: video,
    updated_at: new Date().toISOString()
  }
}

async function listVimeoVideos(token: string, path: string): Promise<VimeoVideo[]> {
  const page = await vimeoFetch<VimeoPage<VimeoVideo>>(path, token)
  return page.data ?? []
}

async function vimeoFetch<T>(path: string, token: string): Promise<T> {
  const response = await fetch(`${VIMEO_API}${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: VIMEO_ACCEPT },
    cache: "no-store"
  })
  if (!response.ok) {
    throw new Error(`Vimeo returned ${response.status}`)
  }
  return response.json() as Promise<T>
}

function videoFields() {
  return "uri,name,link,duration,pictures,privacy,status"
}
