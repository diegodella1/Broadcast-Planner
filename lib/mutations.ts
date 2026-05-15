import { revalidatePath } from "next/cache"

import { auditedMutation } from "./audit"
import { getScheduleForDate } from "./data"
import { buildTemplateBlocks, getDayTemplate } from "./day-templates"
import { buildLongTestSchedule } from "./schedule-builder"
import { findScheduleConflicts } from "./schedule-conflicts"
import { analyzeSchedule } from "./schedule-health"
import { createServiceClient } from "./supabase/server"
import { formatTimecode, parseTimecode, PLAYOUT_TIMEZONE } from "./time"

import type { BlockCategory, ProgramBlock, ProgramStatus, RunbookSection } from "./types"

type ConflictResolutionMode = "none" | "archive_conflicts"

export async function ensureProgramDay(date: string) {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("program_days")
    .upsert(
      {
        air_date: date,
        timezone: PLAYOUT_TIMEZONE,
        status: "draft",
        title: `Programming ${date}`
      },
      { onConflict: "air_date" }
    )
    .select("id")
    .single()
  if (error) throw error
  revalidatePath("/admin/calendar")
  revalidatePath(`/admin/schedule/${date}`)
  return data.id as string
}

export async function createProgramBlock(input: {
  date: string
  title: string
  blockType: string
  category?: BlockCategory
  assetId?: string
  slideId?: string
  startTime: string
  durationSeconds: number
  preRollSeconds?: number
  postRollSeconds?: number
  hideOverlays: boolean
  conflictResolution?: ConflictResolutionMode
}) {
  const dayId = await ensureProgramDay(input.date)
  const startTimeSeconds = parseTimecode(input.startTime)
  const schedule = await getScheduleForDate(input.date)
  const contentDuration = getKnownContentDuration(schedule, input.assetId, input.slideId)
  const preRollSeconds = Math.max(0, Number(input.preRollSeconds || 0) || 0)
  const postRollSeconds = Math.max(0, Number(input.postRollSeconds || 0) || 0)
  const minimumDuration = contentDuration ? contentDuration + preRollSeconds + postRollSeconds : 1
  const durationSeconds = Math.max(1, Number(input.durationSeconds || 0), minimumDuration)
  if (input.blockType === "ad" && durationSeconds > 300) {
    throw new Error("Ads cannot be longer than 300 seconds")
  }
  const supabase = createServiceClient()
  const candidate: ProgramBlock = {
    id: "candidate",
    programDayId: dayId,
    title: input.title,
    blockType: input.blockType as ProgramBlock["blockType"],
    category: input.category ?? "mercados",
    assetId: input.assetId || null,
    slideId: input.slideId || null,
    startTime: input.startTime,
    startTimeSeconds,
    durationSeconds,
    status: "ready",
    hideOverlays: input.hideOverlays,
    fallbackAssetId: null,
    createdAt: "",
    updatedAt: ""
  }
  const conflict = findScheduleConflicts(schedule.blocks, candidate)
  if (conflict.hasConflict && input.conflictResolution !== "archive_conflicts") {
    throw new Error("El bloque se solapa con otro bloque")
  }
  if (conflict.hasConflict) {
    await archiveConflictingBlocks({
      date: input.date,
      conflicts: conflict.conflicts,
      reason: "program_block.conflict_replaced"
    })
  }
  await auditedMutation(
    {
      action: "program_block.created",
      entityType: "program_blocks",
      metadata: { date: input.date },
      next: {
        title: input.title,
        start_time: input.startTime,
        duration_seconds: durationSeconds,
        status: "ready"
      }
    },
    async () => {
      const { error } = await supabase.from("program_blocks").insert({
        program_day_id: dayId,
        title: input.title,
        block_type: input.blockType,
        category: input.category ?? "mercados",
        asset_id: input.assetId || null,
        slide_id: input.slideId || null,
        start_time: input.startTime,
        start_time_seconds: startTimeSeconds,
        duration_seconds: durationSeconds,
        status: "ready",
        hide_overlays: input.hideOverlays
      })
      if (error) throw error
    }
  )
  revalidatePath(`/admin/schedule/${input.date}`)
}

