import type { JSX } from 'react';
import type { Metadata } from 'next';

import { FeatureExplorer } from '@/components/FeatureExplorer';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';

export const metadata: Metadata = {
    title: '功能速查 | MiniSago',
    description: '快速搜尋 MiniSago 的功能、使用條件與範例。',
    alternates: { canonical: '/features/' },
};

export default function FeaturesPage(): JSX.Element {
    return (
        <>
            <SiteHeader active='features' />
            <main id='main'>
                <FeatureExplorer />
            </main>
            <SiteFooter />
        </>
    );
}
