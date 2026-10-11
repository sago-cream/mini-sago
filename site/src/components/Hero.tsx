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
                        alt='MiniSago 3：藍髮、紫眼的 Sago'
                        className='hero-character'
                        height={1540}
                        priority
                        src='/images/minisago3.png'
                        width={1540}
                    />
                </div>
                <div className='hero-copy'>
                    <h1 id='hero-title'>
                        Small Sago.
                        <br />
                        <span>Big possibilities.</span>
                    </h1>
                    <p className='hero-description'>
                        聊天、查資料、改圖、寫程式。
                        <br />
                        Discord 裡的小事，交給 Sago。
                    </p>
                    <div className='hero-actions'>
                        <a className='button' href='#features'>
                            看看 Sago 會什麼 <ArrowDown size={18} />
                        </a>
                    </div>
                </div>
            </div>
        </section>
    );
}
