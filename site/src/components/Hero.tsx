import type { JSX } from 'react';
import { ArrowDown, CalendarDays, Heart, MessageCircle } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import './Hero.css';

export function Hero(): JSX.Element {
    return (
        <section aria-labelledby='hero-title' className='hero'>
            <div className='hero-inner section-width'>
                <div className='hero-copy'>
                    <h1 id='hero-title'>
                        Small Sago.
                        <br />
                        <span>Big possibilities.</span>
                        <sup aria-hidden='true'>✳</sup>
                    </h1>
                    <p className='hero-description'>
                        聊天、查資料、改圖、寫程式。
                        <br />
                        Discord 裡的小事，交給 Sago。
                    </p>
                    <div className='hero-actions'>
                        <a className='button' href='#walkthrough'>
                            帶我認識 Sago <ArrowDown size={18} />
                        </a>
                        <Link className='text-link' href='/features/'>
                            功能速查
                        </Link>
                    </div>
                </div>
                <div className='hero-art'>
                    <span aria-hidden='true' className='portrait-orbit' />
                    <div className='portrait-frame'>
                        <Image
                            alt='MiniSago 3：藍髮、紫眼的 Sago'
                            className='hero-character'
                            height={1540}
                            priority
                            src='/images/minisago3.png'
                            width={1540}
                        />
                    </div>
                    <span aria-hidden='true' className='portrait-spark'>
                        ✳
                    </span>
                    <span
                        aria-hidden='true'
                        className='portrait-bubble bubble-chat'
                    >
                        <MessageCircle size={28} />
                    </span>
                    <span
                        aria-hidden='true'
                        className='portrait-bubble bubble-calendar'
                    >
                        <CalendarDays size={24} />
                    </span>
                    <span
                        aria-hidden='true'
                        className='portrait-bubble bubble-heart'
                    >
                        <Heart size={24} />
                    </span>
                </div>
            </div>
        </section>
    );
}
