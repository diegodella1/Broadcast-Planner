import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { renderWithIntl } from '@/vitest.intl-helper';

import { OperationsPanelOnAir } from './on-air';

import type { UseActiveBlockResult } from '@/app/hooks/use-active-block';

vi.mock('@/app/hooks/use-active-block', () => ({
    useActiveBlock: vi.fn(),
}));

import { useActiveBlock } from '@/app/hooks/use-active-block';

const mockUseActiveBlock = vi.mocked(useActiveBlock);

function makeSnapshot(
    overrides?: Partial<NonNullable<UseActiveBlockResult['data']>['active']>,
): UseActiveBlockResult {
    return {
        data: {
            active: {
                blockId: 'block-1',
                blockTitle: 'Morning Markets',
                blockCategory: 'mercados',
                startsAt: 36000,
                durationSeconds: 3600,
                elapsedInBlock: 1800,
                ...overrides,
            },
            dayStatus: 'active',
        },
        error: null,
        isLoading: false,
    };
}

function makeNoActiveSnapshot(): UseActiveBlockResult {
    return {
        data: { active: null, dayStatus: 'ready' },
        error: null,
        isLoading: false,
    };
}

beforeEach(() => {
    mockUseActiveBlock.mockReset();
});

describe('OperationsPanelOnAir', () => {
    it('renders empty state text when there is no active block', () => {
        mockUseActiveBlock.mockReturnValue(makeNoActiveSnapshot());
        render(renderWithIntl(<OperationsPanelOnAir />));
        // en.json schedule.noActiveBlock = "No active block"
        expect(screen.getByText('No active block')).toBeInTheDocument();
    });

    it("has aria-live='polite' on the container when no active block", () => {
        mockUseActiveBlock.mockReturnValue(makeNoActiveSnapshot());
        const { container } = render(renderWithIntl(<OperationsPanelOnAir />));
        expect(container.firstElementChild).toHaveAttribute('aria-live', 'polite');
    });

    it("has aria-live='polite' on the container when an active block is present", () => {
        mockUseActiveBlock.mockReturnValue(makeSnapshot());
        const { container } = render(renderWithIntl(<OperationsPanelOnAir />));
        expect(container.firstElementChild).toHaveAttribute('aria-live', 'polite');
    });

    it('renders the block title when a block is active', () => {
        mockUseActiveBlock.mockReturnValue(makeSnapshot());
        render(renderWithIntl(<OperationsPanelOnAir />));
        expect(screen.getByText('Morning Markets')).toBeInTheDocument();
    });

    it('renders a BlockBadge with the block category label', () => {
        mockUseActiveBlock.mockReturnValue(makeSnapshot());
        render(renderWithIntl(<OperationsPanelOnAir />));
        // en.json block.category.mercados = "Markets"
        expect(screen.getByRole('status', { name: 'Markets' })).toBeInTheDocument();
    });

    it('renders a progress bar with correct aria-valuenow percentage', () => {
        // elapsedInBlock: 1800, durationSeconds: 3600 => 50%
        mockUseActiveBlock.mockReturnValue(
            makeSnapshot({ elapsedInBlock: 1800, durationSeconds: 3600 }),
        );
        render(renderWithIntl(<OperationsPanelOnAir />));
        const progressbar = screen.getByRole('progressbar');
        expect(progressbar).toHaveAttribute('aria-valuenow', '50');
        expect(progressbar).toHaveAttribute('aria-valuemin', '0');
        expect(progressbar).toHaveAttribute('aria-valuemax', '100');
    });

    it('clamps progress bar to 100% when elapsed exceeds duration', () => {
        mockUseActiveBlock.mockReturnValue(
            makeSnapshot({ elapsedInBlock: 5000, durationSeconds: 3600 }),
        );
        render(renderWithIntl(<OperationsPanelOnAir />));
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
    });

    it('renders 0% progress when elapsed is 0', () => {
        mockUseActiveBlock.mockReturnValue(
            makeSnapshot({ elapsedInBlock: 0, durationSeconds: 3600 }),
        );
        render(renderWithIntl(<OperationsPanelOnAir />));
        expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '0');
    });

    it('renders elapsed and total duration timecodes', () => {
        // elapsedInBlock: 90 => 00:01:30, durationSeconds: 3600 => 01:00:00
        mockUseActiveBlock.mockReturnValue(
            makeSnapshot({ elapsedInBlock: 90, durationSeconds: 3600 }),
        );
        render(renderWithIntl(<OperationsPanelOnAir />));
        expect(screen.getByText('00:01:30')).toBeInTheDocument();
        expect(screen.getByText('01:00:00')).toBeInTheDocument();
    });

    it('does not render a progress bar when there is no active block', () => {
        mockUseActiveBlock.mockReturnValue(makeNoActiveSnapshot());
        render(renderWithIntl(<OperationsPanelOnAir />));
        expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
    });
});
