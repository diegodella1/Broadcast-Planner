/**
 * Calendar-slide data fetcher.
 * Reads upcoming events from the Supabase `events` table when present.
 * If the table does not exist (migration not yet applied) returns an empty list
 * so the slide can render its empty-state without crashing.
 */

import type { CalendarEvent } from '@/lib/slides/types';
import { createServiceClient } from '@/lib/supabase/server';

const DEFAULT_LIMIT = 6;

const POSTGREST_TABLE_MISSING = 'PGRST205';
const POSTGREST_RELATION_MISSING = '42P01';

export async function getUpcomingCalendarEvents(
    limit: number = DEFAULT_LIMIT,
): Promise<CalendarEvent[]> {
    const supabase = createServiceClient();
    const today = new Date().toISOString().slice(0, 10);
    const events = supabase.from('events') as ReturnType<typeof supabase.from>;
    const { data, error } = await events
        .select('*')
        .eq('is_active', true)
        .gte('start_date', today)
        .order('start_date', { ascending: true })
        .order('order_index', { ascending: true })
        .limit(limit);

    if (error) {
        if (error.code === POSTGREST_TABLE_MISSING || error.code === POSTGREST_RELATION_MISSING) {
            console.warn(
                '[lib/slides/data/calendar.ts] events table not found — returning empty list',
            );

            return [];
        }
        throw error;
    }

    return Array.isArray(data) ? (data as CalendarEvent[]) : [];
}
