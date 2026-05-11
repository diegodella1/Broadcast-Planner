import { defineConfig } from "@playwright/test"

export default defineConfig({
  testDir: "./e2e",
  testMatch: /.*\.spec\.ts/,
  timeout: 30_000,
  expect: {
    timeout: 10_000
  },
  use: {
    baseURL: process.env.RTV_BASE_URL ?? "http://127.0.0.1:3450",
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  reporter: [["list"]]
})
