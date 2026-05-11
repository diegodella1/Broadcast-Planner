import { NextResponse, type NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  const csrfResponse = rejectCrossSiteMutation(request)
  if (csrfResponse) return withSecurityHeaders(csrfResponse)

  if (request.nextUrl.pathname === "/rtvtime" || request.nextUrl.pathname.startsWith("/rtvtime/")) {
    const url = request.nextUrl.clone()
    url.pathname = request.nextUrl.pathname.replace(/^\/rtvtime/, "") || "/"
    return withSecurityHeaders(NextResponse.redirect(url, 308))
  }

  if (
    !request.nextUrl.pathname.startsWith("/admin") ||
    request.nextUrl.pathname === "/admin/login"
  ) {
    return withSecurityHeaders(NextResponse.next())
  }
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN
  if (!expected) return withSecurityHeaders(NextResponse.next())
  const actual = request.cookies.get("rpm_admin_token")?.value
  if (actual === expected) return withSecurityHeaders(NextResponse.next())
  const url = request.nextUrl.clone()
  url.pathname = "/admin/login"
  return withSecurityHeaders(NextResponse.redirect(url))
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
}

function rejectCrossSiteMutation(request: NextRequest) {
  if (["GET", "HEAD", "OPTIONS"].includes(request.method)) return null
  const origin = request.headers.get("origin")
  const fetchSite = request.headers.get("sec-fetch-site")
  if (fetchSite === "cross-site") {
    return NextResponse.json({ ok: false, error: "Cross-site request denied" }, { status: 403 })
  }
  if (!origin) return null
  if (origin === request.nextUrl.origin) return null
  return NextResponse.json({ ok: false, error: "Invalid request origin" }, { status: 403 })
}

function withSecurityHeaders(response: NextResponse) {
  response.headers.set("Content-Security-Policy", contentSecurityPolicy())
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  return response
}

function contentSecurityPolicy() {
  const appOrigin = originFromEnv(process.env.NEXT_PUBLIC_APP_BASE_URL)
  const frameAncestors = ["'self'", appOrigin].filter(Boolean).join(" ")
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "form-action 'self'",
    `frame-ancestors ${frameAncestors}`,
    "img-src 'self' data: blob: https: http:",
    "media-src 'self' blob: https: http:",
    "connect-src 'self' https: http: wss:",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'"
  ].join("; ")
}

function originFromEnv(value: string | undefined) {
  if (!value) return ""
  try {
    return new URL(value).origin
  } catch {
    return ""
  }
}
