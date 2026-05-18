import { NextResponse } from "next/server"

import { notifyHealthFailures } from "@/lib/alerts"
import { collectOperatorHealth } from "@/lib/health-checks"

export const dynamic = "force-dynamic"

export async function GET() {
  const report = await collectOperatorHealth()
  await notifyHealthFailures(report)
  return NextResponse.json(report, { status: report.ok ? 200 : 503 })
}
