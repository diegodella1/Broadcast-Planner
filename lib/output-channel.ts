import fs from "node:fs/promises"
import path from "node:path"

import { appUrl } from "./app-url"

export const OUTPUT_CHANNEL_PLAYLIST = "live.m3u8"

export function outputChannelDir() {
  return process.env.OUTPUT_CHANNEL_DIR || path.join("/tmp", "rtvplanner-output-channel")
}

export function outputChannelUrl(requestUrl?: string) {
  const url = appUrl("/api/output/channel/live.m3u8")
  if (process.env.OUTPUT_CAPTURE_TOKEN)
    url.searchParams.set("token", process.env.OUTPUT_CAPTURE_TOKEN)
  if (requestUrl && !process.env.APP_BASE_URL && !process.env.NEXT_PUBLIC_APP_BASE_URL) {
    const request = new URL(requestUrl)
    url.protocol = request.protocol
    url.host = request.host
  }
  return url
}

export async function readOutputChannelPlaylist() {
  try {
    return await fs.readFile(path.join(outputChannelDir(), OUTPUT_CHANNEL_PLAYLIST), "utf8")
  } catch {
    return emptyLivePlaylist()
  }
}

export function emptyLivePlaylist() {
  return [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-TARGETDURATION:4",
    "#EXT-X-MEDIA-SEQUENCE:0",
    ""
  ].join("\n")
}

export function rewriteChannelPlaylist(manifest: string, requestUrl: string) {
  const request = new URL(requestUrl)
  const token = request.searchParams.get("token")
  return manifest
    .split(/\r?\n/)
    .map((line) => {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#") || /^[a-z]+:\/\//i.test(trimmed)) return line
      const segmentPath = `/api/output/channel/segments/${encodeURIComponent(trimmed)}`
      const segment =
        process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL
          ? appUrl(segmentPath)
          : new URL(segmentPath, request)
      if (token) segment.searchParams.set("token", token)
      return segment.toString()
    })
    .join("\n")
}

export function safeSegmentName(name: string) {
  if (!/^[A-Za-z0-9._-]+\.ts$/.test(name)) return null
  return name
}
