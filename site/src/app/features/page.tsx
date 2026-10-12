import type { Metadata } from 'next';

import { FeatureAccessNote } from '@/components/FeatureAccessNote';
import { FeatureExplorer } from '@/components/FeatureExplorer';
import { SiteHeader } from '@/components/SiteChrome';

import './features.css';

export const metadata: Metadata = {
    title: '功能導覽 — MiniSago',
    description:
        '從聊天、檔案到校園與開發協作，透過 Discord 示範對話看看迷你西米露怎麼幫忙。',
    alternates: { canonical: '/features/' },
};
export default function FeatureGuidePage() {
    return (
        <div className='feature-guide-page'>
            <SiteHeader activePage='features' />
            <main className='feature-guide-main' id='main'>
                <h1 className='visually-hidden'>功能導覽</h1>
                <FeatureExplorer />
            </main>
            <footer className='feature-guide-footer section-width'>
                <FeatureAccessNote />
            </footer>
        </div>
    );
}
