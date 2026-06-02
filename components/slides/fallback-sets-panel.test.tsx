import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { FallbackSetsPanel } from './fallback-sets-panel';

import type { FallbackCarousel } from '@/lib/fallback-carousel';
import type { SlideAsset } from '@/lib/types';

const slides: SlideAsset[] = [slide('slide-1', 'Markets'), slide('slide-2', 'Weather')];

const carousel: FallbackCarousel = {
    enabled: true,
    activeSetId: 'set-1',
    cards: [{ kind: 'slide', id: 'slide-2', slideId: 'slide-2', durationSeconds: 30 }],
    sets: [
        {
            id: 'set-1',
            name: 'Main loop',
            cards: [{ kind: 'slide', id: 'slide-2', slideId: 'slide-2', durationSeconds: 30 }],
            createdAt: '2026-06-01T00:00:00.000Z',
            updatedAt: '2026-06-01T00:00:00.000Z',
        },
    ],
    updatedAt: '2026-06-01T00:00:00.000Z',
};

describe('FallbackSetsPanel', () => {
    it('allows adding the same slide multiple times to one loop', () => {
        const { container } = render(
            <FallbackSetsPanel
                slides={slides}
                assets={[]}
                carousel={carousel}
                saveSet={vi.fn()}
                activateSet={vi.fn()}
                deleteSet={vi.fn()}
            />,
        );

        const addMarkets = screen.getByRole('button', {
            name: 'Add Markets to fallback loop',
        });
        fireEvent.click(addMarkets);
        fireEvent.click(addMarkets);

        const slideInputs = container.querySelectorAll('input[name="item_ids"][value="slide-1"]');

        expect(slideInputs).toHaveLength(2);
        expect(screen.getByText(/2x in loop/i)).toBeInTheDocument();
    });

    it('removes only the selected duplicate instance from loop order', () => {
        const { container } = render(
            <FallbackSetsPanel
                slides={slides}
                assets={[]}
                carousel={carousel}
                saveSet={vi.fn()}
                activateSet={vi.fn()}
                deleteSet={vi.fn()}
            />,
        );

        const addMarkets = screen.getByRole('button', {
            name: 'Add Markets to fallback loop',
        });
        fireEvent.click(addMarkets);
        fireEvent.click(addMarkets);
        const removeButtons = screen.getAllByRole('button', {
            name: 'Remove item from fallback set',
        });
        fireEvent.click(removeButtons[1]!);

        const slideInputs = container.querySelectorAll('input[name="item_ids"][value="slide-1"]');

        expect(slideInputs).toHaveLength(1);
        expect(screen.queryByText(/2x in loop/i)).not.toBeInTheDocument();
    });
});

function slide(id: string, title: string): SlideAsset {
    return {
        id,
        title,
        slideType: 'template',
        templateId: title.toLowerCase(),
        defaultDurationSeconds: 30,
        status: 'ready',
        createdAt: '2026-06-01T00:00:00.000Z',
        updatedAt: '2026-06-01T00:00:00.000Z',
    };
}
