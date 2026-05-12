import { NextResponse } from "next/server"

import { getVimeoToken } from "@/lib/settings"
import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type HealthCheck = {
  ok: boolean
  status: "ok" | "degraded" | "fail"
  message: string
}

export async function GET() {
  const checks = {
    env: checkEnv(),
    supabase: await checkSupabase(),
    schema: await checkSchema(),
    storage: await checkStorage(),
    vimeo: await checkVimeoToken()
  } satisfies Record<string, HealthCheck>
  const ok = checks.env.ok && checks.supabase.ok && checks.schema.ok && checks.storage.ok
  const degraded = ok && Object.values(checks).some((check) => check.status === "degraded")
  return NextResponse.json(
    {
      ok,
      status: ok ? (degraded ? "degraded" : "ok") : "fail",
      service: "roxom-playout-manager",
      uptime: Math.round(process.uptime()),
      checks
    },
    { status: ok ? 200 : 503 }
  )
}

function checkEnv(): HealthCheck {
  const missing = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "APP_ENCRYPTION_KEY",
    "ADMIN_BOOTSTRAP_TOKEN",
    ...(process.env.NODE_ENV === "production" ? ["OUTPUT_CAPTURE_TOKEN"] : [])
  ].filter((key) => !process.env[key])
  if (
    process.env.ALLOW_DEMO_DATA === "true" &&
    (process.env.NODE_ENV === "production" ||
      process.env.APP_BASE_URL?.startsWith("https://") ||
      process.env.NEXT_PUBLIC_APP_BASE_URL?.startsWith("https://"))
  ) {
    return {
      ok: false,
      status: "fail",
      message: "ALLOW_DEMO_DATA cannot be enabled in production"
    }
  }
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
    const missingOptional = ["video-assets", "small-media-assets"].filter(
      (bucket) => !buckets.has(bucket)
    )
    if (missingRequired.length) {
      return {
        ok: false,
        status: "fail",
        message: `Missing required buckets: ${missingRequired.join(", ")}`
      }
    }
    if (missingOptional.length) {
      return {
        ok: true,
        status: "degraded",
        message: `Missing optional buckets: ${missingOptional.join(", ")}`
      }
    }
    return { ok: true, status: "ok", message: "Storage buckets present" }
  } catch (error) {
    return { ok: false, status: "fail", message: `Storage check failed: ${errorMessage(error)}` }
  }
}

async function checkSchema(): Promise<HealthCheck> {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase
      .from("media_assets")
      .select("id,playback_readiness_status,playback_checked_at,playback_error")
      .limit(1)
    if (error) throw error
    return { ok: true, status: "ok", message: "Required app columns present" }
  } catch (error) {
    return {
      ok: true,
      status: "degraded",
      message: `Schema drift detected: ${errorMessage(error)}`
    }
  }
}

async function checkVimeoToken(): Promise<HealthCheck> {
  try {
    return (await getVimeoToken())
      ? { ok: true, status: "ok", message: "Vimeo token configured" }
      : { ok: true, status: "degraded", message: "Vimeo token not configured" }
  } catch (error) {
    return {
      ok: true,
      status: "degraded",
      message: `Vimeo token check failed: ${errorMessage(error)}`
    }
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}
