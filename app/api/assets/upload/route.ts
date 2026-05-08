import { NextResponse } from "next/server"
import { appUrl } from "@/lib/app-url"
import { requireAdmin } from "@/lib/auth"
import { createMediaAsset } from "@/lib/mutations"
import { createServiceClient } from "@/lib/supabase/server"

const SMALL_MEDIA_BUCKET = "small-media-assets"
const MAX_SMALL_MEDIA_BYTES = 500 * 1024 * 1024
const SMALL_MEDIA_MIME_TYPES = [
  "video/mp4",
  "video/webm",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "audio/mpeg",
  "audio/mp3"
]

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const form = await request.formData()
    const file = form.get("media_file") ?? form.get("video_file")
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Select a media file")
    }
    if (file.size > MAX_SMALL_MEDIA_BYTES) {
      throw new Error("The file cannot exceed 500 MB")
    }
    if (!SMALL_MEDIA_MIME_TYPES.includes(file.type)) {
      throw new Error("Unsupported format. Use MP4, WebM, PNG, JPG, WebP, GIF or MP3")
    }

    const title = String(form.get("title") ?? "").trim()
    const returnTo = String(form.get("return_to") || "/admin/assets?uploaded=1")
    const rawAssetType = String(form.get("asset_type") || "video")
    const durationSeconds = Number(form.get("duration_seconds") || 0) || undefined
    const orientation = String(form.get("orientation") || "auto")
    const mediaKind = file.type.startsWith("image/") ? "image" : file.type.startsWith("audio/") ? "audio" : "video"
    const assetType = mediaKind === "audio" && !["ad", "promo", "fallback", "music"].includes(rawAssetType) ? "music" : rawAssetType
    const sourceType = mediaKind === "image" ? "supabase_image" : mediaKind === "audio" ? "supabase_audio" : "remote_mp4"
    if (!title) throw new Error("Title is required")
    if (assetType === "ad" && durationSeconds && durationSeconds > 300) {
      throw new Error("Ads cannot be longer than 300 seconds")
    }

    const supabase = createServiceClient()
    await ensureSmallMediaBucket(supabase)

    const extension = extensionFor(file)
    const storagePath = `${new Date().toISOString().slice(0, 10)}/${crypto.randomUUID()}${extension}`
    const bytes = await file.arrayBuffer()
    const { error: uploadError } = await supabase.storage
      .from(SMALL_MEDIA_BUCKET)
      .upload(storagePath, bytes, { contentType: file.type, upsert: false })
    if (uploadError) throw uploadError

    const { data: publicUrl } = supabase.storage.from(SMALL_MEDIA_BUCKET).getPublicUrl(storagePath)
    await createMediaAsset({
      title,
      sourceType,
      mediaKind,
      assetType,
      url: publicUrl.publicUrl,
      storageBucket: SMALL_MEDIA_BUCKET,
      storagePath,
      durationSeconds,
      metadata: {
        presentation: mediaKind === "video" && orientation === "vertical" ? "vertical_blur" : "fit",
        orientation,
        background: mediaKind === "video" && orientation === "vertical" ? "blur" : "black",
        role: assetType === "music" ? "background_music" : "scheduled_media",
        original_file_name: file.name,
        mime_type: file.type,
        size: file.size
      }
    })

    return NextResponse.redirect(appUrl(returnTo), 303)
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 })
  }
}

async function ensureSmallMediaBucket(supabase: ReturnType<typeof createServiceClient>) {
  const { data: buckets } = await supabase.storage.listBuckets()
  if (buckets?.some((bucket) => bucket.id === SMALL_MEDIA_BUCKET)) return
  const { error } = await supabase.storage.createBucket(SMALL_MEDIA_BUCKET, {
    public: true,
    fileSizeLimit: MAX_SMALL_MEDIA_BYTES,
    allowedMimeTypes: SMALL_MEDIA_MIME_TYPES
  })
  if (error) throw error
}

function extensionFor(file: File) {
  const nameExtension = file.name.match(/\.[a-z0-9]+$/i)?.[0]
  if (nameExtension) return nameExtension.toLowerCase()
  if (file.type === "video/webm") return ".webm"
  if (file.type === "image/png") return ".png"
  if (file.type === "image/webp") return ".webp"
  if (file.type === "image/gif") return ".gif"
  if (file.type === "image/jpeg") return ".jpg"
  if (file.type === "audio/mpeg" || file.type === "audio/mp3") return ".mp3"
  return ".mp4"
}
