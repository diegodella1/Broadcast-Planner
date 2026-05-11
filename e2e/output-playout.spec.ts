import { expect, test } from "@playwright/test"
import { inflateSync } from "node:zlib"

const terminalStates = new Set(["playing", "fallback", "emergency"])

test("live output reaches a terminal playout state and is not black", async ({ page, baseURL }) => {
  const url = outputUrl(baseURL ?? "http://127.0.0.1:3450", "/output/live", true)
  await page.goto(url, { waitUntil: "domcontentloaded" })
  const root = page.getByTestId("output-root")
  await expect(root).toBeVisible()

  await page.waitForFunction(
    (states) => {
      const root = document.querySelector("[data-testid='output-root']")
      return root
        ? (states as string[]).includes(root.getAttribute("data-output-state") ?? "")
        : false
    },
    [...terminalStates],
    { timeout: 15_000 }
  )

  const state = await root.getAttribute("data-output-state")
  expect(terminalStates.has(state ?? "")).toBe(true)
  const screenshot = await root.screenshot()
  expectMostlyNonBlackPng(screenshot)
})

test("output session route mints cookie for admin users", async ({ page, baseURL }) => {
  const token = process.env.OUTPUT_CAPTURE_TOKEN
  const adminToken = process.env.ADMIN_BOOTSTRAP_TOKEN
  test.skip(!token || !adminToken, "requires OUTPUT_CAPTURE_TOKEN and ADMIN_BOOTSTRAP_TOKEN")
  const urlBase = baseURL ?? "http://127.0.0.1:3450"

  await page.context().addCookies([
    {
      name: "rpm_admin_token",
      value: adminToken!,
      url: urlBase,
      httpOnly: true,
      sameSite: "Lax"
    }
  ])
  await page.goto(`${urlBase}/api/output/session?debug=true&return_to=/output/live`)
  await expect(page.getByTestId("output-root")).toBeVisible()
  const cookies = await page.context().cookies(urlBase)
  expect(cookies.find((cookie) => cookie.name === "rpm_output_token")?.value).toBe(token)
})

function outputUrl(baseUrl: string, path: string, debug: boolean) {
  const url = new URL(path, baseUrl)
  if (debug) url.searchParams.set("debug", "true")
  if (process.env.OUTPUT_CAPTURE_TOKEN)
    url.searchParams.set("token", process.env.OUTPUT_CAPTURE_TOKEN)
  return url.toString()
}

function expectMostlyNonBlackPng(buffer: Buffer) {
  const image = decodePng(buffer)
  let nonBlack = 0
  const sampleStride = Math.max(4, Math.floor(image.rgba.length / 4 / 5000) * 4)
  for (let index = 0; index < image.rgba.length; index += sampleStride) {
    const r = image.rgba[index] ?? 0
    const g = image.rgba[index + 1] ?? 0
    const b = image.rgba[index + 2] ?? 0
    const a = image.rgba[index + 3] ?? 255
    if (a > 0 && r + g + b > 30) nonBlack += 1
  }
  expect(nonBlack).toBeGreaterThan(10)
}

function decodePng(buffer: Buffer) {
  if (buffer.toString("ascii", 1, 4) !== "PNG") throw new Error("Screenshot is not PNG")
  let offset = 8
  let width = 0
  let height = 0
  let colorType = 0
  const idat: Buffer[] = []
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset)
    const type = buffer.toString("ascii", offset + 4, offset + 8)
    const data = buffer.subarray(offset + 8, offset + 8 + length)
    if (type === "IHDR") {
      width = data.readUInt32BE(0)
      height = data.readUInt32BE(4)
      colorType = data[9] ?? 0
    }
    if (type === "IDAT") idat.push(data)
    if (type === "IEND") break
    offset += 12 + length
  }
  const channels = colorType === 6 ? 4 : colorType === 2 ? 3 : 0
  if (!width || !height || !channels) throw new Error(`Unsupported PNG color type ${colorType}`)
  const inflated = inflateSync(Buffer.concat(idat))
  const scanlineLength = width * channels
  const raw = Buffer.alloc(width * height * channels)
  let inputOffset = 0
  let outputOffset = 0
  let previous = Buffer.alloc(scanlineLength)
  for (let y = 0; y < height; y += 1) {
    const filter = inflated[inputOffset++]
    const current = Buffer.from(inflated.subarray(inputOffset, inputOffset + scanlineLength))
    inputOffset += scanlineLength
    unfilter(current, previous, filter ?? 0, channels)
    current.copy(raw, outputOffset)
    outputOffset += scanlineLength
    previous = current
  }
  if (channels === 4) return { rgba: raw }
  const rgba = Buffer.alloc(width * height * 4)
  for (let src = 0, dst = 0; src < raw.length; src += 3, dst += 4) {
    rgba[dst] = raw[src] ?? 0
    rgba[dst + 1] = raw[src + 1] ?? 0
    rgba[dst + 2] = raw[src + 2] ?? 0
    rgba[dst + 3] = 255
  }
  return { rgba }
}

function unfilter(current: Buffer, previous: Buffer, filter: number, bpp: number) {
  for (let i = 0; i < current.length; i += 1) {
    const left = i >= bpp ? current[i - bpp]! : 0
    const up = previous[i] ?? 0
    const upperLeft = i >= bpp ? (previous[i - bpp] ?? 0) : 0
    if (filter === 1) current[i] = (current[i]! + left) & 0xff
    if (filter === 2) current[i] = (current[i]! + up) & 0xff
    if (filter === 3) current[i] = (current[i]! + Math.floor((left + up) / 2)) & 0xff
    if (filter === 4) current[i] = (current[i]! + paeth(left, up, upperLeft)) & 0xff
  }
}

function paeth(left: number, up: number, upperLeft: number) {
  const p = left + up - upperLeft
  const pa = Math.abs(p - left)
  const pb = Math.abs(p - up)
  const pc = Math.abs(p - upperLeft)
  if (pa <= pb && pa <= pc) return left
  return pb <= pc ? up : upperLeft
}
