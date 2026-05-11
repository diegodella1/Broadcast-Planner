import { cookies } from "next/headers"

export const OUTPUT_COOKIE = "rpm_output_token"

export async function isOutputRequestAllowed(searchParams: { token?: string | undefined }) {
  const expected = process.env.OUTPUT_CAPTURE_TOKEN
  if (!expected) return true
  const cookieStore = await cookies()
  const actual = searchParams.token || cookieStore.get(OUTPUT_COOKIE)?.value || ""
  return actual === expected
}

export function outputAccessDeniedReason() {
  return process.env.OUTPUT_CAPTURE_TOKEN ? "Output capture token required" : "Output unavailable"
}

export function liveOutputHref(debug = false) {
  if (process.env.OUTPUT_CAPTURE_TOKEN) {
    const params = new URLSearchParams({ return_to: "/output/live" })
    if (debug) params.set("debug", "true")
    return `/api/output/session?${params.toString()}`
  }
  const params = new URLSearchParams()
  if (debug) params.set("debug", "true")
  const query = params.toString()
  return `/output/live${query ? `?${query}` : ""}`
}

export function directLiveOutputHref(debug = false) {
  const params = new URLSearchParams()
  if (debug) params.set("debug", "true")
  if (process.env.OUTPUT_CAPTURE_TOKEN) params.set("token", process.env.OUTPUT_CAPTURE_TOKEN)
  const query = params.toString()
  return `/output/live${query ? `?${query}` : ""}`
}
