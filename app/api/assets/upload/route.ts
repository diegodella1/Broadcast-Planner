import { NextResponse } from "next/server"

import { appUrl } from "@/lib/app-url"
import { requireAdmin } from "@/lib/auth"
import { uploadedMediaFieldsFromForm, uploadMediaFile } from "@/lib/media-upload"

export async function POST(request: Request) {
  try {
    await requireAdmin()
    const form = await request.formData()
    const file = form.get("media_file") ?? form.get("video_file")
    if (!(file instanceof File) || file.size === 0) {
      throw new Error("Select a media file")
    }
    const returnTo = String(form.get("return_to") || "/admin/assets?uploaded=1")
    await uploadMediaFile(file, uploadedMediaFieldsFromForm(form))

    return NextResponse.redirect(appUrl(returnTo), 303)
  } catch (error) {
    if (error instanceof Error && error.message === "Unauthorized") {
      return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 })
    }
    return NextResponse.json({ ok: false, error: String(error) }, { status: 400 })
  }
}
