import type { JSX } from 'react';
import { ArrowDown } from 'lucide-react';
import Image from 'next/image';

import './Hero.css';

export function Hero(): JSX.Element {
    return (
        <section aria-labelledby='hero-title' className='hero'>
            <div className='hero-inner section-width'>
                <div className='hero-art'>
                    <Image
                        alt='MiniSago 3：藍髮、紫眼的迷你西米露'
                        className='hero-character'
                        height={1540}
                        loading='eager'
                        src='/images/minisago3.png'
                        width={1540}
                    />
                </div>
                <div className='hero-copy'>
                    <h1 id='hero-title'>
                        能和你聊天的
                        <br />
                        <span>Discord 機器人</span>
                    </h1>
                    <p className='hero-description'>
                        <span>迷你西米露是你在 Discord 裡的 AI 小幫手。</span>
                        <span>
                            聊天、查資料、
                            <span className='hero-description-phrase'>
                                整理對話懶人包，
                            </span>
                            <span className='hero-description-phrase'>
                                還有其他奇奇怪怪的任務，
                            </span>
                            <span className='hero-description-phrase'>
                                通通都能交給她。
                            </span>
                        </span>
                    </p>
                    <div className='hero-actions'>
                        <a className='button' href='#about'>
                            看看她能做什麼 <ArrowDown size={18} />
                        </a>
                    </div>
                </div>
            </div>
            <svg
                aria-hidden='true'
                className='hero-wave'
                preserveAspectRatio='none'
                viewBox='0 0 1440 160'
            >
                <path d='M0 96C240 96 480 32 720 32C960 32 1200 96 1440 96V160H0Z' />
            </svg>
        </section>
    );
}
