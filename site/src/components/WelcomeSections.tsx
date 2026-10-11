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
                <path
                    className='strength-wave-desktop'
                    d='M0 8C240 8 520 12 760 20C824 24 848 44 872 88C904 144 1040 148 1200 148H1440V160H0Z'
                />
                <path
                    className='strength-wave-mobile'
                    d='M0 16C360 0 1080 0 1440 16V160H0Z'
                />
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
                className='strength-wave'
                preserveAspectRatio='none'
                viewBox='0 0 1440 160'
            >
                <path d='M0 0H1440V148C1320 160 1200 152 1120 148C1000 144 904 152 872 108C840 64 848 40 760 24C560 4 240 8 0 8Z' />
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
