import type { JSX } from 'react';

import { Hero } from './Hero';
import { SiteFooter, SiteHeader } from './SiteChrome';
import { AccessSago, GuideLink, NaturalLanguage } from './WelcomeSections';

export function App(): JSX.Element {
    return (
        <>
            <SiteHeader />
            <main id='main'>
                <Hero />
                <NaturalLanguage />
                <GuideLink />
                <AccessSago />
            </main>
            <SiteFooter />
        </>
    );
}
