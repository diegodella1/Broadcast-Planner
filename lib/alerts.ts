import type { OperatorHealthReport } from "./health-checks"

export async function notifyHealthFailures(report: OperatorHealthReport) {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL
  if (!webhookUrl || report.status !== "fail") return
  const failed = Object.values(report.checks).filter((check) => check.status === "fail")
  if (!failed.length) return
  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        service: report.service,
        status: report.status,
        generatedAt: report.generatedAt,
        failed: failed.map((check) => ({
          id: check.id,
          label: check.label,
          message: check.message
        }))
      })
    })
  } catch (error) {
    console.error("[alerts] health alert failed", error)
  }
}
