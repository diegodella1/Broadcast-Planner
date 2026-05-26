import {
    BookOpen,
    CalendarDays,
    Clapperboard,
    HeartPulse,
    ListChecks,
    PackageOpen,
    RadioTower,
    Shield,
} from 'lucide-react';
import Link from 'next/link';

const workflowSteps = [
    'Open Prepare and add or sync videos, graphics, slides, audio, Vimeo shows, guest plates, weather cities and live endpoints.',
    'Create guest records and individualized guest lineup plates when the programming needs guest cards.',
    'Open Program to create the broadcast day, build the rundown and assign ready media, slides or live streams.',
    'Use Loop Builder for silent slide loops. Save as scheduled blocks, fallback carousel, or both.',
    'Enable the optional Previously Recorded bug on normal video programs when needed.',
    'Confirm fallback policy before active: block fallback, day fallback, global fallback video or visual fallback carousel.',
    'Resolve critical health issues before the signal goes live.',
    'Complete runbook preflight checks.',
    'Set the day active.',
    'Open Operate, launch Live Browser Output, click Start Output, then capture the browser in OBS or vMix.',
    'During live, watch active block, next block, fallback reason, drift, playback state and runbook notes.',
    'Stop broadcast from Output and complete shutdown checks.',
];

const sections = [
    {
        title: 'Prepare',
        icon: PackageOpen,
        body: 'Unified intake for uploaded media, remote URLs, music beds, Vimeo episodes, guests, weather cities, data plates and reusable graphics before anything reaches air. Uploaded ads/promos and guest media play through the public app media proxy even when Supabase storage is local.',
        href: '/admin/prepare',
    },
    {
        title: 'Guests',
        icon: Clapperboard,
        body: 'Create guest records with URL or uploaded photo/video media, then build one Guest Lineup plate per show segment or guest group.',
        href: '/admin/guests',
    },
    {
        title: 'Program',
        icon: CalendarDays,
        body: 'Build a broadcast day as a timed rundown. Program owns Calendar, Schedule, Loop Builder, fallback policy and schedule health.',
        href: '/admin/program',
    },
    {
        title: 'Runbook',
        icon: ListChecks,
        body: 'Give operators a repeatable checklist for preflight, live operation, incident response and shutdown.',
        href: '/admin/runbook',
    },
    {
        title: 'Operate',
        icon: RadioTower,
        body: 'Live control-room hub for Output, health, runbook, audit, current block, next block, fallback state and recovery actions.',
        href: '/admin/operate',
    },
    {
        title: 'Preview',
        icon: Clapperboard,
        body: 'Check Vimeo, HLS, MP4, images, audio-backed slides and fallback behavior before a block becomes part of the active day.',
        href: '/admin/calendar',
    },
    {
        title: 'Health',
        icon: HeartPulse,
        body: 'Confirm environment, Supabase, storage, Vimeo, Reuters, output token, schema and Go Live Drill readiness from one screen.',
        href: '/admin/health',
    },
];

const operatorHubs = [
    {
        name: 'Prepare',
        href: '/admin/prepare',
        promise: 'Create and review content before it reaches a day.',
        items: ['Assets', 'Vimeo', 'Music', 'Guests', 'Weather', 'Data plates'],
    },
    {
        name: 'Program',
        href: '/admin/program',
        promise: 'Build the daily signal and define what protects it.',
        items: ['Calendar', 'Schedule', 'Loop Builder', 'Fallback', 'Health'],
    },
    {
        name: 'Operate',
        href: '/admin/operate',
        promise: 'Run the live signal and recover from problems fast.',
        items: ['Output', 'Audio unlock', 'Runbook', 'Health', 'Audit'],
    },
];

