import type { Metadata } from 'next';

import { FeatureExplorer } from '@/components/FeatureExplorer';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { AccessSago } from '@/components/WelcomeSections';

export const metadata: Metadata = {
    title: '功能導覽 — MiniSago',
    description:
        '從聊天、檔案到校園與開發協作，透過 Discord 示範對話看看迷你西米露怎麼幫忙。',
    alternates: { canonical: '/features/' },
};
export default function FeatureGuidePage() {
    return (
        <>
            <SiteHeader />
            <main id='main'>
                <div className='guide-heading section-width'>
                    <h1>功能導覽</h1>
                </div>
                <FeatureExplorer />
                <AccessSago />
            </main>
            <SiteFooter />
        </>
    );
}
