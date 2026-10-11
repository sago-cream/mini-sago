'use client';

import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { ArrowLeft, ArrowRight, ChevronDown } from 'lucide-react';
import Link from 'next/link';

import { FEATURE_GROUPS, FEATURES } from '@/features';
import {
    AccessGuide,
    FeatureBadge,
    FeatureConditions,
    FeatureExample,
} from './FeatureDetails';

import './FeatureWalkthrough.css';

export function FeatureWalkthrough(): JSX.Element {
    const [selected, setSelected] = useState(0);
    const heading = useRef<HTMLHeadingElement>(null);
    const focusRequested = useRef(false);

    function selectGroup(index: number) {
        focusRequested.current = true;
        setSelected(index);
    }

    useEffect(() => {
        if (focusRequested.current) {
            heading.current?.focus();
            heading.current?.scrollIntoView({ block: 'start' });
            focusRequested.current = false;
        }
    }, [selected]);
    const group = FEATURE_GROUPS.at(selected) ?? FEATURE_GROUPS[0];
    const next = FEATURE_GROUPS.at(selected + 1);
    const features = FEATURES.filter(
        (feature) => feature.category === group.category
    );

    return (
        <section
            aria-labelledby='walkthrough-title'
            className='walkthrough section-width'
            id='walkthrough'
        >
            <div className='walkthrough-heading'>
                <div>
                    <h2 id='walkthrough-title'>想做什麼，直接說。</h2>
                    <p>
                        在有 Sago 的聊天室標記她，或用 <code>/ask</code>{' '}
                        私下提問。
                    </p>
                </div>
                <AccessGuide />
            </div>
            <div className='walkthrough-layout'>
                <div aria-label='選擇想做的事' className='walkthrough-nav'>
                    {FEATURE_GROUPS.map(
                        ({ category, title, icon: Icon }, index) => (
                            <button
                                aria-controls='walkthrough-content'
                                aria-pressed={selected === index}
                                key={category}
                                onClick={() => {
                                    selectGroup(index);
                                }}
                                type='button'
                            >
                                <Icon size={20} />
                                <span>{title}</span>
                                <ArrowRight aria-hidden='true' size={16} />
                            </button>
                        )
                    )}
                </div>
                <div className='walkthrough-content' id='walkthrough-content'>
                    <div className='walkthrough-progress'>
                        <h3 ref={heading} tabIndex={-1}>
                            {group.title}
                        </h3>
                        <span aria-live='polite'>
                            {selected + 1} / {FEATURE_GROUPS.length}
                        </span>
                    </div>
                    <div className='walkthrough-grid'>
                        {features.map((feature) => (
                            <article
                                className='walkthrough-card'
                                key={feature.id}
                            >
                                <div className='walkthrough-card-heading'>
                                    <h4>{feature.title}</h4>
                                    <FeatureBadge feature={feature} />
                                </div>
                                <p className='walkthrough-description'>
                                    {feature.description}
                                </p>
                                <FeatureExample feature={feature} />
                                <details className='walkthrough-conditions'>
                                    <summary>
                                        使用條件 <ChevronDown size={14} />
                                    </summary>
                                    <FeatureConditions feature={feature} />
                                </details>
                            </article>
                        ))}
                    </div>
                    <div className='walkthrough-pagination'>
                        <button
                            className='text-link'
                            disabled={selected === 0}
                            onClick={() => {
                                selectGroup(selected - 1);
                            }}
                            type='button'
                        >
                            <ArrowLeft size={16} /> 上一類
                        </button>
                        {next === undefined ? (
                            <Link
                                className='button button-light'
                                href='/features/'
                            >
                                查看全部功能 <ArrowRight size={16} />
                            </Link>
                        ) : (
                            <button
                                className='button button-light'
                                onClick={() => {
                                    selectGroup(selected + 1);
                                }}
                                type='button'
                            >
                                下一類：{next.title} <ArrowRight size={16} />
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </section>
    );
}
