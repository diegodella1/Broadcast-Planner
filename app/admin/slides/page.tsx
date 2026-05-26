import { Archive, CheckCircle2, CirclePlus, Eye, Library, Sparkles } from "lucide-react"

import { AdminShell } from "@/components/admin-shell"
import { StatusPill } from "@/components/status-pill"
import { EmptyState, FormHeader } from "@/components/ui"
import { getSlides } from "@/lib/data"
import {
  archiveSlideAsset,
  createSlideAsset,
  createWeatherPlate,
  updateWeatherPlate
} from "@/lib/mutations"
import { slidePreviewHref } from "@/lib/slide-preview"
import { SLIDE_TEMPLATES, type SlideTemplateEntry } from "@/lib/slides/registry"
import { createServiceClient } from "@/lib/supabase/server"
import type { SlideAsset } from "@/lib/types"

export const dynamic = "force-dynamic"

const DEPRECATED_TEMPLATE_IDS = new Set(["news", "show", "video"])

const TEMPLATE_GROUPS: ReadonlyArray<{
  title: string
  detail: string
  ids: ReadonlyArray<SlideTemplateEntry["id"]>
}> = [
  {
    title: "Core broadcast plates",
    detail: "The plates we are actively improving and scheduling.",
    ids: ["guest-lineup", "weather", "debt", "strc", "sata"]
  },
  {
    title: "Market open plates",
    detail: "Regional index boards with market-clock context.",
    ids: [
      "us-market-open",
      "japan-market-open",
      "uk-market-open",
      "china-market-open",
      "saudi-market-open"
    ]
  },
  {
    title: "Market data plates",
    detail: "BTC-relative markets, metals, oil and FX surfaces.",
    ids: ["metals", "gold", "silver", "oil", "fx"]
  },
  {
    title: "Event plates",
    detail: "Calendar/event boards backed by the events table.",
    ids: ["calendar", "event", "event-modern"]
  }
]

const SYSTEM_SLIDE_PRESETS = SLIDE_TEMPLATES.map((template) => ({
  title: `${template.label} plate`,
  templateId: template.id,
  content: `System slide: ${template.label}. Uses live data when available and safe fallback data otherwise.`
}))

