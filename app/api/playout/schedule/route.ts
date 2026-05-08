import { NextResponse } from "next/server"

import { getLivePlaybackSchedule } from "@/lib/data"
import { secondsSinceMidnightInTimezone } from "@/lib/time"

export const dynamic = "force-dynamic"

export async function GET() {
  try {
    return NextResponse.json(
      {
        schedule: await getLivePlaybackSchedule(),
        secondsOfDay: secondsSinceMidnightInTimezone()
      },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
