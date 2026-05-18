import { NextResponse } from "next/server"

import { requireAdmin } from "@/lib/auth"
import { outputChannelUrl } from "@/lib/output-channel"
import { assertRateLimit, rateLimitErrorResponse } from "@/lib/rate-limit"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    await requireAdmin()
    await assertRateLimit({ scope: "api:output:link", request, limit: 60, windowSeconds: 60 })
    return NextResponse.json(
      { playlistUrl: outputChannelUrl(request.url).toString() },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (error instanceof Error && error.message === "Rate limit exceeded") {
      const { retryAfterSeconds } = rateLimitErrorResponse(error)
      return NextResponse.json(
        { error: "Rate limit exceeded" },
        { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
      )
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
