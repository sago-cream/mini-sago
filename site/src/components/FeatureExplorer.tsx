import type { JSX } from 'react';
import { ChevronDown } from 'lucide-react';

import { AUDIENCE_GROUPS, FEATURES } from '@/features';
import { FeatureExample } from './FeatureDetails';

import './FeatureExplorer.css';

export function FeatureExplorer(): JSX.Element {
    return (
        <section
            aria-labelledby='features-title'
            className='feature-section section-width'
            id='features'
        >
            <div className='feature-heading' id='start'>
                <h2 id='features-title'>想做什麼，直接說。</h2>
                <p>
                    標記迷你西米露，或用 <code>/ask</code> 私下聊。
                </p>
            </div>
            <div className='feature-groups'>
                {AUDIENCE_GROUPS.map((group, index) => (
                    <section
                        aria-labelledby={`feature-group-${index}`}
                        className='feature-group'
                        key={group.audience}
                    >
                        <h3 id={`feature-group-${index}`}>{group.title}</h3>
                        {group.description !== '' && (
                            <p className='feature-group-description'>
                                {group.description}
                            </p>
                        )}
                        <div className='feature-list'>
                            {FEATURES.filter(
                                (feature) => feature.audience === group.audience
                            ).map((feature) => (
                                <article
                                    className='feature-row'
                                    key={feature.id}
                                >
                                    <details name='feature-examples'>
                                        <summary>
                                            <div className='feature-row-copy'>
                                                <h4>{feature.title}</h4>
                                                <p>{feature.description}</p>
                                            </div>
                                            <ChevronDown
                                                aria-hidden='true'
                                                className='row-chevron'
                                                size={16}
                                            />
                                        </summary>
                                        <div className='feature-row-body'>
                                            <FeatureExample feature={feature} />
                                        </div>
                                    </details>
                                </article>
                            ))}
                        </div>
                    </section>
                ))}
            </div>
        </section>
    );
}
