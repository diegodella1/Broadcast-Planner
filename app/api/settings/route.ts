import { NextResponse } from "next/server"
import { appUrl } from "@/lib/app-url"
import { saveVimeoSettings } from "@/lib/settings"

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    await saveVimeoSettings({
      token: String(form.get("vimeo_token") ?? "") || undefined,
      folderUri: String(form.get("vimeo_folder_uri") ?? "") || undefined,
      timezone: String(form.get("timezone") ?? "") || undefined
    })
    return NextResponse.redirect(appUrl("/admin/settings?saved=1"), 303)
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
