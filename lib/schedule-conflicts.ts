import { formatTimecode } from "./time"

import type { ProgramBlock } from "./types"

export type ScheduleConflict = {
  blockId: string
  title: string
  startTimeSeconds: number
  endTimeSeconds: number
}

export type ScheduleConflictResult = {
  hasConflict: boolean
  conflicts: ScheduleConflict[]
  suggestedStartSeconds: number | null
}

const DAY_SECONDS = 86400

export function findScheduleConflicts(
  blocks: ProgramBlock[],
  candidate: {
    id?: string
    programDayId: string
    startTimeSeconds: number
    durationSeconds: number
  }
): ScheduleConflictResult {
  const candidateEnd = candidate.startTimeSeconds + candidate.durationSeconds
  const conflicts = blocks
    .filter((block) => block.programDayId === candidate.programDayId && block.id !== candidate.id)
    .filter((block) => {
      const blockEnd = block.startTimeSeconds + block.durationSeconds
      return candidate.startTimeSeconds < blockEnd && candidateEnd > block.startTimeSeconds
    })
    .map((block) => ({
      blockId: block.id,
      title: block.title,
      startTimeSeconds: block.startTimeSeconds,
      endTimeSeconds: block.startTimeSeconds + block.durationSeconds
    }))

  return {
    hasConflict: conflicts.length > 0,
    conflicts,
    suggestedStartSeconds: conflicts.length
      ? findNearestSafeStart(
          blocks,
          candidate.programDayId,
          candidate.durationSeconds,
          candidateEnd
        )
      : null
  }
}

export function findNearestSafeStart(
  blocks: ProgramBlock[],
  programDayId: string,
  durationSeconds: number,
  preferredStartSeconds = 0
) {
  const sorted = blocks
    .filter((block) => block.programDayId === programDayId)
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
  const candidates = [
    preferredStartSeconds,
    0,
    ...sorted.map((block) => block.startTimeSeconds + block.durationSeconds)
  ]
  for (const start of candidates) {
    if (start < 0 || start + durationSeconds > DAY_SECONDS) continue
    const hasConflict = sorted.some((block) => {
      const blockEnd = block.startTimeSeconds + block.durationSeconds
      return start < blockEnd && start + durationSeconds > block.startTimeSeconds
    })
    if (!hasConflict) return start
  }
  return null
}

export function scheduleConflictMessage(result: ScheduleConflictResult) {
  if (!result.hasConflict) return ""
  const names = result.conflicts.map((conflict) => conflict.title).join(", ")
  const suggestion =
    result.suggestedStartSeconds === null
      ? "No safe same-day slot found."
      : `Try ${formatTimecode(result.suggestedStartSeconds)}.`
  return `Conflicts with ${names}. ${suggestion}`
}