export async function createProgramDayFromTemplate(input: {
  date: string
  templateId: string
  startTime: string
}) {
  const template = getDayTemplate(input.templateId)
  if (!template) throw new Error("Unknown day template")
  const dayId = await ensureProgramDay(input.date)
  const blocks = buildTemplateBlocks(template, input.startTime)
  const lastBlock = blocks[blocks.length - 1]
  if (!lastBlock) throw new Error("Template has no blocks")
  if (lastBlock.startTimeSeconds + lastBlock.durationSeconds > 86400) {
    throw new Error("Template exceeds the 24 hour day")
  }

  const schedule = await getScheduleForDate(input.date)
  const activeBlocks = schedule.blocks.filter((block) => block.status !== "archived")
  if (activeBlocks.length) {
    throw new Error("Day already has blocks. Open the schedule and edit it instead.")
  }

  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "program_day.template_created",
      entityType: "program_blocks",
      metadata: {
        date: input.date,
        template_id: template.id,
        start_time: input.startTime,
        blocks: blocks.length
      },
      next: { template: template.name, blocks: blocks.length }
    },
    async () => {
      const { error } = await supabase.from("program_blocks").insert(
        blocks.map((block) => ({
          program_day_id: dayId,
          title: block.title,
          block_type: block.blockType,
          category: block.category,
          asset_id: null,
          slide_id: null,
          start_time: block.startTime,
          start_time_seconds: block.startTimeSeconds,
          duration_seconds: block.durationSeconds,
          status: "draft",
          hide_overlays: false
        }))
      )
      if (error) throw error
    }
  )
  revalidateSchedule(input.date)
}

export async function fillProgramBlockContent(input: {
  date: string
  blockId: string
  assetId?: string
  slideId?: string
}) {
  const schedule = await getScheduleForDate(input.date)
  const block = schedule.blocks.find((item) => item.id === input.blockId)
  if (!block) throw new Error("Bloque no encontrado")
  const asset = input.assetId
    ? schedule.mediaAssets.find((item) => item.id === input.assetId)
    : null
  const slide = input.slideId
    ? schedule.slideAssets.find((item) => item.id === input.slideId)
    : null
  if (!asset && !slide) throw new Error("Choose content for this block")
  if (asset && slide) throw new Error("Choose either media or slide, not both")
  if (asset && asset.status !== "ready") throw new Error("Asset is not ready")
  if (slide && slide.status !== "ready") throw new Error("Slide is not ready")
  if (asset && !assetMatchesBlock(block.blockType, asset.assetType)) {
    throw new Error("Asset type does not match this block")
  }
  if (slide && block.blockType !== "slide") {
    throw new Error("Slides can only fill slide blocks")
  }

  const contentDuration = asset?.durationSeconds ?? slide?.defaultDurationSeconds ?? 0
  const durationSeconds = Math.max(block.durationSeconds, contentDuration || 1)
  const title = asset?.title ?? slide?.title ?? block.title
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "program_block.content_filled",
      entityType: "program_blocks",
      entityId: block.id,
      metadata: { date: input.date },
      previous: { title: block.title, status: block.status },
      next: { title, status: "ready", duration_seconds: durationSeconds }
    },
    async () => {
      const { error } = await supabase
        .from("program_blocks")
        .update({
          title,
          asset_id: asset?.id ?? null,
          slide_id: slide?.id ?? null,
          duration_seconds: durationSeconds,
          status: "ready",
          updated_at: new Date().toISOString()
        })
        .eq("id", block.id)
      if (error) throw error
    }
  )
  revalidateSchedule(input.date)
}

function getKnownContentDuration(
  schedule: Awaited<ReturnType<typeof getScheduleForDate>>,
  assetId?: string,
  slideId?: string
) {
  const assetDuration = assetId
    ? schedule.mediaAssets.find((asset) => asset.id === assetId)?.durationSeconds
    : null
  if (assetDuration) return assetDuration
  const slideDuration = slideId
    ? schedule.slideAssets.find((slide) => slide.id === slideId)?.defaultDurationSeconds
    : null
  return slideDuration ?? 0
}

function assetMatchesBlock(blockType: ProgramBlock["blockType"], assetType: string) {
  if (blockType === "video") return assetType === "video"
  if (blockType === "image") return assetType === "image"
  if (blockType === "ad") return assetType === "ad"
  if (blockType === "promo") return assetType === "promo"
  if (blockType === "fallback") return assetType === "fallback"
  return false
}

