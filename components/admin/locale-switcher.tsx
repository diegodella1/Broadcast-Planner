'use client';

import clsx from 'clsx';
import { useRouter } from 'next/navigation';
import { useLocale } from 'next-intl';

import { locales, type Locale } from '@/i18n';

export function LocaleSwitcher() {
    const current = useLocale() as Locale;
    const router = useRouter();

    function switchTo(next: Locale) {
        if (next === current) {
            return;
        }
        // Browser cookie setter; not a React-controlled value.
        // eslint-disable-next-line react-hooks/immutability
        document.cookie = `NEXT_LOCALE=${next}; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax`;
        router.refresh();
    }

    return (
        <div
            role="group"
            aria-label="Language"
            className="inline-flex items-center gap-0.5 rounded-md bg-surface-elevated-2 p-0.5"
        >
            {locales.map((loc) => {
                const active = loc === current;

                return (
                    <button
                        key={loc}
                        type="button"
                        onClick={() => switchTo(loc)}
                        aria-pressed={active}
                        className={clsx(
                            'rounded px-2 py-1 text-xs font-medium uppercase tracking-wide transition-colors',
                            'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-accent-positive',
                            active
                                ? 'bg-surface-selected-positive text-accent-positive'
                                : 'text-white/60 hover:text-white/90',
                        )}
                    >
                        {loc}
                    </button>
                );
            })}
        </div>
    );
}
