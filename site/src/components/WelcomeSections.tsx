import type { JSX } from 'react';
import { ArrowUpRight } from 'lucide-react';

import { INVITE_URL } from '@/features';

import './WelcomeSections.css';

const STRENGTHS = [
    {
        title: '隨意交談，不用背指令',
        text: '迷你西米露能直接理解對話',
    },
    {
        title: '讓 Discord 也能有生產力',
        text: '她也能搜尋並整理伺服器或網路資料',
    },
    { title: '融入你的聊天室', text: '記住伺服器的用語。' },
] as const;

export function Strengths(): JSX.Element {
    return (
        <ul className='strength-list' id='about'>
            {STRENGTHS.map(({ title, text }) => (
                <li className='strength' key={title}>
                    <h2>{title}</h2>
                    <p>{text}</p>
                </li>
            ))}
        </ul>
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
