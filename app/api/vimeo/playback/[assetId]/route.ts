import { NextResponse } from "next/server"

import { getMediaAssetById } from "@/lib/data"
import { isOutputRequestAllowed, outputAccessDeniedReason } from "@/lib/output-auth"
import { getVimeoToken } from "@/lib/settings"
import { getVimeoPlayback } from "@/lib/vimeo"

export const dynamic = "force-dynamic"

export async function GET(request: Request, { params }: { params: Promise<{ assetId: string }> }) {
  try {
    const { searchParams } = new URL(request.url)
    const allowed = await isOutputRequestAllowed({
      token: searchParams.get("token") ?? undefined
    })
    if (!allowed) {
      return NextResponse.json({ error: outputAccessDeniedReason() }, { status: 401 })
    }
    const { assetId } = await params
    const asset = await getMediaAssetById(assetId)
    if (!asset) {
      return NextResponse.json({ error: "Vimeo asset not found" }, { status: 404 })
    }
    if (asset.sourceType !== "vimeo" || !asset.vimeoId) {
      return NextResponse.json({ error: "Asset is not a Vimeo video" }, { status: 400 })
    }

    const token = await getVimeoToken()
    if (!token) {
      return NextResponse.json({ error: "Missing Vimeo token" }, { status: 400 })
    }

    const playback = await getVimeoPlayback(token, asset.vimeoId)
    return NextResponse.json(
      {
        hlsUrl: playback.hlsUrl,
        expiresAt: null,
        title: playback.title || asset.title,
        durationSeconds: playback.durationSeconds || asset.durationSeconds || null
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    console.error("[api/vimeo/playback] failed to resolve Vimeo playback", error)
    const message = error instanceof Error ? error.message : "Unknown Vimeo playback error"
    return NextResponse.json({ error: message }, { status: 502 })
  }
}
