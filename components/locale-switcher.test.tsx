import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi, beforeEach } from 'vitest';

import { LocaleSwitcher } from './locale-switcher';

const mockPush = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
    useRouter: () => ({ push: mockPush, refresh: mockRefresh }),
}));

// next-intl's useLocale — start with "en" as current locale
let mockLocale = 'en';
vi.mock('next-intl', () => ({
    useLocale: () => mockLocale,
}));

beforeEach(() => {
    mockLocale = 'en';
    mockPush.mockReset();
    mockRefresh.mockReset();
});

describe('LocaleSwitcher', () => {
    it('renders a button for each supported locale (en and es)', () => {
        render(<LocaleSwitcher />);
        expect(screen.getByRole('button', { name: /en/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /es/i })).toBeInTheDocument();
    });

    it("marks the active locale button with aria-pressed='true'", () => {
        render(<LocaleSwitcher />);
        expect(screen.getByRole('button', { name: /en/i })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: /es/i })).toHaveAttribute(
            'aria-pressed',
            'false',
        );
    });

    it('marks es button as active when current locale is es', () => {
        mockLocale = 'es';
        render(<LocaleSwitcher />);
        expect(screen.getByRole('button', { name: /es/i })).toHaveAttribute('aria-pressed', 'true');
        expect(screen.getByRole('button', { name: /en/i })).toHaveAttribute(
            'aria-pressed',
            'false',
        );
    });

    it("has a group container with aria-label='Language'", () => {
        render(<LocaleSwitcher />);
        expect(screen.getByRole('group', { name: 'Language' })).toBeInTheDocument();
    });

    it('calls router.refresh after switching locale', async () => {
        const user = userEvent.setup();
        render(<LocaleSwitcher />);
        await user.click(screen.getByRole('button', { name: /es/i }));
        expect(mockRefresh).toHaveBeenCalledOnce();
    });

    it('writes NEXT_LOCALE cookie when switching locale', async () => {
        // jsdom defines the cookie accessor on Document.prototype, not on the
        // document instance — spy on the prototype setter to observe writes.
        const protoDescriptor = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
        const cookieWritten: string[] = [];
        // protoDescriptor is always defined in jsdom — assert to satisfy exactOptionalPropertyTypes
        const desc = protoDescriptor!;
        const originalSet = desc.set;

        Object.defineProperty(Document.prototype, 'cookie', {
            configurable: true,

            get:
                desc.get ??
                (function (this: Document) {
                    return '';
                } as () => string),
            set(value: string) {
                cookieWritten.push(value);
                originalSet?.call(this, value);
            },
        });

        try {
            const user = userEvent.setup();
            render(<LocaleSwitcher />);
            await user.click(screen.getByRole('button', { name: /es/i }));
            expect(cookieWritten.some((c) => c.startsWith('NEXT_LOCALE=es'))).toBe(true);
        } finally {
            // Restore the original descriptor so other tests are unaffected
            Object.defineProperty(Document.prototype, 'cookie', protoDescriptor!);
        }
    });

    it('does not call router.refresh when clicking the already-active locale', async () => {
        const user = userEvent.setup();
        render(<LocaleSwitcher />);
        await user.click(screen.getByRole('button', { name: /en/i }));
        expect(mockRefresh).not.toHaveBeenCalled();
    });
});
