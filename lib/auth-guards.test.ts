import { readFileSync } from "node:fs"

import { describe, expect, it } from "vitest"

import { shouldFailClosedForMissingAdminToken } from "./auth"
import { shouldFailClosedForMissingOutputToken } from "./output-auth"

const serviceRoleApiRoutes = [
  "app/api/assets/upload/route.ts",
  "app/api/assets/upload-schedule/route.ts",
  "app/api/settings/route.ts",
  "app/api/vimeo/import/route.ts",
  "app/api/vimeo/sync/route.ts"
]

describe("service-role API guards", () => {
  it("requires admin auth before privileged API mutations", () => {
    for (const route of serviceRoleApiRoutes) {
      const source = readFileSync(route, "utf8")

      expect(source, `${route} must import requireAdmin`).toContain("requireAdmin")
      expect(source, `${route} must call requireAdmin`).toContain("await requireAdmin()")
    }
  })
})

describe("production auth fail-closed policy", () => {
  it("fails closed for missing admin/output tokens on production-like origins", () => {
    const env = {
      APP_BASE_URL: "https://rtvtime.diegodella.ar",
      NEXT_PUBLIC_APP_BASE_URL: "",
      NODE_ENV: "test"
    } as NodeJS.ProcessEnv

    expect(shouldFailClosedForMissingAdminToken(env)).toBe(true)
    expect(shouldFailClosedForMissingOutputToken(env)).toBe(true)
  })

  it("allows missing admin/output tokens only for local development", () => {
    const env = {
      APP_BASE_URL: "http://localhost:3450",
      NEXT_PUBLIC_APP_BASE_URL: "",
      NODE_ENV: "development"
    } as NodeJS.ProcessEnv

    expect(shouldFailClosedForMissingAdminToken(env)).toBe(false)
    expect(shouldFailClosedForMissingOutputToken(env)).toBe(false)
  })
})
