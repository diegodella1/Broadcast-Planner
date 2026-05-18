import { revalidatePath } from "next/cache"

import { auditedMutation } from "./audit"
import { getCurrentOperatorSession } from "./auth"
import { parseReutersStreamInput, maskStreamUrl } from "./reuters-stream"
import { createServiceClient } from "./supabase/server"

import type { OutputOverride } from "./types"

type Row = Record<string, unknown>

export async function getActiveOutputOverride(programDayId?: string | null) {
  if (!programDayId) return null
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("output_overrides")
    .select("*")
    .eq("program_day_id", programDayId)
    .eq("enabled", true)
    .maybeSingle()
  if (error) throw error
  return data ? mapOutputOverride(data as Row) : null
}

export async function setReutersOutputOverride(input: {
  programDayId: string
  streamUrl: string
  label?: string
  expiresAt?: string
}) {
  const stream = parseReutersStreamInput({
    url: input.streamUrl,
    ...(input.label ? { label: input.label } : {}),
    ...(input.expiresAt ? { expiresAt: input.expiresAt } : {})
  })
  if (!stream) throw new Error("Reuters stream URL is required")
  const supabase = createServiceClient()
  const operator = await getCurrentOperatorSession()
  await auditedMutation(
    {
      action: "output_override.reuters_set",
      entityType: "output_overrides",
      entityId: input.programDayId,
      metadata: {
        source_type: "reuters",
        protocol: stream.protocol,
        stream_url: maskStreamUrl(stream.url),
        expires_at: stream.expiresAt ?? null
      }
    },
    async () => {
      await clearOutputOverride(input.programDayId, false)
      const { error } = await supabase.from("output_overrides").insert({
        program_day_id: input.programDayId,
        enabled: true,
        source_type: "reuters",
        stream_url: stream.url,
        stream_protocol: stream.protocol,
        label: stream.label,
        expires_at: stream.expiresAt ?? null,
        metadata: {
          stream_url_masked: maskStreamUrl(stream.url),
          refreshed_at: new Date().toISOString()
        },
        created_by: operator?.operatorId === "bootstrap" ? null : operator?.operatorId
      })
      if (error) throw error
    }
  )
  revalidatePath("/admin/output")
}

export async function clearOutputOverride(programDayId: string, audit = true) {
  const supabase = createServiceClient()
  const operation = async () => {
    const { error } = await supabase
      .from("output_overrides")
      .update({ enabled: false, updated_at: new Date().toISOString() })
      .eq("program_day_id", programDayId)
      .eq("enabled", true)
    if (error) throw error
  }
  if (audit) {
    await auditedMutation(
      {
        action: "output_override.cleared",
        entityType: "output_overrides",
        entityId: programDayId
      },
      operation
    )
  } else {
    await operation()
  }
  revalidatePath("/admin/output")
}

export function mapOutputOverride(row: Row): OutputOverride {
  return {
    id: String(row.id ?? ""),
    programDayId: String(row.program_day_id ?? ""),
    enabled: row.enabled !== false,
    sourceType: String(row.source_type ?? "scheduled_block") as OutputOverride["sourceType"],
    blockId: nullable(row.block_id),
    assetId: nullable(row.asset_id),
    slideId: nullable(row.slide_id),
    streamUrl: nullable(row.stream_url),
    streamProtocol: streamProtocol(row.stream_protocol),
    label: nullable(row.label),
    expiresAt: nullable(row.expires_at),
    metadata:
      typeof row.metadata === "object" && row.metadata !== null
        ? (row.metadata as Record<string, unknown>)
        : {},
    createdBy: nullable(row.created_by),
    createdAt: String(row.created_at ?? ""),
    updatedAt: String(row.updated_at ?? "")
  }
}

function streamProtocol(value: unknown) {
  return value === "hls" || value === "rtmp" ? value : null
}

function nullable(value: unknown) {
  return value === null || value === undefined ? null : String(value)
}
