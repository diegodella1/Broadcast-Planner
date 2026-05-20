import { mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

import { afterEach, describe, expect, it } from "vitest"

import { isSmokeStatusOk, readSmokeStatus, smokeStatusMessage } from "./smoke-status"

const tempDirs: string[] = []

afterEach(() => {
  for (const dir of tempDirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

describe("smoke status", () => {
  it("reads persisted smoke status from disk", () => {
    const file = tempStatusFile({
      status: "ok",
      label: "local-deploy",
      recordedAt: new Date().toISOString()
    })

    const smoke = readSmokeStatus({ RTV_SMOKE_STATUS_FILE: file })

    expect(smoke?.status).toBe("ok")
    expect(smoke?.label).toBe("local-deploy")
    expect(smoke && isSmokeStatusOk(smoke, { RTV_SMOKE_STATUS_FILE: file })).toBe(true)
  })

  it("marks stale smoke status as not ok", () => {
    const file = tempStatusFile({
      status: "ok",
      label: "old",
      recordedAt: "2026-01-01T00:00:00.000Z"
    })
    const smoke = readSmokeStatus({ RTV_SMOKE_STATUS_FILE: file, RTV_SMOKE_MAX_AGE_SECONDS: "1" })

    expect(
      smoke &&
        isSmokeStatusOk(smoke, { RTV_SMOKE_STATUS_FILE: file, RTV_SMOKE_MAX_AGE_SECONDS: "1" })
    ).toBe(false)
    expect(
      smoke &&
        smokeStatusMessage(smoke, { RTV_SMOKE_STATUS_FILE: file, RTV_SMOKE_MAX_AGE_SECONDS: "1" })
    ).toContain("stale")
  })
})

function tempStatusFile(payload: unknown) {
  const dir = mkdtempSync(join(tmpdir(), "rtv-smoke-"))
  tempDirs.push(dir)
  const file = join(dir, "smoke-status.json")
  writeFileSync(file, JSON.stringify(payload))
  return file
}
