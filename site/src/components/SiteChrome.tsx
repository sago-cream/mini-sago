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

export function SiteHeader(): JSX.Element {
    return (
        <>
            <a className='skip-link' href='#main'>
                跳到主要內容
            </a>
            <header className='site-header' id='top'>
                <div className='header-inner section-width'>
                    <Link aria-label='MiniSago 首頁' className='brand' href='/'>
                        <Image
                            alt=''
                            height={40}
                            src='/images/minisago3.png'
                            width={40}
                        />
                        <span>mini sago</span>
                    </Link>
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
