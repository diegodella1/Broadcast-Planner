import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { NowLine } from './now-line';

describe('NowLine', () => {
    it('renders with the provided label text', () => {
        render(<NowLine label="Now" />);
        expect(screen.getByText('Now')).toBeInTheDocument();
    });

    it("sets role='separator' on the root element", () => {
        render(<NowLine label="Now" />);
        expect(screen.getByRole('separator')).toBeInTheDocument();
    });

    it('sets aria-label on the root element matching the label prop', () => {
        render(<NowLine label="En vivo" />);
        const separator = screen.getByRole('separator');
        expect(separator).toHaveAttribute('aria-label', 'En vivo');
    });

    it("sets aria-live='polite' on the root element", () => {
        render(<NowLine label="Now" />);
        const separator = screen.getByRole('separator');
        expect(separator).toHaveAttribute('aria-live', 'polite');
    });

    it('renders the spacer div for time-label column alignment', () => {
        const { container } = render(<NowLine label="Now" />);
        const spacer = container.querySelector('.w-\\[60px\\]');
        expect(spacer).toBeInTheDocument();
    });

    it('renders the live dot with accent-live background class', () => {
        const { container } = render(<NowLine label="Now" />);
        const dot = container.querySelector('.bg-accent-live.rounded-full');
        expect(dot).toBeInTheDocument();
    });

    it('renders the accent-live line', () => {
        const { container } = render(<NowLine label="Now" />);
        const line = container.querySelector('.h-px.flex-1.bg-accent-live');
        expect(line).toBeInTheDocument();
    });

    it('renders the label with accent-live text color', () => {
        render(<NowLine label="LIVE" />);
        const label = screen.getByText('LIVE');
        expect(label.className).toContain('text-accent-live');
    });
});
