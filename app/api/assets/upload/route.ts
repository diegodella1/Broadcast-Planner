import { NextResponse } from "next/server"
import { appUrl } from "@/lib/app-url"
import { createMediaAsset } from "@/lib/mutations"
import { createServiceClient } from "@/lib/supabase/server"

const VIDEO_BUCKET = "video-assets"
const VIDEO_MIME_TYPES = ["video/mp4", "video/webm", "application/vnd.apple.mpegurl", "application/x-mpegURL"]

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const file = form.get("video_file")
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Selecciona un archivo de video")
    }
    if (!VIDEO_MIME_TYPES.includes(file.type)) {
      throw new Error("Formato no soportado. Usa MP4, WebM o HLS")
    }

    const title = String(form.get("title") ?? "").trim()
    const assetType = String(form.get("asset_type") || "video")
    const durationSeconds = Number(form.get("duration_seconds") || 0) || undefined
    const orientation = String(form.get("orientation") || "auto")
    if (!title) throw new Error("El titulo es obligatorio")
    if (assetType === "ad" && durationSeconds && durationSeconds > 300) {
      throw new Error("Ads cannot be longer than 300 seconds")
    }

    const supabase = createServiceClient()
    await ensureVideoBucket(supabase)

    const extension = extensionFor(file)
    const storagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${extension}`
    const bytes = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from(VIDEO_BUCKET)
      .upload(storagePath, bytes, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError

    const { data: publicUrl } = supabase.storage.from(VIDEO_BUCKET).getPublicUrl(storagePath)
    await createMediaAsset({
      title,
      sourceType: "remote_mp4",
      mediaKind: "video",
      assetType,
      url: publicUrl.publicUrl,
      storageBucket: VIDEO_BUCKET,
      storagePath,
      durationSeconds,
      metadata: {
        presentation: orientation === "vertical" ? "vertical_blur" : "fit",
        orientation,
        background: orientation === "vertical" ? "blur" : "black",
        original_file_name: file.name,
        mime_type: file.type,
        size: file.size
      }
    })

    return NextResponse.redirect(appUrl("/admin/assets?uploaded=1"), 303)
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 })
  }
}

async function ensureVideoBucket(supabase: ReturnType<typeof createServiceClient>) {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (buckets?.some((bucket) => bucket.id === VIDEO_BUCKET)) return
  const { error } = await supabase.storage.createBucket(VIDEO_BUCKET, {
    public: true,
    fileSizeLimit: 524288000,
    allowedMimeTypes: VIDEO_MIME_TYPES
  })
  if (error) throw error
}

function extensionFor(file: File) {
  const nameExtension = file.name.match(/\.[a-z0-9]+$/i)?.[0]
  if (nameExtension) return nameExtension.toLowerCase()
  if (file.type === "video/webm") return ".webm"
  if (file.type.includes("mpegurl")) return ".m3u8"
  return ".mp4"
}
