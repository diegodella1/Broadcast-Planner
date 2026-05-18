"use client"

import Link from "next/link"
import { useEffect, useState } from "react"

import type { ScheduleIssue } from "@/lib/schedule-health"

type HealthPayload = {
  generatedAt: string
  criticalCount: number
  warnCount: number
  issues: ScheduleIssue[]
}

export function ScheduleHealthPoller({ date, initial }: { date: string; initial: HealthPayload }) {
  const [payload, setPayload] = useState(initial)

  useEffect(() => {
    let cancelled = false
    async function refresh() {
      const response = await fetch(`/api/admin/schedule/${date}/health`, { cache: "no-store" })
      if (!response.ok) return
      const next = (await response.json()) as HealthPayload
      if (!cancelled) setPayload(next)
    }
    const timer = window.setInterval(() => {
      void refresh()
    }, 10_000)
    return () => {
      cancelled = true
      window.clearInterval(timer)
    }
  }, [date])

  if (!payload.issues.length) return null

  return (
    <section className="surface-panel mb-5 overflow-hidden" aria-live="polite">
      <div className="border-b border-line px-4 py-3">
        <h2 className="font-semibold">Schedule health</h2>
        <p className="mt-1 text-sm text-muted">
          This list refreshes while the schedule page is open.
        </p>
      </div>
      {payload.issues.map((issue) => (
        <Link
          key={issue.id}
          href={issue.targetHref ?? issue.actionHref ?? `/admin/schedule/${date}`}
          className="grid gap-1 border-b border-line px-4 py-3 last:border-b-0 hover:bg-panel-soft"
        >
          <span
            className={
              issue.severity === "critical"
                ? "text-sm font-semibold text-danger-strong"
                : "text-sm font-semibold text-warn-strong"
            }
          >
            {issue.title}
          </span>
          <span className="text-xs leading-5 text-muted">{issue.detail}</span>
        </Link>
      ))}
    </section>
  )
}
