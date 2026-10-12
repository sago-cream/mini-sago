'use client';

import { useState } from 'react';
import type { JSX } from 'react';

import { SHOWCASES } from '@/showcases';
import { DiscordDemo } from './DiscordDemo';

import './ShowcaseCarousel.css';

export function ShowcaseCarousel(): JSX.Element {
    const [selectedId, setSelectedId] = useState<string>(SHOWCASES[0].id);
    const selected =
        SHOWCASES.find((showcase) => showcase.id === selectedId) ??
        SHOWCASES[0];

    return (
        <div
            aria-label='使用情境'
            aria-roledescription='輪播'
            className='showcase-carousel'
            role='region'
        >
            <nav aria-label='選擇示範情境' className='showcase-navigation'>
                {SHOWCASES.map((showcase) => (
                    <button
                        aria-controls='showcase-conversation'
                        aria-pressed={showcase.id === selectedId}
                        key={showcase.id}
                        onClick={() => {
                            setSelectedId(showcase.id);
                        }}
                        type='button'
                    >
                        {showcase.title}
                    </button>
                ))}
            </nav>
            <div
                aria-label={selected.title}
                aria-roledescription='情境'
                id='showcase-conversation'
                role='group'
            >
                <DiscordDemo
                    channel={selected.channel}
                    key={selected.id}
                    messages={selected.messages}
                />
            </div>
        </div>
    );
}
