import type { JSX } from 'react';
import { ArrowUpRight } from 'lucide-react';
import Image from 'next/image';
import Link from 'next/link';

import { REPOSITORY_URL } from '@/features';

import './SiteChrome.css';

export function SiteHeader({
    active = 'home',
}: {
    readonly active?: 'home' | 'features';
}): JSX.Element {
    return (
        <>
            <a className='skip-link' href='#main'>
                跳到主要內容
            </a>
            <header className='site-header'>
                <Link aria-label='MiniSago 首頁' className='brand' href='/'>
                    <Image
                        alt=''
                        height={40}
                        src='/images/minisago3.png'
                        width={40}
                    />
                    <span>mini sago</span>
                </Link>
                <nav aria-label='主要導覽'>
                    <Link
                        aria-current={active === 'home' ? 'page' : undefined}
                        href='/'
                    >
                        認識迷你西米露
                    </Link>
                    <Link
                        aria-current={
                            active === 'features' ? 'page' : undefined
                        }
                        href='/features/'
                    >
                        功能導覽
                    </Link>
                </nav>
                <a
                    aria-label='MiniSago GitHub 原始碼'
                    className='header-github'
                    href={REPOSITORY_URL}
                >
                    <Image
                        alt=''
                        height={20}
                        src='/logos/github.svg'
                        width={20}
                    />
                    <span>GitHub</span>
                    <ArrowUpRight size={16} />
                </a>
            </header>
        </>
    );
}

export function SiteFooter(): JSX.Element {
    return (
        <footer className='site-footer section-width'>
            <div className='footer-brand'>mini sago</div>
            <a href={REPOSITORY_URL}>
                <Image alt='' height={20} src='/logos/github.svg' width={20} />
                GitHub <ArrowUpRight size={14} />
            </a>
        </footer>
    );
}
