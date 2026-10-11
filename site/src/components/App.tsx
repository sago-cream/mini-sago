import type { JSX } from 'react';

import { FeatureExplorer } from './FeatureExplorer';
import { Hero } from './Hero';
import { SiteFooter, SiteHeader } from './SiteChrome';

export function App(): JSX.Element {
    return (
        <>
            <SiteHeader />
            <main id='main'>
                <Hero />
                <FeatureExplorer />
            </main>
            <SiteFooter />
        </>
    );
}
