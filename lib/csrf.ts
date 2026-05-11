import { randomBytes, timingSafeEqual } from "crypto"
import { cookies, headers } from "next/headers"

export { CSRF_COOKIE, CSRF_FIELD, CSRF_HEADER, INTERNAL_CSRF_HEADER } from "./csrf-constants"

import { CSRF_COOKIE, CSRF_FIELD, CSRF_HEADER, INTERNAL_CSRF_HEADER } from "./csrf-constants"

export async function getCsrfToken() {
  const cookieStore = await cookies()
  const existing = cookieStore.get(CSRF_COOKIE)?.value
  if (isValidTokenShape(existing)) return existing
  const headerToken = (await headers()).get(INTERNAL_CSRF_HEADER) ?? undefined
  if (isValidTokenShape(headerToken)) return headerToken
  return randomBytes(32).toString("base64url")
}

export async function verifyCsrfToken(request: Request) {
  const cookieStore = await cookies()
  const expected = cookieStore.get(CSRF_COOKIE)?.value ?? ""
  const actual = await csrfTokenFromRequest(request)
  if (!constantTimeEqual(expected, actual)) {
    throw new Error("Invalid CSRF token")
  }
}

async function csrfTokenFromRequest(request: Request) {
  const header = request.headers.get(CSRF_HEADER)
  if (header) return header
  const contentType = request.headers.get("content-type") ?? ""
  if (!contentType.includes("form")) return ""
  const form = await request
    .clone()
    .formData()
    .catch(() => null)
  const value = form?.get(CSRF_FIELD)
  return typeof value === "string" ? value : ""
}

function constantTimeEqual(expected: string, actual: string) {
  if (!isValidTokenShape(expected) || !isValidTokenShape(actual)) return false
  const left = Buffer.from(expected)
  const right = Buffer.from(actual)
  return left.length === right.length && timingSafeEqual(left, right)
}

function isValidTokenShape(value: string | undefined): value is string {
  return typeof value === "string" && value.length >= 32 && value.length <= 128
}
