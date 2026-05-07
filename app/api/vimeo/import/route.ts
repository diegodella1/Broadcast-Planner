import { NextResponse } from "next/server"
import { appUrl } from "@/lib/app-url"
import { getVimeoToken, markVimeoStatus } from "@/lib/settings"
import { getVimeoVideo, listVimeoAccountVideos, upsertVimeoVideos } from "@/lib/vimeo"

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const videoUri = String(form.get("video_uri") ?? "")
    const returnTo = String(form.get("return_to") ?? "")
    const token = await getVimeoToken()
    if (!token) {
      await markVimeoStatus("invalid", "Missing Vimeo token")
      return NextResponse.json({ ok: false, error: "Missing Vimeo token" }, { status: 400 })
    }

    const videos = videoUri ? [await getVimeoVideo(token, videoUri)] : await listVimeoAccountVideos(token)
    await upsertVimeoVideos(videos)
    await markVimeoStatus("connected")
    return NextResponse.redirect(appUrl(returnTo || "/admin/assets?imported=1"), 303)
  } catch (error) {
    await markVimeoStatus("failed", String(error)).catch(() => undefined)
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
