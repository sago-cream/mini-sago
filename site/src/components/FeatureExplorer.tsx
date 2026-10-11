'use client';

import { useState } from 'react';
import type { JSX } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';

import { ACCESS_LABELS, AUDIENCE_GROUPS, FEATURES } from '@/features';
import type { Audience, Feature } from '@/features';
import {
    AccessGuide,
    FeatureBadge,
    FeatureConditions,
    FeatureExample,
} from './FeatureDetails';

import './FeatureExplorer.css';

export function FeatureExplorer(): JSX.Element {
    const [audiences, setAudiences] = useState<readonly Audience[]>(
        AUDIENCE_GROUPS.map((group) => group.audience)
    );
    const [access, setAccess] =
        useState<ReadonlyArray<Feature['access']>>(ACCESS_LABELS);
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
            audiences.includes(feature.audience) &&
            access.includes(feature.access) &&
            terms.every((term) => content.includes(term) || feature.id === term)
        );
    });
    const hasFilters =
        audiences.length !== AUDIENCE_GROUPS.length ||
        access.length !== ACCESS_LABELS.length ||
        query !== '';

    function resetFilters() {
        setAudiences(AUDIENCE_GROUPS.map((group) => group.audience));
        setAccess(ACCESS_LABELS);
        setQuery('');
    }

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
                <div className='first-message'>
                    <FeatureExample
                        feature={{
                            title: '第一句',
                            example: '@迷你西米露 你能幫我做什麼？',
                        }}
                    />
                </div>
            </div>
            <div className='feature-search'>
                <Search aria-hidden='true' size={20} />
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
            <div className='feature-filters'>
                <p className='filter-help'>勾選要顯示的分類。</p>
                <fieldset className='filter-set'>
                    <legend>使用對象</legend>
                    <div className='filter-choices'>
                        {AUDIENCE_GROUPS.map(({ audience, title }) => (
                            <label className='filter-chip' key={audience}>
                                <input
                                    aria-label={title}
                                    checked={audiences.includes(audience)}
                                    onChange={(event) => {
                                        setAudiences((current) =>
                                            event.target.checked
                                                ? [...current, audience]
                                                : current.filter(
                                                      (item) =>
                                                          item !== audience
                                                  )
                                        );
                                    }}
                                    type='checkbox'
                                />
                                <span>{title}</span>
                                <span
                                    aria-hidden='true'
                                    className='filter-count'
                                >
                                    {
                                        FEATURES.filter(
                                            (feature) =>
                                                feature.audience === audience
                                        ).length
                                    }
                                </span>
                            </label>
                        ))}
                        <div className='filter-actions'>
                            <button
                                aria-label='全選使用對象'
                                onClick={() => {
                                    setAudiences(
                                        AUDIENCE_GROUPS.map(
                                            (group) => group.audience
                                        )
                                    );
                                }}
                                type='button'
                            >
                                全選
                            </button>
                            <button
                                aria-label='清除使用對象'
                                onClick={() => {
                                    setAudiences([]);
                                }}
                                type='button'
                            >
                                清除
                            </button>
                        </div>
                    </div>
                </fieldset>
                <fieldset className='filter-set'>
                    <legend>使用條件</legend>
                    <div className='filter-choices'>
                        {ACCESS_LABELS.map((item) => (
                            <label className='filter-chip' key={item}>
                                <input
                                    aria-label={item}
                                    checked={access.includes(item)}
                                    onChange={(event) => {
                                        setAccess((current) =>
                                            event.target.checked
                                                ? [...current, item]
                                                : current.filter(
                                                      (value) => value !== item
                                                  )
                                        );
                                    }}
                                    type='checkbox'
                                />
                                <span>{item}</span>
                                <span
                                    aria-hidden='true'
                                    className='filter-count'
                                >
                                    {
                                        FEATURES.filter(
                                            (feature) => feature.access === item
                                        ).length
                                    }
                                </span>
                            </label>
                        ))}
                        <div className='filter-actions'>
                            <button
                                aria-label='全選使用條件'
                                onClick={() => {
                                    setAccess(ACCESS_LABELS);
                                }}
                                type='button'
                            >
                                全選
                            </button>
                            <button
                                aria-label='清除使用條件'
                                onClick={() => {
                                    setAccess([]);
                                }}
                                type='button'
                            >
                                清除
                            </button>
                        </div>
                    </div>
                </fieldset>
            </div>
            <div className='feature-meta'>
                <p aria-live='polite'>
                    {filtered.length} / {FEATURES.length} 個功能
                </p>
                <div className='feature-display-controls'>
                    <AccessGuide />
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
                                                        size={24}
                                                    />
                                                    <div className='feature-row-copy'>
                                                        <h4>{feature.title}</h4>
                                                        <p>
                                                            {
                                                                feature.description
                                                            }
                                                        </p>
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
                    <p>換個關鍵字、勾選分類，或重設篩選。</p>
                </div>
            )}
        </section>
    );
}
