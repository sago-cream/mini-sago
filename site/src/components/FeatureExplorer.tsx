'use client';

import type { JSX } from 'react';
import { ChevronDown } from 'lucide-react';

import { AUDIENCE_GROUPS, FEATURES } from '@/features';
import {
    AccessGuide,
    FeatureBadge,
    FeatureConditions,
    FeatureExample,
} from './FeatureDetails';

import './FeatureExplorer.css';

export function FeatureExplorer(): JSX.Element {
    return (
        <section
            aria-labelledby='features-title'
            className='feature-section section-width'
            id='features'
        >
            <div className='feature-heading' id='start'>
                <div>
                    <h2 id='features-title'>想做什麼，直接說。</h2>
                    <p>
                        在聊天室標記迷你西米露，或用 <code>/ask</code>{' '}
                        私下提問。
                    </p>
                </div>
                <AccessGuide />
            </div>
            <div className='feature-groups'>
                {AUDIENCE_GROUPS.map((group, index) => (
                    <section
                        aria-labelledby={`feature-group-${index}`}
                        className='feature-group'
                        key={group.audience}
                    >
                        <h3 id={`feature-group-${index}`}>{group.title}</h3>
                        <p className='feature-group-description'>
                            {group.description}
                        </p>
                        <div className='feature-list'>
                            {FEATURES.filter(
                                (feature) => feature.audience === group.audience
                            ).map((feature) => {
                                const Icon = feature.icon;
                                return (
                                    <article
                                        className='feature-row'
                                        key={feature.id}
                                    >
                                        <details>
                                            <summary>
                                                <Icon
                                                    aria-hidden='true'
                                                    className='feature-row-icon'
                                                    size={24}
                                                />
                                                <div className='feature-row-copy'>
                                                    <h4>{feature.title}</h4>
                                                    <p>{feature.description}</p>
                                                </div>
                                                <FeatureBadge
                                                    feature={feature}
                                                />
                                                <ChevronDown
                                                    aria-hidden='true'
                                                    className='row-chevron'
                                                    size={20}
                                                />
                                            </summary>
                                            <div className='feature-row-body'>
                                                <FeatureConditions
                                                    feature={feature}
                                                />
                                            </div>
                                        </details>
                                        <div className='feature-row-example'>
                                            <FeatureExample feature={feature} />
                                        </div>
                                    </article>
                                );
                            })}
                        </div>
                    </section>
                ))}
            </div>
        </section>
    );
}
