import { afterEach, describe, expect, it } from "vitest"
import { handleDataFailure, shouldUseDemoData } from "./data"

const originalDemoFlag = process.env.ALLOW_DEMO_DATA

afterEach(() => {
  if (originalDemoFlag === undefined) delete process.env.ALLOW_DEMO_DATA
  else process.env.ALLOW_DEMO_DATA = originalDemoFlag
})

describe("data fallback policy", () => {
  it("does not use demo data unless explicitly enabled", () => {
    delete process.env.ALLOW_DEMO_DATA

    expect(shouldUseDemoData()).toBe(false)
    expect(() => handleDataFailure(new Error("supabase down"), "demo")).toThrow(
      "Database unavailable: supabase down"
    )
  })

  it("allows demo data behind ALLOW_DEMO_DATA", () => {
    process.env.ALLOW_DEMO_DATA = "true"

    expect(shouldUseDemoData()).toBe(true)
    expect(handleDataFailure(new Error("supabase down"), "demo")).toBe("demo")
  })
})
