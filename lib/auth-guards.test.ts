import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

const serviceRoleApiRoutes = [
  "app/api/assets/upload/route.ts",
  "app/api/settings/route.ts",
  "app/api/vimeo/import/route.ts"
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
