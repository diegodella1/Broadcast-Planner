import { NextResponse } from "next/server"

import { getCsrfToken } from "@/lib/csrf"

export const dynamic = "force-dynamic"

export async function GET() {
  return NextResponse.json(
    { csrfToken: await getCsrfToken() },
    { headers: { "Cache-Control": "no-store" } }
  )
}
