import { getRequestConfig } from "next-intl/server"

export const locales = ["en", "es"] as const
export const defaultLocale = "en" as const
export type Locale = (typeof locales)[number]

function isLocale(value: string | undefined): value is Locale {
  return typeof value === "string" && (locales as readonly string[]).includes(value)
}

export default getRequestConfig(async () => {
  const { cookies } = await import("next/headers")
  const cookieStore = await cookies()
  const cookieLocale = cookieStore.get("NEXT_LOCALE")?.value
  const locale: Locale = isLocale(cookieLocale) ? cookieLocale : defaultLocale

  return {
    locale,
    messages: (await import(`./messages/${locale}.json`)).default
  }
})
