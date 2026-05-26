import clsx from 'clsx';
import type { BlockCategory } from '@/lib/types';

type Props = {
    category: BlockCategory;
    label: string;
    size?: 'sm' | 'md';
    className?: string;
};

type TokenPair = { bg: string; text: string };

function categoryTokens(category: BlockCategory): TokenPair {
    switch (category) {
        case 'mercados':
            return { bg: 'bg-info-blue/10', text: 'text-info-blue' };
        case 'earthcam':
            return { bg: 'bg-accent-positive/10', text: 'text-accent-positive' };
        case 'clima':
            return { bg: 'bg-warn-amber/10', text: 'text-warn-amber' };
        case 'calendario':
            return { bg: 'bg-warn-amber/10', text: 'text-warn-amber' };
        case 'trending':
            return { bg: 'bg-accent-positive/10', text: 'text-accent-positive' };
        case 'deuda':
            return { bg: 'bg-info-violet/10', text: 'text-info-violet' };
        case 'reuters':
            return { bg: 'bg-negative-red/10', text: 'text-negative-red' };
        case 'broadcast':
            return { bg: 'bg-negative-red/10', text: 'text-negative-red' };
    }
}

export function BlockBadge({ category, label, size = 'sm', className }: Props) {
    const { bg, text } = categoryTokens(category);

    return (
        <span
            className={clsx(
                'inline-flex w-fit items-center font-semibold uppercase tracking-wide rounded-sm',
                bg,
                text,
                size === 'sm' && 'text-[10px] px-1.5 py-0.5',
                size === 'md' && 'text-xs px-2 py-1',
                className,
            )}
            aria-label={label}
            role="status"
        >
            {label}
        </span>
    );
}
