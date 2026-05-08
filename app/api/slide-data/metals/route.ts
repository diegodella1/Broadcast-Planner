import { NextResponse } from "next/server"

import { getMarketsSatsData } from "@/lib/slides/data/markets"

export const dynamic = "force-dynamic"

/**
 * Metals slide-data endpoint.
 *
 * The metals (gold, silver, oil, copper) figures live inside the unified
 * markets payload produced by `getMarketsSatsData()` — there is no dedicated
 * metals fetcher in `lib/slides/data/`. `metals-rate-limit.ts` only exposes
 * monthly-quota accounting helpers, not a fetch function.
 */
export async function GET() {
  try {
    const data = await getMarketsSatsData()
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[/api/slide-data/metals]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch failed" },
      { status: 500 }
    )
  }
}
