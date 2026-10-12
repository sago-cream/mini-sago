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
                    目前迷你西米露只在部分伺服器中活躍。你可以私訊建議我在其他伺服器啟用，或依照開源自架指南，架設自己的迷你西米露。
                </p>
            </div>
            <a className='button' href={SELF_HOST_URL}>
                開源自架指南 <ArrowUpRight aria-hidden='true' size={18} />
            </a>
        </section>
    );
}
