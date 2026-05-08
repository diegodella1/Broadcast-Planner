import { z } from "zod"
import { BLOCK_CATEGORIES } from "@/lib/types"

const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/
const blockTypeEnum = z.enum(["video", "image", "slide", "ad", "promo", "fallback"])
const blockCategoryEnum = z.enum(BLOCK_CATEGORIES as readonly [string, ...string[]])
const programStatusEnum = z.enum(["draft", "ready", "active", "archived"])

const optionalIdString = z
  .string()
  .transform((value) => (value === "" ? undefined : value))
  .optional()

export const createBlockSchema = z.object({
  title: z.string().min(1, "title is required").max(200),
  startTime: z.string().regex(timeRegex, "start_time must be HH:MM or HH:MM:SS"),
  durationSeconds: z.coerce.number().int().positive().max(86400),
  blockType: blockTypeEnum,
  category: blockCategoryEnum.default("mercados"),
  assetId: optionalIdString,
  slideId: optionalIdString,
  hideOverlays: z.boolean().default(false)
})
export type CreateBlockInput = z.infer<typeof createBlockSchema>

export const updateBlockSchema = z.object({
  title: z.string().min(1, "title is required").max(200),
  startTime: z.string().regex(timeRegex, "start_time must be HH:MM or HH:MM:SS"),
  durationSeconds: z.coerce.number().int().positive().max(86400),
  blockType: blockTypeEnum,
  category: blockCategoryEnum.optional(),
  status: programStatusEnum,
  assetId: optionalIdString,
  slideId: optionalIdString,
  fallbackAssetId: optionalIdString,
  notes: z
    .string()
    .max(2000)
    .transform((value) => (value === "" ? undefined : value))
    .optional(),
  hideOverlays: z.boolean().default(false)
})
export type UpdateBlockInput = z.infer<typeof updateBlockSchema>

export const generateLongScheduleSchema = z.object({
  startTime: z
    .string()
    .regex(timeRegex, "start_time must be HH:MM or HH:MM:SS")
    .default("00:00:00"),
  totalHours: z.coerce.number().positive().max(24).default(12),
  programMinutes: z.coerce.number().int().positive().default(48),
  adBreakMinutes: z.coerce.number().int().min(0).max(5).default(4),
  imageBumperSeconds: z.coerce.number().int().min(0).default(30),
  replaceWindow: z.boolean().default(false)
})
export type GenerateLongScheduleInput = z.infer<typeof generateLongScheduleSchema>

export const stopBroadcastSchema = z.object({})
export type StopBroadcastInput = z.infer<typeof stopBroadcastSchema>
