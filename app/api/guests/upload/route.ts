import { NextResponse } from "next/server"

import { appUrl } from "@/lib/app-url"
import { requireAdmin } from "@/lib/auth"
import { CSRF_FIELD, verifyCsrfTokenValue } from "@/lib/csrf"
import { uploadMediaFile } from "@/lib/media-upload"
import { attachGuestMediaAsset } from "@/lib/mutations"
import { assertRateLimit, rateLimitErrorResponse } from "@/lib/rate-limit"

export async function POST(request: Request) {
  try {
    await requireAdmin()
    await assertRateLimit({ scope: "api:guests:upload", request, limit: 30, windowSeconds: 60 })
    const form = await request.formData()
    await verifyCsrfTokenValue(form.get(CSRF_FIELD))

    const guestId = String(form.get("guest_id") || "").trim()
    const kind = String(form.get("kind") || "")
    const file = form.get("media_file") ?? form.get("video_file")
    if (!guestId) throw new Error("Guest is required")
    if (kind !== "photo" && kind !== "video") throw new Error("Invalid guest media kind")
    if (!(file instanceof File) || file.size === 0) throw new Error("Select a media file")
    if (kind === "photo" && !file.type.startsWith("image/")) {
      throw new Error("Guest photo must be an image")
    }
    if (kind === "video" && !file.type.startsWith("video/")) {
      throw new Error("Guest video must be MP4 or WebM")
    }

    const title = String(form.get("title") || file.name || "Guest media").trim()
    const uploaded = await uploadMediaFile(file, {
      title,
      assetType: kind === "photo" ? "image" : "video",
      orientation: String(form.get("orientation") || "auto"),
      durationSeconds: form.get("duration_seconds") as string | null,
      detectedDurationSeconds: form.get("detected_duration_seconds") as string | null,
      detectedWidth: form.get("detected_width") as string | null,
      detectedHeight: form.get("detected_height") as string | null
    })
    await attachGuestMediaAsset({ guestId, kind, assetId: uploaded.assetId, url: uploaded.url })

    const returnTo = String(form.get("return_to") || "/admin/guests?uploaded=1")
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
    if (isUnreadableMultipartError(error)) {
      return NextResponse.json(
        {
          ok: false,
          error:
            "Upload request could not be read. Keep browser uploads under 95 MB, or use URL for larger files."
        },
        { status: 413 }
      )
    }
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 })
  }
}

function isUnreadableMultipartError(error: unknown) {
  return error instanceof TypeError && error.message.includes("Failed to parse body as FormData")
}