export async function updateProgramDayStatus(input: {
  date: string
  status: string
  allowWarnings?: boolean
}) {
  if (!["draft", "ready", "active", "archived"].includes(input.status)) {
    throw new Error("Estado invalido")
  }
  const schedule = await getScheduleForDate(input.date)
  if (!schedule.day) throw new Error("Dia no encontrado")
  const day = schedule.day
  const health = analyzeSchedule(schedule)
  if ((input.status === "ready" || input.status === "active") && health.criticalCount > 0) {
    throw new Error("No se puede publicar con alertas criticas")
  }
  if (
    (input.status === "ready" || input.status === "active") &&
    health.warnCount > 0 &&
    !input.allowWarnings
  ) {
    throw new Error("Hay advertencias pendientes")
  }
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "program_day.status_updated",
      entityType: "program_days",
      entityId: day.id,
      metadata: { date: input.date },
      previous: { status: day.status },
      next: { status: input.status }
    },
    async () => {
      const { error } = await supabase
        .from("program_days")
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .eq("id", day.id)
      if (error) throw error
    }
  )
  revalidatePath("/admin/calendar")
  revalidatePath(`/admin/schedule/${input.date}`)
}

export async function updateProgramBlock(input: {
  date: string
  blockId: string
  title: string
  blockType: string
  category?: BlockCategory
  assetId?: string
  slideId?: string
  startTime: string
  durationSeconds: number
  status: string
  hideOverlays: boolean
  fallbackAssetId?: string
  notes?: string
  conflictResolution?: ConflictResolutionMode
}) {
  if (!["video", "image", "slide", "ad", "promo", "fallback"].includes(input.blockType)) {
    throw new Error("Tipo de bloque invalido")
  }
  if (!["draft", "ready", "active", "archived"].includes(input.status)) {
    throw new Error("Estado invalido")
  }
  const schedule = await getScheduleForDate(input.date)
  const block = schedule.blocks.find((item) => item.id === input.blockId)
  if (!block) throw new Error("Bloque no encontrado")
  const startTimeSeconds = parseTimecode(input.startTime)
  const contentDuration = getKnownContentDuration(schedule, input.assetId, input.slideId)
  const durationSeconds = Math.max(1, Number(input.durationSeconds || 0), contentDuration || 1)
  if (input.blockType === "ad" && durationSeconds > 300) {
    throw new Error("Ads cannot be longer than 300 seconds")
  }
  const conflict = findScheduleConflicts(schedule.blocks, {
    id: input.blockId,
    programDayId: block.programDayId,
    startTimeSeconds,
    durationSeconds
  })
  if (conflict.hasConflict && input.conflictResolution !== "archive_conflicts") {
    throw new Error("El bloque se solapa con otro bloque")
  }
  if (conflict.hasConflict) {
    await archiveConflictingBlocks({
      date: input.date,
      conflicts: conflict.conflicts,
      reason: "program_block.conflict_replaced"
    })
  }
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "program_block.updated",
      entityType: "program_blocks",
      entityId: input.blockId,
      metadata: { date: input.date },
      previous: {
        title: block.title,
        start_time: block.startTime,
        duration_seconds: block.durationSeconds,
        status: block.status
      },
      next: {
        title: input.title,
        start_time: input.startTime,
        duration_seconds: durationSeconds,
        status: input.status
      }
    },
    async () => {
      const { error } = await supabase
        .from("program_blocks")
        .update({
          title: input.title,
          block_type: input.blockType,
          category: input.category ?? block.category,
          asset_id: input.assetId || null,
          slide_id: input.slideId || null,
          start_time: input.startTime,
          start_time_seconds: startTimeSeconds,
          duration_seconds: durationSeconds,
          status: input.status,
          hide_overlays: input.hideOverlays,
          fallback_asset_id: input.fallbackAssetId || null,
          notes: input.notes || null,
          updated_at: new Date().toISOString()
        })
        .eq("id", input.blockId)
      if (error) throw error
    }
  )
  revalidatePath(`/admin/schedule/${input.date}`)
  revalidatePath(`/admin/schedule/${input.date}/blocks/${input.blockId}`)
}

