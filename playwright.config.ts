import { defineConfig } from "@playwright/test"

const webServer = process.env.RTV_BASE_URL
  ? {}
  : {
      webServer: {
        command: "npm run dev",
        url: "http://127.0.0.1:3450/api/health",
        reuseExistingServer: !process.env.CI,
        timeout: 120_000
      }
    }

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
  ...webServer,
  reporter: [["list"]]
})
