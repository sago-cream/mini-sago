import type { JSX } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { CONTACT_URL, LANDING_CONVERSATION } from '@/features';
import { DiscordDemo } from './DiscordDemo';

import './WelcomeSections.css';

export function NaturalLanguage(): JSX.Element {
    return (
        <section
            aria-labelledby='natural-title'
            className='natural-section section-width'
            id='about'
        >
            <div className='natural-copy'>
                <h2 id='natural-title'>
                    一個請求，
                    <br />
                    可以不只一件事。
                </h2>
                <p>
                    像跟朋友說話一樣，告訴她你想做什麼。條件、附件、好幾件事，都可以放在同一個請求裡。
                </p>
                <p>她能接著追問、找資料，再動手完成。你只要專心在事情本身。</p>
            </div>
            <DiscordDemo channel='活動籌備' messages={LANDING_CONVERSATION} />
            <div className='natural-guide-cta'>
                <Link className='text-link' href='/features/'>
                    探索功能導覽 <ArrowRight aria-hidden='true' size={20} />
                </Link>
            </div>
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
                <h2 id='access-title'>想讓迷你西米露幫上忙？</h2>
                <p>
                    目前僅供個人使用，尚未開放自由加入伺服器。
                    <br />
                    想試試看，可以先私訊我，聊聊你的需求與使用權限。
                </p>
            </div>
            <a className='button' href={CONTACT_URL}>
                私訊我，申請使用 <ArrowUpRight aria-hidden='true' size={18} />
            </a>
        </section>
    );
}
