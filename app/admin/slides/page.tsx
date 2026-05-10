import { AdminShell } from "@/components/admin-shell"
import { StatusPill } from "@/components/status-pill"
import { EmptyState, FormHeader } from "@/components/ui"
import { getSlides } from "@/lib/data"
import { createSlideAsset } from "@/lib/mutations"
import { SLIDE_TEMPLATES } from "@/lib/slides/registry"

export const dynamic = "force-dynamic"

const SYSTEM_SLIDE_PRESETS = [
  {
    title: "Markets overview",
    templateId: "metals",
    content: "System slide: markets overview with fallback data until feeds are finalized."
  },
  { title: "FX board", templateId: "fx", content: "System slide: FX and currency board." },
  { title: "Metals board", templateId: "metals", content: "System slide: metals board." },
  { title: "Gold board", templateId: "gold", content: "System slide: gold price board." },
  { title: "Silver board", templateId: "silver", content: "System slide: silver price board." },
  { title: "Oil board", templateId: "oil", content: "System slide: oil price board." },
  { title: "STRC board", templateId: "strc", content: "System slide: STRC dashboard." },
  { title: "SATA board", templateId: "sata", content: "System slide: SATA dashboard." },
  { title: "News headline", templateId: "news", content: "System slide: headline fallback." },
  { title: "Event calendar", templateId: "calendar", content: "System slide: event calendar." }
] as const

export default async function SlidesPage() {
  const slides = await getSlides()
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
  async function addMarketSlide(formData: FormData) {
    "use server"
    await createSlideAsset({
      title: String(formData.get("title") || "Market board"),
      slideType: "template",
      templateId: "market",
      content: String(formData.get("content") || "Live market data"),
      defaultDurationSeconds: Number(formData.get("default_duration_seconds") || 30),
      status: "ready"
    })
  }
  async function addSystemSlide(formData: FormData) {
    "use server"
    await createSlideAsset({
      title: String(formData.get("title")),
      slideType: "template",
      templateId: String(formData.get("template_id")),
      content: String(formData.get("content") || ""),
      defaultDurationSeconds: Number(formData.get("default_duration_seconds") || 30),
      status: "ready"
    })
  }
  return (
    <AdminShell
      title="Graphics"
      description="Fullscreen slides, lower thirds and controlled HTML graphics for scheduled layers."
    >
      <section className="mb-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
        <form
          action={addSlide}
          className="surface-panel grid gap-3 p-4 lg:grid-cols-[1fr_150px_120px_120px]"
        >
          <div className="lg:col-span-4">
            <FormHeader
              title="Create graphic"
              detail="Prepare a reusable on-air plate for a block or scheduled overlay."
            />
          </div>
          <input
            name="title"
            required
            placeholder="Title"
            className="border border-line px-3 py-2 text-sm"
          />
          <select name="slide_type" className="border border-line px-3 py-2 text-sm">
            <option value="html">HTML</option>
            <option value="image">Image</option>
            <option value="markdown">Markdown</option>
            <option value="template">Template</option>
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
            {SLIDE_TEMPLATES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
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
          <button className="btn-primary lg:col-span-4">Create graphic</button>
        </form>
        <form action={addMarketSlide} className="surface-panel p-4">
          <FormHeader
            title="Market slide"
            detail="Create a dynamic HTML slide backed by the market data feed."
          />
          <div className="mt-4 grid gap-3">
            <input
              name="title"
              defaultValue="Market board"
              className="border border-line px-3 py-2 text-sm"
            />
            <input
              name="default_duration_seconds"
              type="number"
              min="1"
              defaultValue="30"
              className="border border-line px-3 py-2 text-sm"
            />
            <input
              name="content"
              defaultValue="Live market data"
              className="border border-line px-3 py-2 text-sm"
            />
            <button className="btn-primary">Create market slide</button>
          </div>
        </form>
      </section>
      <section className="surface-panel mb-5 p-4">
        <FormHeader
          title="System slides"
          detail="One-click dynamic slide presets for markets, prices, FX, financial boards, news and calendar."
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {SYSTEM_SLIDE_PRESETS.map((preset) => (
            <form key={preset.title} action={addSystemSlide}>
              <input type="hidden" name="title" value={preset.title} />
              <input type="hidden" name="template_id" value={preset.templateId} />
              <input type="hidden" name="content" value={preset.content} />
              <input type="hidden" name="default_duration_seconds" value="30" />
              <button className="btn-secondary w-full">{preset.title}</button>
            </form>
          ))}
        </div>
      </section>
      <div className="surface-panel overflow-hidden">
        {slides.map((slide) => (
          <div
            key={slide.id}
            className="grid gap-3 border-b border-line p-4 last:border-b-0 md:grid-cols-[1fr_120px_120px] md:items-center"
          >
            <div>
              <p className="font-semibold">{slide.title}</p>
              <p className="text-sm text-muted">
                {slide.slideType}
                {slide.templateId ? `/${slide.templateId}` : ""} ·{" "}
                {slide.defaultDurationSeconds ? `${slide.defaultDurationSeconds}s` : "No duration"}
              </p>
              {slide.content && (
                <p className="mt-1 line-clamp-1 text-sm text-muted">{slide.content}</p>
              )}
            </div>
            <span className="text-sm text-muted">
              {slide.imageUrl ? "Image" : slide.htmlContent ? "HTML" : "Text"}
            </span>
            <StatusPill status={slide.status} />
          </div>
        ))}
        {slides.length === 0 && (
          <div className="p-4">
            <EmptyState title="No graphics yet">
              Create a plate to use as base content or a scheduled overlay.
            </EmptyState>
          </div>
        )}
      </div>
    </AdminShell>
  )
}
