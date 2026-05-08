import Link from "next/link"
import { Cloud, CloudRain, Sun } from "lucide-react"
import { getTranslations } from "next-intl/server"
import { AdminShell } from "@/components/admin-shell"
import { StatusPill } from "@/components/status-pill"
import { EmptyState, FormHeader } from "@/components/ui"
import { getSlides } from "@/lib/data"
import { createSlideAsset } from "@/lib/mutations"
import { createSlideAssetSchema, parseFormData } from "@/lib/schemas"
import type { SlideAsset } from "@/lib/types"

// ---------------------------------------------------------------------------
// Slide-type detection
// ---------------------------------------------------------------------------
// SlideAsset.slideType: "image" | "html" | "template" | "markdown"
// SlideAsset.templateId: string | null (no template enum yet)
// Primary: slideType === "template" + title heuristic (case-insensitive)
// Fallback for non-template kinds: generic
type SlideKind = "earthcam" | "market" | "weather" | "generic"

function detectKind(slide: SlideAsset): SlideKind {
  if (slide.slideType !== "template") return "generic"
  const lc = slide.title.toLowerCase()
  if (lc.includes("earthcam") || lc.includes("earth")) return "earthcam"
  if (lc.includes("market") || lc.includes("bloomberg") || lc.includes("mercado")) return "market"
  if (lc.includes("weather") || lc.includes("clima")) return "weather"
  return "generic"
}

// ---------------------------------------------------------------------------
// Type pill — inline, token-colored
// ---------------------------------------------------------------------------
const KIND_PILL_CLASSES: Record<SlideKind, string> = {
  earthcam: "bg-accent-positive/10 text-accent-positive",
  market: "bg-info-blue/10 text-info-blue",
  weather: "bg-warn-amber/10 text-warn-amber",
  generic: "bg-white/5 text-white/40"
}

const KIND_LABELS: Record<SlideKind, string> = {
  earthcam: "Earthcam",
  market: "Market",
  weather: "Weather",
  generic: "Generic"
}

function TypePill({ kind }: { kind: SlideKind }) {
  return (
    <span
      className={`inline-flex w-fit items-center rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${KIND_PILL_CLASSES[kind]}`}
    >
      {KIND_LABELS[kind]}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Preview renderers
// ---------------------------------------------------------------------------
// i18n keys slides.preview.{earthcam,market,weather} are NOT in en.json yet.
// Using string literals + [i18n-missing] flag until P6.x adds them.

function EarthcamPreview() {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4 text-accent-positive">
      {/* Globe SVG with animated concentric dots */}
      <svg
        viewBox="0 0 80 80"
        width="80"
        height="80"
        aria-hidden="true"
        className="overflow-visible"
      >
        {/* Globe circle */}
        <circle cx="40" cy="40" r="28" fill="none" stroke="currentColor" strokeWidth="1.5" />
        {/* Latitude lines */}
        <ellipse
          cx="40"
          cy="40"
          rx="28"
          ry="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.75"
          opacity="0.4"
        />
        <ellipse
          cx="40"
          cy="30"
          rx="22"
          ry="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.75"
          opacity="0.3"
        />
        <ellipse
          cx="40"
          cy="50"
          rx="22"
          ry="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="0.75"
          opacity="0.3"
        />
        {/* Vertical meridian */}
        <line
          x1="40"
          y1="12"
          x2="40"
          y2="68"
          stroke="currentColor"
          strokeWidth="0.75"
          opacity="0.4"
        />
        {/* Animated pulse dots */}
        <circle
          cx="40"
          cy="40"
          r="4"
          fill="currentColor"
          className="anim-pd"
          style={{ animationDelay: "0s" }}
        />
        <circle
          cx="40"
          cy="40"
          r="8"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="anim-pd"
          style={{ animationDelay: "0.4s", opacity: 0.6 }}
        />
        <circle
          cx="40"
          cy="40"
          r="13"
          fill="none"
          stroke="currentColor"
          strokeWidth="1"
          className="anim-pd"
          style={{ animationDelay: "0.8s", opacity: 0.3 }}
        />
      </svg>
      <p className="text-sm font-semibold tracking-wide">
        EarthCam {/* [i18n-missing: slides.preview.earthcam] */}
      </p>
      <p className="text-xs text-white/40">Live global camera feed</p>
    </div>
  )
}

function MarketPreview() {
  // Animated bar chart placeholder — bars grow via .anim-bar-grow
  const bars = [45, 65, 38, 80, 55, 70, 60, 85, 48, 72]
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-4">
      <svg
        viewBox="0 0 160 80"
        width="160"
        height="80"
        aria-hidden="true"
        className="overflow-visible"
      >
        {bars.map((h, i) => (
          <rect
            key={i}
            x={i * 16 + 4}
            y={80 - h}
            width="10"
            height={h}
            rx="1"
            fill="#60a5fa"
            opacity="0.75"
            className="anim-bar-grow"
            style={{ animationDelay: `${i * 0.08}s`, transformOrigin: `${i * 16 + 9}px 80px` }}
          />
        ))}
        {/* Baseline */}
        <line x1="0" y1="80" x2="160" y2="80" stroke="rgba(255,255,255,0.1)" strokeWidth="1" />
      </svg>
      <p className="text-sm font-semibold text-info-blue tracking-wide">
        Market Data {/* [i18n-missing: slides.preview.market] */}
      </p>
      <p className="text-xs text-white/40">Bloomberg / financial feed</p>
    </div>
  )
}

