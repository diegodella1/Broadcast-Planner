import createIntlMiddleware from "next-intl/middleware"
import { NextResponse, type NextRequest } from "next/server"
import { locales, defaultLocale } from "./i18n"

const intlMiddleware = createIntlMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: "as-needed"
})

function isAdminPath(pathname: string): boolean {
  const stripped = pathname.replace(/^\/es(?=\/|$)/, "")
  return stripped.startsWith("/admin")
}

function isLoginPath(pathname: string): boolean {
  return pathname === "/admin/login" || pathname === "/es/admin/login"
}

export default function middleware(request: NextRequest) {
  const intlResponse = intlMiddleware(request)

  const { pathname } = request.nextUrl
  if (!isAdminPath(pathname) || isLoginPath(pathname)) return intlResponse

  const expected = process.env.ADMIN_BOOTSTRAP_TOKEN
  if (!expected) return intlResponse
  const actual = request.cookies.get("rpm_admin_token")?.value
  if (actual === expected) return intlResponse

  const isEs = pathname.startsWith("/es/") || pathname === "/es"
  const loginUrl = request.nextUrl.clone()
  loginUrl.pathname = isEs ? "/es/admin/login" : "/admin/login"
  return NextResponse.redirect(loginUrl)
}

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"]
}
