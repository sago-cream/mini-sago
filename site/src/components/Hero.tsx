import type { JSX } from 'react';
import { ArrowDown } from 'lucide-react';
import Image from 'next/image';

import { Strengths } from './WelcomeSections';

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
                        priority
                        src='/images/minisago3.png'
                        width={1540}
                    />
                </div>
                <div className='hero-copy'>
                    <h1 id='hero-title'>
                        聊得來，
                        <br />
                        <span>也幫得上忙。</span>
                    </h1>
                    <p className='hero-description'>
                        Discord 裡的小事，交給迷你西米露。
                    </p>
                    <Strengths />
                    <div className='hero-actions'>
                        <a className='button' href='#features'>
                            看看她會什麼 <ArrowDown size={18} />
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
                <path d='M0 88C240 72 440 72 600 88C800 112 920 152 1120 152H1440V160H0Z' />
            </svg>
        </section>
    );
}
