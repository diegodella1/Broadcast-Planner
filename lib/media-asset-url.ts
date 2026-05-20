const LOCAL_APP_HOSTS = new Set(["127.0.0.1", "localhost", "0.0.0.0"])

export function publicMediaAssetUrl(assetId: string, env = process.env) {
  const baseUrl = env.APP_BASE_URL || env.NEXT_PUBLIC_APP_BASE_URL
  if (!baseUrl) throw new Error("Missing public app URL for uploaded media")
  const publicBase = normalizeAppBase(baseUrl)
  assertPublicAppBase(publicBase, env)
  return `${publicBase}/api/media/assets/${encodeURIComponent(assetId)}`
}

export function assertPublicAppBase(publicBase: string, env = process.env) {
  const url = new URL(publicBase)
  const isLocal = LOCAL_APP_HOSTS.has(url.hostname)
  const shouldRequirePublicHttps = env.NODE_ENV === "production" || env.RUNNING_IN_DOCKER === "1"
  if (shouldRequirePublicHttps && (url.protocol !== "https:" || isLocal)) {
    throw new Error(
      "Uploaded media needs a public HTTPS app URL. Configure APP_BASE_URL or NEXT_PUBLIC_APP_BASE_URL."
    )
  }
}

function normalizeAppBase(baseUrl: string) {
  const url = new URL(baseUrl)
  url.pathname = url.pathname.replace(/\/+$/, "")
  url.search = ""
  url.hash = ""
  return url.toString().replace(/\/+$/, "")
}
