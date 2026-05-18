import { NextResponse } from "next/server"

import { appUrl } from "@/lib/app-url"
import { requireAdmin } from "@/lib/auth"
import { verifyCsrfToken } from "@/lib/csrf"
import { uploadedMediaFieldsFromForm, uploadMediaFile } from "@/lib/media-upload"
import { assertRateLimit, rateLimitErrorResponse } from "@/lib/rate-limit"

export async function POST(request: Request) {
  try {
    await requireAdmin()
    await assertRateLimit({ scope: "api:assets:upload", request, limit: 20, windowSeconds: 60 })
    await verifyCsrfToken(request)
    const form = await request.formData()
    const file = form.get("media_file") ?? form.get("video_file")
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Select a media file")
    }
    const returnTo = String(form.get("return_to") || "/admin/assets?uploaded=1")
    await uploadMediaFile(file, uploadedMediaFieldsFromForm(form))

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
