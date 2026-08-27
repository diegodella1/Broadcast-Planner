import clsx from 'clsx';
import { ArrowRight } from 'lucide-react';
import Link from 'next/link';

import { ClearStateBadge } from '@/components/ui';

import type { LucideIcon } from 'lucide-react';
import type { ReactNode } from 'react';

type FlowTone = 'prepare' | 'program' | 'operate' | 'neutral' | 'warn';

export function FlowHero({
    eyebrow,
    title,
    detail,
    children,
}: {
    eyebrow: string;
    title: string;
    detail: ReactNode;
    children?: ReactNode;
}) {
    return (
        <section className="mb-4 border border-line bg-surface-elevated-2 p-4">
            <div className="flex flex-wrap items-end justify-between gap-4">
                <div className="max-w-4xl">
                    <p className="eyebrow text-accent-positive">{eyebrow}</p>
                    <h2 className="mt-2 font-display text-2xl font-semibold tracking-tight md:text-3xl">
                        {title}
                    </h2>
                    <div className="mt-2 text-sm leading-6 text-muted">{detail}</div>
                </div>
                {children ? (
                    <div className="flex min-w-0 flex-wrap items-center gap-2">{children}</div>
                ) : null}
            </div>
        </section>
    );
}

export function FlowGrid({ children }: { children: ReactNode }) {
    return (
        <section className="grid gap-px overflow-hidden border border-line bg-line xl:grid-cols-3">
            {children}
        </section>
    );
}

export function FlowCard({
    href,
    icon: Icon,
    label,
    title,
    detail,
    tone = 'neutral',
    badge,
}: {
    href: string;
    icon: LucideIcon;
    label: string;
    title: string;
    detail: ReactNode;
    tone?: FlowTone;
    badge?: string;
}) {
    return (
        <Link
            href={href}
            className={clsx(
                'group flex min-h-[11rem] flex-col justify-between border-0 bg-surface p-4 transition-colors hover:bg-surface-elevated-2',
                toneClass(tone),
            )}
        >
            <span>
                <span className="flex items-center justify-between gap-3">
                    <span className="inline-flex h-9 w-9 items-center justify-center rounded border border-line bg-panel text-muted group-hover:border-accent-positive group-hover:text-accent-positive">
                        <Icon size={19} aria-hidden="true" />
                    </span>
                    {badge ? (
                        <ClearStateBadge tone={tone === 'warn' ? 'warn' : 'info'}>
                            {badge}
                        </ClearStateBadge>
                    ) : null}
                </span>
                <span className="technical-label mt-4 block text-muted">{label}</span>
                <span className="mt-2 block font-display text-xl font-semibold text-ink">
                    {title}
                </span>
                <span className="mt-2 block text-sm leading-6 text-muted">{detail}</span>
            </span>
            <span className="mt-5 inline-flex items-center gap-2 text-sm font-semibold text-accent-positive">
                Open
                <ArrowRight
                    size={15}
                    aria-hidden="true"
                    className="transition group-hover:translate-x-0.5"
                />
            </span>
        </Link>
    );
}

export function FlowRail({
    title,
    items,
}: {
    title: string;
    items: Array<{ label: string; value: string; tone?: 'ok' | 'warn' | 'danger' | 'neutral' }>;
}) {
    return (
        <section className="surface-panel p-4">
            <h2 className="font-semibold">{title}</h2>
            <div className="mt-4 grid gap-2">
                {items.map((item) => (
                    <div
                        key={item.label}
                        className="flex min-h-12 items-center justify-between gap-3 border-b border-line bg-surface px-3 py-2 text-sm last:border-b-0"
                    >
                        <span className="font-semibold text-muted">{item.label}</span>
                        <span
                            className={clsx(
                                'truncate font-semibold',
                                railTone(item.tone ?? 'neutral'),
                            )}
                        >
                            {item.value}
                        </span>
                    </div>
                ))}
            </div>
        </section>
    );
}

function toneClass(tone: FlowTone) {
    switch (tone) {
        case 'prepare':
            return 'border-info-line bg-info-soft';
        case 'program':
            return 'border-info-line bg-info-soft';
        case 'operate':
            return 'border-line bg-surface';
        case 'warn':
            return 'border-warn-line bg-warn-soft';
        default:
            return 'border-line bg-surface';
    }
}

function railTone(tone: 'ok' | 'warn' | 'danger' | 'neutral') {
    switch (tone) {
        case 'ok':
            return 'text-success';
        case 'warn':
            return 'text-warn';
        case 'danger':
            return 'text-danger';
        default:
            return 'text-ink';
    }
}