export async function reorderProgramBlocks(input: { date: string; orderedBlockIds: string[] }) {
  const schedule = await getScheduleForDate(input.date)
  const activeBlocks = schedule.blocks
    .filter((block) => block.status !== "archived")
    .sort((a, b) => a.startTimeSeconds - b.startTimeSeconds)
  const orderedSet = new Set(input.orderedBlockIds)
  if (orderedSet.size !== input.orderedBlockIds.length) {
    throw new Error("Hay bloques repetidos en el orden del rundown")
  }
  if (activeBlocks.length !== input.orderedBlockIds.length) {
    throw new Error("El rundown cambio. Recarga antes de reordenar")
  }
  const byId = new Map(activeBlocks.map((block) => [block.id, block]))
  if (input.orderedBlockIds.some((id) => !byId.has(id))) {
    throw new Error("El rundown incluye un bloque inexistente")
  }
  const startSeconds = activeBlocks[0]?.startTimeSeconds ?? 0
  let cursor = startSeconds
  const updates = input.orderedBlockIds.map((id) => {
    const block = byId.get(id)!
    const next = {
      id,
      startTimeSeconds: cursor,
      startTime: formatTimecode(cursor)
    }
    cursor += block.durationSeconds
    return next
  })
  if (cursor > 86400) {
    throw new Error("El rundown excede las 24 horas")
  }
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "program_blocks.reordered",
      entityType: "program_blocks",
      metadata: { date: input.date, blocks: updates.length },
      previous: {
        blocks: activeBlocks.map((block) => ({ id: block.id, start_time: block.startTime }))
      },
      next: { blocks: updates }
    },
    async () => {
      for (let index = 0; index < updates.length; index += 1) {
        const update = updates[index]!
        const { error } = await supabase
          .from("program_blocks")
          .update({
            start_time: formatTimecode(200000 + index * 100000),
            start_time_seconds: 200000 + index * 100000,
            updated_at: new Date().toISOString()
          })
          .eq("id", update.id)
        if (error) throw error
      }
      for (const update of updates) {
        const { error } = await supabase
          .from("program_blocks")
          .update({
            start_time: update.startTime,
            start_time_seconds: update.startTimeSeconds,
            updated_at: new Date().toISOString()
          })
          .eq("id", update.id)
        if (error) throw error
      }
    }
  )
  revalidateSchedule(input.date)
}

export async function resizeProgramBlock(input: {
  date: string
  blockId: string
  durationSeconds: number
}) {
  const schedule = await getScheduleForDate(input.date)
  const block = schedule.blocks.find((item) => item.id === input.blockId)
  if (!block) throw new Error("Bloque no encontrado")
  const durationSeconds = Math.max(1, Math.round(Number(input.durationSeconds || 0) / 300) * 300)
  const conflict = findScheduleConflicts(
    schedule.blocks.filter((item) => item.status !== "archived"),
    {
      id: block.id,
      programDayId: block.programDayId,
      startTimeSeconds: block.startTimeSeconds,
      durationSeconds
    }
  )
  if (conflict.hasConflict) {
    throw new Error("El nuevo largo se solapa con otro bloque")
  }
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "program_block.resized",
      entityType: "program_blocks",
      entityId: block.id,
      metadata: { date: input.date },
      previous: { duration_seconds: block.durationSeconds },
      next: { duration_seconds: durationSeconds }
    },
    async () => {
      const { error } = await supabase
        .from("program_blocks")
        .update({ duration_seconds: durationSeconds, updated_at: new Date().toISOString() })
        .eq("id", block.id)
      if (error) throw error
    }
  )
  revalidateSchedule(input.date)
}

export async function moveProgramBlock(input: {
  date: string
  blockId: string
  startTimeSeconds: number
}) {
  const schedule = await getScheduleForDate(input.date)
  const block = schedule.blocks.find((item) => item.id === input.blockId)
  if (!block) throw new Error("Bloque no encontrado")
  const startTimeSeconds = Math.min(
    Math.max(0, Math.round(Number(input.startTimeSeconds || 0) / 300) * 300),
    86400 - block.durationSeconds
  )
  const conflict = findScheduleConflicts(
    schedule.blocks.filter((item) => item.status !== "archived"),
    {
      id: block.id,
      programDayId: block.programDayId,
      startTimeSeconds,
      durationSeconds: block.durationSeconds
    }
  )
  if (conflict.hasConflict) {
    throw new Error("El bloque se solapa con otro bloque")
  }
  const startTime = formatTimecode(startTimeSeconds)
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "program_block.moved",
      entityType: "program_blocks",
      entityId: block.id,
      metadata: { date: input.date },
      previous: { start_time: block.startTime, start_time_seconds: block.startTimeSeconds },
      next: { start_time: startTime, start_time_seconds: startTimeSeconds }
    },
    async () => {
      const { error } = await supabase
        .from("program_blocks")
        .update({
          start_time: startTime,
          start_time_seconds: startTimeSeconds,
          updated_at: new Date().toISOString()
        })
        .eq("id", block.id)
      if (error) throw error
    }
  )
  revalidateSchedule(input.date)
}

