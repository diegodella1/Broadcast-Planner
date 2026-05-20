import Link from "next/link"
import type { ReactNode } from "react"

const shipped = [
  "Single-tenant operator console for Roxom TV",
  "Named operators, admin sessions and role guards",
  "Rate limiting, CSRF protection and output token flow",
  "Admin health checks and Go Live Drill",
  "Daily schedule builder with schedule health polling",
  "Schedule add-block confirmation with highlighted placement and readable time ranges",
  "Runbook for preflight, live operation, incident notes and shutdown",
  "Output overrides for urgent live cuts",
  "Music preferences for image and slide blocks",
  "Dynamic Reuters HLS/RTMP stream snapshots",
  "Browser output for OBS/vMix capture",
  "Time-accurate video reload resume",
  "Audit identity for critical operations",
  "Supabase readiness schema and fresh-project bootstrap SQL"
]

const verification = [
  "typecheck passed",
  "lint passed",
  "format check passed",
  "i18n check passed",
  "security service-role guard passed",
  "audit trail guard passed",
  "Vitest passed: 254 tests",
  "Next production build passed",
  "local production deploy passed",
  "local read-only smoke passed",
  "public production read-only smoke passed"
]

const nextSteps = [
  "Provision day-to-day named operators and keep bootstrap token as emergency-only access.",
  "Run the browser output Go Live Drill in the actual OBS/vMix capture runtime.",
  "Replace remaining placeholder/static plate data with real feeds or editable operator inputs.",
  "Remodel the visual design of cards, plates and output surfaces for final broadcast identity.",
  "Add output drift monitoring and incident prompts for silence, black output and stalled video.",
  "Finish i18n and validation copy cleanup.",
  "Record recent smoke status so health is not degraded only because smoke metadata is missing."
]

const operationSteps = [
  {
    name: "1. Load content",
    route: "/admin/assets",
    actions: [
      "Upload videos, images, audio and graphics.",
      "Sync Vimeo.",
      "Register remote URLs when needed.",
      "Mark assets as ready only after reviewing playback, duration and fallback."
    ]
  },
  {
    name: "2. Build the day",
    route: "/admin/calendar",
    actions: [
      "Create or open the programming day.",
      "Add blocks in chronological order.",
      "Assign an asset, slide or Reuters stream.",
      "For Reuters, paste the current HLS/RTMP endpoint because those URLs are dynamic."
    ]
  },
  {
    name: "3. Review the schedule",
    route: "/admin/schedule/<date>",
    actions: [
      "Fix gaps.",
      "Fix overlaps.",
      "Resolve missing or not-ready assets.",
      "Review fallback at day and block level.",
      "Use schedule health deep links to jump directly to the affected block."
    ]
  },
  {
    name: "4. Complete the runbook",
    route: "/admin/runbook/<date>",
    actions: [
      "Complete preflight before going live.",
      "Record live operation notes.",
      "Use incident mode if there is degradation.",
      "Complete shutdown after the broadcast ends."
    ]
  },
  {
    name: "5. Go live",
    route: "/admin/output",
    actions: [
      "Activate the correct day.",
      "Open Browser Output.",
      "Click Start Output once to unlock audio.",
      "Capture the browser or window in OBS/vMix.",
      "Confirm that the monitor shows the expected current block and next block."
    ]
  },
  {
    name: "6. Operate during live",
    route: "/admin/output",
    actions: [
      "Monitor current block, next block, fallback reason and playback errors.",
      "Use Reuters live override only when the output must cut immediately to a dynamic endpoint.",
      "Return to schedule when the override ends."
    ]
  },
  {
    name: "7. Stop broadcast",
    route: "/admin/output",
    actions: [
      "Use Stop broadcast.",
      "Confirm that active overrides are cleared.",
      "Complete shutdown checks.",
      "Review the audit log."
    ]
  }
]

const preAirChecks = [
  "/api/health returns ok:true.",
  "Supabase check OK.",
  "Schema/migrations OK.",
  "Storage buckets OK.",
  "Vimeo token/playback ready.",
  "Reuters readiness OK if Reuters is used.",
  "OUTPUT_CAPTURE_TOKEN configured.",
  "Browser output opens on the capture machine.",
  "Start Output unlocks audio.",
  "Reload mid-video resumes near the expected schedule offset.",
  "Slide output renders in the capture runtime.",
  "Fallback defined.",
  "Runbook preflight complete."
]

const releaseGates = [
  "rtk npm run typecheck",
  "rtk npm run lint",
  "rtk npm run format:check",
  "rtk npm run i18n:check",
  "rtk npm run security:service-role",
  "rtk npm run security:audit-trail",
  "rtk npm test",
  "rtk npm run build",
  "rtk bash scripts/local_readonly_smoke.sh",
  "rtk bash scripts/prod_readonly_smoke.sh"
]