const limits = [
    'Production app is live and usable with an operator present.',
    'Browser output has been confirmed through web player, vMix and OBS.',
    'Uploaded ads/promos use the public app proxy; older 127.0.0.1 asset URLs were backfilled.',
    'Guest lineup plates now use operator-configured guests, uploaded/remote photos and short muted videos.',
    'Prepare, Program and Operate hubs reduce the visible operator path while keeping direct routes available.',
    'Loop Builder can create scheduled slide loops, set the global visual fallback carousel, or do both.',
    'Weather plates can be created per city from the admin graphics surface.',
    'Metals use Roxom API data when available; weather falls back to Open-Meteo when OpenWeather is not configured.',
    'Calendar/event plates use the Supabase events table from the latest migration/bootstrap SQL.',
    'Previously Recorded bugs apply only to normal video program blocks, not ads, promos, slides, images, fallbacks, Reuters or manual overrides.',
    'The final broadcast plate design still needs a visual remodel.',
    'OpenNext/Cloudflare Workers is configured as an alternate deploy path but still needs a real Workers smoke before becoming primary.',
    'Browser audio requires one operator click after load or reload.',
    'Reuters endpoints are dynamic; refresh expired URLs before or during air.',
    'Fallback assets are required for reliable unattended operation.',
    'Secrets must stay in environment variables or encrypted settings.',
];

const recentUpdates = [
    'Browser output was confirmed in the web player, vMix and OBS.',
    'Schedule now highlights the block that was just created.',
    'Calendar blocks show start/end ranges and a readable duration chip.',
    'Gaps show their full time range so operators can fill the right window faster.',
    'Admin navigation is now grouped around Prepare, Program and Operate.',
    'Loop Builder separates scheduled loops from fallback-only carousel updates.',
    'Local Supabase media uploads now play publicly through /api/media/assets/:assetId.',
    'Deploy/read-only smoke scripts now persist the latest smoke result for health checks.',
    'Guest lineup plates can now be individualized per slide from /admin/guests.',
    'Metals plates now use the Roxom metals API for gold and silver with Pyth fallback.',
    'Weather plates now have a no-key Open-Meteo fallback.',
    'Calendar/event plates now use a persisted events table.',
    'Normal video programs can show a four-corner Previously Recorded bug in browser output.',
    'The US debt plate no longer depends on a missing background asset.',
    'Supabase bootstrap SQL is available for setting up a fresh backend.',
    'A standalone guest lineup SQL migration is available at /manual/guest-lineup-migration.sql.',
    'OpenNext/Cloudflare Workers deploy scripts are configured for alternate production validation.',
];