export async function duplicateProgramBlock(input: { date: string; blockId: string }) {
  const schedule = await getScheduleForDate(input.date)
  const block = schedule.blocks.find((item) => item.id === input.blockId)
  if (!block) throw new Error("Bloque no encontrado")
  const insertStart = block.startTimeSeconds + block.durationSeconds
  const followingBlocks = schedule.blocks
    .filter((item) => item.status !== "archived" && item.startTimeSeconds >= insertStart)
    .sort((a, b) => b.startTimeSeconds - a.startTimeSeconds)
  const dayEnd = Math.max(
    insertStart + block.durationSeconds,
    ...followingBlocks.map(
      (item) => item.startTimeSeconds + item.durationSeconds + block.durationSeconds
    )
  )
  if (dayEnd > 86400) {
    throw new Error("Duplicar el bloque excede las 24 horas")
  }
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "program_block.duplicated",
      entityType: "program_blocks",
      entityId: block.id,
      metadata: { date: input.date, shifted_blocks: followingBlocks.length },
      next: { title: `${block.title} copy`, start_time: formatTimecode(insertStart) }
    },
    async () => {
      for (const item of followingBlocks) {
        const shiftedStart = item.startTimeSeconds + block.durationSeconds
        const { error } = await supabase
          .from("program_blocks")
          .update({
            start_time: formatTimecode(shiftedStart),
            start_time_seconds: shiftedStart,
            updated_at: new Date().toISOString()
          })
          .eq("id", item.id)
        if (error) throw error
      }
      const { error } = await supabase.from("program_blocks").insert({
        program_day_id: block.programDayId,
        title: `${block.title} copy`,
        block_type: block.blockType,
        category: block.category,
        asset_id: block.assetId || null,
        slide_id: block.slideId || null,
        start_time: formatTimecode(insertStart),
        start_time_seconds: insertStart,
        duration_seconds: block.durationSeconds,
        status: "draft",
        hide_overlays: block.hideOverlays,
        fallback_asset_id: block.fallbackAssetId || null,
        notes: block.notes || null
      })
      if (error) throw error
    }
  )
  revalidateSchedule(input.date)
}

export async function archiveProgramBlock(input: { date: string; blockId: string }) {
  await bulkUpdateProgramBlockStatus({
    date: input.date,
    blockIds: [input.blockId],
    status: "archived"
  })
}

export async function bulkUpdateProgramBlockStatus(input: {
  date: string
  blockIds: string[]
  status: ProgramStatus
}) {
  assertProgramStatus(input.status)
  const blockIds = [...new Set(input.blockIds)].filter(Boolean)
  if (!blockIds.length) throw new Error("Selecciona al menos un bloque")
  const schedule = await getScheduleForDate(input.date)
  const existing = schedule.blocks.filter((block) => blockIds.includes(block.id))
  if (existing.length !== blockIds.length) throw new Error("Uno o mas bloques no existen")
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "program_blocks.bulk_status_updated",
      entityType: "program_blocks",
      metadata: { date: input.date, blocks: blockIds.length },
      previous: { blocks: existing.map((block) => ({ id: block.id, status: block.status })) },
      next: { status: input.status }
    },
    async () => {
      const { error } = await supabase
        .from("program_blocks")
        .update({ status: input.status, updated_at: new Date().toISOString() })
        .in("id", blockIds)
      if (error) throw error
    }
  )
  revalidateSchedule(input.date)
}

export async function updateRunbookCheck(input: {
  date: string
  programDayId: string
  section: RunbookSection
  itemKey: string
  checked: boolean
  notes?: string
}) {
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "operator_runbook.updated",
      entityType: "operator_runbook_checks",
      metadata: {
        date: input.date,
        section: input.section,
        item_key: input.itemKey
      },
      next: { checked: input.checked, notes: input.notes || null }
    },
    async () => {
      const { error } = await supabase.from("operator_runbook_checks").upsert(
        {
          program_day_id: input.programDayId,
          section: input.section,
          item_key: input.itemKey,
          checked: input.checked,
          notes: input.notes || null,
          checked_at: input.checked ? new Date().toISOString() : null,
          updated_at: new Date().toISOString()
        },
        { onConflict: "program_day_id,section,item_key" }
      )
      if (error) throw error
    }
  )
  revalidatePath(`/admin/runbook/${input.date}`)
  revalidatePath(`/admin/schedule/${input.date}`)
  revalidatePath("/admin/output")
}

function assertProgramStatus(status: ProgramStatus) {
  if (!["draft", "ready", "active", "archived"].includes(status)) {
    throw new Error("Estado invalido")
  }
}

