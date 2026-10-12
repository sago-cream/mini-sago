'use client';

import { useEffect, useRef, useState } from 'react';
import type { JSX } from 'react';
import { Hash, RotateCcw, Smile } from 'lucide-react';
import Image from 'next/image';

import type { DemoMessage } from '@/features';
import { DiscordMessage } from './DiscordMessage';

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
    const [reduced, setReduced] = useState(false);
    const [cancelled, setCancelled] = useState(false);
    const [dismissed, setDismissed] = useState<readonly number[]>([]);
    const complete = cancelled || shown >= messages.length;
    const awaitingConfirmation =
        !cancelled && messages.at(shown - 1)?.confirmation !== undefined;
    const visible = messages
        .slice(0, shown)
        .map((message, index) => ({ message, index }));
    const replaced = new Set(
        visible.flatMap(({ message }) =>
            message.replaces === undefined ? [] : [message.replaces]
        )
    );
    const displayed = visible.filter(
        ({ index }) => !replaced.has(index) && !dismissed.includes(index)
    );
    const confirmationIndex = messages.findIndex(
        (message) => message.confirmation !== undefined
    );
    const reducedCount =
        confirmationIndex === -1 ? messages.length : confirmationIndex + 1;
    const next = messages.at(shown);
    const initialCommand = shown === 0 ? next?.command : undefined;
    const initialText =
        shown === 0 && next?.author === 'user'
            ? next.text
            : `傳訊息到 #${channel}`;

    useEffect(() => {
        const motion = globalThis.matchMedia(
            '(prefers-reduced-motion: reduce)'
        );
        function updateMotion() {
            setReduced(motion.matches);
            if (motion.matches) {
                setShown((count) => Math.max(count, reducedCount));
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
    }, [reducedCount]);

    useEffect(() => {
        if (!playing || complete || awaitingConfirmation) {
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
    }, [awaitingConfirmation, complete, next?.author, playing, shown]);

    useEffect(() => {
        if (log.current && !reduced) {
            log.current.scrollTop = log.current.scrollHeight;
        }
    }, [reduced, shown]);

    function replay() {
        setShown(reduced ? reducedCount : 0);
        setCancelled(false);
        setDismissed([]);
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
                        {(!reduced ||
                            cancelled ||
                            dismissed.length > 0 ||
                            (complete && confirmationIndex !== -1)) && (
                            <button
                                aria-label='重播'
                                disabled={
                                    playing &&
                                    !complete &&
                                    !awaitingConfirmation
                                }
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
                    {displayed.map(({ message, index }, position) => (
                        <DiscordMessage
                            cancelled={cancelled}
                            continuation={
                                position > 0 &&
                                message.author !== 'notice' &&
                                message.command === undefined &&
                                message.ephemeral !== true &&
                                message.spoken !== true &&
                                message.replaces === undefined &&
                                message.replyTo === undefined &&
                                displayed.at(position - 1)?.message.author ===
                                    message.author &&
                                displayed.at(position - 1)?.message.userName ===
                                    message.userName
                            }
                            index={index}
                            key={`${message.author}-${index}`}
                            message={message}
                            onCancel={() => {
                                setCancelled(true);
                            }}
                            onConfirm={() => {
                                setShown(reduced ? messages.length : shown + 1);
                            }}
                            onDismiss={() => {
                                setDismissed((previous) => [
                                    ...previous,
                                    index,
                                ]);
                            }}
                        />
                    ))}
                </div>
                <div aria-live='polite' className='discord-status'>
                    {awaitingConfirmation && (
                        <span>選擇確認或取消，繼續示範</span>
                    )}
                    {!awaitingConfirmation &&
                        !complete &&
                        playing &&
                        next?.author === 'sago' && (
                            <>
                                <span
                                    aria-hidden='true'
                                    className='typing-dots'
                                >
                                    <i />
                                    <i />
                                    <i />
                                </span>
                                <span>迷你西米露 正在輸入…</span>
                            </>
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
                        {initialCommand === undefined ? (
                            initialText
                        ) : (
                            <>
                                <span className='composer-command-name'>
                                    /{initialCommand.name}
                                </span>{' '}
                                <span className='composer-option-name'>
                                    prompt
                                </span>{' '}
                                {initialCommand.prompt}
                            </>
                        )}
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
