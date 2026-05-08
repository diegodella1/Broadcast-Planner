import path from "node:path"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./vitest.setup.ts"],
    include: [
      "lib/**/*.test.ts",
      "app/**/*.test.ts",
      "app/**/*.test.tsx",
      "components/**/*.test.tsx"
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "html"],
      include: ["lib/**", "app/**", "components/**"],
      exclude: ["**/*.test.*", "**/messages/**", "**/mock-data*", "**/*.config.*"],
      thresholds: {
        lines: 30,
        statements: 30,
        functions: 30,
        branches: 25
      }
    }
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, ".")
    }
  }
})
