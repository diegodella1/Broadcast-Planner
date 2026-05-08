import { NextResponse } from "next/server"

export const dynamic = "force-dynamic"

/**
 * Weather slide-data stub.
 *
 * No lib helper exists yet under `lib/slides/data/` — the OpenWeatherMap port
 * from backgroundclima is still pending. This endpoint returns an explicit
 * `available: false` payload so consumers can render their empty-state without
 * blowing up. Replace the body with a real fetcher once the port lands.
 */
export async function GET() {
  try {
    return NextResponse.json(
      { available: false, reason: "weather lib helper not yet ported from backgroundclima" },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    console.error("[/api/slide-data/weather]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch failed" },
      { status: 500 }
    )
  }
}
