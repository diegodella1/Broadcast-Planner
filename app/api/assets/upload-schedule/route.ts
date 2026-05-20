import { NextResponse } from "next/server"

import { appUrl } from "@/lib/app-url"
import { requireAdmin } from "@/lib/auth"
import { verifyCsrfToken } from "@/lib/csrf"
import { uploadedMediaFieldsFromForm, uploadMediaFile } from "@/lib/media-upload"
import { createProgramBlock } from "@/lib/mutations"
import { assertRateLimit, rateLimitErrorResponse } from "@/lib/rate-limit"

export async function POST(request: Request) {
  try {
    await requireAdmin()
    await assertRateLimit({
      scope: "api:assets:upload-schedule",
      request,
      limit: 20,
      windowSeconds: 60
    })
    await verifyCsrfToken(request)
    const form = await request.formData()
    const file = form.get("media_file") ?? form.get("video_file")
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Select a media file")
    }
    if (file.type.startsWith("audio/")) {
      throw new Error("MP3 is saved in the library. It cannot be a primary schedule block yet.")
    }

    const date = String(form.get("date") || "").trim()
    const startTime = String(form.get("start_time") || "").trim()
    if (!date) throw new Error("Date is required")
    if (!startTime) throw new Error("Start time is required")

    const uploaded = await uploadMediaFile(file, uploadedMediaFieldsFromForm(form))
    const created = await createProgramBlock({
      date,
      title: uploaded.title,
      blockType: blockTypeFor(uploaded.assetType, uploaded.mediaKind),
      assetId: uploaded.assetId,
      startTime,
      durationSeconds: uploaded.durationSeconds,
      hideOverlays: form.get("hide_overlays") === "on"
    })

    const returnTo = String(
      form.get("return_to") || `/admin/schedule/${date}?uploaded=1&created=${created.id}`
    )
    return NextResponse.redirect(appUrl(returnTo), 303)
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    if (error instanceof Error && error.message === "Rate limit exceeded") {
      const { retryAfterSeconds } = rateLimitErrorResponse(error)
      return NextResponse.json(
        { ok: false, error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      )
    }
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 })
  }
}

function blockTypeFor(assetType: string, mediaKind: string) {
  if (assetType === "ad" || assetType === "promo" || assetType === "fallback") return assetType
  if (mediaKind === "image") return "image"
  return "video"
}
