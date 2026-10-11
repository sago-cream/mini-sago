'use client';

import { useState } from 'react';
import type { JSX } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

import { ACCESS_LABELS, AUDIENCE_GROUPS, FEATURES } from '@/features';
import {
    AccessGuide,
    FeatureBadge,
    FeatureConditions,
    FeatureExample,
} from './FeatureDetails';

import './FeatureExplorer.css';

export function FeatureExplorer(): JSX.Element {
    const [audience, setAudience] = useState('全部');
    const [access, setAccess] = useState('全部');
    const [query, setQuery] = useState('');
    const [showExamples, setShowExamples] = useState(true);
    const terms = query
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/u)
        .filter(Boolean);
    const filtered = FEATURES.filter((feature) => {
        const group = AUDIENCE_GROUPS.find(
            (item) => item.audience === feature.audience
        );
        const content =
            `${group?.title} ${group?.description} ${feature.category} ${feature.title} ${feature.description} ${feature.example} ${feature.note} ${feature.access}`.toLocaleLowerCase();
        return (
            (audience === '全部' || feature.audience === audience) &&
            (access === '全部' || feature.access === access) &&
            terms.every((term) => content.includes(term) || feature.id === term)
        );
    });
    const hasFilters = audience !== '全部' || access !== '全部' || query !== '';

    function resetFilters() {
        setAudience('全部');
        setAccess('全部');
        setQuery('');
    }

    return (
        <section
            aria-labelledby='features-title'
            className='feature-section section-width'
            id='features'
        >
            <div className='feature-heading'>
                <div>
                    <h2 id='features-title'>想做什麼，直接說。</h2>
                </div>
                <AccessGuide />
            </div>
            <div className='feature-toolbar'>
                <div className='feature-search'>
                    <Search size={18} />
                    <label className='visually-hidden' htmlFor='feature-query'>
                        搜尋功能
                    </label>
                    <input
                        id='feature-query'
                        onChange={(event) => {
                            setQuery(event.target.value);
                        }}
                        placeholder='搜尋功能，例如日曆、GIF、PR⋯'
                        type='search'
                        value={query}
                    />
                    {query !== '' && (
                        <button
                            aria-label='清除搜尋'
                            onClick={() => {
                                setQuery('');
                            }}
                            type='button'
                        >
                            <X size={16} />
                        </button>
                    )}
                </div>
                <label className='feature-filter'>
                    <span className='visually-hidden'>使用對象</span>
                    <select
                        onChange={(event) => {
                            setAudience(event.target.value);
                        }}
                        value={audience}
                    >
                        <option value='全部'>全部使用對象</option>
                        {AUDIENCE_GROUPS.map(({ audience: item, title }) => (
                            <option key={item} value={item}>
                                {title}
                            </option>
                        ))}
                    </select>
                </label>
                <label className='feature-filter'>
                    <span className='visually-hidden'>使用條件</span>
                    <select
                        onChange={(event) => {
                            setAccess(event.target.value);
                        }}
                        value={access}
                    >
                        <option value='全部'>全部使用條件</option>
                        {ACCESS_LABELS.map((item) => (
                            <option key={item} value={item}>
                                {item}
                            </option>
                        ))}
                    </select>
                </label>
            </div>
            <div className='feature-meta'>
                <p aria-live='polite'>
                    {filtered.length} / {FEATURES.length} 個功能
                </p>
                <div className='feature-display-controls'>
                    <label className='example-toggle'>
                        <input
                            checked={showExamples}
                            onChange={(event) => {
                                setShowExamples(event.target.checked);
                            }}
                            type='checkbox'
                        />
                        顯示範例
                    </label>
                    {hasFilters && (
                        <button
                            className='text-link'
                            onClick={resetFilters}
                            type='button'
                        >
                            重設篩選 <X size={14} />
                        </button>
                    )}
                </div>
            </div>
            <div className='feature-groups'>
                {AUDIENCE_GROUPS.map((group, index) => {
                    const items = filtered.filter(
                        (feature) => feature.audience === group.audience
                    );
                    if (items.length === 0) {
                        return undefined;
                    }
                    return (
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
                                {items.map((feature) => {
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
                                                        size={20}
                                                    />
                                                    <h4>{feature.title}</h4>
                                                    <p>{feature.description}</p>
                                                    <FeatureBadge
                                                        feature={feature}
                                                    />
                                                    <ChevronDown
                                                        aria-hidden='true'
                                                        className='row-chevron'
                                                        size={16}
                                                    />
                                                </summary>
                                                <div className='feature-row-body'>
                                                    {!showExamples && (
                                                        <FeatureExample
                                                            feature={feature}
                                                        />
                                                    )}
                                                    <FeatureConditions
                                                        feature={feature}
                                                    />
                                                </div>
                                            </details>
                                            {showExamples && (
                                                <div className='feature-row-example'>
                                                    <FeatureExample
                                                        feature={feature}
                                                    />
                                                </div>
                                            )}
                                        </article>
                                    );
                                })}
                            </div>
                        </section>
                    );
                })}
            </div>
            {filtered.length === 0 && (
                <div className='empty-state'>
                    <Search size={28} />
                    <h3>沒有符合的功能</h3>
                    <p>換個關鍵字，或重設篩選。</p>
                </div>
            )}
        </section>
    );
}
