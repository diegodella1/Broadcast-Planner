import { NextResponse } from "next/server"

import { requireAdmin } from "@/lib/auth"
import { OUTPUT_COOKIE } from "@/lib/output-auth"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    await requireAdmin()
    const token = process.env.OUTPUT_CAPTURE_TOKEN
    const { searchParams, origin } = new URL(request.url)
    const returnTo = safeReturnTo(searchParams.get("return_to") ?? "/output/live")
    const debug = searchParams.get("debug") === "true"
    const target = new URL(returnTo, origin)
    if (debug) target.searchParams.set("debug", "true")

    const response = NextResponse.redirect(target, 303)
    if (token) {
      response.cookies.set(OUTPUT_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: isSecureCookie(),
        path: "/",
        maxAge: 60 * 60 * 6
      })
    }
    return response
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ ok: false, error: "Output session failed" }, { status: 500 })
  }
}

function safeReturnTo(value: string) {
  return value.startsWith("/output/") || value === "/output/live" ? value : "/output/live"
}

function isSecureCookie() {
  return (
    process.env.NEXT_PUBLIC_APP_BASE_URL?.startsWith("https://") ||
    process.env.NODE_ENV === "production"
  )
}
