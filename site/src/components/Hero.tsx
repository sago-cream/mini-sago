'use client';

import { useState } from 'react';
import type { JSX } from 'react';
import { ArrowDown, ArrowUpRight, Check, Sparkles } from 'lucide-react';
import Image from 'next/image';

import { SETUP_URL } from '@/features';

import './Hero.css';

const EXAMPLES = [
    {
        label: '聊一聊',
        request: '幫我整理一下剛剛討論的重點',
        reply: '好呀，我把重點整理好了。一起看看！',
    },
    {
        label: '小提醒',
        request: '明天晚上八點提醒我交報告',
        reply: '再告訴我時區，就能幫你設定提醒囉。',
    },
    {
        label: '改個圖',
        request: '把這段影片轉成 GIF',
        reply: '把影片傳給我，我來幫你處理。',
    },
] as const;
export function Hero(): JSX.Element {
    const [selected, setSelected] = useState(0);
    const example = EXAMPLES[selected] ?? EXAMPLES[0];
    return (
        <section aria-labelledby='hero-title' className='hero'>
            <div className='hero-inner section-width'>
                <div className='hero-copy'>
                    <p className='hero-eyebrow'>
                        <span /> YOUR LITTLE DISCORD COMPANION
                    </p>
                    <h1 id='hero-title'>
                        Small Sago.
                        <br />
                        <span>Big possibilities.</span>
                        <sup aria-hidden='true'>✳</sup>
                    </h1>
                    <p className='hero-description'>
                        聊天、查資料、改圖、寫程式。
                        <br />
                        小事，交給 Sago。
                    </p>
                    <div className='hero-actions'>
                        <a className='button' href='#features'>
                            看看 Sago 會什麼 <ArrowDown size={18} />
                        </a>
                        <a className='hero-guide' href={SETUP_URL}>
                            使用指南 <ArrowUpRight size={18} />
                        </a>
                    </div>
                    <p className='hero-footnote'>
                        <Check size={14} /> 開源・自然語言操作・依權限開放
                    </p>
                </div>
                <div className='hero-art'>
                    <span className='art-orbit orbit-one' />
                    <span className='art-orbit orbit-two' />
                    <span aria-hidden='true' className='art-star star-one'>
                        ✧
                    </span>
                    <span aria-hidden='true' className='art-star star-two'>
                        ✳
                    </span>
                    <span className='art-caption'>
                        a little magic
                        <br />
                        in your everyday.
                    </span>
                    <Image
                        alt='藍髮的 Sago 坐在雲朵上，抱著淡紫色筆電'
                        className='hero-character'
                        height={1024}
                        priority
                        src='/images/sago-hero.png'
                        unoptimized
                        width={1024}
                    />
                    <div className='floating-label'>
                        <Sparkles size={16} />
                        <span>say hello to sago ♡</span>
                    </div>
                </div>
                <div className='chat-preview'>
                    <div className='chat-preview-top'>
                        <span className='demo-label'>對話示意</span>
                        <div aria-label='選擇對話示意' className='demo-options'>
                            {EXAMPLES.map(({ label }, index) => (
                                <button
                                    aria-pressed={selected === index}
                                    key={label}
                                    onClick={() => {
                                        setSelected(index);
                                    }}
                                    type='button'
                                >
                                    {label}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div className='demo-message'>
                        <span className='demo-user'>你</span>
                        <p>
                            <strong>@Sago</strong> {example.request}
                        </p>
                    </div>
                    <div aria-live='polite' className='demo-message demo-reply'>
                        <Image
                            alt=''
                            height={32}
                            src='/images/sago-avatar.png'
                            width={32}
                        />
                        <p>{example.reply}</p>
                    </div>
                </div>
            </div>
            <a className='hero-scroll' href='#about'>
                SCROLL TO EXPLORE <ArrowDown size={14} />
            </a>
        </section>
    );
}