export default async function SlidesPage() {
  const slides = await getSlides()
  const activeSlides = slides.filter((slide) => slide.status !== "archived")
  const archivedSlides = slides.filter((slide) => slide.status === "archived")
  const currentTemplateIds = new Set(SLIDE_TEMPLATES.map((template) => template.id))
  const activeByTemplate = new Map(
    activeSlides
      .filter((slide) => slide.templateId)
      .map((slide) => [slide.templateId as string, slide])
  )
  const missingPresets = SYSTEM_SLIDE_PRESETS.filter(
    (preset) => !activeByTemplate.has(preset.templateId)
  )
  const legacySlides = activeSlides.filter((slide) => isLegacySlide(slide, currentTemplateIds))
  const weatherPlates = activeSlides.filter((slide) => slide.templateId === "weather")
  const customSlides = activeSlides.filter(
    (slide) => !slide.templateId && !isLegacySlide(slide, currentTemplateIds)
  )
  const scheduledSlideIds = await getScheduledSlideIds()

  async function addSlide(formData: FormData) {
    "use server"
    const slideType = String(formData.get("slide_type"))
    const defaultDurationSeconds =
      Number(formData.get("default_duration_seconds") || 0) || undefined
    const templateId =
      slideType === "template" ? String(formData.get("template_id") || "") : undefined
    await createSlideAsset({
      title: String(formData.get("title")),
      slideType,
      content: String(formData.get("content") || ""),
      imageUrl: String(formData.get("image_url") || ""),
      htmlContent: String(formData.get("html_content") || ""),
      ...(defaultDurationSeconds !== undefined ? { defaultDurationSeconds } : {}),
      ...(templateId !== undefined && templateId !== "" ? { templateId } : {}),
      status: String(formData.get("status") || "ready")
    })
  }

  async function addSystemSlide(formData: FormData) {
    "use server"
    const templateId = String(formData.get("template_id"))
    const existing = await getSlides()
    if (existing.some((slide) => slide.templateId === templateId && slide.status !== "archived")) {
      return
    }
    await createSlideAsset({
      title: String(formData.get("title")),
      slideType: "template",
      templateId,
      content: String(formData.get("content") || ""),
      defaultDurationSeconds: Number(formData.get("default_duration_seconds") || 30),
      status: "ready"
    })
  }

  async function addAllSystemSlides() {
    "use server"
    const existing = await getSlides()
    const existingTemplateIds = new Set(
      existing
        .filter((slide) => slide.status !== "archived")
        .map((slide) => slide.templateId)
        .filter(Boolean)
    )
    for (const preset of SYSTEM_SLIDE_PRESETS) {
      if (existingTemplateIds.has(preset.templateId)) continue
      await createSlideAsset({
        title: preset.title,
        slideType: "template",
        templateId: preset.templateId,
        content: preset.content,
        defaultDurationSeconds: 30,
        status: "ready"
      })
    }
  }

  async function archiveSlide(formData: FormData) {
    "use server"
    await archiveSlideAsset(String(formData.get("slide_id")))
  }

  async function addWeatherPlate(formData: FormData) {
    "use server"
    await createWeatherPlate({
      title: String(formData.get("title") || ""),
      locationName: String(formData.get("location_name") || ""),
      lat: Number(formData.get("lat")),
      lon: Number(formData.get("lon")),
      defaultDurationSeconds: Number(formData.get("default_duration_seconds") || 30),
      status: String(formData.get("status") || "ready")
    })
  }

  async function updateWeatherPlateAction(formData: FormData) {
    "use server"
    await updateWeatherPlate({
      slideId: String(formData.get("slide_id") || ""),
      title: String(formData.get("title") || ""),
      locationName: String(formData.get("location_name") || ""),
      lat: Number(formData.get("lat")),
      lon: Number(formData.get("lon")),
      defaultDurationSeconds: Number(formData.get("default_duration_seconds") || 30),
      status: String(formData.get("status") || "ready")
    })
  }

  async function archiveLegacySlides() {
    "use server"
    const existing = await getSlides()
    const currentIds = new Set(SLIDE_TEMPLATES.map((template) => template.id))
    for (const slide of existing) {
      if (slide.status === "archived") continue
      if (!isLegacySlide(slide, currentIds)) continue
      await archiveSlideAsset(slide.id)
    }
  }

  return (
    <AdminShell
      title="Graphics"
      description="Broadcast-ready plates grouped by what is current, missing, custom or legacy."
    >
      <section className="mb-5 grid gap-3 md:grid-cols-4">
        <MetricCard icon={Sparkles} label="Current templates" value={SLIDE_TEMPLATES.length} />
        <MetricCard icon={CheckCircle2} label="Ready in library" value={activeByTemplate.size} />
        <MetricCard icon={CirclePlus} label="Missing" value={missingPresets.length} />
        <MetricCard icon={Archive} label="Legacy active" value={legacySlides.length} />
      </section>

      <section className="surface-panel mb-5 p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <FormHeader
            title="Current system plates"
            detail="These are the supported plates for scheduling. Create missing plates once, then schedule them from the daily rundown."
          />
          <form action={addAllSystemSlides}>
            <button className="btn-primary">Create missing plates</button>
          </form>
        </div>
        <div className="mt-5 grid gap-4">
          {TEMPLATE_GROUPS.map((group) => (
            <section key={group.title} className="rounded-md border border-line bg-panel-soft p-3">
              <div className="mb-3">
                <h2 className="text-sm font-semibold">{group.title}</h2>
                <p className="text-xs text-muted">{group.detail}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {group.ids.map((templateId) => {
                  const template = SLIDE_TEMPLATES.find((entry) => entry.id === templateId)
                  if (!template) return null
                  const slide = activeByTemplate.get(template.id)
                  const preset = SYSTEM_SLIDE_PRESETS.find(
                    (item) => item.templateId === template.id
                  )
                  return (
                    <SystemTemplateCard
                      key={template.id}
                      template={template}
                      slide={slide}
                      preset={preset}
                      addSystemSlide={addSystemSlide}
                      archiveSlide={archiveSlide}
                    />
                  )
                })}
              </div>
            </section>
          ))}
        </div>
      </section>

      <section className="surface-panel mb-5 overflow-hidden">
        <div className="border-b border-line p-4">
          <FormHeader
            title="Weather plates"
            detail="Create multiple city-specific Weather plates. Each plate keeps its own city name, latitude and longitude."
          />
        </div>
        <form
          action={addWeatherPlate}
          className="grid gap-3 border-b border-line p-4 lg:grid-cols-[1fr_1fr_130px_130px_110px_110px]"
        >
          <input
            name="title"
            required
            placeholder="Plate title"
            className="border border-line px-3 py-2 text-sm"
          />
          <input
            name="location_name"
            required
            placeholder="City label"
            className="border border-line px-3 py-2 text-sm"
          />
          <input
            name="lat"
            required
            type="number"
            step="any"
            min="-90"
            max="90"
            placeholder="Lat"
            className="border border-line px-3 py-2 text-sm"
          />
          <input
            name="lon"
            required
            type="number"
            step="any"
            min="-180"
            max="180"
            placeholder="Lon"
            className="border border-line px-3 py-2 text-sm"
          />
          <input
            name="default_duration_seconds"
            type="number"
            min="1"
            defaultValue="30"
            className="border border-line px-3 py-2 text-sm"
            aria-label="Duration seconds"
          />
          <select name="status" className="border border-line px-3 py-2 text-sm">
            <option value="ready">Ready</option>
            <option value="draft">Draft</option>
          </select>
          <button className="btn-primary lg:col-span-6">Create weather plate</button>
        </form>
        {weatherPlates.map((slide) => (
          <WeatherPlateRow
            key={slide.id}
            slide={slide}
            updateWeatherPlateAction={updateWeatherPlateAction}
            archiveSlide={archiveSlide}
          />
        ))}
        {weatherPlates.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No city weather plates">
              Create Buenos Aires, Miami, Madrid or any city with latitude and longitude.
            </EmptyState>
          </div>
        ) : null}
      </section>

      {legacySlides.length > 0 && (
        <section className="surface-panel mb-5 p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <FormHeader
              title="Legacy or extra plates"
              detail="These are active graphics that are not part of the current supported template set. Archive them if they are old News/Show/Video experiments or duplicates."
            />
            <form action={archiveLegacySlides}>
              <button className="btn-secondary">Archive legacy plates</button>
            </form>
          </div>
          <div className="mt-4 grid gap-3">
            {legacySlides.map((slide) => (
              <SlideRow key={slide.id} slide={slide} archiveSlide={archiveSlide} />
            ))}
          </div>
        </section>
      )}

      <section className="mb-5">
        <form
          action={addSlide}
          className="surface-panel grid gap-3 p-4 lg:grid-cols-[1fr_150px_120px_120px]"
        >
          <div className="lg:col-span-4">
            <FormHeader
              title="Create custom graphic"
              detail="Use this for one-off images, controlled HTML or a manually-created template plate."
            />
          </div>
          <input
            name="title"
            required
            placeholder="Title"
            className="border border-line px-3 py-2 text-sm"
          />
          <select name="slide_type" className="border border-line px-3 py-2 text-sm">
            <option value="template">Template</option>
            <option value="image">Image</option>
            <option value="html">HTML</option>
            <option value="markdown">Markdown</option>
          </select>
          <input
            name="default_duration_seconds"
            type="number"
            min="1"
            placeholder="Sec"
            className="border border-line px-3 py-2 text-sm"
          />
          <select name="status" className="border border-line px-3 py-2 text-sm">
            <option value="ready">Ready</option>
            <option value="draft">Draft</option>
          </select>
          <input
            name="image_url"
            placeholder="Image URL"
            className="border border-line px-3 py-2 text-sm lg:col-span-2"
          />
          <select
            name="template_id"
            className="border border-line px-3 py-2 text-sm lg:col-span-2"
            aria-label="Template (required when type is Template)"
          >
            <option value="">Choose template</option>
            {SLIDE_TEMPLATES.map((template) => (
              <option key={template.id} value={template.id}>
                {template.label}
              </option>
            ))}
          </select>
          <textarea
            name="content"
            placeholder="Visible text"
            className="min-h-24 border border-line px-3 py-2 text-sm lg:col-span-2"
          />
          <textarea
            name="html_content"
            placeholder="Optional controlled HTML"
            className="min-h-24 border border-line px-3 py-2 text-sm lg:col-span-4"
          />
          <button className="btn-primary lg:col-span-4">Create custom graphic</button>
        </form>
      </section>

      <section className="surface-panel overflow-hidden">
        <div className="border-b border-line p-4">
          <FormHeader
            title="Custom and archived graphics"
            detail="Custom graphics stay available here. Archived plates are hidden from normal scheduling."
          />
        </div>
        {customSlides.map((slide) => (
          <SlideRow
            key={slide.id}
            slide={slide}
            archiveSlide={archiveSlide}
            scheduled={scheduledSlideIds.has(slide.id)}
          />
        ))}
        {archivedSlides.map((slide) => (
          <SlideRow key={slide.id} slide={slide} archiveSlide={archiveSlide} muted />
        ))}
        {customSlides.length === 0 && archivedSlides.length === 0 && (
          <div className="p-4">
            <EmptyState title="No custom graphics">
              Current system plates are managed above. Custom one-offs will appear here.
            </EmptyState>
          </div>
        )}
      </section>
    </AdminShell>
  )
}

