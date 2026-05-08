import { z } from "zod"

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

export const createDaySchema = z.object({
  date: z.string().regex(isoDateRegex, "date must be YYYY-MM-DD")
})
export type CreateDayInput = z.infer<typeof createDaySchema>

export const setDayStatusSchema = z.object({
  status: z.enum(["draft", "ready", "active", "archived"]),
  allowWarnings: z.boolean().default(false)
})
export type SetDayStatusInput = z.infer<typeof setDayStatusSchema>
