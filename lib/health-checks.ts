import { getLiveSchedule } from "./data"
import { getActiveOutputOverride } from "./output-overrides"
import { getReutersSettings } from "./reuters-credentials"
import { getVimeoSettings, getVimeoToken } from "./settings"
import { createServiceClient } from "./supabase/server"

export type OperatorHealthStatus = "ok" | "degraded" | "fail"

export type OperatorHealthCheck = {
  id:
    | "env"
    | "supabase"
    | "schema"
    | "storage"
    | "vimeo"
    | "reuters"
    | "output"
    | "migrations"
    | "smoke"
  label: string
  ok: boolean
  status: OperatorHealthStatus
  message: string
  href?: string
}

export type OperatorHealthReport = {
  ok: boolean
  status: OperatorHealthStatus
  service: "roxom-playout-manager"
  generatedAt: string
  uptime: number
  checks: Record<OperatorHealthCheck["id"], OperatorHealthCheck>
}

export async function collectOperatorHealth(): Promise<OperatorHealthReport> {
  const [supabase, schema, storage, vimeo, reuters, output, migrations, smoke] = await Promise.all([
    checkSupabase(),
    checkSchema(),
    checkStorage(),
    checkVimeo(),
    checkReuters(),
    checkOutput(),
    checkMigrations(),
    checkSmoke()
  ])
  const checks = {
    env: checkEnv(),
    supabase,
    schema,
    storage,
    vimeo,
    reuters,
    output,
    migrations,
    smoke
  } satisfies OperatorHealthReport["checks"]
  const ok = Object.values(checks).every((check) => check.ok)
  const degraded = ok && Object.values(checks).some((check) => check.status === "degraded")
  return {
    ok,
    status: ok ? (degraded ? "degraded" : "ok") : "fail",
    service: "roxom-playout-manager",
    generatedAt: new Date().toISOString(),
    uptime: Math.round(process.uptime()),
    checks
  }
}

function checkEnv(): OperatorHealthCheck {
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
    return fail("env", "Environment", "ALLOW_DEMO_DATA cannot be enabled in production")
  }
  return missing.length
    ? fail("env", "Environment", `Missing required env: ${missing.join(", ")}`)
    : pass("env", "Environment", "Required environment is configured")
}

async function checkSupabase(): Promise<OperatorHealthCheck> {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase.from("program_days").select("id").limit(1)
    if (error) throw error
    return pass("supabase", "Supabase", "Database query succeeded")
  } catch (error) {
    return fail("supabase", "Supabase", `Supabase unavailable: ${errorMessage(error)}`)
  }
}

async function checkSchema(): Promise<OperatorHealthCheck> {
  try {
    const supabase = createServiceClient()
    const { error } = await supabase
      .from("media_assets")
      .select("id,playback_readiness_status,playback_checked_at,playback_error")
      .limit(1)
    if (error) throw error
    return pass("schema", "Schema", "Required app columns present")
  } catch (error) {
    return degraded("schema", "Schema", `Schema drift detected: ${errorMessage(error)}`)
  }
}

async function checkStorage(): Promise<OperatorHealthCheck> {
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
      return fail("storage", "Storage", `Missing required buckets: ${missingRequired.join(", ")}`)
    }
    if (missingOptional.length) {
      return degraded(
        "storage",
        "Storage",
        `Missing optional buckets: ${missingOptional.join(", ")}`
      )
    }
    return pass("storage", "Storage", "Required storage buckets present")
  } catch (error) {
    return fail("storage", "Storage", `Storage check failed: ${errorMessage(error)}`)
  }
}

