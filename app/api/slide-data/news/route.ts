import { NextResponse } from "next/server"

import { getNewsSlideData } from "@/lib/slides/data/news"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const data = getNewsSlideData()
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[/api/slide-data/news]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch failed" },
      { status: 500 }
    )
  }
}
