import { z } from "zod"

const vimeoUriRegex = /^\/videos\/\d+$/
const timeRegex = /^\d{2}:\d{2}(:\d{2})?$/
const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/

export const vimeoSearchSchema = z.object({
  query: z.string().min(1).max(200)
})
export type VimeoSearchInput = z.infer<typeof vimeoSearchSchema>

export const goLiveNowSchema = z.object({
  vimeoUri: z.string().regex(vimeoUriRegex, "vimeoUri must be /videos/<id>"),
  preempt: z.coerce.boolean().optional()
})
export type GoLiveNowInput = z.infer<typeof goLiveNowSchema>

export const scheduleVimeoBlockSchema = z.object({
  vimeoUri: z.string().regex(vimeoUriRegex, "vimeoUri must be /videos/<id>"),
  startAt: z.string().regex(timeRegex, "startAt must be HH:MM or HH:MM:SS"),
  airDate: z.string().regex(isoDateRegex, "airDate must be YYYY-MM-DD").optional()
})
export type ScheduleVimeoBlockInput = z.infer<typeof scheduleVimeoBlockSchema>