function WeatherPreview() {
  const cities = [
    { city: "New York", temp: "18°C", Icon: Sun },
    { city: "London", temp: "12°C", Icon: Cloud },
    { city: "Tokyo", temp: "22°C", Icon: CloudRain }
  ] as const
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6">
      <p className="text-sm font-semibold text-warn-amber tracking-wide">
        Weather {/* [i18n-missing: slides.preview.weather] */}
      </p>
      <div className="flex w-full gap-2">
        {cities.map(({ city, temp, Icon }) => (
          <div
            key={city}
            className="flex flex-1 flex-col items-center gap-1 rounded-sm border border-white/10 bg-surface-elevated-1 py-3"
          >
            <Icon size={20} className="text-warn-amber" aria-hidden="true" />
            <span className="text-sm font-semibold text-white/90">{temp}</span>
            <span className="text-[10px] text-white/50">{city}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function GenericPreview({ slide }: { slide: SlideAsset }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-6 text-center">
      <p className="text-sm font-semibold text-white/90 line-clamp-2">{slide.title}</p>
      <p className="text-xs text-white/40 capitalize">{slide.slideType}</p>
      {slide.content && <p className="mt-1 text-xs text-white/50 line-clamp-3">{slide.content}</p>}
    </div>
  )
}

function SlidePreview({ slide }: { slide: SlideAsset }) {
  const kind = detectKind(slide)
  return (
    <>
      {kind === "earthcam" && <EarthcamPreview />}
      {kind === "market" && <MarketPreview />}
      {kind === "weather" && <WeatherPreview />}
      {kind === "generic" && <GenericPreview slide={slide} />}
    </>
  )
}

// ---------------------------------------------------------------------------
// Thumbnail chip — small 16:9 colored block
// ---------------------------------------------------------------------------
const KIND_THUMB_BG: Record<SlideKind, string> = {
  earthcam: "bg-accent-positive/20",
  market: "bg-info-blue/20",
  weather: "bg-warn-amber/20",
  generic: "bg-white/5"
}

function SlideThumbnail({ kind }: { kind: SlideKind }) {
  return (
    <div
      className={`aspect-video w-12 shrink-0 rounded-sm ${KIND_THUMB_BG[kind]}`}
      aria-hidden="true"
    />
  )
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default async function SlidesPage({
  searchParams
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const [t, slides, resolvedParams] = await Promise.all([
    getTranslations("slides"),
    getSlides(),
    searchParams
  ])

  const rawSlideParam = resolvedParams["slide"]
  const slideParam = typeof rawSlideParam === "string" ? rawSlideParam : undefined
  const selectedSlide = slides.find((s) => s.id === slideParam) ?? slides[0] ?? null

  async function addSlide(formData: FormData) {
    "use server"
    const data = parseFormData(createSlideAssetSchema, {
      title: formData.get("title"),
      slideType: formData.get("slide_type"),
      content: formData.get("content") ?? "",
      imageUrl: formData.get("image_url") ?? "",
      htmlContent: formData.get("html_content") ?? "",
      defaultDurationSeconds: formData.get("default_duration_seconds") ?? "",
      status: formData.get("status") ?? "ready"
    })
    await createSlideAsset({
      title: data.title,
      slideType: data.slideType,
      status: data.status,
      ...(data.content !== undefined ? { content: data.content } : {}),
      ...(data.imageUrl !== undefined ? { imageUrl: data.imageUrl } : {}),
      ...(data.htmlContent !== undefined ? { htmlContent: data.htmlContent } : {}),
      ...(data.defaultDurationSeconds !== undefined
        ? { defaultDurationSeconds: data.defaultDurationSeconds }
        : {})
    })
  }

  return (
    <AdminShell title={t("title")} description={t("description")}>
      {/* Create form */}
      <form
        action={addSlide}
        className="surface-panel mb-5 grid gap-3 p-4 lg:grid-cols-[1fr_150px_120px_120px]"
      >
        <div className="lg:col-span-4">
          <FormHeader title={t("create.title")} detail={t("create.detail")} />
        </div>
        <input
          name="title"
          required
          placeholder={t("create.titleField")}
          className="border border-line px-3 py-2 text-sm"
        />
        <select name="slide_type" className="border border-line px-3 py-2 text-sm">
          <option value="html">{t("type.html")}</option>
          <option value="image">{t("type.image")}</option>
          <option value="markdown">{t("type.markdown")}</option>
          <option value="template">{t("type.template")}</option>
        </select>
        <input
          name="default_duration_seconds"
          type="number"
          min="1"
          placeholder="Seg"
          className="border border-line px-3 py-2 text-sm"
        />
        <select name="status" className="border border-line px-3 py-2 text-sm">
          <option value="ready">{t("status.ready")}</option>
          <option value="draft">{t("status.draft")}</option>
        </select>
        <input
          name="image_url"
          placeholder={t("create.imageUrl")}
          className="border border-line px-3 py-2 text-sm lg:col-span-2"
        />
        <textarea
          name="content"
          placeholder={t("create.visibleText")}
          className="min-h-24 border border-line px-3 py-2 text-sm lg:col-span-2"
        />
        <textarea
          name="html_content"
          placeholder={t("create.optionalHtml")}
          className="min-h-24 border border-line px-3 py-2 text-sm lg:col-span-4"
        />
        <button className="btn-primary lg:col-span-4">{t("create.submit")}</button>
      </form>

      {/* Split layout: list + preview */}
      {slides.length === 0 ? (
        <div className="surface-panel p-4">
          <EmptyState title={t("empty.title")}>{t("empty.body")}</EmptyState>
        </div>
      ) : (
        <div className="flex gap-6 items-start">
          {/* ── Slide list (260px) ─────────────────────────────────────── */}
          <nav aria-label={t("title")} className="w-[260px] shrink-0 overflow-y-auto surface-panel">
            {slides.map((slide) => {
              const kind = detectKind(slide)
              const isActive = slide.id === selectedSlide?.id
              return (
                <Link
                  key={slide.id}
                  href={`/admin/slides?slide=${slide.id}`}
                  className={[
                    "flex items-center gap-3 px-3 py-2.5 border-l-2 transition-colors",
                    isActive
                      ? "bg-surface-selected-positive border-accent-positive"
                      : "border-transparent hover:bg-surface-elevated-2"
                  ].join(" ")}
                  aria-current={isActive ? "page" : undefined}
                >
                  <SlideThumbnail kind={kind} />
                  <div className="min-w-0 flex-1">
                    <p
                      className={[
                        "truncate text-sm font-semibold",
                        isActive ? "text-accent-positive" : "text-white/80"
                      ].join(" ")}
                    >
                      {slide.title}
                    </p>
                    <div className="mt-0.5 flex items-center gap-1.5">
                      <TypePill kind={kind} />
                      {isActive && (
                        <span
                          className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent-positive"
                          aria-hidden="true"
                        />
                      )}
                    </div>
                  </div>
                </Link>
              )
            })}
          </nav>

          {/* ── Preview pane (flex-1) ───────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            {selectedSlide ? (
              <>
                {/* Controls row */}
                <div className="mb-3 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <TypePill kind={detectKind(selectedSlide)} />
                    <span className="text-sm font-semibold text-white/90">
                      {selectedSlide.title}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusPill status={selectedSlide.status} />
                    <button type="button" className="btn-secondary text-xs px-3 min-h-8">
                      Edit
                    </button>
                    <button type="button" className="btn-primary text-xs px-3 min-h-8">
                      {t("add")}
                    </button>
                  </div>
                </div>

                {/* 16:9 preview frame */}
                <div className="aspect-video bg-surface-elevated-2 border border-white/10 rounded-sm overflow-hidden">
                  <SlidePreview slide={selectedSlide} />
                </div>

                {/* Caption */}
                <p className="mt-2 text-xs text-white/60">
                  {selectedSlide.title}
                  {" · "}
                  {selectedSlide.slideType}
                  {selectedSlide.defaultDurationSeconds
                    ? ` · ${selectedSlide.defaultDurationSeconds}s`
                    : ` · ${t("noDuration")}`}
                </p>
              </>
            ) : (
              <div className="surface-panel p-8 text-center">
                <EmptyState title={t("empty.title")}>{t("empty.body")}</EmptyState>
              </div>
            )}
          </div>
        </div>
      )}
    </AdminShell>
  )
}
