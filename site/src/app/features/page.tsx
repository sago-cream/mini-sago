import type { Metadata } from 'next';

import { FeatureAccessNote } from '@/components/FeatureAccessNote';
import { FeatureExplorer } from '@/components/FeatureExplorer';
import { SiteHeader } from '@/components/SiteChrome';
import { pageMetadata } from '@/metadata';

import './features.css';

export const metadata: Metadata = pageMetadata(
    '功能導覽 — mini sago',
    '從聊天、檔案到校園與開發協作，透過 Discord 示範對話看看迷你西米露怎麼幫忙。',
    '/features/'
);
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
