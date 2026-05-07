import { AdminShell } from "@/components/admin-shell"
import { StatusPill } from "@/components/status-pill"
import { EmptyState, FormHeader } from "@/components/ui"
import { getSlides } from "@/lib/data"
import { createSlideAsset } from "@/lib/mutations"

export default async function SlidesPage() {
  const slides = await getSlides()
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
    <AdminShell title="Slides" description="Placas, textos y HTML controlado para bases visuales u overlays.">
      <form action={addSlide} className="surface-panel mb-5 grid gap-3 p-4 lg:grid-cols-[1fr_150px_120px_120px]">
        <div className="lg:col-span-4">
          <FormHeader title="Crear slide" detail="Prepará una placa reutilizable para un bloque o una capa programada." />
        </div>
        <input name="title" required placeholder="Titulo" className="border border-line px-3 py-2 text-sm" />
        <select name="slide_type" className="border border-line px-3 py-2 text-sm">
          <option value="html">HTML</option>
          <option value="image">Imagen</option>
          <option value="markdown">Markdown</option>
          <option value="template">Template</option>
        </select>
        <input name="default_duration_seconds" type="number" min="1" placeholder="Seg" className="border border-line px-3 py-2 text-sm" />
        <select name="status" className="border border-line px-3 py-2 text-sm">
          <option value="ready">Ready</option>
          <option value="draft">Draft</option>
        </select>
        <input name="image_url" placeholder="URL imagen" className="border border-line px-3 py-2 text-sm lg:col-span-2" />
        <textarea name="content" placeholder="Texto visible" className="min-h-24 border border-line px-3 py-2 text-sm lg:col-span-2" />
        <textarea name="html_content" placeholder="HTML opcional" className="min-h-24 border border-line px-3 py-2 text-sm lg:col-span-4" />
        <button className="btn-primary lg:col-span-4">Crear slide</button>
      </form>
      <div className="surface-panel overflow-hidden">
        {slides.map((slide) => (
          <div key={slide.id} className="grid gap-3 border-b border-line p-4 last:border-b-0 md:grid-cols-[1fr_120px_120px] md:items-center">
            <div>
              <p className="font-semibold">{slide.title}</p>
              <p className="text-sm text-muted">
                {slide.slideType} · {slide.defaultDurationSeconds ? `${slide.defaultDurationSeconds}s` : "Sin duracion"}
              </p>
              {slide.content && <p className="mt-1 line-clamp-1 text-sm text-muted">{slide.content}</p>}
            </div>
            <span className="text-sm text-muted">{slide.imageUrl ? "Imagen" : slide.htmlContent ? "HTML" : "Texto"}</span>
            <StatusPill status={slide.status} />
          </div>
        ))}
        {slides.length === 0 && <div className="p-4"><EmptyState title="No hay slides creados">Creá una placa para usarla como contenido base o overlay programado.</EmptyState></div>}
      </div>
    </AdminShell>
  )
}
