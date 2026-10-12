import type { JSX, ReactNode } from 'react';
import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';

import { pageMetadata, SITE_NAME, SITE_ORIGIN } from '@/metadata';

import './global.css';

const rounded = Nunito({
    subsets: ['latin'],
    variable: '--font-rounded',
    display: 'swap',
});
export const metadata: Metadata = {
    ...pageMetadata(
        SITE_NAME,
        '不用背指令，自然地說出需求。認識 Discord 裡的迷你西米露，透過示範對話探索聊天、檔案、校園與開發功能。',
        '/'
    ),
    metadataBase: new URL(SITE_ORIGIN),
    applicationName: SITE_NAME,
    robots: { index: true, follow: true },
    icons: { icon: '/images/minisago3.png' },
};

interface RootLayoutProps {
    readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
    return (
        <html
            className={rounded.variable}
            data-scroll-behavior='smooth'
            lang='zh-Hant'
        >
            <body>{children}</body>
        </html>
    );
}
