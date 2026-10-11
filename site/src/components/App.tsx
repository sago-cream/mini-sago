import type { JSX } from 'react';
import { ArrowDown, ArrowUpRight, Code2, Heart, Sparkles } from 'lucide-react';
import Image from 'next/image';

import { HIGHLIGHTS, REPOSITORY_URL } from '@/features';
import { FeatureExplorer } from './FeatureExplorer';
import { Hero } from './Hero';

import './App.css';

export function App(): JSX.Element {
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
                    <a href='#about'>認識 Sago</a>
                    <a href='#features'>功能小冊</a>
                    <a href='#start'>怎麼開始</a>
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
            <main id='main'>
                <Hero />
                <section
                    aria-labelledby='intro-title'
                    className='intro section-width'
                    id='about'
                >
                    <div className='intro-heading'>
                        <h2 id='intro-title'>
                            住在 Discord 裡，
                            <br />
                            把日常變輕一點。
                        </h2>
                    </div>
                    <div className='highlights'>
                        {HIGHLIGHTS.map(({ icon: Icon, title, text }) => (
                            <div className='highlight' key={title}>
                                <span className='highlight-icon'>
                                    <Icon size={22} />
                                </span>
                                <div>
                                    <h3>{title}</h3>
                                    <p>{text}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </section>
                <FeatureExplorer />
                <section
                    aria-labelledby='start-title'
                    className='getting-started section-width'
                    id='start'
                >
                    <div className='start-copy'>
                        <h2 id='start-title'>第一句，就從這裡開始。</h2>
                        <p>
                            在有 Sago 的聊天室標記她，或用 <code>/ask</code>{' '}
                            私下提問。
                        </p>
                        <p>功能是否開放，請主人確認。</p>
                    </div>
                    <div className='first-message'>
                        <Sparkles size={24} />
                        <span>@Sago 你能幫我做什麼？</span>
                    </div>
                </section>
                <section
                    aria-labelledby='faq-title'
                    className='faq section-width'
                >
                    <div>
                        <h2 id='faq-title'>你可能想知道</h2>
                    </div>
                    <div className='faq-list'>
                        <details>
                            <summary>每個伺服器都能用全部功能嗎？</summary>
                            <p>
                                依主人設定的伺服器、頻道、身分組與整合服務開放。
                            </p>
                        </details>
                        <details>
                            <summary>Sago 會看到所有聊天和檔案嗎？</summary>
                            <p>
                                聊天與雲端資料依提問者權限讀取；Mac
                                檔案限主人使用，僅搜尋允許的目錄。
                            </p>
                        </details>
                        <details>
                            <summary>
                                會直接修改日曆、合併 PR 或部署嗎？
                            </summary>
                            <p>
                                日曆修改需提問者確認；發布
                                PR、合併與部署需主人明確授權。
                            </p>
                        </details>
                    </div>
                </section>
                <div className='closing section-width'>
                    <span aria-hidden='true' className='closing-star'>
                        ✳
                    </span>
                    <p>
                        一點點 Sago，
                        <br />
                        <strong>多一點輕鬆。</strong>
                    </p>
                    <a className='button' href='#features'>
                        找找能幫上的忙 <ArrowDown size={18} />
                    </a>
                </div>
            </main>
            <footer className='site-footer section-width'>
                <div className='footer-brand'>
                    mini sago<span>*</span>
                    <p>Made for little everyday things.</p>
                </div>
                <div>
                    <a href={REPOSITORY_URL}>
                        GitHub <ArrowUpRight size={14} />
                    </a>
                    <span className='footer-credit'>
                        <Heart size={14} /> 小幫手，也有大大的心。
                    </span>
                </div>
            </footer>
        </>
    );
}
