'use client';

import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { FileText, Hash, Pause, Play, Plus, RotateCcw } from 'lucide-react';
import Image from 'next/image';

import type { DemoMessage } from '@/features';

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
    const idleStatus = paused ? '示範已暫停' : ' ';
    const statusText = complete ? '示範完成' : idleStatus;

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
            <div className='discord-channel'>
                <Hash aria-hidden='true' size={22} />
                <strong>{channel}</strong>
                <span>對話示範</span>
            </div>
            <div
                aria-label={`${channel}的示範對話`}
                className='discord-log'
                ref={log}
            >
                {messages.slice(0, shown).map((message, index) => (
                    <div
                        className={`discord-message message-${message.author}`}
                        key={`${message.author}-${index}`}
                    >
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
                                    <span
                                        aria-hidden='true'
                                        className='discord-avatar human-avatar'
                                    >
                                        你
                                    </span>
                                )}
                                <div className='discord-message-body'>
                                    <div className='discord-author'>
                                        <strong>
                                            {message.author === 'sago'
                                                ? '迷你西米露'
                                                : '你'}
                                        </strong>
                                        {message.author === 'sago' && (
                                            <span className='discord-app-tag'>
                                                APP
                                            </span>
                                        )}
                                        <time>
                                            今天 15:
                                            {String(24 + index).padStart(
                                                2,
                                                '0'
                                            )}
                                        </time>
                                    </div>
                                    {message.text !== '' && (
                                        <p>{message.text}</p>
                                    )}
                                    {message.file && (
                                        <div
                                            className={`discord-attachment attachment-${message.file.kind}`}
                                        >
                                            {message.file.kind === 'chart' && (
                                                <div
                                                    aria-label='A 組 18 人、B 組 14 人、C 組 16 人'
                                                    className='demo-chart'
                                                >
                                                    <span>
                                                        A 組<i />
                                                    </span>
                                                    <span>
                                                        B 組<i />
                                                    </span>
                                                    <span>
                                                        C 組<i />
                                                    </span>
                                                </div>
                                            )}
                                            {message.file.kind === 'image' && (
                                                <Image
                                                    alt='示範表情圖片'
                                                    className='demo-image'
                                                    height={80}
                                                    src='/images/minisago3.png'
                                                    width={80}
                                                />
                                            )}
                                            <div className='attachment-caption'>
                                                <FileText
                                                    aria-hidden='true'
                                                    size={20}
                                                />
                                                <div>
                                                    <strong>
                                                        {message.file.name}
                                                    </strong>
                                                    <small>
                                                        {message.file.detail}
                                                    </small>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>
                ))}
            </div>
            <div aria-live='polite' className='discord-status'>
                {!complete && playing && !paused && next?.author === 'sago' ? (
                    <>
                        <span aria-hidden='true' className='typing-dots'>
                            <i />
                            <i />
                            <i />
                        </span>
                        <span>迷你西米露 正在輸入…</span>
                    </>
                ) : (
                    <span>{statusText}</span>
                )}
            </div>
            <div aria-hidden='true' className='discord-composer'>
                <Plus size={20} />
                <span>
                    {shown === 0 && next?.author === 'user'
                        ? next.text
                        : `訊息 #${channel}`}
                </span>
            </div>
            <div className='demo-controls'>
                <p>情境示範，非即時操作</p>
                <div>
                    {!complete && !reduced && (
                        <button
                            aria-label={paused ? '繼續示範' : '暫停示範'}
                            onClick={() => {
                                setPaused((value) => !value);
                            }}
                            type='button'
                        >
                            {paused ? <Play size={15} /> : <Pause size={15} />}
                            {paused ? '繼續' : '暫停'}
                        </button>
                    )}
                    {!reduced && (
                        <button onClick={replay} type='button'>
                            <RotateCcw size={15} />
                            重播
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}
