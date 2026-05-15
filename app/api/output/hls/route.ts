import { NextResponse } from "next/server"

import { requireAdmin } from "@/lib/auth"
import { getLiveSchedule, getMediaAssetById } from "@/lib/data"
import { getVimeoToken } from "@/lib/settings"
import { findActiveSchedule } from "@/lib/scheduler"
import { getVimeoPlayback } from "@/lib/vimeo"
import { secondsSinceMidnightInTimezone, PLAYOUT_TIMEZONE } from "@/lib/time"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const requestedAssetId = searchParams.get("assetId")
    const asset = requestedAssetId
      ? await getMediaAssetById(requestedAssetId)
      : await getActiveAsset()
    if (!asset) {
      return NextResponse.json({ error: "No active media asset" }, { status: 404 })
    }
    if (asset.sourceType !== "vimeo" || !asset.vimeoId) {
      return NextResponse.json({ error: "Active asset is not a Vimeo video" }, { status: 400 })
    }

    const token = await getVimeoToken()
    if (!token) {
      return NextResponse.json({ error: "Missing Vimeo token" }, { status: 400 })
    }

    const playback = await getVimeoPlayback(token, asset.vimeoId)
    return NextResponse.json(
      {
        assetId: asset.id,
        title: playback.title || asset.title,
        durationSeconds: playback.durationSeconds || asset.durationSeconds || null,
        hlsUrl: playback.hlsUrl
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

async function getActiveAsset() {
  const now = new Date()
  const bundle = await getLiveSchedule(now)
  const timezone = bundle.day?.timezone ?? PLAYOUT_TIMEZONE
  const active = findActiveSchedule(bundle, secondsSinceMidnightInTimezone(now, timezone))
  return active.asset ?? null
}