function revalidateSchedule(date: string) {
  revalidatePath(`/admin/schedule/${date}`)
  revalidatePath("/admin/calendar")
  revalidatePath("/admin/output")
}

async function archiveConflictingBlocks(input: {
  date: string
  conflicts: Array<{
    blockId: string
    title: string
    startTimeSeconds: number
    endTimeSeconds: number
  }>
  reason: string
}) {
  const supabase = createServiceClient()
  for (const conflict of input.conflicts) {
    await auditedMutation(
      {
        action: "program_block.archived_for_replacement",
        entityType: "program_blocks",
        entityId: conflict.blockId,
        metadata: {
          date: input.date,
          reason: input.reason,
          start_seconds: conflict.startTimeSeconds,
          end_seconds: conflict.endTimeSeconds
        },
        previous: { title: conflict.title },
        next: { status: "archived" }
      },
      async () => {
        const { error } = await supabase
          .from("program_blocks")
          .update({ status: "archived", updated_at: new Date().toISOString() })
          .eq("id", conflict.blockId)
        if (error) throw error
      }
    )
  }
}

export async function deleteProgramBlock(input: { date: string; blockId: string }) {
  const schedule = await getScheduleForDate(input.date)
  const block = schedule.blocks.find((item) => item.id === input.blockId)
  if (!block) throw new Error("Bloque no encontrado")
  const supabase = createServiceClient()
  const { error: layerError } = await supabase
    .from("scheduled_layers")
    .delete()
    .eq("program_block_id", input.blockId)
  if (layerError) throw layerError
  await auditedMutation(
    {
      action: "program_block.deleted",
      entityType: "program_blocks",
      entityId: input.blockId,
      metadata: { date: input.date },
      previous: { title: block.title, start_time: block.startTime, status: block.status }
    },
    async () => {
      const { error } = await supabase.from("program_blocks").delete().eq("id", input.blockId)
      if (error) throw error
    }
  )
  revalidatePath(`/admin/schedule/${input.date}`)
}

export async function createLongTestSchedule(input: {
  date: string
  startTime: string
  totalHours: number
  programMinutes: number
  adBreakMinutes: number
  imageBumperSeconds: number
  replaceWindow: boolean
}) {
  const dayId = await ensureProgramDay(input.date)
  const schedule = await getScheduleForDate(input.date)
  const generatedBlocks = buildLongTestSchedule({
    mediaAssets: schedule.mediaAssets,
    slideAssets: schedule.slideAssets,
    startTime: input.startTime,
    totalHours: input.totalHours,
    programMinutes: input.programMinutes,
    adBreakMinutes: input.adBreakMinutes,
    imageBumperSeconds: input.imageBumperSeconds
  })
  const firstBlock = generatedBlocks[0]
  const lastBlock = generatedBlocks[generatedBlocks.length - 1]
  if (!firstBlock || !lastBlock) throw new Error("No se pudo generar la grilla")

  const supabase = createServiceClient()
  const startSeconds = firstBlock.startTimeSeconds
  const endSeconds = lastBlock.startTimeSeconds + lastBlock.durationSeconds

  if (input.replaceWindow) {
    const { error: deleteError } = await supabase
      .from("program_blocks")
      .delete()
      .eq("program_day_id", dayId)
      .gte("start_time_seconds", startSeconds)
      .lt("start_time_seconds", endSeconds)
    if (deleteError) throw deleteError
  }

  await auditedMutation(
    {
      action: "program_blocks.generated",
      entityType: "program_blocks",
      metadata: {
        date: input.date,
        start_time: input.startTime,
        total_hours: input.totalHours,
        blocks: generatedBlocks.length,
        replace_window: input.replaceWindow
      },
      next: {
        start_seconds: startSeconds,
        end_seconds: endSeconds,
        blocks: generatedBlocks.length
      }
    },
    async () => {
      const { error } = await supabase.from("program_blocks").insert(
        generatedBlocks.map((block) => ({
          program_day_id: dayId,
          title: block.title,
          block_type: block.blockType,
          category: "broadcast" satisfies BlockCategory,
          asset_id: block.assetId || null,
          slide_id: block.slideId || null,
          start_time: block.startTime,
          start_time_seconds: block.startTimeSeconds,
          duration_seconds: block.durationSeconds,
          status: "ready",
          hide_overlays: false
        }))
      )
      if (error) throw error
    }
  )
  revalidatePath(`/admin/schedule/${input.date}`)
  revalidatePath("/admin/calendar")
}

