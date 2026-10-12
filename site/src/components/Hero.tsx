import type { JSX } from 'react';
import { ArrowDown, ArrowRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

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
                        不用背指令，
                        <br />
                        <span>有事直接說。</span>
                    </h1>
                    <p className='hero-description'>
                        迷你西米露，住在 Discord 裡的 AI 小幫手。
                        <br />
                        聊天、查資料，還能一起把事情做完。
                    </p>
                    <div className='hero-actions'>
                        <a className='button' href='#about'>
                            看她怎麼幫忙 <ArrowDown size={18} />
                        </a>
                        <Link className='hero-guide-link' href='/features/'>
                            功能導覽 <ArrowRight size={18} />
                        </Link>
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
