import { NextResponse } from "next/server"

import { appUrl } from "@/lib/app-url"
import { getLiveSchedule } from "@/lib/data"
import { isOutputRequestAllowed, outputAccessDeniedReason } from "@/lib/output-auth"
import { findActiveSchedule } from "@/lib/scheduler"
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
    const bundle = await getLiveSchedule(now)
    const timezone = bundle.day?.timezone ?? PLAYOUT_TIMEZONE
    const secondsOfDay = secondsSinceMidnightInTimezone(now, timezone)
    const active = findActiveSchedule(bundle, secondsOfDay)

    if (!bundle.day || !active.block) {
      return NextResponse.json(fallbackState("no-active-block"), {
        headers: { "Cache-Control": "no-store" }
      })
    }

    const startOffsetSeconds = Math.max(0, Math.floor(active.elapsedInBlock))
    const token = searchParams.get("token") ?? process.env.OUTPUT_CAPTURE_TOKEN ?? ""
    if (active.slide?.templateId) {
      const renderUrl = appUrl(`/output/slide/${active.slide.id}`)
      if (token) renderUrl.searchParams.set("token", token)
      return NextResponse.json(
        {
          kind: "slide",
          signature: `slide:${active.block.id}:${active.slide.id}:${active.slide.templateId}`,
          blockId: active.block.id,
          title: active.slide.title,
          slideId: active.slide.id,
          templateId: active.slide.templateId,
          renderUrl: renderUrl.toString(),
          startOffsetSeconds,
          durationSeconds: active.block.durationSeconds
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
            kind: "vimeo",
            signature: `vimeo:${active.block.id}:${active.asset.id}`,
            blockId: active.block.id,
            assetId: active.asset.id,
            title: playback.title || active.asset.title,
            hlsUrl: playback.hlsUrl,
            startOffsetSeconds,
            durationSeconds: playback.durationSeconds || active.asset.durationSeconds
          },
          { headers: { "Cache-Control": "no-store" } }
        )
      }
      if (active.asset.sourceType === "hls" && active.asset.url) {
        return NextResponse.json(
          {
            kind: "hls",
            signature: `hls:${active.block.id}:${active.asset.id}`,
            blockId: active.block.id,
            assetId: active.asset.id,
            title: active.asset.title,
            hlsUrl: active.asset.url,
            startOffsetSeconds,
            durationSeconds: active.asset.durationSeconds
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
    title: "RTV fallback"
  }
}
