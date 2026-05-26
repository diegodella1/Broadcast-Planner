import { getGuests } from '@/lib/data';

import type { GuestLineupData, GuestLineupGuest } from '@/lib/slides/types';
import type { SlideAsset } from '@/lib/types';

const CACHE_MS = 30_000;
const ROTATION_SECONDS = 9;

const cache = new Map<string, { value: GuestLineupData; expiresAt: number }>();

export async function getGuestLineupData(
    input: { slide?: SlideAsset | null | undefined } = {},
): Promise<GuestLineupData> {
    const now = Date.now();
    const guestIds = guestIdsFromSlide(input.slide);
    const cacheKey = guestIds.length ? `slide:${input.slide?.id ?? guestIds.join(',')}` : 'global';
    const cached = cache.get(cacheKey);

    if (cached && cached.expiresAt > now) {
        return cached.value;
    }

    try {
        const guests = selectGuests(await getGuests({ readyOnly: true }), guestIds);
        const value =
            guests.length > 0
                ? liveData(
                      guests.map((guest) => ({
                          id: guest.id,
                          name: guest.name,
                          role: guest.role ?? null,
                          company: guest.company ?? null,
                          host: guest.host ?? null,
                          program: guest.program ?? null,
                          category: guest.category,
                          appearanceAt: guest.appearanceAt ?? null,
                          photoUrl: guest.photoUrl ?? null,
                          photoAssetId: guest.photoAssetId ?? null,
                          videoUrl: guest.videoUrl ?? null,
                          videoAssetId: guest.videoAssetId ?? null,
                          color: guest.color,
                          sortOrder: guest.sortOrder,
                      })),
                      guestIds.length ? (input.slide?.id ?? null) : null,
                  )
                : demoData();
        cache.set(cacheKey, { value, expiresAt: now + CACHE_MS });

        return value;
    } catch (error) {
        if (cached) {
            return { ...cached.value, stale: true };
        }
        console.error('[lib/slides/data/guests.ts:getGuestLineupData]', error);

        return {
            ...demoData(),
            mode: 'unavailable',
            stale: true,
            source: 'Guests table unavailable',
        };
    }
}

function liveData(guests: GuestLineupGuest[], slideId: string | null): GuestLineupData {
    return {
        mode: 'live',
        guests,
        updatedAt: new Date().toISOString(),
        rotationSeconds: ROTATION_SECONDS,
        cacheSeconds: CACHE_MS / 1000,
        endpoint: slideId
            ? `/api/slide-data/guests?slideId=${encodeURIComponent(slideId)}`
            : '/api/slide-data/guests',
        source: 'Supabase guests',
    };
}

function guestIdsFromSlide(slide: SlideAsset | null | undefined) {
    const guestIds = slide?.metadata?.guestIds;

    return Array.isArray(guestIds) ? guestIds.map(String).filter(Boolean) : [];
}

function selectGuests(guests: Awaited<ReturnType<typeof getGuests>>, guestIds: string[]) {
    if (!guestIds.length) {
        return guests;
    }
    const byId = new Map(guests.map((guest) => [guest.id, guest]));

    return guestIds.map((id) => byId.get(id)).filter(Boolean) as typeof guests;
}

export function demoData(): GuestLineupData {
    const updatedAt = new Date().toISOString();

    return {
        mode: 'demo',
        guests: [
            {
                id: 'demo-saylor',
                name: 'Michael Saylor',
                role: 'Executive Chairman',
                company: 'Strategy',
                host: 'RTV Markets Desk',
                program: 'Opening Bell',
                category: 'bitcoin',
                appearanceAt: updatedAt,
                photoUrl:
                    'https://images.unsplash.com/photo-1560250097-0b93528c311a?auto=format&fit=crop&w=900&q=80',
                photoAssetId: null,
                videoUrl: null,
                videoAssetId: null,
                color: '#f7931a',
                sortOrder: 1,
            },
            {
                id: 'demo-alden',
                name: 'Lyn Alden',
                role: 'Macro Strategist',
                company: 'Lyn Alden Investment Strategy',
                host: 'RTV Macro',
                program: 'Macro Check',
                category: 'macro',
                appearanceAt: updatedAt,
                photoUrl:
                    'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=900&q=80',
                photoAssetId: null,
                videoUrl: null,
                videoAssetId: null,
                color: '#5eead4',
                sortOrder: 2,
            },
            {
                id: 'demo-long',
                name: 'Caitlin Long',
                role: 'Founder and CEO',
                company: 'Custodia Bank',
                host: 'RTV Policy',
                program: 'Policy Desk',
                category: 'policy',
                appearanceAt: updatedAt,
                photoUrl:
                    'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?auto=format&fit=crop&w=900&q=80',
                photoAssetId: null,
                videoUrl: null,
                videoAssetId: null,
                color: '#93c5fd',
                sortOrder: 3,
            },
        ],
        updatedAt,
        rotationSeconds: ROTATION_SECONDS,
        cacheSeconds: CACHE_MS / 1000,
        endpoint: '/api/slide-data/guests',
        stale: true,
        source: 'Demo guests',
    };
}
