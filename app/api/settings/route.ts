import { NextResponse } from "next/server"

import { appUrl } from "@/lib/app-url"
import { saveVimeoSettings } from "@/lib/settings"

export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const token = String(form.get("vimeo_token") ?? "") || undefined
    const folderUri = String(form.get("vimeo_folder_uri") ?? "") || undefined
    const timezone = String(form.get("timezone") ?? "") || undefined
    await saveVimeoSettings({
      ...(token !== undefined ? { token } : {}),
      ...(folderUri !== undefined ? { folderUri } : {}),
      ...(timezone !== undefined ? { timezone } : {})
    })
    return NextResponse.redirect(appUrl("/admin/settings?saved=1"), 303)
  } catch (error) {
    return NextResponse.json({ ok: false, error: String(error) }, { status: 500 })
  }
}
