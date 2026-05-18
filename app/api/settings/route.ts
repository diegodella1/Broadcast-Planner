import { NextResponse } from "next/server"

import { appUrl } from "@/lib/app-url"
import { requireAdmin } from "@/lib/auth"
import { verifyCsrfToken } from "@/lib/csrf"
import { assertRateLimit, rateLimitErrorResponse } from "@/lib/rate-limit"
import { saveVimeoSettings } from "@/lib/settings"

export async function POST(request: Request) {
  try {
    await requireAdmin()
    await assertRateLimit({ scope: "api:settings", request, limit: 10, windowSeconds: 60 })
    await verifyCsrfToken(request)
    const form = await request.formData()
    const token = String(form.get("vimeo_token") ?? "") || undefined
    const folderUri = String(form.get("vimeo_folder_uri") ?? "") || undefined
    const timezone = String(form.get("timezone") ?? "") || undefined
    await saveVimeoSettings({
      ...(token !== undefined ? { token } : {}),
      ...(folderUri !== undefined ? { folderUri } : {}),
      ...(timezone !== undefined ? { timezone } : {})
    })
    return NextResponse.redirect(appUrl("/admin/settings?saved=1"), 303)
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
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
