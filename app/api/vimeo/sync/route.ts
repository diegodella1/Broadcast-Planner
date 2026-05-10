import { NextResponse } from "next/server"

import { appUrl } from "@/lib/app-url"
import { requireAdmin } from "@/lib/auth"
import { getVimeoSettings, getVimeoToken, recordVimeoSyncStatus } from "@/lib/settings"
import { syncVimeoCatalog } from "@/lib/vimeo"

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const form = await request.formData().catch(() => new FormData())
    const returnTo = String(form.get("return_to") ?? "")
    const requestedScope = String(form.get("scope_uri") ?? "")
    const [token, settings] = await Promise.all([getVimeoToken(), getVimeoSettings()])
    if (!token) {
      await recordVimeoSyncStatus({
        status: "invalid",
        errorMessage: "Missing Vimeo token"
      })
      return NextResponse.json({ ok: false, error: "Missing Vimeo token" }, { status: 400 })
    }

    const configuredScope = String(settings?.publicConfig.folder_uri ?? "")
    const result = await syncVimeoCatalog(token, requestedScope || configuredScope || undefined)
    await recordVimeoSyncStatus({ status: "connected", ...result })

    if (returnTo) {
      return NextResponse.redirect(
        appUrl(
          `${returnTo}${returnTo.includes("?") ? "&" : "?"}synced=1&count=${result.syncedCount}`
        ),
        303
      )
    }
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    const message = errorMessage(error)
    await recordVimeoSyncStatus({
      status: "failed",
      errorMessage: message
    }).catch(() => undefined)
    return NextResponse.json({ ok: false, error: message }, { status: 500 })
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null) {
    return JSON.stringify(error)
  }
  return String(error)
}
