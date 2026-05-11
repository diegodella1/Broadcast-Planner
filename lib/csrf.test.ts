import { beforeEach, describe, expect, it, vi } from "vitest"

const cookieMap = new Map<string, string>()

vi.mock("next/headers", () => ({
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
    vi.resetModules()
  })

  it("issues and reuses a CSRF token", async () => {
    const { CSRF_COOKIE, getCsrfToken } = await import("./csrf")
    const first = await getCsrfToken()
    const second = await getCsrfToken()

    expect(first).toHaveLength(43)
    expect(second).toBe(first)
    expect(cookieMap.get(CSRF_COOKIE)).toBe(first)
  })

  it("accepts a matching header token", async () => {
    const { CSRF_COOKIE, CSRF_HEADER, getCsrfToken, verifyCsrfToken } = await import("./csrf")
    const token = String(await getCsrfToken())
    cookieMap.set(CSRF_COOKIE, token)

    await expect(
      verifyCsrfToken(new Request("http://localhost", { headers: { [CSRF_HEADER]: token } }))
    ).resolves.toBeUndefined()
  })

  it("rejects a missing token", async () => {
    const { verifyCsrfToken } = await import("./csrf")

    await expect(verifyCsrfToken(new Request("http://localhost"))).rejects.toThrow(
      "Invalid CSRF token"
    )
  })
})
