"use client"

import { useEffect, useState } from "react"

export function useSlidePollingData<T>(initialData: T, endpoint: string, intervalMs = 30_000) {
  const [data, setData] = useState(initialData)

  useEffect(() => {
    let cancelled = false
    const timer = setInterval(async () => {
      try {
        const response = await fetch(endpoint, { cache: "no-store" })
        if (!response.ok) return
        const payload = (await response.json()) as T
        if (!cancelled) setData(payload)
      } catch {
        // Keep the last visible payload if this refresh fails.
      }
    }, intervalMs)

    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [endpoint, intervalMs])

  return data
}
