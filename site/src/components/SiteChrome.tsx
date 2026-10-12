import type { JSX } from 'react';
import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { REPOSITORY_URL } from '@/features';

import './SiteChrome.css';

function GitHubLink(): JSX.Element {
    return (
        <a
            aria-label='MiniSago GitHub 原始碼'
            className='github-link'
            href={REPOSITORY_URL}
        >
            <Image alt='' height={20} src='/logos/github.svg' width={20} />
            <span>GitHub</span>
            <ArrowUpRight aria-hidden='true' size={16} />
        </a>
    );
}

interface SiteHeaderProps {
    readonly activePage?: 'intro' | 'features';
}

export function SiteHeader({ activePage }: SiteHeaderProps = {}): JSX.Element {
    return (
        <>
            <a className='skip-link' href='#main'>
                跳到主要內容
            </a>
            <header className='site-header' id='top'>
                <div className='header-inner section-width'>
                    {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Native fragment navigation also scrolls repeated homepage clicks. */}
                    <a
                        aria-label='MiniSago 首頁'
                        className='brand'
                        href='/#top'
                    >
                        <Image
                            alt=''
                            height={40}
                            src='/images/minisago3.png'
                            width={40}
                        />
                        <span>mini sago</span>
                    </a>
                    <nav aria-label='主要導覽' className='header-navigation'>
                        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Use the same native top navigation as the brand. */}
                        <a
                            aria-current={
                                activePage === 'intro' ? 'page' : undefined
                            }
                            href='/#top'
                        >
                            簡介
                        </a>
                        <Link
                            aria-current={
                                activePage === 'features' ? 'page' : undefined
                            }
                            href='/features/'
                        >
                            功能導覽
                        </Link>
                    </nav>
                    <GitHubLink />
                </div>
            </header>
        </>
    );
}

export function SiteFooter(): JSX.Element {
    return (
        <footer className='site-footer section-width'>
            <a
                aria-label='MiniSago 回到頁首'
                className='footer-brand'
                href='#top'
            >
                mini sago
            </a>
            <nav aria-label='網站資訊' className='footer-links'>
                <Link href='/privacy/'>隱私權政策</Link>
                <Link href='/terms/'>使用條款</Link>
                <GitHubLink />
            </nav>
        </footer>
    );
}
