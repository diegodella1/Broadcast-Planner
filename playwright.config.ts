import { defineConfig } from "@playwright/test"
import { loadEnvConfig } from "@next/env"

loadEnvConfig(process.cwd())

const e2ePort = process.env.RTV_E2E_PORT ?? "3451"
const e2eBaseURL = process.env.RTV_BASE_URL ?? `http://127.0.0.1:${e2ePort}`
const webServer = process.env.RTV_BASE_URL
  ? {}
  : {
      webServer: {
        command: `./node_modules/.bin/next dev -p ${e2ePort}`,
        url: e2eBaseURL,
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
    baseURL: e2eBaseURL,
    screenshot: "only-on-failure",
    trace: "retain-on-failure"
  },
  ...webServer,
  reporter: [["list"]]
})
