import type { JSX } from 'react';
import {
    ArrowUpRight,
    Heart,
    MessageCircle,
    ShieldCheck,
    Sparkles,
} from 'lucide-react';

import { INVITE_URL } from '@/features';
import { FeatureExample } from './FeatureDetails';

import './WelcomeSections.css';

const STRENGTHS = [
    { icon: MessageCircle, title: '不用背指令', text: '直接說你想做什麼。' },
    { icon: ShieldCheck, title: '依權限開放', text: '依身分與頻道提供功能。' },
    { icon: Heart, title: '記得這個聊天室', text: '記住伺服器的用語。' },
] as const;

export function Strengths(): JSX.Element {
    return (
        <section
            aria-labelledby='strengths-title'
            className='strengths section-width'
            id='about'
        >
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
        </section>
    );
}

export function GettingStarted(): JSX.Element {
    return (
        <section
            aria-labelledby='start-title'
            className='getting-started section-width'
            id='start'
        >
            <div className='start-copy'>
                <h2 id='start-title'>第一句，就從這裡開始。</h2>
                <p>
                    在有 Sago 的聊天室標記她，或用 <code>/ask</code> 私下提問。
                </p>
                <p>功能開放情況，請向擁有者確認。</p>
            </div>
            <div className='first-message'>
                <Sparkles aria-hidden='true' size={24} />
                <FeatureExample
                    feature={{
                        title: '第一句',
                        example: '@Sago 你能幫我做什麼？',
                    }}
                />
            </div>
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
                <h2 id='invite-title'>把 Sago 帶進你的伺服器。</h2>
                <p>邀請後，功能依伺服器、頻道與身分組設定開放。</p>
            </div>
            <a className='button' href={INVITE_URL}>
                邀請 Sago <ArrowUpRight aria-hidden='true' size={18} />
            </a>
        </section>
    );
}
