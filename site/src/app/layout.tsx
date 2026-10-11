import type { JSX, ReactNode } from 'react';
import type { Metadata } from 'next';
import { Nunito } from 'next/font/google';

import './global.css';

const rounded = Nunito({
    subsets: ['latin'],
    variable: '--font-rounded',
    display: 'swap',
});
export const metadata: Metadata = {
    title: 'MiniSago — 聊天室裡的小幫手',
    description:
        '聊天、查資料、改圖，還能陪你寫程式。認識 MiniSago，看看 Discord 裡的 Sago 能幫上什麼忙。',
    metadataBase: new URL('https://minisago.sagocream.com'),
    alternates: { canonical: '/' },
    icons: { icon: '/images/sago-avatar.png' },
};

interface RootLayoutProps {
    readonly children: ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps): JSX.Element {
    return (
        <html className={rounded.variable} lang='zh-Hant'>
            <body>{children}</body>
        </html>
    );
}
