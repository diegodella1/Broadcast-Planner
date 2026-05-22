import { NextResponse } from "next/server"

import { getChinaMarketOpenData } from "@/lib/slides/data/china-market-open"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(await getChinaMarketOpenData(), {
      headers: { "Cache-Control": "private, max-age=0, no-store" }
    })
  } catch (error) {
    console.error("[/api/slide-data/china-market-open]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch failed" },
      { status: 500 }
    )
  }
}
