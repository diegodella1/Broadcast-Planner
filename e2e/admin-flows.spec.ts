import { expect, test } from "@playwright/test"
import { createHash } from "node:crypto"

test.setTimeout(60_000)

const e2eOperator = {
  handle: "qa-e2e",
  displayName: "QA E2E",
  token: "qa-e2e-token-2026"
}

test.beforeAll(async () => {
  await upsertE2eOperator()
})

test("named operator can log in and reach the dashboard", async ({ page }) => {
  test.skip(!canSeedOperator(), "requires Supabase service role env")
  await page.goto("/admin/login", { waitUntil: "domcontentloaded" })
  await page.getByRole("textbox", { name: /operator handle/i }).fill(e2eOperator.handle)
  await page.getByRole("textbox", { name: "Token", exact: true }).fill(e2eOperator.token)
  await page.getByRole("button", { name: /sign in|login|ingresar/i }).click()
  await expect(page).toHaveURL(/\/admin\/calendar/)
  await page.goto("/admin", { waitUntil: "domcontentloaded" })
  await expect(page.getByRole("main")).toBeVisible()
})

test.describe("authenticated admin flows", () => {
  test.beforeEach(async ({ page, baseURL }) => {
    test.skip(!process.env.ADMIN_BOOTSTRAP_TOKEN, "requires ADMIN_BOOTSTRAP_TOKEN")
    await page.context().addCookies([
      {
        name: "rpm_admin_token",
        value: process.env.ADMIN_BOOTSTRAP_TOKEN!,
        url: baseURL ?? "http://127.0.0.1:3451",
        httpOnly: true,
        sameSite: "Lax"
      }
    ])
  })

  test("operator can open core production pages", async ({ page }) => {
    for (const path of [
      "/admin/assets",
      "/admin/vimeo",
      "/admin/calendar",
      "/admin/runbook",
      "/admin/output",
      "/admin/health"
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" })
      await expect(page.getByRole("main")).toBeVisible()
    }
  })

  test("output page exposes control and health surfaces", async ({ page }) => {
    await page.goto("/admin/output")
    await expect(
      page.getByText(/Browser Output|Live Browser Output|OBS|vMix/i).first()
    ).toBeVisible()
    await expect(page.getByText(/Stop broadcast|Detener broadcast/i).first()).toBeVisible()
  })

  test("admin health reports integration readiness", async ({ page }) => {
    await page.goto("/admin/health")
    await expect(page.getByText(/Supabase/i).first()).toBeVisible()
    await expect(page.getByText(/Storage/i).first()).toBeVisible()
    await expect(page.getByText(/Vimeo/i).first()).toBeVisible()
    await expect(page.getByText(/Reuters/i).first()).toBeVisible()
    await expect(page.getByText(/Output/i).first()).toBeVisible()
  })

  test("operator path covers library, schedule, runbook, Reuters override and stop controls", async ({
    page
  }) => {
    const today = new Intl.DateTimeFormat("en-CA", {
      timeZone: "America/Los_Angeles",
      year: "numeric",
      month: "2-digit",
      day: "2-digit"
    }).format(new Date())
    for (const path of [
      "/admin/assets",
      "/admin/vimeo",
      `/admin/schedule/${today}`,
      `/admin/runbook/${today}`,
      "/admin/output",
      "/admin/health"
    ]) {
      await page.goto(path, { waitUntil: "domcontentloaded" })
      await expect(page.getByRole("main")).toBeVisible()
    }
    await page.goto("/admin/output", { waitUntil: "domcontentloaded" })
    await expect(page.getByPlaceholder(/HLS .* RTMP URL/i)).toBeVisible()
    await expect(page.getByRole("button", { name: /Set Reuters live/i })).toBeVisible()
    await expect(
      page.getByRole("button", { name: /Stop broadcast|Detener broadcast/i })
    ).toBeVisible()
  })
})

test.describe("authenticated write smoke", () => {
  test("schedule and fallback flows are covered by staging write smoke", async () => {
    test.skip(
      process.env.RTV_E2E_ADMIN_WRITE !== "true",
      "run npm run smoke:staging-write for mutating schedule, asset and fallback coverage"
    )
  })
})

function canSeedOperator() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.SUPABASE_SERVICE_ROLE_KEY &&
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )
}

async function upsertE2eOperator() {
  if (!canSeedOperator()) return
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/\/$/, "")
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
  const response = await fetch(`${baseUrl}/rest/v1/admin_operators?on_conflict=handle`, {
    method: "POST",
    headers: {
      apikey: serviceKey,
      authorization: `Bearer ${serviceKey}`,
      "content-type": "application/json",
      prefer: "resolution=merge-duplicates"
    },
    body: JSON.stringify({
      handle: e2eOperator.handle,
      display_name: e2eOperator.displayName,
      role: "admin",
      token_hash: createHash("sha256").update(e2eOperator.token).digest("hex"),
      status: "active"
    })
  })
  if (!response.ok) {
    throw new Error(`Could not seed E2E operator: ${response.status} ${await response.text()}`)
  }
}
