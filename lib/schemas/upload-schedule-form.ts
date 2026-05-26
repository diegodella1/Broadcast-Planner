import { z } from 'zod';

const formString = z.preprocess(
    (value) => (value === null || value === undefined ? '' : String(value)),
    z.string(),
);

const requiredFile = z.preprocess(
    (value) => (value instanceof File ? value : undefined),
    z
        .instanceof(File)
        .refine((file) => file.size > 0, { message: 'Select a media file' })
        .refine((file) => !file.type.startsWith('audio/'), {
            message: 'MP3 is saved in the library. It cannot be a primary schedule block yet.',
        }),
    { message: 'Select a media file' },
);

const requiredTrimmed = (message: string) =>
    formString.transform((value) => value.trim()).pipe(z.string().min(1, message));

const checkboxOn = z.preprocess(
    (value) => (value === null || value === undefined ? '' : String(value)),
    z.string().transform((value) => value === 'on'),
);

/**
 * Validation surface mirrors the prior route, which manually enforced:
 *   - `media_file` (or fallback `video_file`) must be a File with size > 0
 *   - file.type must NOT start with `audio/` (audio cannot anchor a schedule block)
 *   - `date` required after trim ("Date is required")
 *   - `start_time` required after trim ("Start time is required")
 *   - `hide_overlays` derived as `=== 'on'`
 *   - `return_to` was read with `String(form.get('return_to') || ...)`
 *
 * Everything else (title, asset_type, orientation, duration_*, detected_*,
 * metadata_json) is forwarded into `uploadedMediaFieldsFromForm` +
 * `resolveUploadedMedia` and validated there. The schema only encodes what
 * the route handler itself enforced.
 */
export const uploadScheduleFormSchema = z.object({
    media_file: requiredFile,
    date: requiredTrimmed('Date is required'),
    start_time: requiredTrimmed('Start time is required'),
    hide_overlays: checkboxOn,
    return_to: formString,
});
export type UploadScheduleFormInput = z.infer<typeof uploadScheduleFormSchema>;
