#!/usr/bin/env node
// scripts/i18n-check.mjs
import {readFileSync} from "node:fs"
import {fileURLToPath} from "node:url"
import {dirname, join} from "node:path"

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = join(__dirname, "..")

function flatten(obj, prefix = "", out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === "object" && !Array.isArray(v)) {
      flatten(v, path, out)
    } else {
      out.set(path, v)
    }
  }
  return out
}

function loadJson(path) {
  return JSON.parse(readFileSync(path, "utf8"))
}

const en = flatten(loadJson(join(root, "messages/en.json")))
const es = flatten(loadJson(join(root, "messages/es.json")))

const onlyInEn = [...en.keys()].filter((k) => !es.has(k)).sort()
const onlyInEs = [...es.keys()].filter((k) => !en.has(k)).sort()
const empties = []
const nonStrings = []
for (const [locale, map] of [["en", en], ["es", es]]) {
  for (const [k, v] of map) {
    if (typeof v !== "string") {
      nonStrings.push(`${k} (${locale})`)
    } else if (v === "") {
      empties.push(`${k} (${locale})`)
    }
  }
}

const ok = onlyInEn.length === 0 && onlyInEs.length === 0 && empties.length === 0 && nonStrings.length === 0

if (ok) {
  console.log(`[i18n-check] OK — ${en.size} keys symmetric`)
  process.exit(0)
}

console.error("[i18n-check] FAIL")
if (onlyInEn.length) console.error(`Only in en.json (${onlyInEn.length}): ${onlyInEn.join(", ")}`)
if (onlyInEs.length) console.error(`Only in es.json (${onlyInEs.length}): ${onlyInEs.join(", ")}`)
if (empties.length) console.error(`Empty values (${empties.length}): ${empties.join(", ")}`)
if (nonStrings.length) console.error(`Non-string values (${nonStrings.length}): ${nonStrings.join(", ")}`)
process.exit(1)