export default function ManualPage() {
    return (
        <main className="min-h-screen bg-surface-elevated-1 text-white/90">
            <div className="mx-auto max-w-5xl px-6 py-10">
                <header className="border-b border-white/10 pb-8">
                    <Link
                        href="/"
                        className="text-sm font-semibold text-accent-positive hover:underline"
                    >
                        Back to home
                    </Link>
                    <p className="eyebrow mt-6 text-accent-positive">Roxom TV</p>
                    <h1 className="mt-3 text-4xl font-semibold tracking-normal md:text-5xl">
                        Operator Manual
                    </h1>
                    <p className="mt-4 max-w-3xl text-base leading-7 text-white/65">
                        RTV Planner is the control room for Roxom TV: build the schedule, protect
                        every block with fallbacks, run preflight and send a browser-based signal
                        into OBS or vMix. This page is public; admin actions still require login.
                    </p>
                </header>

                <section className="grid gap-3 border-b border-white/10 py-6 md:grid-cols-4">
                    <ManualMetric label="Status" value="Production live" />
                    <ManualMetric label="Workflow" value="Prepare -> Program -> Operate" />
                    <ManualMetric label="Output" value="Browser playout" />
                    <ManualMetric label="Backend" value="Supabase" />
                </section>

                <section className="border-b border-white/10 py-5">
                    <div className="flex flex-wrap gap-2">
                        <Link className="btn-secondary" href="/admin/prepare">
                            Prepare
                        </Link>
                        <Link className="btn-secondary" href="/admin/program">
                            Program
                        </Link>
                        <Link className="btn-secondary" href="/admin/operate">
                            Operate
                        </Link>
                        <Link className="btn-secondary" href="/pending">
                            Pending
                        </Link>
                        <Link className="btn-secondary" href="/notion">
                            Status
                        </Link>
                    </div>
                </section>

                <section className="border-b border-white/10 py-8">
                    <div className="flex items-center gap-3">
                        <RadioTower size={22} className="text-accent-positive" aria-hidden="true" />
                        <h2 className="text-2xl font-semibold">Operator Map</h2>
                    </div>
                    <div className="mt-5 grid gap-4 md:grid-cols-3">
                        {operatorHubs.map((hub, index) => (
                            <Link
                                key={hub.name}
                                href={hub.href}
                                className="group flex min-h-[16rem] flex-col justify-between border border-white/10 bg-surface-elevated-2 p-5 transition hover:-translate-y-0.5 hover:border-accent-positive hover:bg-surface-selected-positive"
                            >
                                <span>
                                    <span className="grid h-9 w-9 place-items-center rounded-md bg-accent-positive text-sm font-bold text-surface-elevated-1">
                                        {index + 1}
                                    </span>
                                    <span className="mt-4 block text-2xl font-semibold">
                                        {hub.name}
                                    </span>
                                    <span className="mt-2 block text-sm leading-6 text-white/65">
                                        {hub.promise}
                                    </span>
                                    <span className="mt-4 flex flex-wrap gap-2">
                                        {hub.items.map((item) => (
                                            <span
                                                key={item}
                                                className="rounded-md border border-white/10 bg-black/20 px-2 py-1 text-xs font-semibold text-white/60"
                                            >
                                                {item}
                                            </span>
                                        ))}
                                    </span>
                                </span>
                                <span className="mt-5 text-sm font-semibold text-accent-positive group-hover:underline">
                                    Open {hub.name}
                                </span>
                            </Link>
                        ))}
                    </div>
                </section>

                <section className="border-b border-white/10 py-8">
                    <h2 className="text-2xl font-semibold">Latest Updates</h2>
                    <div className="mt-5 grid gap-3 md:grid-cols-2">
                        {recentUpdates.map((item) => (
                            <div
                                key={item}
                                className="surface-panel p-4 text-sm leading-6 text-white/72"
                            >
                                {item}
                            </div>
                        ))}
                    </div>
                </section>

                <section className="py-8">
                    <div className="flex items-center gap-3">
                        <BookOpen size={22} className="text-accent-positive" aria-hidden="true" />
                        <h2 className="text-2xl font-semibold">Go Live Workflow</h2>
                    </div>
                    <ol className="mt-5 grid gap-3 md:grid-cols-2">
                        {workflowSteps.map((step, index) => (
                            <li key={step} className="surface-panel flex gap-3 p-4">
                                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-md bg-accent-positive text-sm font-bold text-surface-elevated-1">
                                    {index + 1}
                                </span>
                                <span className="text-sm leading-6 text-white/75">{step}</span>
                            </li>
                        ))}
                    </ol>
                </section>

                <section className="py-8">
                    <h2 className="text-2xl font-semibold">Core Surfaces</h2>
                    <div className="mt-5 grid gap-4 md:grid-cols-2">
                        {sections.map((section) => (
                            <article key={section.title} className="surface-panel p-5">
                                <div className="flex items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <section.icon
                                            size={22}
                                            className="text-accent-positive"
                                            aria-hidden="true"
                                        />
                                        <h3 className="text-xl font-semibold">{section.title}</h3>
                                    </div>
                                    <Link
                                        className="btn-secondary min-h-9 text-xs"
                                        href={section.href}
                                    >
                                        Open
                                    </Link>
                                </div>
                                <p className="mt-4 text-sm leading-6 text-white/70">
                                    {section.body}
                                </p>
                            </article>
                        ))}
                    </div>
                </section>

                <section className="mt-8 rounded-lg border border-white/10 bg-surface-elevated-2 p-5">
                    <div className="flex items-center gap-3">
                        <Shield size={22} className="text-accent-positive" aria-hidden="true" />
                        <h2 className="text-xl font-semibold">Current Limits</h2>
                    </div>
                    <ul className="mt-4 grid gap-2 text-sm leading-6 text-white/70">
                        {limits.map((limit) => (
                            <li key={limit}>{limit}</li>
                        ))}
                    </ul>
                </section>
            </div>
        </main>
    );
}

function ManualMetric({ label, value }: { label: string; value: string }) {
    return (
        <div className="rounded-lg border border-white/10 bg-surface-elevated-2 p-4">
            <p className="text-xs font-semibold uppercase text-white/45">{label}</p>
            <p className="mt-2 text-lg font-semibold">{value}</p>
        </div>
    );
}