function SystemTemplateCard({
  template,
  slide,
  preset,
  addSystemSlide,
  archiveSlide
}: {
  template: SlideTemplateEntry
  slide: SlideAsset | undefined
  preset: (typeof SYSTEM_SLIDE_PRESETS)[number] | undefined
  addSystemSlide: (formData: FormData) => Promise<void>
  archiveSlide: (formData: FormData) => Promise<void>
}) {
  return (
    <div className="rounded-md border border-line bg-surface p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-semibold">{template.label}</p>
          <p className="mt-1 line-clamp-2 text-xs text-muted">{template.description}</p>
        </div>
        {slide ? <StatusPill status={slide.status} /> : <StatusPill status="draft" />}
      </div>
      <p className="mt-3 text-xs text-muted">
        {template.dataEndpoint ? `Data: ${template.dataEndpoint}` : "Static template"}
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {slide ? (
          <>
            <a
              className="btn-secondary min-h-9 gap-2"
              href={slidePreviewHref(slide.id)}
              target="_blank"
              rel="noreferrer"
            >
              <Eye size={15} aria-hidden="true" />
              View
            </a>
            <form action={archiveSlide}>
              <input type="hidden" name="slide_id" value={slide.id} />
              <button className="btn-secondary min-h-9 gap-2">
                <Archive size={15} aria-hidden="true" />
                Archive
              </button>
            </form>
          </>
        ) : (
          <form action={addSystemSlide}>
            <input type="hidden" name="title" value={preset?.title ?? `${template.label} plate`} />
            <input type="hidden" name="template_id" value={template.id} />
            <input
              type="hidden"
              name="content"
              value={preset?.content ?? `System slide: ${template.label}.`}
            />
            <input type="hidden" name="default_duration_seconds" value="30" />
            <button className="btn-primary min-h-9 gap-2">
              <CirclePlus size={15} aria-hidden="true" />
              Create
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function WeatherPlateRow({
  slide,
  updateWeatherPlateAction,
  archiveSlide
}: {
  slide: SlideAsset
  updateWeatherPlateAction: (formData: FormData) => Promise<void>
  archiveSlide: (formData: FormData) => Promise<void>
}) {
  const weather = weatherMetadata(slide)
  return (
    <form
      action={updateWeatherPlateAction}
      className="grid gap-3 border-b border-line p-4 last:border-b-0 lg:grid-cols-[1fr_1fr_130px_130px_110px_110px_170px]"
    >
      <input type="hidden" name="slide_id" value={slide.id} />
      <input
        name="title"
        required
        defaultValue={slide.title}
        className="border border-line px-3 py-2 text-sm"
        aria-label="Plate title"
      />
      <input
        name="location_name"
        required
        defaultValue={weather.locationName}
        className="border border-line px-3 py-2 text-sm"
        aria-label="City label"
      />
      <input
        name="lat"
        required
        type="number"
        step="any"
        min="-90"
        max="90"
        defaultValue={weather.lat}
        className="border border-line px-3 py-2 text-sm"
        aria-label="Latitude"
      />
      <input
        name="lon"
        required
        type="number"
        step="any"
        min="-180"
        max="180"
        defaultValue={weather.lon}
        className="border border-line px-3 py-2 text-sm"
        aria-label="Longitude"
      />
      <input
        name="default_duration_seconds"
        type="number"
        min="1"
        defaultValue={slide.defaultDurationSeconds ?? 30}
        className="border border-line px-3 py-2 text-sm"
        aria-label="Duration seconds"
      />
      <select
        name="status"
        defaultValue={slide.status}
        className="border border-line px-3 py-2 text-sm"
        aria-label="Status"
      >
        <option value="ready">Ready</option>
        <option value="draft">Draft</option>
        <option value="archived">Archived</option>
      </select>
      <div className="flex flex-wrap gap-2 lg:justify-end">
        <a
          className="btn-secondary min-h-9 gap-2"
          href={slidePreviewHref(slide.id)}
          target="_blank"
          rel="noreferrer"
        >
          <Eye size={15} aria-hidden="true" />
          View
        </a>
        <button className="btn-secondary min-h-9">Save</button>
        <button formAction={archiveSlide} className="btn-secondary min-h-9">
          Archive
        </button>
      </div>
    </form>
  )
}

function SlideRow({
  slide,
  archiveSlide,
  muted = false,
  scheduled = false
}: {
  slide: SlideAsset
  archiveSlide: (formData: FormData) => Promise<void>
  muted?: boolean
  scheduled?: boolean
}) {
  return (
    <div className="grid gap-3 border-b border-line p-4 last:border-b-0 md:grid-cols-[1fr_120px_120px_180px] md:items-center">
      <div className={muted ? "opacity-60" : ""}>
        <p className="font-semibold">{slide.title}</p>
        <p className="text-sm text-muted">
          {slide.slideType}
          {slide.templateId ? `/${slide.templateId}` : ""} ·{" "}
          {slide.defaultDurationSeconds ? `${slide.defaultDurationSeconds}s` : "No duration"}
        </p>
        {slide.content && <p className="mt-1 line-clamp-1 text-sm text-muted">{slide.content}</p>}
        {scheduled && !slide.templateId ? (
          <p className="mt-2 rounded-md border border-warn-line bg-warn-soft px-2 py-1 text-xs font-semibold text-warn-strong">
            Static custom slide is scheduled. Replace with a current template before archiving.
          </p>
        ) : null}
      </div>
      <span className="text-sm text-muted">
        {slide.imageUrl ? "Image" : slide.htmlContent ? "HTML" : "Text"}
      </span>
      <StatusPill status={slide.status} />
      <div className="flex flex-wrap gap-2 md:justify-end">
        <a
          className="btn-secondary min-h-9 gap-2"
          href={slidePreviewHref(slide.id)}
          target="_blank"
          rel="noreferrer"
        >
          <Eye size={15} aria-hidden="true" />
          View
        </a>
        {slide.status !== "archived" && (
          <form action={archiveSlide}>
            <input type="hidden" name="slide_id" value={slide.id} />
            <button className="btn-secondary min-h-9 gap-2">
              <Archive size={15} aria-hidden="true" />
              Archive
            </button>
          </form>
        )}
      </div>
    </div>
  )
}

function weatherMetadata(slide: SlideAsset) {
  return {
    locationName: stringMetadata(slide.metadata?.weatherLocationName, "Buenos Aires"),
    lat: numberMetadata(slide.metadata?.weatherLat, -34.6037),
    lon: numberMetadata(slide.metadata?.weatherLon, -58.3816)
  }
}

function stringMetadata(value: unknown, fallback: string) {
  return typeof value === "string" && value.trim() ? value : fallback
}

function numberMetadata(value: unknown, fallback: number) {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function MetricCard({
  icon: Icon,
  label,
  value
}: {
  icon: typeof Library
  label: string
  value: number
}) {
  return (
    <div className="surface-panel flex items-center gap-3 p-4">
      <div className="grid size-10 place-items-center rounded-md border border-line bg-panel-soft">
        <Icon size={18} aria-hidden="true" />
      </div>
      <div>
        <p className="text-xs font-semibold uppercase text-muted">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
      </div>
    </div>
  )
}

function isLegacySlide(slide: SlideAsset, currentTemplateIds: Set<string>) {
  if (slide.templateId) {
    return (
      !currentTemplateIds.has(slide.templateId) || DEPRECATED_TEMPLATE_IDS.has(slide.templateId)
    )
  }
  const normalizedTitle = slide.title.toLowerCase()
  return ["news", "show", "video"].some((word) => normalizedTitle.includes(word))
}

async function getScheduledSlideIds() {
  try {
    const supabase = createServiceClient()
    const [{ data: blocks }, { data: layers }] = await Promise.all([
      supabase.from("program_blocks").select("slide_id,status").neq("status", "archived"),
      supabase.from("scheduled_layers").select("slide_id,enabled").eq("enabled", true)
    ])
    return new Set(
      [...(blocks ?? []), ...(layers ?? [])]
        .map((row) => row.slide_id)
        .filter((id): id is string => Boolean(id))
    )
  } catch (error) {
    console.error("[app/admin/slides/page.tsx:getScheduledSlideIds]", error)
    return new Set<string>()
  }
}
