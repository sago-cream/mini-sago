import type { JSX } from 'react';

import { FeatureExplorer } from './FeatureExplorer';
import { Hero } from './Hero';
import { SiteFooter, SiteHeader } from './SiteChrome';
import { InviteSago, Strengths } from './WelcomeSections';

export function App(): JSX.Element {
    return (
        <>
            <SiteHeader />
            <main id='main'>
                <Hero />
                <Strengths />
                <FeatureExplorer />
                <InviteSago />
            </main>
            <SiteFooter />
        </>
    );
}
