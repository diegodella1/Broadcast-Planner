import type { BlockType, ProgramBlock } from "./types"

export type RecordedBugPosition = "top_left" | "top_right" | "bottom_left" | "bottom_right"

export type RecordedBug = {
  label: "PREVIOUSLY RECORDED"
  position: RecordedBugPosition
}

const RECORDED_BUG_POSITIONS: readonly RecordedBugPosition[] = [
  "top_left",
  "top_right",
  "bottom_left",
  "bottom_right"
]

export function isRecordedBugPosition(value: unknown): value is RecordedBugPosition {
  return typeof value === "string" && RECORDED_BUG_POSITIONS.includes(value as RecordedBugPosition)
}

export function isRecordedBugEligibleBlock(block: Pick<ProgramBlock, "blockType" | "metadata">) {
  return block.blockType === "video" && !metadataText(block.metadata, "reuters_stream_url")
}

export function recordedBugFromBlock(block: Pick<ProgramBlock, "blockType" | "metadata">) {
  if (!isRecordedBugEligibleBlock(block)) return null
  if (block.metadata?.previously_recorded_enabled !== true) return null
  const position = block.metadata.previously_recorded_position
  return {
    label: "PREVIOUSLY RECORDED",
    position: isRecordedBugPosition(position) ? position : "top_right"
  } satisfies RecordedBug
}

export function recordedBugMetadata(input: {
  metadata?: Record<string, unknown> | null | undefined
  blockType: BlockType
  enabled?: boolean | undefined
  position?: unknown
  hasReutersStream?: boolean | undefined
}) {
  const next = { ...(input.metadata ?? {}) }
  delete next.previously_recorded_enabled
  delete next.previously_recorded_position

  if (input.blockType !== "video" || input.hasReutersStream || !input.enabled) return next

  next.previously_recorded_enabled = true
  next.previously_recorded_position = isRecordedBugPosition(input.position)
    ? input.position
    : "top_right"
  return next
}

function metadataText(metadata: Record<string, unknown> | null | undefined, key: string) {
  const value = metadata?.[key]
  return typeof value === "string" ? value : ""
}
