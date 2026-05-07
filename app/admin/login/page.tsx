import { redirect } from "next/navigation"
import { cookies } from "next/headers"
import { isAdminTokenValid } from "@/lib/auth"

export default function LoginPage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  async function login(formData: FormData) {
    "use server"
    const token = String(formData.get("token") ?? "")
    if (!isAdminTokenValid(token)) {
      redirect("/admin/login?error=1")
    }
    const cookieStore = await cookies()
    const secureCookie = process.env.NEXT_PUBLIC_APP_BASE_URL?.startsWith("https://") ?? process.env.NODE_ENV === "production"
    cookieStore.set("rpm_admin_token", token, {
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
        <p className="eyebrow text-signal">Roxom TV</p>
        <h1 className="mt-2 text-2xl font-semibold">Acceso admin</h1>
        <p className="mt-2 text-sm leading-6 text-muted">Ingresá el token operativo configurado para administrar RTVTime.</p>
        <label className="mt-6 block text-sm font-medium">
          Token
          <input name="token" type="password" className="mt-2 w-full border border-line px-3 py-2" />
        </label>
        <ErrorMessage searchParams={searchParams} />
        <button className="btn-primary mt-5 w-full">Entrar</button>
      </form>
    </main>
  )
}

async function ErrorMessage({ searchParams }: { searchParams: Promise<{ error?: string }> }) {
  const params = await searchParams
  if (!params.error) return null
  return <p className="mt-3 rounded-md border border-danger-line bg-danger-soft px-3 py-2 text-sm text-danger-strong">Token invalido.</p>
}
