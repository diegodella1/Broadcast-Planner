#!/usr/bin/env node

import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import { createClient } from "@supabase/supabase-js"

loadEnvFile(".env")
loadEnvFile(".env.local")

const apply = process.argv.includes("--apply")
const serviceUrl = process.env.SUPABASE_SERVICE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!serviceUrl || !serviceKey) {
  console.error(
    "Missing SUPABASE_SERVICE_URL/NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY"
  )
  process.exit(1)
}

const publicAppBase = publicAppBaseUrl(
  process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL
)
assertPublicHttps(publicAppBase)

const supabase = createClient(serviceUrl, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false }
})

const rows = await fetchMediaAssets()
const candidates = rows.filter((row) => isLocalUrl(row.url))
let updated = 0
let skipped = 0

for (const row of candidates) {
  if (!row.storage_bucket || !row.storage_path) {
    skipped += 1
    console.log(`skip ${row.id} ${row.title ?? ""}: missing storage_bucket/storage_path`)
    continue
  }
  const nextUrl = publicMediaAssetUrl(row.id)
  if (!apply) {
    console.log(`dry-run ${row.id} ${row.title ?? ""}: ${row.url} -> ${nextUrl}`)
    continue
  }
  const { error } = await supabase
    .from("media_assets")
    .update({ url: nextUrl, updated_at: new Date().toISOString() })
    .eq("id", row.id)
  if (error) throw error
  updated += 1
  console.log(`updated ${row.id} ${row.title ?? ""}: ${nextUrl}`)
}

console.log(
  `${apply ? "apply" : "dry-run"} complete: ${candidates.length} local urls, ${updated} updated, ${skipped} skipped`
)

async function fetchMediaAssets() {
  const pageSize = 1000
  const all = []
  for (let from = 0; ; from += pageSize) {
    const to = from + pageSize - 1
    const { data, error } = await supabase
      .from("media_assets")
      .select("id,title,url,storage_bucket,storage_path")
      .range(from, to)
    if (error) throw error
    all.push(...(data ?? []))
    if (!data || data.length < pageSize) return all
  }
}

function publicMediaAssetUrl(assetId) {
  return `${publicAppBase}/api/media/assets/${encodeURIComponent(assetId)}`
}

function publicAppBaseUrl(baseUrl) {
  if (!baseUrl) throw new Error("Missing public app URL")
  const url = new URL(baseUrl)
  url.pathname = url.pathname.replace(/\/+$/, "")
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/+$/, "")
}

function assertPublicHttps(baseUrl) {
  const url = new URL(baseUrl)
  if (url.protocol !== "https:" || isLocalHost(url.hostname)) {
    throw new Error(
      "Backfill needs APP_BASE_URL or NEXT_PUBLIC_APP_BASE_URL to be a public HTTPS app URL"
    )
  }
}

function isLocalUrl(value) {
  if (!value) return false
  try {
    const url = new URL(value)
    return isLocalHost(url.hostname)
  } catch {
    return false
  }
}

function isLocalHost(hostname) {
  return hostname === "127.0.0.1" || hostname === "localhost" || hostname === "0.0.0.0"
}

function loadEnvFile(name) {
  const path = resolve(process.cwd(), name)
  if (!existsSync(path)) return
  const content = readFileSync(path, "utf8")
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#") || !trimmed.includes("=")) continue
    const index = trimmed.indexOf("=")
    const key = trimmed.slice(0, index).trim()
    const value = trimmed
      .slice(index + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "")
    if (key && process.env[key] === undefined) process.env[key] = value
  }
}
