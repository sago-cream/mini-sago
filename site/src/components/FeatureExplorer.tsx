'use client';

import { useState } from 'react';
import type { JSX } from 'react';
import { ArrowUpRight, ChevronDown, Search, X } from 'lucide-react';

import { CATEGORIES, FEATURES, REPOSITORY_URL } from '@/features';

import './FeatureExplorer.css';

export function FeatureExplorer(): JSX.Element {
    const [category, setCategory] = useState('全部');
    const [query, setQuery] = useState('');
    const normalizedQuery = query.trim().toLocaleLowerCase();
    const filtered = FEATURES.filter(
        (feature) =>
            (category === '全部' || feature.category === category) &&
            `${feature.title} ${feature.description} ${feature.example} ${feature.note} ${feature.access}`
                .toLocaleLowerCase()
                .includes(normalizedQuery)
    );
    return (
        <section
            aria-labelledby='features-title'
            className='feature-section'
            id='features'
        >
            <div className='section-width'>
                <div className='feature-heading'>
                    <div>
                        <h2 id='features-title'>
                            你想做的，<span>這裡找找。</span>
                        </h2>
                        <p>選個分類，找你需要的功能。</p>
                    </div>
                    <span aria-hidden='true' className='feature-stamp'>
                        made for
                        <br />
                        <strong>your everyday</strong>
                        <span>✳</span>
                    </span>
                </div>
                <div className='feature-toolbar'>
                    <div aria-label='依功能分類' className='category-tabs'>
                        {CATEGORIES.map((item) => (
                            <button
                                aria-pressed={category === item}
                                key={item}
                                onClick={() => {
                                    setCategory(item);
                                }}
                                type='button'
                            >
                                {item}
                            </button>
                        ))}
                    </div>
                    <label className='feature-search'>
                        <Search size={18} />
                        <span className='visually-hidden'>搜尋功能</span>
                        <input
                            onChange={(event) => {
                                setQuery(event.target.value);
                            }}
                            placeholder='搜尋功能、關鍵字⋯'
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
                    </label>
                </div>
                <div className='feature-meta'>
                    <p aria-live='polite'>
                        找到 <strong>{filtered.length}</strong> 個小幫手
                    </p>
                    <span>標籤為基本使用條件</span>
                </div>
                <div className='feature-grid'>
                    {filtered.map(
                        ({
                            id,
                            title,
                            description,
                            example,
                            access,
                            note,
                            icon: Icon,
                            guide,
                        }) => (
                            <article className='feature-card' key={id}>
                                <div className='feature-card-top'>
                                    <span className='feature-icon'>
                                        <Icon size={23} />
                                    </span>
                                    <span
                                        className={`access-badge ${access === '開發中' ? 'access-development' : ''}`}
                                    >
                                        {access}
                                    </span>
                                </div>

                                <h3>{title}</h3>
                                <p className='feature-description'>
                                    {description}
                                </p>
                                <details className='feature-example'>
                                    <summary>
                                        看範例 <ChevronDown size={16} />
                                    </summary>
                                    <div className='example-content'>
                                        <p className='example-request'>
                                            {example}
                                        </p>
                                        <p>{note}</p>
                                        <a
                                            className='text-link'
                                            href={`${REPOSITORY_URL}/blob/main/${guide}`}
                                        >
                                            使用說明 <ArrowUpRight size={16} />
                                        </a>
                                    </div>
                                </details>
                            </article>
                        )
                    )}
                </div>
                {filtered.length === 0 && (
                    <div className='empty-state'>
                        <Search size={28} />
                        <h3>還沒找到這個小幫手</h3>
                        <p>換個關鍵字，或看看全部功能。</p>
                        <button
                            className='button button-light'
                            onClick={() => {
                                setCategory('全部');
                                setQuery('');
                            }}
                            type='button'
                        >
                            重設搜尋
                        </button>
                    </div>
                )}
                <p className='feature-disclaimer'>
                    功能依權限、設定與服務狀態開放。範例非即時聊天。
                </p>
            </div>
        </section>
    );
}
