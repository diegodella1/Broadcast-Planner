import { NextResponse } from "next/server"

import { isOutputRequestAllowed, outputAccessDeniedReason } from "@/lib/output-auth"
import { readOutputChannelPlaylist, rewriteChannelPlaylist } from "@/lib/output-channel"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const allowed = await isOutputRequestAllowed({ token: searchParams.get("token") ?? undefined })
  if (!allowed) return NextResponse.json({ error: outputAccessDeniedReason() }, { status: 401 })

  const manifest = rewriteChannelPlaylist(await readOutputChannelPlaylist(), request.url)
  return new NextResponse(`${manifest.trimEnd()}\n`, {
    headers: {
      "Cache-Control": "no-store",
      "Content-Disposition": 'inline; filename="rtv-channel-live.m3u8"',
      "Content-Type": "application/vnd.apple.mpegurl; charset=utf-8"
    }
  })
}
