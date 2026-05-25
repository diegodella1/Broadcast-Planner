import { NextResponse } from "next/server"

import { appUrl } from "@/lib/app-url"
import { getLiveSchedule, getPlaybackScheduleForBlock } from "@/lib/data"
import { getLatestMusicPreference } from "@/lib/operator-preferences"
import { getActiveOutputOverride } from "@/lib/output-overrides"
import { isOutputRequestAllowed, outputAccessDeniedReason } from "@/lib/output-auth"
import { findActiveLayers, findActiveSchedule } from "@/lib/scheduler"
import { getVimeoToken } from "@/lib/settings"
import { PLAYOUT_TIMEZONE, secondsSinceMidnightInTimezone } from "@/lib/time"
import { getVimeoPlayback } from "@/lib/vimeo"

import type { MediaAsset, ScheduleBundle } from "@/lib/types"

export const dynamic = "force-dynamic"

type OutputBase = {
  serverSeconds: number
  generatedAt: string
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const allowed = await isOutputRequestAllowed({ token: searchParams.get("token") ?? undefined })
    if (!allowed) return NextResponse.json({ error: outputAccessDeniedReason() }, { status: 401 })
    const mediaAccessToken = searchParams.get("token") ?? process.env.OUTPUT_CAPTURE_TOKEN ?? ""

    const now = new Date()
    const previewBlockId = searchParams.get("previewBlockId")
    const bundle = previewBlockId
      ? await getPlaybackScheduleForBlock(previewBlockId)
      : await getLiveSchedule(now)
    const timezone = bundle.day?.timezone ?? PLAYOUT_TIMEZONE
    const startAtParam = searchParams.get("startAt")
    const requestedStartAt = startAtParam === null ? null : Number(startAtParam)
    const hasRequestedStartAt = requestedStartAt !== null && Number.isFinite(requestedStartAt)
    const secondsOfDay = previewBlockId
      ? (bundle.blocks.find((block) => block.id === previewBlockId)?.startTimeSeconds ?? 0) +
        (hasRequestedStartAt ? Math.max(0, requestedStartAt) : 0)
      : hasRequestedStartAt
        ? requestedStartAt
        : secondsSinceMidnightInTimezone(now, timezone)
    const active = previewBlockId
      ? previewActiveSchedule(
          bundle,
          previewBlockId,
          hasRequestedStartAt ? Math.max(0, requestedStartAt) : 0
        )
      : findActiveSchedule(bundle, secondsOfDay)
    const override = await getActiveOutputOverride(bundle.day?.id)
    const music = await backgroundMusicForActive(bundle, active, mediaAccessToken)
    const base = {
      serverSeconds: secondsOfDay,
      generatedAt: now.toISOString()
    }
    if (bundle.day && override?.sourceType === "reuters" && override.streamUrl) {
      return NextResponse.json(
        {
          ...base,
          kind: "hls",
          signature: `reuters-override:${override.id}:${override.updatedAt}`,
          blockId: override.blockId,
          title: override.label ?? "Reuters live",
          hlsUrl: override.streamUrl,
          startOffsetSeconds: 0,
          durationSeconds: null,
          sourceType: "reuters",
          streamProtocol: override.streamProtocol,
          backgroundMusic: suppressBackgroundMusic(music)
        },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    if (!bundle.day || !active.block) {
      return NextResponse.json(
        await fallbackStateForBundle(bundle, "no-active-block", base, mediaAccessToken, music),
        {
          headers: { "Cache-Control": "no-store" }
        }
      )
    }

    const startOffsetSeconds = Math.max(0, Math.floor(active.elapsedInBlock))
    const reutersUrl = metadataText(active.block.metadata, "reuters_stream_url")
    if (reutersUrl) {
      return NextResponse.json(
        {
          ...base,
          kind: "hls",
          signature: `reuters:${active.block.id}:${metadataText(active.block.metadata, "reuters_stream_refreshed_at")}`,
          blockId: active.block.id,
          title: metadataText(active.block.metadata, "reuters_stream_label") || active.block.title,
          hlsUrl: reutersUrl,
          startOffsetSeconds: 0,
          durationSeconds: active.block.durationSeconds,
          sourceType: "reuters",
          streamProtocol: metadataText(active.block.metadata, "reuters_stream_protocol") || "hls",
          backgroundMusic: suppressBackgroundMusic(music)
        },
        { headers: { "Cache-Control": "no-store" } }
      )
    }
    if (active.slide) {
      const renderUrl = appUrl(`/output/slide/${active.slide.id}`)
      if (mediaAccessToken) renderUrl.searchParams.set("token", mediaAccessToken)
      return NextResponse.json(
        {
          ...base,
          kind: "slide",
          signature: `slide:${active.block.id}:${active.slide.id}:${active.slide.updatedAt}`,
          blockId: active.block.id,
          title: active.slide.title,
          slideId: active.slide.id,
          templateId: active.slide.templateId,
          ...(active.slide.templateId ? { renderUrl: renderUrl.toString() } : {}),
          ...(active.slide.imageUrl ? { imageUrl: active.slide.imageUrl } : {}),
          ...(active.slide.content || active.slide.htmlContent
            ? { content: active.slide.content ?? active.slide.htmlContent ?? "" }
            : {}),
          startOffsetSeconds,
          durationSeconds: active.block.durationSeconds,
          backgroundMusic: music
        },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    if (active.asset) {
      if (active.asset.sourceType === "vimeo" && active.asset.vimeoId) {
        const vimeoToken = await getVimeoToken()
        if (!vimeoToken)
          return NextResponse.json(
            await fallbackStateForBundle(bundle, "missing-vimeo-token", base, mediaAccessToken)
          )
        const playback = await getVimeoPlayback(vimeoToken, active.asset.vimeoId)
        return NextResponse.json(
          {
            ...base,
            kind: "vimeo",
            signature: `vimeo:${active.block.id}:${active.asset.id}`,
            blockId: active.block.id,
            assetId: active.asset.id,
            title: playback.title || active.asset.title,
            hlsUrl: playback.hlsUrl,
            startOffsetSeconds,
            durationSeconds: playback.durationSeconds || active.asset.durationSeconds,
            ...videoPresentation(active.asset),
            backgroundMusic: suppressBackgroundMusic(music)
          },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
      if (active.asset.sourceType === "hls" && active.asset.url) {
        return NextResponse.json(
          {
            ...base,
            kind: "hls",
            signature: `hls:${active.block.id}:${active.asset.id}`,
            blockId: active.block.id,
            assetId: active.asset.id,
            title: active.asset.title,
            hlsUrl: withMediaAccessToken(active.asset.url, mediaAccessToken),
            startOffsetSeconds,
            durationSeconds: active.asset.durationSeconds,
            ...videoPresentation(active.asset),
            backgroundMusic: suppressBackgroundMusic(music)
          },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
      if (active.asset.sourceType === "remote_mp4" && active.asset.url) {
        return NextResponse.json(
          {
            ...base,
            kind: "mp4",
            signature: `mp4:${active.block.id}:${active.asset.id}`,
            blockId: active.block.id,
            assetId: active.asset.id,
            title: active.asset.title,
            url: withMediaAccessToken(active.asset.url, mediaAccessToken),
            startOffsetSeconds,
            durationSeconds: active.asset.durationSeconds ?? active.block.durationSeconds,
            ...videoPresentation(active.asset),
            backgroundMusic: suppressBackgroundMusic(music)
          },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
      if (
        (active.asset.sourceType === "remote_image" ||
          active.asset.sourceType === "supabase_image") &&
        active.asset.url
      ) {
        return NextResponse.json(
          {
            ...base,
            kind: "image",
            signature: `image:${active.block.id}:${active.asset.id}`,
            blockId: active.block.id,
            assetId: active.asset.id,
            title: active.asset.title,
            imageUrl: withMediaAccessToken(active.asset.url, mediaAccessToken),
            startOffsetSeconds,
            durationSeconds: active.block.durationSeconds,
            backgroundMusic: music
          },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
    }

    return NextResponse.json(
      await fallbackStateForBundle(
        bundle,
        "unsupported-active-content",
        base,
        mediaAccessToken,
        music
      ),
      {
        headers: { "Cache-Control": "no-store" }
      }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ ...fallbackState("state-error"), error: message }, { status: 200 })
  }
}

async function fallbackStateForBundle(
  bundle: ScheduleBundle,
  reason: string,
  base: OutputBase,
  mediaAccessToken = "",
  backgroundMusic: Awaited<ReturnType<typeof backgroundMusicForActive>> = null
) {
  const fallbackAsset = findFallbackLoopAsset(bundle)
  if (!fallbackAsset) return fallbackState(reason, base, backgroundMusic)
  return (
    (await fallbackVideoState(fallbackAsset, reason, base, mediaAccessToken)) ??
    fallbackState(reason, base, backgroundMusic)
  )
}

async function fallbackVideoState(
  asset: MediaAsset,
  reason: string,
  base: OutputBase,
  mediaAccessToken = ""
) {
  const common = {
    ...base,
    signature: `fallback-loop:${asset.id}:${asset.updatedAt}`,
    reason,
    assetId: asset.id,
    title: asset.title,
    startOffsetSeconds: loopOffset(base.serverSeconds, asset.durationSeconds),
    durationSeconds: asset.durationSeconds ?? null,
    muted: true,
    loop: true,
    ...videoPresentation(asset),
    backgroundMusic: null
  }
  if (asset.sourceType === "remote_mp4" && asset.url) {
    return { ...common, kind: "mp4", url: withMediaAccessToken(asset.url, mediaAccessToken) }
  }
  if (asset.sourceType === "hls" && asset.url) {
    return { ...common, kind: "hls", hlsUrl: withMediaAccessToken(asset.url, mediaAccessToken) }
  }
  if (asset.sourceType === "vimeo" && asset.vimeoId) {
    const vimeoToken = await getVimeoToken()
    if (!vimeoToken) return null
    const playback = await getVimeoPlayback(vimeoToken, asset.vimeoId)
    return {
      ...common,
      kind: "vimeo",
      title: playback.title || asset.title,
      hlsUrl: playback.hlsUrl,
      durationSeconds: playback.durationSeconds || asset.durationSeconds || null,
      startOffsetSeconds: loopOffset(
        base.serverSeconds,
        playback.durationSeconds || asset.durationSeconds
      )
    }
  }
  return null
}

function findFallbackLoopAsset(bundle: ScheduleBundle) {
  return (
    bundle.mediaAssets.find(
      (asset) =>
        asset.status === "ready" &&
        asset.mediaKind === "video" &&
        asset.metadata?.fallback_loop === true &&
        Boolean(asset.url || asset.vimeoId)
    ) ?? null
  )
}

function loopOffset(serverSeconds: number, durationSeconds?: number | null) {
  if (!durationSeconds || durationSeconds <= 1) return 0
  return Math.max(0, Math.floor(serverSeconds % durationSeconds))
}

function fallbackState(
  reason: string,
  base?: OutputBase,
  backgroundMusic: Awaited<ReturnType<typeof backgroundMusicForActive>> = null
) {
  return {
    kind: "fallback",
    signature: `fallback:${reason}`,
    reason,
    title: "RTV fallback",
    serverSeconds: base?.serverSeconds ?? secondsSinceMidnightInTimezone(),
    generatedAt: base?.generatedAt ?? new Date().toISOString(),
    backgroundMusic
  }
}

function videoPresentation(asset: MediaAsset) {
  const presentation = asset.metadata?.presentation === "vertical_blur" ? "vertical_blur" : "fit"
  const background =
    presentation === "vertical_blur" || asset.metadata?.background === "blur" ? "blur" : "black"
  return { presentation, background }
}

function metadataText(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key]
  return typeof value === "string" ? value : ""
}

async function backgroundMusicForActive(
  bundle: Awaited<ReturnType<typeof getLiveSchedule>>,
  active: ReturnType<typeof findActiveSchedule>,
  mediaAccessToken = ""
) {
  const shouldPlay =
    active.block?.blockType === "image" ||
    active.block?.blockType === "slide" ||
    active.block?.blockType === "fallback" ||
    !active.block ||
    Boolean(active.slide) ||
    active.asset?.mediaKind === "image"
  const preference = await getLatestMusicPreference()
  if (!preference.enabled) return null
  const tracks = bundle.mediaAssets
    .filter((asset) => asset.assetType === "music" && asset.status === "ready" && asset.url)
    .map((asset) => ({
      id: asset.id,
      title: asset.title,
      url: withMediaAccessToken(asset.url!, mediaAccessToken)
    }))
  if (!tracks.length) return null
  return {
    enabled: shouldPlay,
    volume: preference.volume,
    fade: preference.fade,
    tracks
  }
}

function suppressBackgroundMusic(
  music: Awaited<ReturnType<typeof backgroundMusicForActive>>
): Awaited<ReturnType<typeof backgroundMusicForActive>> {
  return music ? { ...music, enabled: false } : null
}

function withMediaAccessToken(value: string, token: string) {
  if (!token || !value.includes("/api/media/assets/")) return value
  try {
    const url = new URL(value)
    if (url.pathname.startsWith("/api/media/assets/")) {
      url.searchParams.set("token", token)
      return url.toString()
    }
    return value
  } catch {
    if (!value.startsWith("/api/media/assets/")) return value
    const url = new URL(value, "https://local.rtv")
    url.searchParams.set("token", token)
    return `${url.pathname}${url.search}`
  }
}

function previewActiveSchedule(
  bundle: Awaited<ReturnType<typeof getLiveSchedule>>,
  blockId: string,
  elapsedInBlock: number
): ReturnType<typeof findActiveSchedule> {
  const block = bundle.blocks.find((candidate) => candidate.id === blockId) ?? null
  if (!block) {
    return {
      day: bundle.day,
      block: null,
      elapsedInBlock: 0,
      layers: [],
      fallbackAsset:
        bundle.mediaAssets.find(
          (asset) => asset.assetType === "fallback" && asset.status === "ready"
        ) ?? null,
      reason: "Block not found"
    }
  }
  return {
    day: bundle.day,
    block,
    elapsedInBlock,
    layers: block.hideOverlays ? [] : findActiveLayers(bundle.layers, block.id, elapsedInBlock),
    asset: block.assetId
      ? (bundle.mediaAssets.find((asset) => asset.id === block.assetId) ?? null)
      : null,
    slide: block.slideId
      ? (bundle.slideAssets.find((slide) => slide.id === block.slideId) ?? null)
      : null,
    fallbackAsset: block.fallbackAssetId
      ? (bundle.mediaAssets.find((asset) => asset.id === block.fallbackAssetId) ?? null)
      : (bundle.mediaAssets.find(
          (asset) => asset.assetType === "fallback" && asset.status === "ready"
        ) ?? null)
  }
}
