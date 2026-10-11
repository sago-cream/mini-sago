import type { JSX } from 'react';

import { FeatureWalkthrough } from './FeatureWalkthrough';
import { Hero } from './Hero';
import { SiteFooter, SiteHeader } from './SiteChrome';

export function App(): JSX.Element {
    return (
        <>
            <SiteHeader active='home' />
            <main id='main'>
                <Hero />
                <FeatureWalkthrough />
            </main>
            <SiteFooter />
        </>
    );
}
