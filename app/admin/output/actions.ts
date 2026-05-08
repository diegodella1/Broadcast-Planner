"use server"

import { goLiveWithVimeo, scheduleVimeoBlock } from "@/lib/manual-broadcast"
import { goLiveNowSchema, scheduleVimeoBlockSchema } from "@/lib/schemas"

export type ManualBroadcastResult =
  | { success: true; programBlockId: string }
  | { success: false; error: string }

export async function goLiveAction(input: {
  vimeoUri: string
  preempt?: boolean
}): Promise<ManualBroadcastResult> {
  try {
    const parsed = goLiveNowSchema.safeParse(input)
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input"
      }
    }
    const { programBlockId } = await goLiveWithVimeo(parsed.data)
    return { success: true, programBlockId }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return { success: false, error: message }
  }
}

export async function scheduleAction(input: {
  vimeoUri: string
  startAt: string
  airDate?: string
}): Promise<ManualBroadcastResult> {
  try {
    const parsed = scheduleVimeoBlockSchema.safeParse(input)
    if (!parsed.success) {
      return {
        success: false,
        error: parsed.error.issues[0]?.message ?? "Invalid input"
      }
    }
    const { programBlockId } = await scheduleVimeoBlock(parsed.data)
    return { success: true, programBlockId }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error"
    return { success: false, error: message }
  }
}
