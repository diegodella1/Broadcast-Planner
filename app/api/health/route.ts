import { NextResponse } from "next/server"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type HealthCheck = {
  ok: boolean
  status: "ok" | "degraded" | "fail"
  message: string
}

export async function GET() {
  const checks: Record<string, HealthCheck> = {
    env: checkEnv(),
    supabase: await checkSupabase(),
    storage: await checkStorage(),
    vimeo: checkOptionalEnv("VIMEO_ACCESS_TOKEN", "Vimeo token configured")
  }
  const requiredKeys = ["env", "supabase"] as const
  const ok = requiredKeys.every((key) => checks[key].ok)
  const degraded = ok && Object.values(checks).some((check) => check.status === "degraded")
  return NextResponse.json({
    ok,
    status: ok ? (degraded ? "degraded" : "ok") : "fail",
    service: "roxom-playout-manager",
    uptime: Math.round(process.uptime()),
    checks
  }, { status: ok ? 200 : 503 })
}

function checkEnv(): HealthCheck {
  const missing = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "APP_ENCRYPTION_KEY",
    "ADMIN_BOOTSTRAP_TOKEN"
  ].filter((key) => !process.env[key])
  return missing.length
    ? { ok: false, status: "fail", message: `Missing required env: ${missing.join(", ")}` }
    : { ok: true, status: "ok", message: "Required env present" }
}

async function checkSupabase(): Promise<HealthCheck> {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from("program_days").select("id").limit(1)
    if (error) throw error
    return { ok: true, status: "ok", message: "Supabase query succeeded" }
  } catch (error) {
    return { ok: false, status: "fail", message: `Supabase unavailable: ${errorMessage(error)}` }
  }
}

async function checkStorage(): Promise<HealthCheck> {
  try {
    const supabase = createServiceClient()
    const { data, error } = await supabase.storage.listBuckets()
    if (error) throw error
    const buckets = new Set((data ?? []).map((bucket) => bucket.id))
    const missingRequired = ["slide-assets", "graphics"].filter((bucket) => !buckets.has(bucket))
    const missingOptional = ["video-assets", "small-media-assets"].filter((bucket) => !buckets.has(bucket))
    if (missingRequired.length) {
      return { ok: false, status: "fail", message: `Missing required buckets: ${missingRequired.join(", ")}` }
    }
    if (missingOptional.length) {
      return { ok: true, status: "degraded", message: `Missing optional buckets: ${missingOptional.join(", ")}` }
    }
    return { ok: true, status: "ok", message: "Storage buckets present" }
  } catch (error) {
    return { ok: true, status: "degraded", message: `Storage check failed: ${errorMessage(error)}` }
  }
}

function checkOptionalEnv(key: string, okMessage: string): HealthCheck {
  return process.env[key]
    ? { ok: true, status: "ok", message: okMessage }
    : { ok: true, status: "degraded", message: `${key} not configured` }
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}
