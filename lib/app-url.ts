export function appUrl(path: string) {
  const base =
    process.env.APP_BASE_URL || process.env.NEXT_PUBLIC_APP_BASE_URL || "http://localhost:3000"
  const normalizedPath = path.startsWith("/") ? path : `/${path}`
  const url = new URL(base)
  const target = new URL(normalizedPath, "http://local")
  const basePath = url.pathname.replace(/\/$/, "")
  url.pathname = `${basePath}${target.pathname}`
  url.search = target.search
  url.hash = ""
  return url
}
