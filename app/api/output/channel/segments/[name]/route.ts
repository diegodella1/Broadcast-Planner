import fs from "node:fs/promises"
import path from "node:path"

import { NextResponse } from "next/server"

import { isOutputRequestAllowed, outputAccessDeniedReason } from "@/lib/output-auth"
import { outputChannelDir, safeSegmentName } from "@/lib/output-channel"

export const dynamic = "force-dynamic"
export const runtime = "nodejs"

export async function GET(request: Request, { params }: { params: Promise<{ name: string }> }) {
  const { searchParams } = new URL(request.url)
  const allowed = await isOutputRequestAllowed({ token: searchParams.get("token") ?? undefined })
  if (!allowed) return NextResponse.json({ error: outputAccessDeniedReason() }, { status: 401 })

  const name = safeSegmentName((await params).name)
  if (!name) return NextResponse.json({ error: "Invalid segment" }, { status: 400 })

  try {
    const data = await fs.readFile(path.join(outputChannelDir(), name))
    return new NextResponse(data, {
      headers: {
        "Cache-Control": "no-store",
        "Content-Type": "video/mp2t"
      }
    })
  } catch {
    return NextResponse.json({ error: "Segment not found" }, { status: 404 })
  }
}
