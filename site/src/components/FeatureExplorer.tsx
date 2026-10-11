'use client';

import { useState } from 'react';
import type { JSX } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

import { ACCESS_LABELS, FEATURE_GROUPS, FEATURES } from '@/features';
import {
    AccessGuide,
    FeatureBadge,
    FeatureConditions,
    FeatureExample,
} from './FeatureDetails';

import './FeatureExplorer.css';

export function FeatureExplorer(): JSX.Element {
    const [category, setCategory] = useState('全部');
    const [access, setAccess] = useState('全部');
    const [query, setQuery] = useState('');
    const [showExamples, setShowExamples] = useState(true);
    const terms = query
        .trim()
        .toLocaleLowerCase()
        .split(/\s+/u)
        .filter(Boolean);
    const filtered = FEATURES.filter((feature) => {
        const groupTitle =
            FEATURE_GROUPS.find((group) => group.category === feature.category)
                ?.title ?? feature.category;
        const content =
            `${groupTitle} ${feature.category} ${feature.title} ${feature.description} ${feature.example} ${feature.note} ${feature.access}`.toLocaleLowerCase();
        return (
            (category === '全部' || feature.category === category) &&
            (access === '全部' || feature.access === access) &&
            terms.every((term) => content.includes(term) || feature.id === term)
        );
    });
    const hasFilters = category !== '全部' || access !== '全部' || query !== '';

    function resetFilters() {
        setCategory('全部');
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
                    <p>
                        在有 Sago 的聊天室標記她，或用 <code>/ask</code>{' '}
                        私下提問。
                    </p>
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
                    <span className='visually-hidden'>功能分類</span>
                    <select
                        onChange={(event) => {
                            setCategory(event.target.value);
                        }}
                        value={category}
                    >
                        <option value='全部'>全部分類</option>
                        {FEATURE_GROUPS.map(({ category: item }) => (
                            <option key={item} value={item}>
                                {item}
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
                {FEATURE_GROUPS.map((group, index) => {
                    const items = filtered.filter(
                        (feature) => feature.category === group.category
                    );
                    if (items.length === 0) {
                        return undefined;
                    }
                    return (
                        <section
                            aria-labelledby={`feature-group-${index}`}
                            className='feature-group'
                            key={group.category}
                        >
                            <h3 id={`feature-group-${index}`}>{group.title}</h3>
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
