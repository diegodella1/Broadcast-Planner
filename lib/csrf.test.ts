import { beforeEach, describe, expect, it, vi } from "vitest"

const cookieMap = new Map<string, string>()
const headerMap = new Map<string, string>()

vi.mock("next/headers", () => ({
  headers: vi.fn(async () => ({
    get: (name: string) => headerMap.get(name) ?? null
  })),
  cookies: vi.fn(async () => ({
    get: (name: string) => {
      const value = cookieMap.get(name)
      return value ? { name, value } : undefined
    },
    set: (name: string, value: string) => {
      cookieMap.set(name, value)
    }
  }))
}))

describe("csrf", () => {
  beforeEach(() => {
    cookieMap.clear()
    headerMap.clear()
    vi.resetModules()
  })

  it("reads a CSRF token from middleware headers and reuses the cookie", async () => {
    const { CSRF_COOKIE, INTERNAL_CSRF_HEADER, getCsrfToken } = await import("./csrf")
    const issued = "a".repeat(48)
    headerMap.set(INTERNAL_CSRF_HEADER, issued)
    const first = await getCsrfToken()
    cookieMap.set(CSRF_COOKIE, first)
    headerMap.clear()
    const second = await getCsrfToken()

    expect(first).toBe(issued)
    expect(second).toBe(first)
  })

  it("accepts a matching header token", async () => {
    const { CSRF_COOKIE, CSRF_HEADER, getCsrfToken, verifyCsrfToken } = await import("./csrf")
    const token = String(await getCsrfToken())
    cookieMap.set(CSRF_COOKIE, token)

    await expect(
      verifyCsrfToken(new Request("http://localhost", { headers: { [CSRF_HEADER]: token } }))
    ).resolves.toBeUndefined()
  })

  it("accepts a matching form token value", async () => {
    const { CSRF_COOKIE, getCsrfToken, verifyCsrfTokenValue } = await import("./csrf")
    const token = String(await getCsrfToken())
    cookieMap.set(CSRF_COOKIE, token)

    await expect(verifyCsrfTokenValue(token)).resolves.toBeUndefined()
  })

  it("rejects a missing token", async () => {
    const { verifyCsrfToken } = await import("./csrf")

    await expect(verifyCsrfToken(new Request("http://localhost"))).rejects.toThrow(
      "Invalid CSRF token"
    )
  })
})
