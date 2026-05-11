import { NextResponse } from "next/server"

import { getUpcomingCalendarEvents } from "@/lib/slides/data/calendar"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    const events = await getUpcomingCalendarEvents()
    return NextResponse.json({ events }, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    console.error("[/api/slide-data/calendar]", error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "fetch failed" },
      { status: 500 }
    )
  }
}
