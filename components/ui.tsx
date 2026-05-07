import Link from "next/link"
import type { ReactNode } from "react"
import clsx from "clsx"

type Tone = "neutral" | "ok" | "warn" | "danger" | "info"

export function MetricTile({
  label,
  value,
  detail,
  tone = "neutral"
}: {
  label: string
  value: string
  detail: string
  tone?: Tone
}) {
  return (
    <section className={clsx("surface-card p-4", toneBorder(tone))}>
      <p className="eyebrow">{label}</p>
      <p className={clsx("mt-2 text-2xl font-semibold tabular-nums", toneText(tone))}>{value}</p>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </section>
  )
}

export function Notice({
  tone = "info",
  title,
  children
}: {
  tone?: Tone
  title?: string
  children: ReactNode
}) {
  return (
    <div className={clsx("mb-4 rounded-md border px-4 py-3 text-sm", noticeTone(tone))}>
      {title ? <p className="font-semibold">{title}</p> : null}
      <div className={title ? "mt-1" : ""}>{children}</div>
    </div>
  )
}

export function EmptyState({
  title,
  children,
  action
}: {
  title: string
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className="rounded-md border border-dashed border-line bg-panel-soft px-4 py-5 text-sm">
      <p className="font-semibold text-ink">{title}</p>
      <div className="mt-1 max-w-2xl text-muted">{children}</div>
      {action ? <div className="mt-4">{action}</div> : null}
    </div>
  )
}

export function FormHeader({ title, detail }: { title: string; detail: string }) {
  return (
    <div>
      <h2 className="text-base font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-muted">{detail}</p>
    </div>
  )
}

export function FilterLink({
  href,
  active,
  children
}: {
  href: string
  active: boolean
  children: ReactNode
}) {
  return (
    <Link className={active ? "chip-active" : "chip"} href={href}>
      {children}
    </Link>
  )
}

export function ButtonLink({
  href,
  variant = "primary",
  children
}: {
  href: string
  variant?: "primary" | "secondary"
  children: ReactNode
}) {
  return (
    <Link className={variant === "secondary" ? "btn-secondary" : "btn-primary"} href={href}>
      {children}
    </Link>
  )
}

function toneBorder(tone: Tone) {
  switch (tone) {
    case "ok":
      return "border-success-line"
    case "warn":
      return "border-warn-line"
    case "danger":
      return "border-danger-line"
    case "info":
      return "border-info-line"
    default:
      return "border-line"
  }
}

function toneText(tone: Tone) {
  switch (tone) {
    case "ok":
      return "text-success"
    case "warn":
      return "text-warn"
    case "danger":
      return "text-danger"
    case "info":
      return "text-info"
    default:
      return "text-ink"
  }
}

function noticeTone(tone: Tone) {
  switch (tone) {
    case "ok":
      return "border-success-line bg-success-soft text-success-strong"
    case "warn":
      return "border-warn-line bg-warn-soft text-warn-strong"
    case "danger":
      return "border-danger-line bg-danger-soft text-danger-strong"
    default:
      return "border-info-line bg-info-soft text-info-strong"
  }
}