export default function NotionStatusPage() {
  const h2Class = "mt-8 text-2xl font-semibold tracking-normal text-[#2f2f2b]"
  const h3Class = "mt-6 text-xl font-semibold tracking-normal text-[#2f2f2b]"
  const listClass = "list-disc space-y-1 pl-6"
  const numberListClass = "list-decimal space-y-1 pl-6"
  const codeClass = "rounded bg-[#f1f1ef] px-1 py-0.5 font-mono text-[0.9em] text-[#eb5757]"

  return (
    <main className="min-h-screen bg-[#fbfbfa] text-[#37352f]">
      <div className="mx-auto max-w-[820px] px-6 py-10 md:py-14">
        <nav className="mb-10 flex gap-4 text-sm text-[#6b6b63]">
          <Link className="underline decoration-[#d3d1cb] underline-offset-4" href="/pending">
            Pending/Gantt
          </Link>
          <Link className="underline decoration-[#d3d1cb] underline-offset-4" href="/manual">
            Full manual
          </Link>
        </nav>

        <article className="space-y-12 rounded-sm bg-[#fbfbfa] text-[16px] leading-7">
          <section className="space-y-5">
            <div className="text-6xl leading-none">📡</div>
            <p className="text-sm font-medium text-[#787774]">RTV Planner</p>
            <h1 className="text-4xl font-bold leading-tight tracking-[-0.01em] text-[#2f2f2b] md:text-5xl">
              RTV Planner status
            </h1>

            <Callout>
              Status: <strong>production live.</strong> Ready for controlled broadcast operation
              with an operator present and OBS/vMix certification as the main remaining gate.
            </Callout>

            <h2 className={h2Class}>Current status</h2>
            <p>
              RTV Planner is the broadcast control room for Roxom TV. It gives operators one place
              to load content, build the daily rundown, check schedule risk, run preflight and send
              browser playout into OBS or vMix.
            </p>
            <p>
              The workflow is browser-output-first: the operator opens Browser Output from Admin
              Output, clicks Start Output once to unlock audio and captures the page in OBS/vMix.
              Reload recovery seeks video to the current scheduled offset so the signal can resume
              near the correct moment.
            </p>

            <h2 className={h2Class}>Implemented and applied</h2>
            <ul className={listClass}>
              {shipped.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h2 className={h2Class}>Production verification</h2>
            <ul className={listClass}>
              {verification.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h2 className={h2Class}>Health status</h2>
            <ul className={listClass}>
              <li>/api/health returns ok: true after deploy checks.</li>
              <li>
                Status can show degraded when there is no live day loaded or no recent smoke status
                configured.
              </li>
              <li>Schema, Supabase, storage, Vimeo, Reuters and output checks are healthy.</li>
            </ul>

            <h2 className={h2Class}>Next steps</h2>
            <ol className={numberListClass}>
              {nextSteps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>

            <h2 className={h2Class}>Notes</h2>
            <ul className={listClass}>
              <li>
                Reuters stream URLs are dynamic snapshots. Expired or rotated HLS/RTMP endpoints
                must be refreshed.
              </li>
              <li>
                Smoke scripts require environment variables to be loaded, including
                OUTPUT_CAPTURE_TOKEN.
              </li>
              <li>
                Browser output is the active playout surface. OBS/vMix browser capture must be
                certified separately from Playwright/headless testing.
              </li>
              <li>
                Some on-air plates are operational but not final: remaining placeholder/static data
                must be connected to real inputs, and the visual design needs a broadcast-quality
                remodel.
              </li>
              <li>
                If output reloads mid-show, the video seeks to the current schedule offset before
                playback resumes. Audio may still require a Start Output click after reload.
              </li>
            </ul>
          </section>

          <hr className="border-[#e9e7e3]" />

          <section className="space-y-5">
            <div className="text-6xl leading-none">🎛️</div>
            <h1 className="text-4xl font-bold leading-tight tracking-[-0.01em] text-[#2f2f2b] md:text-5xl">
              Operations manual
            </h1>

            <h2 className={h2Class}>Objective</h2>
            <p>
              RTV Planner turns a daily broadcast plan into an operator-run signal: media library,
              schedule, runbook, fallbacks, live monitor and fullscreen browser output.
            </p>

            <h2 className={h2Class}>Standard workflow</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-collapse text-sm">
                <thead>
                  <tr className="border-y border-[#e9e7e3] text-left text-[#787774]">
                    <th className="py-2 pr-4 font-medium">Step</th>
                    <th className="py-2 pr-4 font-medium">Route</th>
                    <th className="py-2 font-medium">Primary action</th>
                  </tr>
                </thead>
                <tbody>
                  {operationSteps.map((step) => (
                    <tr key={step.name} className="border-b border-[#e9e7e3] align-top">
                      <td className="py-3 pr-4 font-medium">{step.name}</td>
                      <td className="py-3 pr-4">
                        <code className={codeClass}>{step.route}</code>
                      </td>
                      <td className="py-3">{step.actions[0]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {operationSteps.map((step) => (
              <section key={step.name} className="space-y-2">
                <h3 className={h3Class}>{step.name}</h3>
                <p>
                  <strong>Route:</strong> <code className={codeClass}>{step.route}</code>
                </p>
                <p>
                  <strong>Actions:</strong>
                </p>
                <ul className={listClass}>
                  {step.actions.map((action) => (
                    <li key={action}>{action}</li>
                  ))}
                </ul>
              </section>
            ))}

            <h2 className={h2Class}>Operating rules</h2>
            <ul className={listClass}>
              <li>Browser output is the primary playout surface.</li>
              <li>
                OBS/vMix captures `/output/live`; operators click Start Output to unlock audio.
              </li>
              <li>The bootstrap token remains for emergency access.</li>
              <li>Normal operation must use named operators.</li>
              <li>Critical changes must appear in the audit log.</li>
              <li>
                Do not go live with critical schedule health issues without an explicit decision.
              </li>
            </ul>

            <h2 className={h2Class}>Pre-air checks</h2>
            <ul className={listClass}>
              {preAirChecks.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>

            <h2 className={h2Class}>Verification commands</h2>
            <ul className={listClass}>
              {releaseGates.map((gate) => (
                <li key={gate}>
                  <code className={codeClass}>{gate}</code>
                </li>
              ))}
            </ul>
          </section>
        </article>
      </div>
    </main>
  )
}

function Callout({ children }: { children: ReactNode }) {
  return (
    <div className="flex gap-3 rounded-sm bg-[#f1f1ef] px-4 py-3 text-[#37352f]">
      <span aria-hidden="true">✅</span>
      <p>{children}</p>
    </div>
  )
}
