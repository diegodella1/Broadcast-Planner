import { NextResponse } from "next/server"

import { requireAdmin } from "@/lib/auth"

import { OutputHlsError, resolveOutputHls } from "./live"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    await requireAdmin()
    const { searchParams } = new URL(request.url)
    const requestedAssetId = searchParams.get("assetId")
    const payload = await resolveOutputHls({ requestUrl: request.url, assetId: requestedAssetId })
    return NextResponse.json(payload, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
    if (error instanceof OutputHlsError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
