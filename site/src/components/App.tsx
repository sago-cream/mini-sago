import type { JSX } from 'react';

import { Hero } from './Hero';
import { SiteFooter, SiteHeader } from './SiteChrome';
import { AccessSago, NaturalLanguage } from './WelcomeSections';

export function App(): JSX.Element {
    return (
        <>
            <SiteHeader />
            <main id='main'>
                <Hero />
                <NaturalLanguage />
                <AccessSago />
            </main>
            <SiteFooter />
        </>
    );
}
