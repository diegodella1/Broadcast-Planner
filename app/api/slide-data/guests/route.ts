import { NextResponse } from "next/server"

import { getSlides } from "@/lib/data"
import { getGuestLineupData } from "@/lib/slides/data/guests"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const slideId = new URL(request.url).searchParams.get("slideId")
    const slide = slideId ? (await getSlides()).find((candidate) => candidate.id === slideId) : null
    const data = await getGuestLineupData({ slide })
    return NextResponse.json(data, {
      headers: { "Cache-Control": "private, max-age=0, no-store" }
    })
  } catch (error) {
    console.error("[/api/slide-data/guests]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch failed" },
      { status: 500 }
    )
  }
}
