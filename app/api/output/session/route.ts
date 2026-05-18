import { NextResponse } from "next/server"

import { requireAdmin } from "@/lib/auth"
import { OUTPUT_COOKIE } from "@/lib/output-auth"
import { assertRateLimit, rateLimitErrorResponse } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    await requireAdmin()
    await assertRateLimit({ scope: "api:output:session", request, limit: 30, windowSeconds: 60 })
    const token = process.env.OUTPUT_CAPTURE_TOKEN
    const { searchParams } = new URL(request.url)
    const returnTo = safeReturnTo(searchParams.get("return_to") ?? "/output/live")
    const debug = searchParams.get("debug") === "true"
    const target = new URL(returnTo, "http://local")
    if (debug) target.searchParams.set("debug", "true")
    const location = `${target.pathname}${target.search}${target.hash}`

    const response = new NextResponse(null, { status: 303, headers: { Location: location } })
    if (token) {
      response.cookies.set(OUTPUT_COOKIE, token, {
        httpOnly: true,
        sameSite: "lax",
        secure: isSecureCookie(request),
        path: "/",
        maxAge: 60 * 60 * 6
      })
    }
    return response
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
    console.error("[output-session] failed", error)
    return NextResponse.json({ ok: false, error: "Output session failed" }, { status: 500 })
  }
}

function safeReturnTo(value: string) {
  return value.startsWith("/output/") || value === "/output/live" ? value : "/output/live"
}

function isSecureCookie(request: Request) {
  if (process.env.NODE_ENV !== "production") return false
  const configuredBase = process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL
  if (configuredBase) return configuredBase.startsWith("https://")
  return new URL(request.url).protocol === "https:"
}
