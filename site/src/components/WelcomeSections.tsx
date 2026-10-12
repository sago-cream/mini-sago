import type { JSX } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { SELF_HOST_URL } from '@/features';
import { ShowcaseCarousel } from './ShowcaseCarousel';

import './WelcomeSections.css';

export function NaturalLanguage(): JSX.Element {
    return (
        <section
            aria-labelledby='natural-title'
            className='natural-section section-width'
            id='about'
        >
            <div className='natural-copy'>
                <h2 id='natural-title'>以自然語言取代成堆指令</h2>
                <p>
                    標記迷你西米露並直接告訴她你想做什麼。她能自主思考並調用工具完成你的需求。
                </p>
                <Link className='text-link' href='/features/'>
                    探索所有工具 <ArrowRight aria-hidden='true' size={20} />
                </Link>
            </div>
            <ShowcaseCarousel />
        </section>
    );
}
export function AccessSago(): JSX.Element {
    return (
        <section
            aria-labelledby='access-title'
            className='access-sago section-width'
            id='access'
        >
            <div>
                <h2 id='access-title'>想和迷你西米露聊聊？</h2>
                <p>
                    如果你認識我，很可能已經能在我們的 Discord 伺服器裡使用她。
                    <br />
                    想在自己的伺服器使用？你也可以依照開源指南，架設自己的迷你西米露。
                </p>
            </div>
            <a className='button' href={SELF_HOST_URL}>
                自行架設指南 <ArrowUpRight aria-hidden='true' size={18} />
            </a>
        </section>
    );
}
