import { cookies } from "next/headers"

export async function requireAdmin() {
  const token = process.env.ADMIN_BOOTSTRAP_TOKEN
  if (!token) return
  const cookieStore = await cookies()
  const cookieToken = cookieStore.get("rpm_admin_token")?.value
  if (cookieToken !== token) {
    throw new Error("Unauthorized")
  }
}

export function isAdminTokenValid(token: string) {
  return Boolean(process.env.ADMIN_BOOTSTRAP_TOKEN && token === process.env.ADMIN_BOOTSTRAP_TOKEN)
}
