import type { JSX } from 'react';
import { ArrowUpRight, Heart, MessageCircle, Search } from 'lucide-react';

import { INVITE_URL } from '@/features';

import './WelcomeSections.css';

const STRENGTHS = [
    {
        icon: MessageCircle,
        title: '隨意交談，不用背指令',
        text: '迷你西米露能直接理解對話',
    },
    {
        icon: Search,
        title: '讓 Discord 也能有生產力',
        text: '她也能搜尋並整理伺服器或網路資料',
    },
    { icon: Heart, title: '融入你的聊天室', text: '記住伺服器的用語。' },
] as const;

export function Strengths(): JSX.Element {
    return (
        <section
            aria-labelledby='strengths-title'
            className='strength-band'
            id='about'
        >
            <svg
                aria-hidden='true'
                className='strength-wave'
                preserveAspectRatio='none'
                viewBox='0 0 1440 160'
            >
                <path d='M0 80C120 110 156 10 280 20C402 30 424 132 548 100C662 70 702 8 816 28C934 48 988 152 1110 116C1240 78 1294 14 1440 52V160H0Z' />
            </svg>
            <div className='strength-band-body'>
                <div className='strengths section-width'>
                    <h2 id='strengths-title'>
                        住在 Discord 裡，
                        <br />
                        把日常變輕一點。
                    </h2>
                    <ul className='strength-list'>
                        {STRENGTHS.map(({ icon: Icon, title, text }) => (
                            <li className='strength' key={title}>
                                <span className='strength-icon'>
                                    <Icon aria-hidden='true' size={22} />
                                </span>
                                <div>
                                    <h3>{title}</h3>
                                    <p>{text}</p>
                                </div>
                            </li>
                        ))}
                    </ul>
                </div>
            </div>
            <svg
                aria-hidden='true'
                className='strength-wave strength-wave-bottom'
                preserveAspectRatio='none'
                viewBox='0 0 1440 160'
            >
                <path d='M0 0H1440V60C1310 8 1268 126 1140 112C1000 98 970 22 848 42C722 62 700 152 572 132C440 112 394 32 268 54C156 74 108 146 0 106Z' />
            </svg>
        </section>
    );
}

export function InviteSago(): JSX.Element {
    return (
        <section
            aria-labelledby='invite-title'
            className='invite-sago section-width'
            id='invite'
        >
            <div>
                <h2 id='invite-title'>把迷你西米露帶進你的伺服器。</h2>
                <p>邀請後，功能依伺服器、頻道與身分組設定開放。</p>
            </div>
            <a className='button' href={INVITE_URL}>
                邀請迷你西米露 <ArrowUpRight aria-hidden='true' size={18} />
            </a>
        </section>
    );
}