async function checkVimeo(): Promise<OperatorHealthCheck> {
  try {
    const [settings, token] = await Promise.all([getVimeoSettings(), getVimeoToken()])
    if (!token) return degraded("vimeo", "Vimeo", "Vimeo token not configured", "/admin/settings")
    if (settings?.status === "failed" || settings?.status === "invalid") {
      return degraded("vimeo", "Vimeo", settings.lastError ?? `Status: ${settings.status}`)
    }
    return pass("vimeo", "Vimeo", settings?.lastError ?? "Vimeo token configured")
  } catch (error) {
    return degraded("vimeo", "Vimeo", `Vimeo check failed: ${errorMessage(error)}`)
  }
}

async function checkReuters(): Promise<OperatorHealthCheck> {
  try {
    const settings = await getReutersSettings()
    if (settings?.lastError) return degraded("reuters", "Reuters", settings.lastError)
    return pass(
      "reuters",
      "Reuters",
      settings?.hasSecret
        ? "Reuters credentials configured; dynamic stream URLs are per block or override"
        : "Manual Reuters HLS/RTMP endpoint entry is available"
    )
  } catch (error) {
    return degraded("reuters", "Reuters", `Reuters check failed: ${errorMessage(error)}`)
  }
}

async function checkOutput(): Promise<OperatorHealthCheck> {
  if (!process.env.OUTPUT_CAPTURE_TOKEN) {
    return fail("output", "Output", "OUTPUT_CAPTURE_TOKEN missing", "/admin/output")
  }
  try {
    const live = await getLiveSchedule()
    const override = await getActiveOutputOverride(live.day?.id)
    if (override?.sourceType === "reuters") {
      return override.streamUrl
        ? pass(
            "output",
            "Output",
            `Reuters override active: ${override.streamProtocol ?? "stream"}`
          )
        : degraded("output", "Output", "Reuters override missing stream URL", "/admin/output")
    }
    return live.day
      ? pass("output", "Output", `Live day ${live.day.airDate} loaded`, "/admin/output")
      : degraded("output", "Output", "No live day loaded", "/admin/calendar")
  } catch (error) {
    return fail("output", "Output", `Output check failed: ${errorMessage(error)}`, "/admin/output")
  }
}

async function checkMigrations(): Promise<OperatorHealthCheck> {
  try {
    const supabase = createServiceClient()
    const [operators, preferences, overrides] = await Promise.all([
      supabase.from("admin_operators").select("id").limit(1),
      supabase.from("operator_preferences").select("operator_id,key,value").limit(1),
      supabase.from("output_overrides").select("id,program_day_id,enabled").limit(1)
    ])
    const error = operators.error ?? preferences.error ?? overrides.error
    if (error) throw error
    return pass("migrations", "Migrations", "Ops readiness tables are available")
  } catch (error) {
    return fail(
      "migrations",
      "Migrations",
      `Ops readiness migration missing or invalid: ${errorMessage(error)}`
    )
  }
}

async function checkSmoke(): Promise<OperatorHealthCheck> {
  const status = process.env.RTV_LAST_SMOKE_STATUS
  if (!status) {
    return degraded("smoke", "Smoke", "No recent smoke status configured")
  }
  return status === "ok"
    ? pass("smoke", "Smoke", "Latest smoke status is ok")
    : fail("smoke", "Smoke", `Latest smoke status: ${status}`)
}

function pass(
  id: OperatorHealthCheck["id"],
  label: string,
  message: string,
  href?: string
): OperatorHealthCheck {
  return href
    ? { id, label, ok: true, status: "ok", message, href }
    : { id, label, ok: true, status: "ok", message }
}

function degraded(
  id: OperatorHealthCheck["id"],
  label: string,
  message: string,
  href?: string
): OperatorHealthCheck {
  return href
    ? { id, label, ok: true, status: "degraded", message, href }
    : { id, label, ok: true, status: "degraded", message }
}

function fail(
  id: OperatorHealthCheck["id"],
  label: string,
  message: string,
  href?: string
): OperatorHealthCheck {
  return href
    ? { id, label, ok: false, status: "fail", message, href }
    : { id, label, ok: false, status: "fail", message }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) return error.message
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message: unknown }).message)
  }
  return String(error)
}
