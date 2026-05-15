import { NextResponse } from "next/server"

import { requireAdmin } from "@/lib/auth"
import { outputChannelUrl } from "@/lib/output-channel"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    await requireAdmin()
    return NextResponse.json(
      { playlistUrl: outputChannelUrl(request.url).toString() },
      { headers: { "Cache-Control": "no-store" } }
    )
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
