import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { getTranslations } from "next-intl/server"
import { isAdminTokenValid } from "@/lib/auth"
import { loginSchema } from "@/lib/schemas"

export default async function LoginPage({
  searchParams
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const t = await getTranslations("login")

  async function login(formData: FormData) {
    "use server"
    const parsed = loginSchema.safeParse({ token: formData.get("token") ?? "" })
    if (!parsed.success || !isAdminTokenValid(parsed.data.token)) {
      redirect("/admin/login?error=1")
    }
    const cookieStore = await cookies()
    const secureCookie =
      process.env.NEXT_PUBLIC_APP_BASE_URL?.startsWith("https://") ??
      process.env.NODE_ENV === "production"
    cookieStore.set("rpm_admin_token", parsed.data.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: secureCookie,
      path: "/",
      maxAge: 60 * 60 * 12
    })
    redirect("/admin/calendar")
  }

  return (
    <main className="grid min-h-screen place-items-center bg-panel px-6">
      <form action={login} className="surface-panel w-full max-w-sm p-6">
        <p className="eyebrow text-signal">{t("eyebrow")}</p>
        <h1 className="mt-2 text-2xl font-semibold">{t("title")}</h1>
        <p className="mt-2 text-sm leading-6 text-muted">{t("body")}</p>
        <label className="mt-6 block text-sm font-medium">
          {t("tokenLabel")}
          <input
            name="token"
            type="password"
            className="mt-2 w-full border border-line px-3 py-2"
          />
        </label>
        <ErrorMessage searchParams={searchParams} errorText={t("errorInvalid")} />
        <button className="btn-primary mt-5 w-full">{t("submit")}</button>
      </form>
    </main>
  )
}

async function ErrorMessage({
  searchParams,
  errorText
}: {
  searchParams: Promise<{ error?: string }>
  errorText: string
}) {
  const params = await searchParams
  if (!params.error) return null
  return (
    <p className="mt-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong">
      {errorText}
    </p>
  )
}
