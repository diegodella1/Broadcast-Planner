import { NextResponse } from "next/server"

import { searchVimeoCatalog } from "@/lib/manual-broadcast"
import { vimeoSearchSchema } from "@/lib/schemas"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const parsed = vimeoSearchSchema.safeParse({ query: searchParams.get("q") ?? "" })
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message ?? "Invalid query" },
        { status: 400 }
      )
    }
    const results = await searchVimeoCatalog(parsed.data.query)
    return NextResponse.json(results, { headers: { "Cache-Control": "no-store" } })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    console.error("[api/vimeo/search]", error)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
