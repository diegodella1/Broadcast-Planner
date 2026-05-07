import clsx from "clsx"

export function StatusPill({ status }: { status: string }) {
  const label = statusLabels[status] ?? status
  return (
    <span
      className={clsx(
        "inline-flex w-fit items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold leading-none",
        status === "ready" || status === "active"
          ? "border-success-line bg-success-soft text-success-strong"
          : "border-line bg-panel-soft text-muted",
        status === "draft" && "border-line bg-panel-soft text-muted",
        status === "syncing" && "border-info-line bg-info-soft text-info-strong",
        status === "failed" && "border-danger-line bg-danger-soft text-danger-strong",
        status === "archived" && "border-line-strong bg-panel text-muted"
      )}
    >
      <span
        className={clsx(
          "h-1.5 w-1.5 rounded-full",
          status === "ready" || status === "active" ? "bg-success" : "bg-muted",
          status === "syncing" && "bg-info",
          status === "failed" && "bg-danger",
          status === "archived" && "bg-line-strong"
        )}
      />
      {label}
    </span>
  )
}

const statusLabels: Record<string, string> = {
  active: "Active",
  archived: "Archived",
  draft: "Draft",
  failed: "Failed",
  ready: "Ready",
  syncing: "Syncing"
}
