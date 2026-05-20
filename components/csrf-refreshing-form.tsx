"use client"

import { useRef, type FormEvent, type ReactNode } from "react"

import { CSRF_FIELD } from "@/lib/csrf-constants"

export function CsrfRefreshingForm({
  action,
  method = "post",
  encType,
  className,
  children
}: {
  action: string
  method?: string
  encType?: string
  className?: string
  children: ReactNode
}) {
  const submittingWithFreshToken = useRef(false)

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    if (submittingWithFreshToken.current) {
      submittingWithFreshToken.current = false
      return
    }

    event.preventDefault()
    const form = event.currentTarget
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLElement | null
    const token = await fetchFreshCsrfToken()
    const input = form.elements.namedItem(CSRF_FIELD)
    if (input instanceof HTMLInputElement) input.value = token

    submittingWithFreshToken.current = true
    if (submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement) {
      form.requestSubmit(submitter)
    } else {
      form.requestSubmit()
    }
  }

  return (
    <form
      action={action}
      method={method}
      encType={encType}
      className={className}
      onSubmit={onSubmit}
    >
      {children}
    </form>
  )
}

async function fetchFreshCsrfToken() {
  const response = await fetch("/api/csrf", {
    credentials: "same-origin",
    cache: "no-store"
  })
  if (!response.ok) throw new Error("Could not refresh CSRF token")
  const data = (await response.json()) as { csrfToken?: string }
  if (!data.csrfToken) throw new Error("Missing CSRF token")
  return data.csrfToken
}
