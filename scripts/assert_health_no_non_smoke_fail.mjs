#!/usr/bin/env node

import { readFileSync } from "node:fs"

const file = process.argv[2]
if (!file) {
  console.error("Usage: node scripts/assert_health_no_non_smoke_fail.mjs <health.json>")
  process.exit(1)
}

const payload = JSON.parse(readFileSync(file, "utf8"))
if (payload.ok === true) process.exit(0)

const checks = payload.checks && typeof payload.checks === "object" ? payload.checks : {}
const failing = Object.values(checks).filter(
  (check) => check && check.id !== "smoke" && check.ok !== true
)

if (failing.length === 0 && checks.smoke?.ok === false) {
  console.error("Health recovered past stale smoke status; continuing smoke run.")
  process.exit(0)
}

console.error(JSON.stringify(payload, null, 2))
process.exit(1)