export async function createSlideAsset(input: {
  title: string
  slideType: string
  content?: string | undefined
  imageUrl?: string | undefined
  htmlContent?: string | undefined
  templateId?: string | undefined
  defaultDurationSeconds?: number | undefined
  status?: string | undefined
}) {
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "slide_asset.created",
      entityType: "slide_assets",
      next: { title: input.title, slide_type: input.slideType, status: input.status || "ready" }
    },
    async () => {
      const { error } = await supabase.from("slide_assets").insert({
        title: input.title,
        slide_type: input.slideType,
        content: input.content || null,
        image_url: input.imageUrl || null,
        html_content: input.htmlContent || null,
        template_id: input.templateId || null,
        default_duration_seconds: input.defaultDurationSeconds || null,
        status: input.status || "ready"
      })
      if (error) throw error
    }
  )
  revalidatePath("/admin/slides")
}

export async function createScheduledLayer(input: {
  date: string
  blockId: string
  title: string
  layerType: string
  assetId?: string
  slideId?: string
  startTime: string
  durationSeconds: number
  zIndex: number
  position: string
}) {
  const startTimeSeconds = parseTimecode(input.startTime)
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: "scheduled_layer.created",
      entityType: "scheduled_layers",
      metadata: { block_id: input.blockId },
      next: {
        title: input.title,
        start_time: input.startTime,
        duration_seconds: input.durationSeconds
      }
    },
    async () => {
      const { error } = await supabase.from("scheduled_layers").insert({
        program_block_id: input.blockId,
        title: input.title,
        layer_type: input.layerType,
        asset_id: input.assetId || null,
        slide_id: input.slideId || null,
        start_time_seconds: startTimeSeconds,
        duration_seconds: input.durationSeconds,
        z_index: input.zIndex,
        position: input.position,
        enabled: true
      })
      if (error) throw error
    }
  )
  revalidatePath(`/admin/schedule/${input.date}/blocks/${input.blockId}`)
  revalidatePath(`/admin/schedule/${input.date}`)
}

export async function setScheduledLayerEnabled(input: {
  date: string
  blockId: string
  layerId: string
  enabled: boolean
}) {
  const supabase = createServiceClient()
  await auditedMutation(
    {
      action: input.enabled ? "scheduled_layer.enabled" : "scheduled_layer.disabled",
      entityType: "scheduled_layers",
      entityId: input.layerId,
      metadata: { block_id: input.blockId },
      next: { enabled: input.enabled }
    },
    async () => {
      const { error } = await supabase
        .from("scheduled_layers")
        .update({ enabled: input.enabled, updated_at: new Date().toISOString() })
        .eq("id", input.layerId)
      if (error) throw error
    }
  )
  revalidatePath(`/admin/schedule/${input.date}`)
  revalidatePath(`/admin/schedule/${input.date}/blocks/${input.blockId}`)
}

export async function createMediaAsset(input: {
  title: string
  sourceType: string
  mediaKind: string
  assetType: string
  url?: string | undefined
  storageBucket?: string | undefined
  storagePath?: string | undefined
  durationSeconds?: number | undefined
  metadata?: Record<string, unknown> | undefined
  lifecycleState?: string | undefined
}) {
  if (input.assetType === "ad" && input.durationSeconds && input.durationSeconds > 300) {
    throw new Error("Ads cannot be longer than 300 seconds")
  }
  const supabase = createServiceClient()
  const data = await auditedMutation(
    {
      action: "media_asset.created",
      entityType: "media_assets",
      next: { title: input.title, source_type: input.sourceType, status: "ready" }
    },
    async () => {
      const { data, error } = await supabase
        .from("media_assets")
        .insert({
          title: input.title,
          source_type: input.sourceType,
          media_kind: input.mediaKind,
          asset_type: input.assetType,
          url: input.url || null,
          storage_bucket: input.storageBucket || null,
          storage_path: input.storagePath || null,
          duration_seconds: input.durationSeconds || null,
          metadata: input.metadata ?? {},
          status: "ready",
          lifecycle_state: input.lifecycleState ?? "reviewed"
        })
        .select("id")
        .single()
      if (error) throw error
      return data
    }
  )
  revalidatePath("/admin/assets")
  return String(data.id)
}

