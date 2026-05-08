import { NextResponse, type NextRequest } from "next/server"

export function middleware(request: NextRequest) {
  if (
    !request.nextUrl.pathname.startsWith("/admin") ||
    request.nextUrl.pathname === "/admin/login"
  ) {
    return NextResponse.next()
  }
  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN
  if (!expected) return NextResponse.next()
  const actual = request.cookies.get("rpm_admin_token")?.value
  if (actual === expected) return NextResponse.next()
  const url = request.nextUrl.clone()
  url.pathname = "/admin/login"
  return NextResponse.redirect(url)
}

export const config = {
  matcher: ["/admin/:path*"]
}
