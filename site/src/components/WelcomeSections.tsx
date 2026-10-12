import type { JSX } from 'react';
import { ArrowRight, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';

import { LANDING_CONVERSATION, SELF_HOST_URL } from '@/features';
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
                    不用背指令，
                    <br />
                    有事直接說。
                </h2>
                <p>
                    像平常聊天一樣，標記迷你西米露，直接說你想做什麼。她能理解你的意思，也能接著對話，問清楚再幫忙。
                </p>
                <Link className='text-link' href='/features/'>
                    探索功能導覽 <ArrowRight aria-hidden='true' size={20} />
                </Link>
            </div>
            <DiscordDemo channel='活動籌備' messages={LANDING_CONVERSATION} />
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
