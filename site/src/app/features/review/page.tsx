import { Hash } from 'lucide-react';
import type { Metadata } from 'next';

import { DiscordMessage } from '@/components/DiscordMessage';
import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { FEATURE_SECTIONS, FEATURES } from '@/features';
import type { DemoMessage } from '@/features';

import '@/components/DiscordDemo.css';
import './review.css';

export const metadata: Metadata = {
    title: '功能文案總覽 — MiniSago',
    robots: { index: false, follow: false },
    alternates: { canonical: '/features/review/' },
};

export default function FeatureCopyReviewPage() {
    return (
        <>
            <SiteHeader />
            <main className='feature-review section-width' id='main'>
                <header className='feature-review-heading'>
                    <h1>功能文案總覽</h1>
                    <a href='/features/'>回到功能導覽</a>
                </header>
                {FEATURE_SECTIONS.map((section) => (
                    <section
                        aria-labelledby={`review-section-${section.id}`}
                        className='feature-review-group'
                        key={section.id}
                    >
                        <h2 id={`review-section-${section.id}`}>
                            {section.title}
                        </h2>
                        {FEATURES.filter(
                            (feature) => feature.section === section.id
                        ).map((feature) => (
                            <article
                                aria-labelledby={`review-title-${feature.id}`}
                                className='feature-review-item'
                                id={feature.id}
                                key={feature.id}
                            >
                                <h3 id={`review-title-${feature.id}`}>
                                    <a href={`#${feature.id}`}>
                                        {feature.title}
                                    </a>
                                </h3>
                                <p className='feature-review-description'>
                                    {feature.description}
                                </p>
                                <div className='discord-chat'>
                                    <div className='discord-channel'>
                                        <Hash aria-hidden='true' size={22} />
                                        <strong>{feature.channel}</strong>
                                        <span>對話示範</span>
                                    </div>
                                    <div
                                        aria-label={`${feature.title}的完整示範對話`}
                                        className='discord-log'
                                    >
                                        {feature.messages.map(
                                            (message: DemoMessage, index) => (
                                                <div key={index}>
                                                    {message.command && (
                                                        <p className='feature-review-command'>
                                                            /
                                                            {
                                                                message.command
                                                                    .name
                                                            }{' '}
                                                            {
                                                                message.command
                                                                    .prompt
                                                            }
                                                        </p>
                                                    )}
                                                    <DiscordMessage
                                                        cancelled={false}
                                                        continuation={false}
                                                        index={index}
                                                        message={message}
                                                    />
                                                </div>
                                            )
                                        )}
                                    </div>
                                </div>
                                {feature.note !== '' && (
                                    <p className='feature-review-note'>
                                        {feature.note}
                                    </p>
                                )}
                            </article>
                        ))}
                    </section>
                ))}
            </main>
            <SiteFooter />
        </>
    );
}
