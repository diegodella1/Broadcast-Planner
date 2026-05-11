import { CsrfInput } from "@/components/csrf-input"
import { MediaFilePicker } from "@/components/media-file-picker"
import { SubmitButton } from "@/components/submit-button"
import { Field, FormHeader } from "@/components/ui"

export async function MediaUploadForm({
  action,
  title = "Upload media",
  detail = "Store videos, images or MP3 files with browser-checked metadata.",
  submitLabel = "Upload",
  returnTo,
  includeAudio = true,
  scheduleDate
}: {
  action: string
  title?: string
  detail?: string
  submitLabel?: string
  returnTo?: string
  includeAudio?: boolean
  scheduleDate?: string
}) {
  return (
    <form action={action} method="post" encType="multipart/form-data" className="surface-panel p-4">
      <CsrfInput />
      <FormHeader title={title} detail={detail} />
      {returnTo ? <input type="hidden" name="return_to" value={returnTo} /> : null}
      {scheduleDate ? <input type="hidden" name="date" value={scheduleDate} /> : null}
      <div className="mt-4 grid gap-3 lg:grid-cols-[1fr_170px_140px_120px]">
        <Field label="Title">
          <input
            name="title"
            required
            placeholder="Media title"
            className="border border-line px-3 py-2 text-sm font-normal text-ink"
          />
        </Field>
        <Field label="Use as">
          <select
            name="asset_type"
            className="border border-line px-3 py-2 text-sm font-normal text-ink"
          >
            <option value="video">Video</option>
            <option value="ad">Ad</option>
            <option value="promo">Promo</option>
            <option value="fallback">Fallback</option>
            <option value="image">Image</option>
            {includeAudio ? <option value="music">Music</option> : null}
          </select>
        </Field>
        <Field label="Format">
          <select
            name="orientation"
            className="border border-line px-3 py-2 text-sm font-normal text-ink"
          >
            <option value="auto">Auto</option>
            <option value="horizontal">Horizontal</option>
            <option value="vertical">Vertical blur</option>
          </select>
        </Field>
        {scheduleDate ? (
          <Field label="Start time">
            <input
              name="start_time"
              required
              defaultValue="00:00:00"
              className="border border-line px-3 py-2 text-sm font-normal text-ink"
            />
          </Field>
        ) : null}
        <MediaFilePicker includeAudio={includeAudio} />
        <SubmitButton pendingLabel="Uploading...">{submitLabel}</SubmitButton>
      </div>
    </form>
  )
}
