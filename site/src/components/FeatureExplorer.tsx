import type { JSX } from 'react';
import { ChevronDown } from 'lucide-react';

import { AUDIENCE_GROUPS, FEATURE_TOPICS } from '@/features';
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
                            {FEATURE_TOPICS.filter(
                                (feature) => feature.audience === group.audience
                            ).map((feature) => (
                                <article
                                    className='feature-row'
                                    key={feature.id}
                                >
                                    <details>
                                        <summary>
                                            <div className='feature-row-copy'>
                                                <div className='feature-row-title'>
                                                    <h4>{feature.title}</h4>
                                                    {(feature.access ===
                                                        '需設定' ||
                                                        feature.access ===
                                                            '開發中') && (
                                                        <FeatureBadge
                                                            feature={feature}
                                                        />
                                                    )}
                                                </div>
                                                <p>{feature.description}</p>
                                            </div>
                                            <ChevronDown
                                                aria-hidden='true'
                                                className='row-chevron'
                                                size={16}
                                            />
                                        </summary>
                                        <div className='feature-row-body'>
                                            {feature.features.length === 1 ? (
                                                <>
                                                    <FeatureExample
                                                        feature={
                                                            feature.features[0]
                                                        }
                                                    />
                                                    <FeatureConditions
                                                        feature={
                                                            feature.features[0]
                                                        }
                                                    />
                                                </>
                                            ) : (
                                                <>
                                                    <dl className='feature-actions'>
                                                        {feature.features.map(
                                                            (item) => (
                                                                <div
                                                                    className='feature-action'
                                                                    key={
                                                                        item.id
                                                                    }
                                                                >
                                                                    <dt>
                                                                        {
                                                                            item.title
                                                                        }
                                                                    </dt>
                                                                    <dd>
                                                                        <p className='feature-action-description'>
                                                                            {
                                                                                item.description
                                                                            }
                                                                        </p>
                                                                        <FeatureExample
                                                                            feature={
                                                                                item
                                                                            }
                                                                        />
                                                                    </dd>
                                                                </div>
                                                            )
                                                        )}
                                                    </dl>
                                                    <details className='feature-topic-notes'>
                                                        <summary>
                                                            使用條件與說明
                                                        </summary>
                                                        {feature.features.map(
                                                            (item) => (
                                                                <div
                                                                    className='feature-topic-note'
                                                                    key={
                                                                        item.id
                                                                    }
                                                                >
                                                                    <h5>
                                                                        {
                                                                            item.title
                                                                        }
                                                                    </h5>
                                                                    <FeatureConditions
                                                                        feature={
                                                                            item
                                                                        }
                                                                    />
                                                                </div>
                                                            )
                                                        )}
                                                    </details>
                                                </>
                                            )}
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
