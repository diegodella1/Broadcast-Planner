import { z } from "zod"

const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/
const layerTypeEnum = z.enum(["overlay", "image", "slide", "logo_bug", "lower_third", "promo"])
const positionEnum = z.enum([
  "fullscreen",
  "lower_third",
  "sidebar",
  "top_right",
  "bottom_bar",
  "custom"
])

const optionalIdString = z
  .string()
  .transform((value) => (value === "" ? undefined : value))
  .optional()

export const createLayerSchema = z.object({
  title: z.string().min(1, "title is required").max(200),
  layerType: layerTypeEnum,
  startTime: z.string().regex(timeRegex, "start_time must be HH:MM or HH:MM:SS"),
  durationSeconds: z.coerce.number().int().positive().max(86400),
  zIndex: z.coerce.number().int().default(10),
  position: positionEnum,
  assetId: optionalIdString,
  slideId: optionalIdString
})
export type CreateLayerInput = z.infer<typeof createLayerSchema>

export const toggleLayerSchema = z.object({
  layerId: z.string().min(1, "layer_id is required"),
  enabled: z.boolean()
})
export type ToggleLayerInput = z.infer<typeof toggleLayerSchema>

export const createLowerThirdSchema = z.object({
  title: z.string().max(200).optional(),
  primaryText: z.string().min(1, "primary_text is required").max(500),
  secondaryText: z
    .string()
    .max(500)
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  startTime: z.string().regex(timeRegex, "start_time must be HH:MM or HH:MM:SS"),
  durationSeconds: z.coerce.number().int().positive().max(86400)
})
export type CreateLowerThirdInput = z.infer<typeof createLowerThirdSchema>
