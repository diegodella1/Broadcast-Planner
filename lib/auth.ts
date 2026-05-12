import { cookies } from "next/headers"

export async function requireAdmin() {
  const token = process.env.ADMIN_BOOTSTRAP_TOKEN
  if (!token) {
    if (shouldFailClosedForMissingAdminToken()) {
      throw new Error("Admin auth not configured")
    }
    return
  }
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get("rpm_admin_token")?.value
  if (cookieToken !== token) {
    throw new Error("Unauthorized")
  }
}

export function isAdminTokenValid(token: string) {
  return Boolean(process.env.ADMIN_BOOTSTRAP_TOKEN && token === process.env.ADMIN_BOOTSTRAP_TOKEN)
}

export function shouldFailClosedForMissingAdminToken(env = process.env) {
  return isProductionLikeRuntime(env)
}

export function isProductionLikeRuntime(env = process.env) {
  return (
    env.NODE_ENV === "production" ||
    env.APP_BASE_URL?.startsWith("https://") ||
    env.NEXT_PUBLIC_APP_BASE_URL?.startsWith("https://")
  )
}
