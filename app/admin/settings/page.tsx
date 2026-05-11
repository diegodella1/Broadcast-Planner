import Link from "next/link"

import { AdminShell } from "@/components/admin-shell"
import { CsrfInput } from "@/components/csrf-input"
import { FormHeader, MetricTile, Notice } from "@/components/ui"
import { getVimeoSettings, getVimeoToken } from "@/lib/settings"
import { PLAYOUT_TIMEZONE } from "@/lib/time"

export const dynamic = "force-dynamic"

export default async function SettingsPage({
  searchParams
}: {
  searchParams: Promise<{ saved?: string }>
}) {
  const params = await searchParams
  const [settings, token] = await Promise.all([getVimeoSettings(), getVimeoToken()])
  const currentTimezone = String(settings?.publicConfig.timezone ?? PLAYOUT_TIMEZONE)
  const lastSyncAt = settingText(settings?.publicConfig.last_sync_at) || "Never"
  const lastSyncCount = settingText(settings?.publicConfig.last_sync_count) || "0"
  const lastSyncStaleCount = settingText(settings?.publicConfig.last_sync_stale_count) || "0"

  return (
    <AdminShell
      title="Integrations"
      description="Credentials, operating timezone, and integration health."
      actions={
        <Link className="btn-primary" href="/admin/vimeo">
          Open Vimeo Sync
        </Link>
      }
    >
      {params.saved ? <Notice tone="ok">Settings saved.</Notice> : null}

      <section className="mb-5 grid gap-3 md:grid-cols-3">
        <MetricTile
          label="Vimeo token"
          value={token ? "Set" : "Missing"}
          detail={settings?.status ?? "unknown"}
          tone={token ? "ok" : "warn"}
        />
        <MetricTile
          label="Last sync"
          value={lastSyncAt}
          detail={`${lastSyncCount} assets updated`}
          tone="info"
        />
        <MetricTile
          label="Stale"
          value={lastSyncStaleCount}
          detail="Archived by sync"
          tone={lastSyncStaleCount === "0" ? "ok" : "warn"}
        />
      </section>

      {settings?.lastError ? (
        <Notice tone="warn" title="Last integration error">
          {settings.lastError}
        </Notice>
      ) : null}

      <form action="/api/settings" method="post" className="surface-panel max-w-2xl p-5">
        <CsrfInput />
        <FormHeader
          title="Vimeo integration"
          detail="Store a Vimeo API token for daily sync. Synced episodes appear in Library for scheduling."
        />
        <div className="mt-4 rounded-md bg-panel-soft px-3 py-2 text-sm text-muted">
          Vimeo connection: {token ? "token configured" : "no token configured"}
          {!token ? (
            <span className="block">Paste a Vimeo access token below to enable sync.</span>
          ) : null}
        </div>
        <label className="mt-5 block text-sm font-medium">
          Vimeo access token
          <input
            name="vimeo_token"
            type="password"
            autoComplete="off"
            className="mt-2 w-full border border-line px-3 py-2"
            placeholder={
              settings?.hasSecret ? "Token saved. Leave blank to keep it." : "Paste token"
            }
          />
          <span className="mt-1 block text-xs text-muted">
            Stored encrypted in Supabase. Environment variable VIMEO_ACCESS_TOKEN still takes
            priority if present.
          </span>
        </label>
        <label className="mt-5 block text-sm font-medium">
          Optional Vimeo show/folder URI
          <input
            name="vimeo_folder_uri"
            className="mt-2 w-full border border-line px-3 py-2"
            defaultValue={String(settings?.publicConfig.folder_uri ?? "")}
            placeholder="/albums/1234567"
          />
          <span className="mt-1 block text-xs text-muted">
            Blank syncs account videos and shows. Use an album/show URI to limit sync scope.
          </span>
        </label>
        <label className="mt-4 block text-sm font-medium">
          Timezone
          <input
            name="timezone"
            className="mt-2 w-full border border-line px-3 py-2"
            defaultValue={currentTimezone}
          />
          <span className="mt-1 block text-xs text-muted">
            Operational scheduling reference: San Francisco ({PLAYOUT_TIMEZONE}).
          </span>
        </label>
        <button className="btn-primary mt-5">Save settings</button>
      </form>
    </AdminShell>
  )
}

function settingText(value: unknown) {
  if (value === null || value === undefined) return ""
  return String(value)
}
