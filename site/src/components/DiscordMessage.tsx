import type { JSX } from 'react';
import { Mic } from 'lucide-react';
import Image from 'next/image';

import type { DemoMessage } from '@/features';
import { DiscordAttachment } from './DiscordAttachment';

interface MessageProps {
    readonly message: DemoMessage;
    readonly index: number;
    readonly continuation: boolean;
    readonly cancelled: boolean;
    readonly onConfirm: () => void;
    readonly onCancel: () => void;
    readonly onDismiss: () => void;
}

function MentionText({ text }: { readonly text: string }): JSX.Element {
    return (
        <>
            {text.split(/(@迷你西米露|@你)/gu).map((part, index) =>
                part === '@迷你西米露' || part === '@你' ? (
                    <span className='discord-mention' key={index}>
                        {part}
                    </span>
                ) : (
                    <span key={index}>{part}</span>
                )
            )}
        </>
    );
}

export function DiscordMessage({
    message,
    index,
    continuation,
    cancelled,
    onConfirm,
    onCancel,
    onDismiss,
}: MessageProps): JSX.Element {
    if (message.author === 'notice') {
        return (
            <div className='discord-scene-divider'>
                <span>{message.text}</span>
            </div>
        );
    }
    return (
        <div
            className={`discord-message message-${message.author} ${message.replyTo === undefined ? '' : 'message-reply'} ${continuation ? 'message-continuation' : ''} ${message.ephemeral === true ? 'message-ephemeral' : ''} ${message.command ? 'message-command' : ''}`}
        >
            {message.command && (
                <div className='discord-command-context'>
                    <Image
                        alt=''
                        className='reply-avatar'
                        height={16}
                        src='/demos/discord-avatar.png'
                        width={16}
                    />
                    <strong>你</strong> 已使用{' '}
                    <span
                        className='discord-command-name'
                        title={message.command.prompt}
                    >
                        {message.command.name}
                    </span>
                </div>
            )}
            {message.replyTo !== undefined && (
                <div className='discord-reply-context'>
                    <Image
                        alt=''
                        className='reply-avatar'
                        height={16}
                        src='/demos/discord-avatar.png'
                        width={16}
                    />
                    <strong>@{message.replyUserName ?? '你'}</strong>
                    <span>{message.replyTo}</span>
                </div>
            )}
            <Image
                alt=''
                className='discord-avatar'
                height={40}
                src={
                    message.author === 'sago'
                        ? '/images/minisago3.png'
                        : '/demos/discord-avatar.png'
                }
                width={40}
            />
            <div className='discord-message-body'>
                <div className='discord-author'>
                    <strong>
                        {message.author === 'sago'
                            ? '迷你西米露'
                            : (message.userName ?? '你')}
                    </strong>
                    {(message.author === 'sago' || message.app === true) && (
                        <span className='discord-app-tag'>應用</span>
                    )}
                    <time>
                        {message.time ??
                            `今天 下午3:${String(24 + index).padStart(2, '0')}`}
                    </time>
                </div>
                {message.spoken === true && (
                    <span className='discord-speech-label'>
                        <Mic aria-hidden='true' size={14} />
                        語音情境・示範逐字稿
                    </span>
                )}
                {cancelled && message.confirmation ? (
                    <p>已取消，不會建立活動或寄出邀請。</p>
                ) : (
                    <>
                        {message.prelude !== undefined && (
                            <p>{message.prelude}</p>
                        )}
                        {message.heading !== undefined && (
                            <h3 className='discord-message-heading'>
                                {message.heading}
                            </h3>
                        )}
                        {message.text !== '' && (
                            <p>
                                <MentionText text={message.text} />
                            </p>
                        )}
                        {message.code !== undefined && (
                            <pre className='discord-code'>
                                <code>{message.code}</code>
                            </pre>
                        )}
                        {message.quote !== undefined && (
                            <blockquote className='discord-quote'>
                                {message.quote}
                            </blockquote>
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
                                    <a href={link.href} key={link.href}>
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
                            <DiscordAttachment file={message.file} />
                        )}
                        {message.embed && (
                            <div
                                className='discord-embed'
                                style={{ borderLeftColor: message.embed.color }}
                            >
                                <span>{message.embed.author}</span>
                                <strong>{message.embed.title}</strong>
                                <p>{message.embed.description}</p>
                                {message.embed.footer !== '' && (
                                    <small>{message.embed.footer}</small>
                                )}
                            </div>
                        )}
                        {message.confirmation && (
                            <div className='discord-component-buttons'>
                                <button onClick={onConfirm} type='button'>
                                    {message.confirmation.confirmLabel}
                                </button>
                                <button onClick={onCancel} type='button'>
                                    {message.confirmation.cancelLabel}
                                </button>
                            </div>
                        )}
                    </>
                )}
                {message.ephemeral === true && (
                    <div className='discord-ephemeral-footer'>
                        <Image
                            alt=''
                            height={16}
                            src='/demos/discord-icons/visibility.svg'
                            width={16}
                        />
                        <span>只有您才能看到這個 ·</span>
                        <button onClick={onDismiss} type='button'>
                            刪除這則訊息
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
