import { z } from "zod"

const sourceTypeEnum = z.enum([
  "vimeo",
  "supabase_image",
  "remote_image",
  "remote_mp4",
  "hls",
  "rtmp",
  "supabase_audio",
  "reuters"
])
const mediaKindEnum = z.enum(["video", "image", "audio", "graphic"])
const assetTypeEnum = z.enum(["video", "image", "slide", "ad", "promo", "fallback", "overlay", "music"])
const assetStatusEnum = z.enum(["draft", "syncing", "ready", "failed", "archived"])
const orientationEnum = z.enum(["auto", "horizontal", "vertical"])

const optionalString = (max = 2000) =>
  z
    .string()
    .max(max)
    .transform((value) => (value === "" ? undefined : value))
    .optional()

const optionalDuration = z
  .union([
    z.coerce.number().int().positive().max(86400),
    z.literal("").transform(() => undefined),
    z.literal(0).transform(() => undefined)
  ])
  .optional()

export const createMediaAssetSchema = z.object({
  title: z.string().min(1, "title is required").max(200),
  sourceType: sourceTypeEnum,
  mediaKind: mediaKindEnum,
  assetType: assetTypeEnum,
  url: optionalString(2000),
  durationSeconds: optionalDuration
})
export type CreateMediaAssetInput = z.infer<typeof createMediaAssetSchema>

export const updateMediaAssetSchema = z.object({
  id: z.string().min(1, "id is required"),
  title: z.string().min(1, "title is required").max(200),
  description: optionalString(2000),
  sourceType: sourceTypeEnum,
  mediaKind: mediaKindEnum,
  assetType: assetTypeEnum,
  url: optionalString(2000),
  thumbnailUrl: optionalString(2000),
  durationSeconds: optionalDuration,
  status: assetStatusEnum,
  orientation: orientationEnum.default("auto")
})
export type UpdateMediaAssetInput = z.infer<typeof updateMediaAssetSchema>