export async function updateMediaAsset(input: {
  id: string
  title: string
  description?: string | undefined
  sourceType: string
  mediaKind: string
  assetType: string
  url?: string | undefined
  thumbnailUrl?: string | undefined
  durationSeconds?: number | undefined
  status: string
  lifecycleState?: string | undefined
  orientation?: string | undefined
  playlistOrder?: number | undefined
  revalidatePaths?: string[] | undefined
}) {
  if (!input.id) throw new Error("Asset missing")
  if (input.assetType === "ad" && input.durationSeconds && input.durationSeconds > 300) {
    throw new Error("Ads cannot be longer than 300 seconds")
  }
  const supabase = createServiceClient()
  const { data: current, error: currentError } = await supabase
    .from("media_assets")
    .select("metadata")
    .eq("id", input.id)
    .single()
  if (currentError) throw currentError

  const metadata =
    typeof current.metadata === "object" && current.metadata !== null
      ? { ...(current.metadata as Record<string, unknown>) }
      : {}
  const orientation = input.orientation || String(metadata.orientation || "auto")
  metadata.orientation = orientation
  metadata.presentation = orientation === "vertical" ? "vertical_blur" : "fit"
  metadata.background = orientation === "vertical" ? "blur" : "black"
  if (input.assetType === "music" && typeof input.playlistOrder === "number") {
    metadata.playlist_order = input.playlistOrder
  }

  await auditedMutation(
    {
      action: "media_asset.updated",
      entityType: "media_assets",
      entityId: input.id,
      ...(typeof current === "object" && current !== null
        ? { previous: { metadata: current.metadata ?? null } }
        : {}),
      next: {
        title: input.title,
        source_type: input.sourceType,
        asset_type: input.assetType,
        status: input.status,
        lifecycle_state: input.lifecycleState ?? "reviewed"
      }
    },
    async () => {
      const { error } = await supabase
        .from("media_assets")
        .update({
          title: input.title,
          description: input.description || null,
          source_type: input.sourceType,
          media_kind: input.mediaKind,
          asset_type: input.assetType,
          url: input.url || null,
          thumbnail_url: input.thumbnailUrl || null,
          duration_seconds: input.durationSeconds || null,
          status: input.status,
          lifecycle_state: input.lifecycleState ?? "reviewed",
          metadata,
          updated_at: new Date().toISOString()
        })
        .eq("id", input.id)
      if (error) throw error
    }
  )
  revalidatePath("/admin/assets")
  for (const path of input.revalidatePaths ?? []) {
    revalidatePath(path)
  }
}

export async function deleteMediaAsset(input: { id: string; force?: boolean }) {
  if (!input.id) throw new Error("Asset missing")
  const supabase = createServiceClient()
  const { data: asset, error: assetError } = await supabase
    .from("media_assets")
    .select("title, storage_bucket, storage_path, lifecycle_state")
    .eq("id", input.id)
    .single()
  if (assetError) throw assetError
  const scheduledInUse =
    asset.lifecycle_state === "scheduled_in_use" || (await isAssetScheduled(input.id))
  if (scheduledInUse && !input.force) {
    throw new Error("Asset is scheduled in use. Confirm force delete to continue.")
  }

  const storageBucket = asset.storage_bucket ? String(asset.storage_bucket) : ""
  const storagePath = asset.storage_path ? String(asset.storage_path) : ""
  if (storageBucket && storagePath) {
    const { error: storageError } = await supabase.storage.from(storageBucket).remove([storagePath])
    if (storageError) throw storageError
  }

  await auditedMutation(
    {
      action: "media_asset.deleted",
      entityType: "media_assets",
      entityId: input.id,
      previous: { title: String(asset.title ?? "") }
    },
    async () => {
      const { error } = await supabase.from("media_assets").delete().eq("id", input.id)
      if (error) throw error
    }
  )
  revalidatePath("/admin/assets")
  revalidatePath("/admin/music")
}

async function isAssetScheduled(assetId: string) {
  const supabase = createServiceClient()
  const [{ data: blocks, error: blocksError }, { data: layers, error: layersError }] =
    await Promise.all([
      supabase.from("program_blocks").select("asset_id, fallback_asset_id, status"),
      supabase.from("scheduled_layers").select("asset_id, enabled")
    ])
  if (blocksError) throw blocksError
  if (layersError) throw layersError
  const blockRows = (blocks ?? []) as Array<Record<string, unknown>>
  const layerRows = (layers ?? []) as Array<Record<string, unknown>>
  return (
    blockRows.some(
      (row) =>
        row.status !== "archived" && (row.asset_id === assetId || row.fallback_asset_id === assetId)
    ) || layerRows.some((row) => row.enabled !== false && row.asset_id === assetId)
  )
}
