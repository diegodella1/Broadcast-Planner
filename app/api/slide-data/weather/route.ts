import { NextResponse } from "next/server"

import { getWeatherSlideData } from "@/lib/slides/data/weather"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const data = await getWeatherSlideData()
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[/api/slide-data/weather]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch failed" },
      { status: 500 }
    )
  }
}
