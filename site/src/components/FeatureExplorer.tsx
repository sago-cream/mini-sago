'use client';

import { useState } from 'react';
import type { JSX } from 'react';
import { ChevronDown } from 'lucide-react';

import { FEATURE_SECTIONS, FEATURES } from '@/features';
import { DiscordDemo } from './DiscordDemo';

import './FeatureExplorer.css';

export function FeatureExplorer(): JSX.Element {
    const [selectedId, setSelectedId] = useState<string>(FEATURES[0].id);
    const [menuOpen, setMenuOpen] = useState(false);
    const selected =
        FEATURES.find((feature) => feature.id === selectedId) ?? FEATURES[0];
    return (
        <div className='feature-workspace section-width'>
            <button
                aria-controls='feature-navigation'
                aria-expanded={menuOpen}
                className='feature-mobile-menu'
                onClick={() => {
                    setMenuOpen((value) => !value);
                }}
                type='button'
            >
                選擇功能：{selected.title}
                <ChevronDown aria-hidden='true' size={18} />
            </button>
            <nav
                aria-label='功能分類'
                className={`feature-sidebar ${menuOpen ? 'sidebar-open' : ''}`}
                id='feature-navigation'
            >
                {FEATURE_SECTIONS.map((section) => (
                    <details
                        className='sidebar-section'
                        key={section.id}
                        name='feature-sections'
                        open={section.id === selected.section}
                    >
                        <summary>
                            <h2>{section.title}</h2>
                            <ChevronDown aria-hidden='true' size={14} />
                        </summary>
                        {FEATURES.filter(
                            (feature) => feature.section === section.id
                        ).map((feature) => (
                            <button
                                aria-controls='feature-preview'
                                aria-pressed={feature.id === selectedId}
                                key={feature.id}
                                onClick={() => {
                                    setSelectedId(feature.id);
                                    setMenuOpen(false);
                                }}
                                type='button'
                            >
                                {feature.title}
                            </button>
                        ))}
                    </details>
                ))}
            </nav>
            <section
                aria-labelledby='selected-feature-title'
                className='feature-preview'
                id='feature-preview'
            >
                <div className='feature-preview-heading'>
                    <h2 id='selected-feature-title'>{selected.title}</h2>
                    <p>{selected.description}</p>
                </div>
                <DiscordDemo
                    channel={selected.channel}
                    key={selected.id}
                    messages={selected.messages}
                />
                {selected.note !== '' && (
                    <p className='feature-note'>{selected.note}</p>
                )}
            </section>
        </div>
    );
}
