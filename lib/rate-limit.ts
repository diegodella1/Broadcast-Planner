import { getCurrentOperatorSession, hashSecret } from "./auth"
import { createServiceClient } from "./supabase/server"

export type RateLimitResult = {
  allowed: boolean
  retryAfterSeconds: number
}

export async function assertRateLimit(input: {
  scope: string
  request?: Request
  limit?: number
  windowSeconds?: number
}) {
  const result = await checkRateLimit(input)
  if (!result.allowed) {
    const error = new Error("Rate limit exceeded")
    ;(error as Error & { retryAfterSeconds?: number }).retryAfterSeconds = result.retryAfterSeconds
    throw error
  }
}

export async function checkRateLimit(input: {
  scope: string
  request?: Request
  limit?: number
  windowSeconds?: number
}): Promise<RateLimitResult> {
  const limit = input.limit ?? 60
  const windowSeconds = input.windowSeconds ?? 60
  const identity = await rateLimitIdentity(input.request)
  const now = new Date()
  const bucketKey = `${input.scope}:${identity}:${Math.floor(now.getTime() / (windowSeconds * 1000))}`
  const resetAt = new Date(Math.ceil(now.getTime() / (windowSeconds * 1000)) * windowSeconds * 1000)
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("api_rate_limits")
    .select("hits, reset_at")
    .eq("bucket_key", bucketKey)
    .maybeSingle()
  if (error) return fallbackForRateLimitBackendError(error)
  const currentHits =
    data && new Date(String(data.reset_at)).getTime() > now.getTime() ? Number(data.hits) : 0
  const nextHits = currentHits + 1
  const { error: upsertError } = await supabase.from("api_rate_limits").upsert({
    bucket_key: bucketKey,
    hits: nextHits,
    reset_at: resetAt.toISOString(),
    updated_at: now.toISOString()
  })
  if (upsertError) return fallbackForRateLimitBackendError(upsertError)
  return {
    allowed: nextHits <= limit,
    retryAfterSeconds: Math.max(1, Math.ceil((resetAt.getTime() - now.getTime()) / 1000))
  }
}

function fallbackForRateLimitBackendError(error: unknown): RateLimitResult {
  if (process.env.NODE_ENV === "production") throw error
  return { allowed: true, retryAfterSeconds: 0 }
}

export function rateLimitErrorResponse(error: unknown) {
  const retryAfterSeconds =
    typeof error === "object" && error !== null && "retryAfterSeconds" in error
      ? Number((error as { retryAfterSeconds?: unknown }).retryAfterSeconds)
      : 60
  return { retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : 60 }
}

async function rateLimitIdentity(request?: Request) {
  const session = await getCurrentOperatorSession()
  if (session) return `operator:${session.operatorId}`
  const rawIp =
    request?.headers.get("cf-connecting-ip") ??
    request?.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    request?.headers.get("x-real-ip") ??
    "unknown"
  return `ip:${hashSecret(rawIp)}`
}
