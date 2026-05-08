import { getTranslations } from "next-intl/server"
import { AdminShell } from "@/components/admin-shell"
import { StatusPill } from "@/components/status-pill"
import { EmptyState, FormHeader } from "@/components/ui"
import { getSlides } from "@/lib/data"
import { createSlideAsset } from "@/lib/mutations"

export default async function SlidesPage() {
  const [t, slides] = await Promise.all([
    getTranslations("slides"),
    getSlides()
  ])
  async function addSlide(formData: FormData) {
    "use server"
    const slideType = String(formData.get("slide_type"))
    await createSlideAsset({
      title: String(formData.get("title")),
      slideType,
      content: String(formData.get("content") || ""),
      imageUrl: String(formData.get("image_url") || ""),
      htmlContent: String(formData.get("html_content") || ""),
      defaultDurationSeconds: Number(formData.get("default_duration_seconds") || 0) || undefined,
      status: String(formData.get("status") || "ready")
    })
  }
  return (
    <AdminShell title={t("title")} description={t("description")}>
      <form action={addSlide} className="surface-panel mb-5 grid gap-3 p-4 lg:grid-cols-[1fr_150px_120px_120px]">
        <div className="lg:col-span-4">
          <FormHeader title={t("create.title")} detail={t("create.detail")} />
        </div>
        <input name="title" required placeholder={t("create.titleField")} className="border border-line px-3 py-2 text-sm" />
        <select name="slide_type" className="border border-line px-3 py-2 text-sm">
          <option value="html">{t("type.html")}</option>
          <option value="image">{t("type.image")}</option>
          <option value="markdown">{t("type.markdown")}</option>
          <option value="template">{t("type.template")}</option>
        </select>
        <input name="default_duration_seconds" type="number" min="1" placeholder="Seg" className="border border-line px-3 py-2 text-sm" />
        <select name="status" className="border border-line px-3 py-2 text-sm">
          <option value="ready">{t("status.ready")}</option>
          <option value="draft">{t("status.draft")}</option>
        </select>
        <input name="image_url" placeholder={t("create.imageUrl")} className="border border-line px-3 py-2 text-sm lg:col-span-2" />
        <textarea name="content" placeholder={t("create.visibleText")} className="min-h-24 border border-line px-3 py-2 text-sm lg:col-span-2" />
        <textarea name="html_content" placeholder={t("create.optionalHtml")} className="min-h-24 border border-line px-3 py-2 text-sm lg:col-span-4" />
        <button className="btn-primary lg:col-span-4">{t("create.submit")}</button>
      </form>
      <div className="surface-panel overflow-hidden">
        {slides.map((slide) => (
          <div key={slide.id} className="grid gap-3 border-b border-line p-4 last:border-b-0 md:grid-cols-[1fr_120px_120px] md:items-center">
            <div>
              <p className="font-semibold">{slide.title}</p>
              <p className="text-sm text-muted">
                {slide.slideType} · {slide.defaultDurationSeconds ? `${slide.defaultDurationSeconds}s` : t("noDuration")}
              </p>
              {slide.content && <p className="mt-1 line-clamp-1 text-sm text-muted">{slide.content}</p>}
            </div>
            <span className="text-sm text-muted">{slide.imageUrl ? t("kind.image") : slide.htmlContent ? t("kind.html") : t("kind.text")}</span>
            <StatusPill status={slide.status} />
          </div>
        ))}
        {slides.length === 0 && <div className="p-4"><EmptyState title={t("empty.title")}>{t("empty.body")}</EmptyState></div>}
      </div>
    </AdminShell>
  )
}
