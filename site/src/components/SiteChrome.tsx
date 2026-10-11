import type { JSX } from 'react';
import { ArrowUpRight, Code2 } from 'lucide-react';
import Image from 'next/image';

import { REPOSITORY_URL } from '@/features';

import './SiteChrome.css';

export function SiteHeader(): JSX.Element {
    return (
        <>
            <a className='skip-link' href='#main'>
                跳到主要內容
            </a>
            <header className='site-header'>
                <a aria-label='MiniSago 首頁' className='brand' href='#main'>
                    <Image
                        alt=''
                        height={40}
                        src='/images/minisago3.png'
                        width={40}
                    />
                    <span>
                        mini sago<span className='brand-star'>*</span>
                    </span>
                </a>
                <nav aria-label='主要導覽'>
                    <a href='#features'>功能一覽</a>
                </nav>
                <a
                    aria-label='MiniSago GitHub 原始碼'
                    className='header-github'
                    href={REPOSITORY_URL}
                >
                    <Code2 size={20} />
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
            <div className='footer-brand'>
                mini sago<span>*</span>
            </div>
            <a href={REPOSITORY_URL}>
                GitHub <ArrowUpRight size={14} />
            </a>
        </footer>
    );
}
