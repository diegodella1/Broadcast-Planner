import { isoDateInTimezone, secondsSinceMidnightInTimezone } from "./time"

import type { ProgramBlock } from "./types"

export type ScheduleLiveState = {
  isToday: boolean
  nowSeconds: number | null
  activeBlock: ProgramBlock | null
  elapsedSeconds: number
  nextBlock: ProgramBlock | null
}

export function getScheduleLiveState({
  date,
  timezone,
  blocks,
  now = new Date()
}: {
  date: string
  timezone: string
  blocks: ProgramBlock[]
  now?: Date
}): ScheduleLiveState {
  const isToday = date === isoDateInTimezone(now, timezone)
  if (!isToday) {
    return {
      isToday: false,
      nowSeconds: null,
      activeBlock: null,
      elapsedSeconds: 0,
      nextBlock: null
    }
  }

  const nowSeconds = secondsSinceMidnightInTimezone(now, timezone)
  const eligibleBlocks = blocks
    .filter((block) => block.status === "ready" || block.status === "active")
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
  const activeBlock =
    eligibleBlocks
      .filter(
        (block) =>
          nowSeconds >= block.startTimeSeconds &&
          nowSeconds < block.startTimeSeconds + block.durationSeconds
      )
      .at(-1) ?? null
  const nextBlock = eligibleBlocks.find((block) => block.startTimeSeconds > nowSeconds) ?? null

  return {
    isToday: true,
    nowSeconds,
    activeBlock,
    elapsedSeconds: activeBlock
      ? Math.max(
          0,
          Math.min(nowSeconds - activeBlock.startTimeSeconds, activeBlock.durationSeconds)
        )
      : 0,
    nextBlock
  }
}
