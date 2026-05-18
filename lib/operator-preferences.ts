import { getCurrentOperatorSession } from "./auth"
import { createServiceClient } from "./supabase/server"

export type MusicPreference = {
  enabled: boolean
  volume: number
  fade: "none" | "short"
}

const DEFAULT_MUSIC_PREFERENCE: MusicPreference = {
  enabled: false,
  volume: 50,
  fade: "short"
}

export async function getMusicPreference(): Promise<MusicPreference> {
  const operator = await getCurrentOperatorSession()
  if (!operator || operator.operatorId === "bootstrap") return DEFAULT_MUSIC_PREFERENCE
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("operator_preferences")
    .select("value")
    .eq("operator_id", operator.operatorId)
    .eq("key", "music")
    .maybeSingle()
  if (error) throw error
  return parseMusicPreference(data?.value)
}

export async function getLatestMusicPreference(): Promise<MusicPreference> {
  const supabase = createServiceClient()
  const { data, error } = await supabase
    .from("operator_preferences")
    .select("value,updated_at")
    .eq("key", "music")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle()
  if (error) throw error
  return parseMusicPreference(data?.value)
}

export async function saveMusicPreference(input: Partial<MusicPreference>) {
  const operator = await getCurrentOperatorSession()
  if (!operator || operator.operatorId === "bootstrap") return DEFAULT_MUSIC_PREFERENCE
  const next = parseMusicPreference(input)
  const supabase = createServiceClient()
  const { error } = await supabase.from("operator_preferences").upsert(
    {
      operator_id: operator.operatorId,
      key: "music",
      value: next,
      updated_at: new Date().toISOString()
    },
    { onConflict: "operator_id,key" }
  )
  if (error) throw error
  return next
}

function parseMusicPreference(value: unknown): MusicPreference {
  const source =
    typeof value === "object" && value !== null ? (value as Record<string, unknown>) : {}
  const volume = Number(source.volume)
  return {
    enabled: source.enabled === true,
    volume: Number.isFinite(volume) ? Math.max(0, Math.min(100, Math.round(volume))) : 50,
    fade: source.fade === "none" ? "none" : "short"
  }
}
