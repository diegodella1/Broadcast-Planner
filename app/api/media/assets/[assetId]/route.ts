import { NextResponse } from "next/server"

import { createServiceClient } from "@/lib/supabase/server"

export const dynamic = "force-dynamic"

type RouteContext = {
  params: Promise<{ assetId: string }>
}

export async function GET(request: Request, { params }: RouteContext) {
  const { assetId } = await params
  const supabase = createServiceClient()
  const { data: asset, error } = await supabase
    .from("media_assets")
    .select("id,status,storage_bucket,storage_path,metadata")
    .eq("id", assetId)
    .single()

  if (error || !asset) return NextResponse.json({ error: "Media not found" }, { status: 404 })
  if (asset.status !== "ready" || !asset.storage_bucket || !asset.storage_path) {
    return NextResponse.json({ error: "Media unavailable" }, { status: 404 })
  }

  const upstream = await fetchStorageObject({
    bucket: String(asset.storage_bucket),
    path: String(asset.storage_path),
    range: request.headers.get("range")
  })
  if (upstream.status === 404)
    return NextResponse.json({ error: "Media not found" }, { status: 404 })
  if (!upstream.ok && upstream.status !== 206) {
    return NextResponse.json({ error: "Media unavailable" }, { status: upstream.status })
  }

  const headers = responseHeaders(upstream.headers, asset.metadata)
  return new Response(upstream.body, { status: upstream.status, headers })
}

async function fetchStorageObject({
  bucket,
  path,
  range
}: {
  bucket: string
  path: string
  range: string | null
}) {
  const baseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!baseUrl || !key) throw new Error("Missing Supabase service environment")
  const url = new URL(
    `/storage/v1/object/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`,
    baseUrl
  )
  const headers = new Headers({
    apikey: key,
    Authorization: `Bearer ${key}`
  })
  if (range) headers.set("range", range)
  return fetch(url, { headers, cache: "no-store" })
}

function responseHeaders(upstream: Headers, metadata: unknown) {
  const headers = new Headers()
  copyHeader(upstream, headers, "content-type")
  copyHeader(upstream, headers, "content-length")
  copyHeader(upstream, headers, "content-range")
  copyHeader(upstream, headers, "accept-ranges")
  copyHeader(upstream, headers, "etag")
  copyHeader(upstream, headers, "last-modified")
  if (!headers.has("content-type")) {
    const mimeType = metadataValue(metadata, "mime_type")
    if (mimeType) headers.set("content-type", mimeType)
  }
  if (!headers.has("accept-ranges")) headers.set("accept-ranges", "bytes")
  headers.set("cache-control", "public, max-age=31536000, immutable")
  return headers
}

function copyHeader(from: Headers, to: Headers, name: string) {
  const value = from.get(name)
  if (value) to.set(name, value)
}

function metadataValue(metadata: unknown, key: string) {
  if (!metadata || typeof metadata !== "object") return ""
  const value = (metadata as Record<string, unknown>)[key]
  return typeof value === "string" ? value : ""
}

function encodeStoragePath(path: string) {
  return path
    .split("/")
    .filter(Boolean)
    .map((part) => encodeURIComponent(part))
    .join("/")
}
