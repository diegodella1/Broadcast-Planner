import { NextResponse } from "next/server"

import { isOutputRequestAllowed, outputAccessDeniedReason } from "@/lib/output-auth"

import { OutputHlsError, renderVlcHlsManifest, resolveOutputHls } from "../live"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const allowed = await isOutputRequestAllowed({
      token: searchParams.get("token") ?? undefined
    })
    if (!allowed) {
      return NextResponse.json({ error: outputAccessDeniedReason() }, { status: 401 })
    }
    const payload = await resolveOutputHls({ requestUrl: request.url })
    return new NextResponse(await renderVlcHlsManifest(payload), {
      headers: {
        "Cache-Control": "no-store",
        "Content-Disposition": 'inline; filename="rtv-live.m3u"',
        "Content-Type": "audio/x-mpegurl; charset=utf-8"
      }
    })
  } catch (error) {
    if (error instanceof OutputHlsError) {
      return NextResponse.json({ error: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : "Unknown error"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
