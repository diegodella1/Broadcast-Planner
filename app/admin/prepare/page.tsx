import { CloudSun, DatabaseZap, Music, PackageOpen, Users, Video } from 'lucide-react';

import { FlowCard, FlowGrid, FlowHero, FlowRail } from '@/components/admin-flow';
import { AdminShell } from '@/components/admin-shell';
import { ButtonLink } from '@/components/ui';
import { getAssets, getGuests, getSlides } from '@/lib/data';

export const dynamic = 'force-dynamic';

export default async function PreparePage() {
    const [assets, slides, guests] = await Promise.all([getAssets(), getSlides(), getGuests()]);
    const readyAssets = assets.filter((asset) => asset.status === 'ready');
    const reviewAssets = assets.filter((asset) => asset.status !== 'ready');
    const musicAssets = assets.filter((asset) => asset.assetType === 'music');
    const weatherPlates = slides.filter((slide) => slide.templateId === 'weather');
    const guestPlates = slides.filter((slide) => slide.templateId === 'guest-lineup');
    const dataPlates = slides.filter((slide) =>
        ['btc-open', 'debt', 'events-calendar', 'metals', 'us-market-open'].includes(
            slide.templateId ?? '',
        ),
    );

    return (
        <AdminShell
            title="Prepare"
            description="Create and review everything before it reaches a schedule."
            actions={
                <>
                    <ButtonLink href="/admin/assets">Add media</ButtonLink>
                    <ButtonLink href="/admin/slides" variant="secondary">
                        Create plate
                    </ButtonLink>
                </>
            }
        >
            <FlowHero
                eyebrow="One intake"
                title="Prepare content once, then schedule only ready items."
                detail="Use this as the front door for media, music, weather, guest and data plates. Raw metadata stays in the old detail pages; this page keeps operator choices small."
            />
            <section className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
                <FlowGrid>
                    <FlowCard
                        href="/admin/assets"
                        icon={Video}
                        label="Media"
                        title="Video, images, promos, ads"
                        detail="Upload or reference playable assets. Review readiness before scheduling."
                        tone={reviewAssets.length ? 'warn' : 'prepare'}
                        badge={`${readyAssets.length}/${assets.length} ready`}
                    />
                    <FlowCard
                        href="/admin/vimeo"
                        icon={PackageOpen}
                        label="Import"
                        title="Vimeo programs"
                        detail="Sync source programs into the library before building the rundown."
                        tone="prepare"
                    />
                    <FlowCard
                        href="/admin/music"
                        icon={Music}
                        label="Audio bed"
                        title="Background playlist"
                        detail="Tracks play under slides, images and visual fallback loops."
                        tone={musicAssets.length ? 'prepare' : 'warn'}
                        badge={`${musicAssets.length} tracks`}
                    />
                    <FlowCard
                        href="/admin/guests"
                        icon={Users}
                        label="People"
                        title="Guest records and plates"
                        detail="Create guests, then build different Guest Lineup plates for each group."
                        tone="prepare"
                        badge={`${guestPlates.length} plates`}
                    />
                    <FlowCard
                        href="/admin/slides#weather"
                        icon={CloudSun}
                        label="Cities"
                        title="Weather plates"
                        detail="Create multiple city-specific weather cards. City is the operator concept; lat/lon stays advanced."
                        tone="prepare"
                        badge={`${weatherPlates.length} cities`}
                    />
                    <FlowCard
                        href="/admin/slides"
                        icon={DatabaseZap}
                        label="Data"
                        title="Markets, metals, debt"
                        detail="Use real-data plates with visible provider fallback and freshness checks."
                        tone="prepare"
                        badge={`${dataPlates.length} plates`}
                    />
                </FlowGrid>
                <FlowRail
                    title="Prepare state"
                    items={[
                        { label: 'Assets', value: String(assets.length) },
                        {
                            label: 'Needs fix',
                            value: String(reviewAssets.length),
                            tone: reviewAssets.length ? 'warn' : 'ok',
                        },
                        { label: 'Slides', value: String(slides.length) },
                        { label: 'Guests', value: String(guests.length) },
                    ]}
                />
            </section>
        </AdminShell>
    );
}
