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

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const allowed = await isOutputRequestAllowed({ token: searchParams.get("token") ?? undefined })
    if (!allowed) return NextResponse.json({ error: outputAccessDeniedReason() }, { status: 401 })

    const now = new Date()
    const previewBlockId = searchParams.get("previewBlockId")
    const bundle = previewBlockId
      ? await getPlaybackScheduleForBlock(previewBlockId)
      : await getLiveSchedule(now)
    const timezone = bundle.day?.timezone ?? PLAYOUT_TIMEZONE
    const requestedStartAt = Number(searchParams.get("startAt"))
    const secondsOfDay = previewBlockId
      ? (bundle.blocks.find((block) => block.id === previewBlockId)?.startTimeSeconds ?? 0) +
        (Number.isFinite(requestedStartAt) ? Math.max(0, requestedStartAt) : 0)
      : Number.isFinite(requestedStartAt)
        ? requestedStartAt
        : secondsSinceMidnightInTimezone(now, timezone)
    const active = previewBlockId
      ? previewActiveSchedule(
          bundle,
          previewBlockId,
          Number.isFinite(requestedStartAt) ? Math.max(0, requestedStartAt) : 0
        )
      : findActiveSchedule(bundle, secondsOfDay)
    const override = await getActiveOutputOverride(bundle.day?.id)
    const music = await backgroundMusicForActive(bundle, active)
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
          backgroundMusic: null
        },
        { headers: { "Cache-Control": "no-store" } }
      )
    }

    if (!bundle.day || !active.block) {
      return NextResponse.json(fallbackState("no-active-block"), {
        headers: { "Cache-Control": "no-store" }
      })
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
          backgroundMusic: null
        },
        { headers: { "Cache-Control": "no-store" } }
      )
    }
    const token = searchParams.get("token") ?? process.env.OUTPUT_CAPTURE_TOKEN ?? ""
    if (active.slide) {
      const renderUrl = appUrl(`/output/slide/${active.slide.id}`)
      if (token) renderUrl.searchParams.set("token", token)
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
        if (!vimeoToken) return NextResponse.json(fallbackState("missing-vimeo-token"))
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
            backgroundMusic: null
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
            hlsUrl: active.asset.url,
            startOffsetSeconds,
            durationSeconds: active.asset.durationSeconds,
            backgroundMusic: null
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
            url: active.asset.url,
            startOffsetSeconds,
            durationSeconds: active.asset.durationSeconds ?? active.block.durationSeconds,
            backgroundMusic: null
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
            imageUrl: active.asset.url,
            startOffsetSeconds,
            durationSeconds: active.block.durationSeconds,
            backgroundMusic: music
          },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
    }

    return NextResponse.json(fallbackState("unsupported-active-content"), {
      headers: { "Cache-Control": "no-store" }
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ ...fallbackState("state-error"), error: message }, { status: 200 })
  }
}

function fallbackState(reason: string) {
  return {
    kind: "fallback",
    signature: `fallback:${reason}`,
    reason,
    title: "RTV fallback",
    serverSeconds: secondsSinceMidnightInTimezone(),
    generatedAt: new Date().toISOString(),
    backgroundMusic: null
  }
}

function metadataText(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key]
  return typeof value === "string" ? value : ""
}

async function backgroundMusicForActive(
  bundle: Awaited<ReturnType<typeof getLiveSchedule>>,
  active: ReturnType<typeof findActiveSchedule>
) {
  const eligible =
    active.block?.blockType === "image" ||
    active.block?.blockType === "slide" ||
    Boolean(active.slide) ||
    active.asset?.mediaKind === "image"
  if (!eligible) return null
  const preference = await getLatestMusicPreference()
  if (!preference.enabled) return null
  const tracks = bundle.mediaAssets
    .filter((asset) => asset.assetType === "music" && asset.status === "ready" && asset.url)
    .map((asset) => ({
      id: asset.id,
      title: asset.title,
      url: asset.url!
    }))
  if (!tracks.length) return null
  return {
    enabled: true,
    volume: preference.volume,
    fade: preference.fade,
    tracks
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
