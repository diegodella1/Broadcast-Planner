'use client';

import {
    CalendarDays,
    ChevronDown,
    HeartPulse,
    LayoutDashboard,
    MonitorPlay,
    Music,
    PackageOpen,
    RadioTower,
    Video,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

import type { LucideIcon } from 'lucide-react';

type NavItem = {
    label: string;
    href: string;
    icon: LucideIcon;
    match?: 'exact';
    activePaths?: string[];
};

type NavGroup = {
    label: string;
    items: NavItem[];
};

export const navGroups: NavGroup[] = [
    {
        label: 'Workspace',
        items: [
            { label: 'Cockpit', href: '/admin', icon: LayoutDashboard, match: 'exact' },
            {
                label: 'Prepare',
                href: '/admin/prepare',
                icon: PackageOpen,
                activePaths: ['/admin/assets', '/admin/slides', '/admin/guests', '/admin/music'],
            },
            {
                label: 'Program',
                href: '/admin/program',
                icon: CalendarDays,
                activePaths: ['/admin/calendar', '/admin/schedule'],
            },
            {
                label: 'Operate',
                href: '/admin/operate',
                icon: RadioTower,
                activePaths: ['/admin/output', '/admin/health', '/admin/runbook', '/admin/audit'],
            },
        ],
    },
    {
        label: 'Systems',
        items: [
            { label: 'Output', href: '/admin/output', icon: MonitorPlay },
            { label: 'Music', href: '/admin/music', icon: Music },
            { label: 'Library', href: '/admin/assets', icon: Video },
            { label: 'Health', href: '/admin/health', icon: HeartPulse },
        ],
    },
];

export function AdminNav({ mobile = false }: { mobile?: boolean }) {
    const pathname = usePathname();
    const activeHref = findActiveHref(pathname);

    const links = mobile ? navGroups.flatMap((group) => group.items) : null;

    if (mobile) {
        const activeItem = links!.find(({ href }) => href === activeHref);

        return (
            <nav className="relative lg:hidden" aria-label="Admin sections">
                <details className="group">
                    <summary className="flex min-h-10 cursor-pointer list-none items-center gap-2 rounded border border-line bg-surface-elevated-2 px-3 text-sm font-semibold text-ink marker:hidden">
                        {activeItem ? <activeItem.icon size={16} aria-hidden="true" /> : null}
                        <span>{activeItem?.label ?? 'Navigation'}</span>
                        <ChevronDown
                            size={15}
                            aria-hidden="true"
                            className="ml-auto transition-transform group-open:rotate-180"
                        />
                    </summary>
                    <div className="absolute right-0 top-12 z-50 grid w-72 gap-4 rounded border border-line-strong bg-surface-elevated-2 p-3 shadow-2xl">
                        {navGroups.map((group) => (
                            <section key={group.label}>
                                <p className="technical-label px-2 text-muted">{group.label}</p>
                                <div className="mt-1 grid gap-1">
                                    {group.items.map(({ label, href, icon: Icon }) => {
                                        const active = href === activeHref;

                                        return (
                                            <Link
                                                key={href}
                                                href={href}
                                                aria-current={active ? 'page' : undefined}
                                                className={[
                                                    'flex min-h-10 items-center gap-3 rounded px-3 text-sm font-semibold',
                                                    active
                                                        ? 'bg-surface-selected-positive text-accent-positive'
                                                        : 'text-muted hover:bg-panel-soft hover:text-ink',
                                                ].join(' ')}
                                            >
                                                <Icon size={17} aria-hidden="true" />
                                                {label}
                                            </Link>
                                        );
                                    })}
                                </div>
                            </section>
                        ))}
                    </div>
                </details>
            </nav>
        );
    }

    return (
        <nav className="mt-7 grid gap-5" aria-label="Admin sections">
            {navGroups.map((group) => (
                <section key={group.label}>
                    <p className="technical-label px-3 text-muted">{group.label}</p>
                    <div className="mt-2 grid gap-1">
                        {group.items.map(({ label, href, icon: Icon }) => {
                            const active = href === activeHref;

                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    aria-current={active ? 'page' : undefined}
                                    className={[
                                        'flex min-h-10 items-center gap-3 rounded px-3 text-sm font-semibold',
                                        active
                                            ? 'border-l-2 border-accent-positive bg-surface-selected-positive text-accent-positive'
                                            : 'border-l-2 border-transparent text-muted hover:bg-panel-soft hover:text-ink',
                                    ].join(' ')}
                                >
                                    <Icon size={17} aria-hidden="true" />
                                    <span>{label}</span>
                                </Link>
                            );
                        })}
                    </div>
                </section>
            ))}
        </nav>
    );
}

function findActiveHref(pathname: string): string | null {
    for (const group of navGroups) {
        for (const item of group.items) {
            if (pathname === item.href.split('?')[0]) {
                return item.href;
            }
        }
    }

    for (const group of navGroups) {
        for (const item of group.items) {
            if (
                item.activePaths?.some(
                    (path) => pathname === path || pathname.startsWith(`${path}/`),
                )
            ) {
                return item.href;
            }
        }
    }

    for (const group of navGroups) {
        for (const item of group.items) {
            if (item.match === 'exact') {
                continue;
            }
            const basePath = item.href.split('?')[0]!;

            if (pathname.startsWith(`${basePath}/`)) {
                return item.href;
            }
        }
    }

    return null;
}
