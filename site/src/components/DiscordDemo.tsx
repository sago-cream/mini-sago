'use client';

import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Hash, Pause, Play, RotateCcw, Smile } from 'lucide-react';
import Image from 'next/image';

import type { DemoMessage } from '@/features';
import { DiscordAttachment } from './DiscordAttachment';

import './DiscordDemo.css';

interface DemoProps {
    readonly channel: string;
    readonly messages: readonly DemoMessage[];
}
export function DiscordDemo({ channel, messages }: DemoProps): JSX.Element {
    const shell = useRef<HTMLDivElement>(null);
    const log = useRef<HTMLDivElement>(null);
    const [shown, setShown] = useState(0);
    const [playing, setPlaying] = useState(false);
    const [paused, setPaused] = useState(false);
    const [reduced, setReduced] = useState(false);
    const complete = shown >= messages.length;
    const next = messages.at(shown);

    useEffect(() => {
        const motion = globalThis.matchMedia(
            '(prefers-reduced-motion: reduce)'
        );
        function updateMotion() {
            setReduced(motion.matches);
            if (motion.matches) {
                setShown(messages.length);
                setPlaying(false);
            }
        }
        const observer = new IntersectionObserver(
            (entries: ReadonlyArray<{ readonly isIntersecting: boolean }>) => {
                if (entries[0]?.isIntersecting) {
                    updateMotion();
                    if (!motion.matches) {
                        setPlaying(true);
                    }
                } else {
                    setPlaying(false);
                }
            },
            { threshold: 0.15 }
        );
        if (shell.current) {
            observer.observe(shell.current);
        }
        motion.addEventListener('change', updateMotion);
        return () => {
            observer.disconnect();
            motion.removeEventListener('change', updateMotion);
        };
    }, [messages.length]);

    useEffect(() => {
        if (!playing || paused || complete) {
            return undefined;
        }
        const timer = globalThis.setTimeout(
            (count: number) => {
                setShown(count + 1);
            },
            next?.author === 'sago' ? 1600 : 700,
            shown
        );
        return () => {
            globalThis.clearTimeout(timer);
        };
    }, [complete, next?.author, paused, playing, shown]);

    useEffect(() => {
        if (log.current && !reduced) {
            log.current.scrollTop = log.current.scrollHeight;
        }
    }, [reduced, shown]);

    function replay() {
        setShown(reduced ? messages.length : 0);
        setPaused(false);
        setPlaying(!reduced);
    }

    return (
        <div className='discord-demo' ref={shell}>
            <div className='discord-chat'>
                <div className='discord-channel'>
                    <Hash aria-hidden='true' size={22} />
                    <strong>{channel}</strong>
                    <span>對話示範</span>
                    <div className='demo-controls'>
                        {!complete && !reduced && (
                            <button
                                aria-label={paused ? '繼續示範' : '暫停示範'}
                                onClick={() => {
                                    setPaused((value) => !value);
                                }}
                                title={paused ? '繼續示範' : '暫停示範'}
                                type='button'
                            >
                                {paused ? (
                                    <Play aria-hidden='true' size={16} />
                                ) : (
                                    <Pause aria-hidden='true' size={16} />
                                )}
                            </button>
                        )}
                        {!reduced && (
                            <button
                                aria-label='重播'
                                onClick={replay}
                                title='重播'
                                type='button'
                            >
                                <RotateCcw aria-hidden='true' size={16} />
                            </button>
                        )}
                    </div>
                </div>
                <div
                    aria-label={`${channel}的示範對話`}
                    className='discord-log'
                    ref={log}
                >
                    {messages.slice(0, shown).map((message, index) => (
                        <div
                            className={`discord-message message-${message.author} ${message.replyTo === undefined ? '' : 'message-reply'} ${messages.at(index - 1)?.author === message.author && messages.at(index - 1)?.userName === message.userName && index > 0 && message.replyTo === undefined ? 'message-continuation' : ''}`}
                            key={`${message.author}-${index}`}
                        >
                            {message.replyTo !== undefined && (
                                <div className='discord-reply-context'>
                                    <Image
                                        alt=''
                                        className='reply-avatar'
                                        height={16}
                                        src='/demos/discord-avatar.png'
                                        width={16}
                                    />
                                    <strong>@你</strong>
                                    <span>{message.replyTo}</span>
                                </div>
                            )}
                            {message.author === 'notice' ? (
                                <p className='discord-notice'>{message.text}</p>
                            ) : (
                                <>
                                    {message.author === 'sago' ? (
                                        <Image
                                            alt=''
                                            className='discord-avatar'
                                            height={40}
                                            src='/images/minisago3.png'
                                            width={40}
                                        />
                                    ) : (
                                        <Image
                                            alt=''
                                            className='discord-avatar'
                                            height={40}
                                            src='/demos/discord-avatar.png'
                                            width={40}
                                        />
                                    )}
                                    <div className='discord-message-body'>
                                        <div className='discord-author'>
                                            <strong>
                                                {message.author === 'sago'
                                                    ? '迷你西米露'
                                                    : (message.userName ??
                                                      '你')}
                                            </strong>
                                            {message.author === 'sago' && (
                                                <span className='discord-app-tag'>
                                                    應用
                                                </span>
                                            )}
                                            <time>
                                                今天 下午3:
                                                {String(24 + index).padStart(
                                                    2,
                                                    '0'
                                                )}
                                            </time>
                                        </div>
                                        {message.text !== '' && (
                                            <p>
                                                {message.text.startsWith(
                                                    '@迷你西米露'
                                                ) ? (
                                                    <>
                                                        <span className='discord-mention'>
                                                            @迷你西米露
                                                        </span>
                                                        {message.text.slice(
                                                            '@迷你西米露'.length
                                                        )}
                                                    </>
                                                ) : (
                                                    message.text
                                                )}
                                            </p>
                                        )}
                                        {message.list && (
                                            <ul className='discord-message-list'>
                                                {message.list.map((item) => (
                                                    <li key={item}>{item}</li>
                                                ))}
                                            </ul>
                                        )}
                                        {message.links && (
                                            <div className='discord-message-links'>
                                                {message.links.map((link) => (
                                                    <a
                                                        href={link.href}
                                                        key={link.href}
                                                    >
                                                        {link.label}
                                                    </a>
                                                ))}
                                            </div>
                                        )}
                                        {message.emoji && (
                                            <Image
                                                alt={`:${message.emoji.name}:`}
                                                className='discord-emoji'
                                                height={48}
                                                src={message.emoji.src}
                                                width={48}
                                            />
                                        )}
                                        {message.file && (
                                            <DiscordAttachment
                                                file={message.file}
                                            />
                                        )}
                                        {message.embed && (
                                            <div
                                                className='discord-embed'
                                                style={{
                                                    borderLeftColor:
                                                        message.embed.color,
                                                }}
                                            >
                                                <span>
                                                    {message.embed.author}
                                                </span>
                                                <strong>
                                                    {message.embed.title}
                                                </strong>
                                                <p>
                                                    {message.embed.description}
                                                </p>
                                                <small>
                                                    {message.embed.footer}
                                                </small>
                                            </div>
                                        )}
                                        {message.buttons && (
                                            <div
                                                aria-hidden='true'
                                                className='discord-component-buttons'
                                            >
                                                {message.buttons.map(
                                                    (label) => (
                                                        <span key={label}>
                                                            {label}
                                                        </span>
                                                    )
                                                )}
                                            </div>
                                        )}
                                    </div>
                                </>
                            )}
                        </div>
                    ))}
                </div>
                <div aria-live='polite' className='discord-status'>
                    {!complete &&
                    playing &&
                    !paused &&
                    next?.author === 'sago' ? (
                        <>
                            <span aria-hidden='true' className='typing-dots'>
                                <i />
                                <i />
                                <i />
                            </span>
                            <span>迷你西米露 正在輸入…</span>
                        </>
                    ) : (
                        <span />
                    )}
                </div>
                <div aria-hidden='true' className='discord-composer'>
                    <Image
                        alt=''
                        height={24}
                        src='/demos/discord-icons/plus.svg'
                        width={24}
                    />
                    <span>
                        {shown === 0 && next?.author === 'user'
                            ? next.text
                            : `傳訊息到 #${channel}`}
                    </span>
                    <div className='composer-tools'>
                        <Image
                            alt=''
                            className='composer-extra'
                            height={24}
                            src='/demos/discord-icons/gift.svg'
                            width={24}
                        />
                        <Image
                            alt=''
                            className='composer-extra'
                            height={24}
                            src='/demos/discord-icons/gif.svg'
                            width={24}
                        />
                        <Image
                            alt=''
                            className='composer-extra'
                            height={24}
                            src='/demos/discord-icons/sticker.svg'
                            width={24}
                        />
                        <Smile size={22} />
                        <Image
                            alt=''
                            height={24}
                            src='/demos/discord-icons/apps.svg'
                            width={24}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
}
