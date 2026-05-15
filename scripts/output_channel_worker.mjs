#!/usr/bin/env node
import fs from "node:fs/promises"
import path from "node:path"
import { spawn } from "node:child_process"

import { chromium } from "@playwright/test"

const APP_BASE_URL =
  process.env.OUTPUT_WORKER_BASE_URL || process.env.APP_BASE_URL || "http://127.0.0.1:3450"
const TOKEN = process.env.OUTPUT_CAPTURE_TOKEN || ""
const OUTPUT_DIR = process.env.OUTPUT_CHANNEL_DIR || path.resolve(".runtime/output-channel")
const FFMPEG = process.env.FFMPEG_BIN || "ffmpeg"
const POLL_MS = Number(process.env.OUTPUT_CHANNEL_POLL_MS || 2000)

let currentSignature = ""
let ffmpeg = null
let stopping = false
let browser = null

await fs.mkdir(OUTPUT_DIR, { recursive: true })

process.on("SIGTERM", () => void shutdown())
process.on("SIGINT", () => void shutdown())

while (!stopping) {
  try {
    const state = await fetchState()
    if (state.signature !== currentSignature || !ffmpeg || ffmpeg.exitCode !== null) {
      currentSignature = state.signature
      await restartForState(state)
    }
    await cleanupOldSegments()
  } catch (error) {
    console.error(`[output-channel] ${error instanceof Error ? error.message : String(error)}`)
    if (!ffmpeg || ffmpeg.exitCode !== null)
      await restartForState({ kind: "fallback", signature: "fallback:error" })
  }
  await sleep(POLL_MS)
}

async function fetchState() {
  const url = new URL("/api/output/channel/state", APP_BASE_URL)
  if (TOKEN) url.searchParams.set("token", TOKEN)
  const response = await fetch(url, { cache: "no-store" })
  if (!response.ok) throw new Error(`state returned ${response.status}`)
  return response.json()
}

async function restartForState(state) {
  await stopFfmpeg()
  const prefix = `seg_${Date.now()}`
  const args =
    state.kind === "vimeo" || state.kind === "hls"
      ? mediaArgs(state).concat(outputArgs(prefix, "0:a:0?"))
      : state.kind === "slide"
        ? (await slideArgs(state)).concat(outputArgs(prefix, "1:a:0"))
        : fallbackArgs().concat(outputArgs(prefix, "1:a:0"))

  ffmpeg = spawn(FFMPEG, args, { stdio: ["ignore", "ignore", "pipe"] })
  console.log(`[output-channel] started ${state.kind} ${state.title || state.reason || ""}`)
  ffmpeg.stderr.on("data", (chunk) => {
    const line = String(chunk).trim()
    if (line) console.error(`[ffmpeg] ${line}`)
  })
  ffmpeg.on("exit", (code, signal) => {
    console.log(`[output-channel] ffmpeg exited code=${code} signal=${signal}`)
  })
}

function mediaArgs(state) {
  const offset = Math.max(0, Math.floor(Number(state.startOffsetSeconds || 0)))
  return ["-re", ...(offset > 0 ? ["-ss", String(offset)] : []), "-i", state.hlsUrl]
}

function outputArgs(prefix, audioMap) {
  return [
    "-map",
    "0:v:0",
    "-map",
    audioMap,
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-pix_fmt",
    "yuv420p",
    "-r",
    "30",
    "-g",
    "60",
    "-c:a",
    "aac",
    "-b:a",
    "128k",
    "-f",
    "hls",
    "-hls_time",
    "4",
    "-hls_list_size",
    "12",
    "-hls_flags",
    "delete_segments+append_list+omit_endlist+program_date_time+independent_segments+discont_start",
    "-hls_segment_filename",
    path.join(OUTPUT_DIR, `${prefix}_%05d.ts`),
    path.join(OUTPUT_DIR, "live.m3u8")
  ]
}

async function slideArgs(state) {
  const screenshotPath = path.join(OUTPUT_DIR, "current-slide.png")
  await captureSlide(state.renderUrl, screenshotPath)
  return [
    "-re",
    "-loop",
    "1",
    "-framerate",
    "30",
    "-i",
    screenshotPath,
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000"
  ]
}

function fallbackArgs() {
  return [
    "-re",
    "-f",
    "lavfi",
    "-i",
    "color=c=black:s=1920x1080:r=30",
    "-f",
    "lavfi",
    "-i",
    "anullsrc=channel_layout=stereo:sample_rate=48000"
  ]
}

async function captureSlide(url, screenshotPath) {
  browser ??= await chromium.launch({ headless: true })
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } })
  try {
    await page.goto(url, { waitUntil: "networkidle", timeout: 30000 })
    await page.screenshot({ path: screenshotPath, type: "png" })
  } finally {
    await page.close()
  }
}

async function stopFfmpeg() {
  if (!ffmpeg || ffmpeg.exitCode !== null) return
  ffmpeg.kill("SIGTERM")
  await new Promise((resolve) => {
    const timer = setTimeout(() => {
      ffmpeg?.kill("SIGKILL")
      resolve()
    }, 3000)
    ffmpeg?.once("exit", () => {
      clearTimeout(timer)
      resolve()
    })
  })
}

async function cleanupOldSegments() {
  const files = await fs.readdir(OUTPUT_DIR).catch(() => [])
  const cutoff = Date.now() - 10 * 60 * 1000
  await Promise.all(
    files
      .filter((file) => file.endsWith(".ts"))
      .map(async (file) => {
        const fullPath = path.join(OUTPUT_DIR, file)
        const stat = await fs.stat(fullPath).catch(() => null)
        if (stat && stat.mtimeMs < cutoff) await fs.unlink(fullPath).catch(() => undefined)
      })
  )
}

async function shutdown() {
  stopping = true
  await stopFfmpeg()
  if (browser) await browser.close()
  process.exit(0)
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
