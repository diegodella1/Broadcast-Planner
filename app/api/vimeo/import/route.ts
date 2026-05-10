import { NextResponse } from "next/server"

import { appUrl } from "@/lib/app-url"
import { requireAdmin } from "@/lib/auth"
import { getVimeoToken, markVimeoStatus, recordVimeoSyncStatus } from "@/lib/settings"
import { getVimeoVideo, listVimeoAccountVideos, upsertVimeoVideos } from "@/lib/vimeo"

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const form = await request.formData()
    const videoUri = String(form.get("video_uri") ?? "")
    const returnTo = String(form.get("return_to") ?? "")
    const token = await getVimeoToken()
    if (!token) {
      await markVimeoStatus("invalid", "Missing Vimeo token")
      return NextResponse.json({ ok: false, error: "Missing Vimeo token" }, { status: 400 })
    }

    const videos = videoUri
      ? [await getVimeoVideo(token, videoUri)]
      : await listVimeoAccountVideos(token)
    await upsertVimeoVideos(videos)
    await markVimeoStatus("connected")
    await recordVimeoSyncStatus({
      status: "connected",
      syncedCount: videos.length,
      staleCount: 0,
      failedCount: 0
    })
    return NextResponse.redirect(appUrl(returnTo || "/admin/assets?imported=1"), 303)
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    await markVimeoStatus("failed", String(error)).catch(() => undefined)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
