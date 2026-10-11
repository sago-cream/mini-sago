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
                <path d='M0 8C160 8 360 12 480 24C556 32 584 48 608 92C636 140 748 148 904 148H1440V160H0Z' />
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
                <path d='M0 0H1440V148C1280 160 1100 152 936 148C752 144 640 152 608 108C576 64 584 40 496 24C352 4 160 8 0 8Z' />
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
