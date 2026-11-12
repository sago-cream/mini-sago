'use client';

import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { ChevronDown, X } from 'lucide-react';

import { FEATURE_SECTIONS, FEATURES } from '@/features';
import { DiscordDemo } from './DiscordDemo';
import { FeatureAccessNote } from './FeatureAccessNote';

import './FeatureExplorer.css';

export function FeatureExplorer(): JSX.Element {
    const [selectedId, setSelectedId] = useState<string>(FEATURES[0].id);
    const [expandedSections, setExpandedSections] = useState<readonly string[]>(
        [FEATURES[0].section]
    );
    const [menuOpen, setMenuOpen] = useState(false);
    const picker = useRef<HTMLDialogElement>(null);
    const pickerButton = useRef<HTMLButtonElement>(null);
    const preview = useRef<HTMLElement>(null);

    useEffect(() => {
        const desktop = globalThis.matchMedia('(min-width: 701px)');
        function closeOnDesktop() {
            if (desktop.matches) {
                picker.current?.close();
            }
        }
        desktop.addEventListener('change', closeOnDesktop);
        return () => {
            desktop.removeEventListener('change', closeOnDesktop);
        };
    }, []);
    const selected =
        FEATURES.find((feature) => feature.id === selectedId) ?? FEATURES[0];
    function navigation(mobile: boolean): JSX.Element {
        return (
            <nav
                aria-label='功能分類'
                className={
                    mobile ? 'feature-picker-navigation' : 'feature-sidebar'
                }
                id={mobile ? 'mobile-feature-navigation' : 'feature-navigation'}
            >
                {FEATURE_SECTIONS.map((section) => (
                    <details
                        className='sidebar-section'
                        key={section.id}
                        onToggle={(event) => {
                            const expanded = event.currentTarget.open;
                            setExpandedSections((previous) => {
                                if (
                                    previous.includes(section.id) === expanded
                                ) {
                                    return previous;
                                }
                                return expanded
                                    ? [...previous, section.id]
                                    : previous.filter(
                                          (id) => id !== section.id
                                      );
                            });
                        }}
                        open={expandedSections.includes(section.id)}
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
                                    preview.current?.scrollTo({ top: 0 });
                                    if (mobile) {
                                        picker.current?.close();
                                        pickerButton.current?.focus();
                                    }
                                }}
                                type='button'
                            >
                                {feature.title}
                            </button>
                        ))}
                    </details>
                ))}
            </nav>
        );
    }
    return (
        <div className='feature-workspace section-width'>
            <button
                aria-controls='feature-picker'
                aria-expanded={menuOpen}
                aria-haspopup='dialog'
                aria-label={`選擇功能：${selected.title}`}
                className='feature-mobile-menu'
                onClick={() => {
                    picker.current?.showModal();
                    setMenuOpen(true);
                    picker.current
                        ?.querySelector('[aria-pressed="true"]')
                        ?.scrollIntoView({ block: 'nearest' });
                }}
                ref={pickerButton}
                type='button'
            >
                <span>{selected.title}</span>
                <ChevronDown aria-hidden='true' size={18} />
            </button>
            {navigation(false)}
            <dialog
                aria-labelledby='feature-picker-title'
                className='feature-picker'
                id='feature-picker'
                onClose={() => {
                    setMenuOpen(false);
                }}
                ref={picker}
            >
                <div className='feature-picker-heading'>
                    <h2 id='feature-picker-title'>選擇功能</h2>
                    <button
                        aria-label='關閉功能選單'
                        onClick={() => {
                            picker.current?.close();
                        }}
                        type='button'
                    >
                        <X aria-hidden='true' size={20} />
                    </button>
                </div>
                {navigation(true)}
            </dialog>
            <section
                aria-labelledby='selected-feature-title'
                className='feature-preview'
                id='feature-preview'
                ref={preview}
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
                <details
                    className='feature-mobile-notes'
                    key={`notes-${selected.id}`}
                >
                    <summary>
                        使用提醒與範圍
                        <ChevronDown aria-hidden='true' size={16} />
                    </summary>
                    <div>
                        {selected.note !== '' && <p>{selected.note}</p>}
                        <FeatureAccessNote />
                    </div>
                </details>
            </section>
        </div>
    );
}
