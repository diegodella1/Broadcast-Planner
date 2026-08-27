import type { Metadata } from 'next';
import { Hanken_Grotesk, Inter, JetBrains_Mono } from 'next/font/google';
import { NextIntlClientProvider } from 'next-intl';
import { getLocale, getMessages } from 'next-intl/server';
import { PRODUCT_DESCRIPTION, PRODUCT_NAME } from '@/lib/brand';
import './globals.css';

const hanken = Hanken_Grotesk({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    display: 'swap',
    variable: '--font-hanken',
});

const inter = Inter({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    display: 'swap',
    variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ['latin'],
    weight: ['400', '500', '600', '700'],
    display: 'swap',
    variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
    title: {
        default: PRODUCT_NAME,
        template: `%s · ${PRODUCT_NAME}`,
    },
    description: PRODUCT_DESCRIPTION,
    applicationName: PRODUCT_NAME,
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
    const locale = await getLocale();
    const messages = await getMessages();

    return (
        <html
            lang={locale}
            className={`${hanken.variable} ${inter.variable} ${jetbrainsMono.variable}`}
        >
            <body>
                <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
            </body>
        </html>
    );
}
