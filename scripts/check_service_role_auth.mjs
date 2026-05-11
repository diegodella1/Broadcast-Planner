import { readdirSync, readFileSync, statSync } from "node:fs"
import { join } from "node:path"

const root = join(process.cwd(), "app", "api")
const failures = []

for (const file of walk(root)) {
  if (!file.endsWith("route.ts")) continue
  const source = readFileSync(file, "utf8")
  if (!source.includes("createServiceClient")) continue
  if (!/export\s+async\s+function\s+(POST|PUT|PATCH|DELETE)\b/.test(source)) continue
  if (!source.includes("requireAdmin")) {
    failures.push(file)
    continue
  }
  if (!source.includes("await requireAdmin()")) failures.push(file)
}

if (failures.length) {
  console.error("Mutating service-role API route missing requireAdmin:")
  for (const file of failures) console.error(`- ${file}`)
  process.exit(1)
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry)
    const stat = statSync(path)
    if (stat.isDirectory()) yield* walk(path)
    else yield path
  }
}
