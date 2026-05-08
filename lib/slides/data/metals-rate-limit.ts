/**
 * Monthly rate limit accounting for the Metals.dev fallback fetcher
 * (currently unused — the active path is Pyth — kept as a follow-up safety net).
 * Ported from backgroundclima/lib/metals-rate-limit.ts.
 */

export const METALS_MONTHLY_LIMIT = 100

type MetalsRateLimit = { month: number; year: number; count: number }

let state: MetalsRateLimit | null = null

function currentPeriod(): { month: number; year: number } {
  const now = new Date()
  return { month: now.getMonth(), year: now.getFullYear() }
}

function ensureCurrentPeriod(): MetalsRateLimit {
  const { month, year } = currentPeriod()
  if (!state || state.month !== month || state.year !== year) {
    state = { month, year, count: 0 }
  }
  return state
}

export function canMakeMetalsRequest(): boolean {
  const cur = ensureCurrentPeriod()
  return cur.count < METALS_MONTHLY_LIMIT
}

export function incrementMetalsRequest(): void {
  const cur = ensureCurrentPeriod()
  cur.count += 1
}

export function getMetalsRemainingRequests(): number {
  const cur = ensureCurrentPeriod()
  return Math.max(0, METALS_MONTHLY_LIMIT - cur.count)
}

export function getMetalsRequestsPerDay(): number {
  const { month, year } = currentPeriod()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const dayOfMonth = new Date().getDate()
  const daysRemaining = daysInMonth - dayOfMonth + 1
  if (daysRemaining <= 0) return 0
  return Math.floor(getMetalsRemainingRequests() / daysRemaining)
}

/** Test-only helper to reset the counter between unit tests. */
export function __resetMetalsRateLimitForTests() {
  state = null
}
