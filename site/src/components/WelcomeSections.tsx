import type { JSX } from 'react';
import { ArrowUpRight, Heart, MessageCircle, Search } from 'lucide-react';

import { INVITE_URL } from '@/features';

import './WelcomeSections.css';

const STRENGTHS = [
    { icon: MessageCircle, title: '不用背指令', text: '直接說你想做什麼。' },
    {
        icon: Search,
        title: '查資料，也能動手做',
        text: '找來源、算表格、處理圖片。',
    },
    { icon: Heart, title: '記得這個聊天室', text: '記住伺服器的用語。' },
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
                viewBox='0 0 1440 96'
            >
                <path d='M0 48C240 -16 480 -16 720 48S1200 112 1440 48V96H0Z' />
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
                viewBox='0 0 1440 96'
            >
                <path d='M0 48C240 -16 480 -16 720 48S1200 112 1440 48V96H0Z' />
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
