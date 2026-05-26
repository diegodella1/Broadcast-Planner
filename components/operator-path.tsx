'use client';

import { CheckCircle2, FolderOpen, MonitorPlay, Rows3 } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const steps = [
    {
        label: 'Library',
        detail: 'Add & verify content',
        href: '/admin/assets',
        icon: FolderOpen,
        match: ['/admin/assets', '/admin/vimeo', '/admin/slides', '/admin/music'],
    },
    {
        label: 'Schedule',
        detail: 'Put it on the day',
        href: '/admin/calendar',
        icon: Rows3,
        match: ['/admin/calendar', '/admin/schedule'],
    },
    {
        label: 'Browser Output',
        detail: 'Open capture page',
        href: '/admin/output',
        icon: MonitorPlay,
        match: ['/admin/output'],
    },
];

export function OperatorPath() {
    const pathname = usePathname();

    return (
        <nav
            className="grid gap-2 border-b border-line bg-panel-soft px-4 py-3 md:grid-cols-3 md:px-6"
            aria-label="Operator path"
        >
            {steps.map((step, index) => {
                const active = step.match.some(
                    (match) => pathname === match || pathname.startsWith(match),
                );
                const complete = step.match.some((match) => pathname.startsWith(match)) && !active;
                const Icon = step.icon;

                return (
                    <Link
                        key={step.href}
                        href={step.href}
                        aria-current={active ? 'step' : undefined}
                        className={[
                            'group flex min-w-0 items-center gap-3 rounded-md border px-3 py-2 text-sm',
                            active
                                ? 'border-accent-positive bg-surface-selected-positive text-accent-positive'
                                : 'border-line bg-surface text-muted hover:border-line-strong hover:text-ink',
                        ].join(' ')}
                    >
                        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-current/20">
                            {complete ? (
                                <CheckCircle2 size={16} aria-hidden="true" />
                            ) : (
                                <Icon size={16} aria-hidden="true" />
                            )}
                        </span>
                        <span className="min-w-0">
                            <span className="block truncate font-semibold">
                                {index + 1}. {step.label}
                            </span>
                            <span className="block truncate text-xs opacity-75">{step.detail}</span>
                        </span>
                    </Link>
                );
            })}
        </nav>
    );
}
