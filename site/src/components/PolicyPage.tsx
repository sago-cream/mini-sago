import type { JSX, ReactNode } from 'react';

import { POLICY_UPDATED, SUPPORT_EMAIL } from '@/policies';
import { SiteFooter, SiteHeader } from './SiteChrome';

import './PolicyPage.css';

interface PolicyPageProps {
    readonly title: string;
    readonly intro: string;
    readonly children: ReactNode;
}

export function PolicyPage({
    title,
    intro,
    children,
}: PolicyPageProps): JSX.Element {
    return (
        <>
            <SiteHeader />
            <main className='policy-page section-width' id='main'>
                <article className='policy-content'>
                    <header className='policy-heading'>
                        <h1>{title}</h1>
                        <p>{intro}</p>
                        <span>
                            更新日期：
                            <time dateTime={POLICY_UPDATED}>
                                {POLICY_UPDATED}
                            </time>
                        </span>
                    </header>
                    {children}
                    <section aria-labelledby='policy-contact' id='contact'>
                        <h2 id='policy-contact'>聯絡與協助</h2>
                        <p>
                            服務問題、隱私疑問或資料刪除請求，請寄信至{' '}
                            <a href={`mailto:${SUPPORT_EMAIL}`}>
                                {SUPPORT_EMAIL}
                            </a>
                            。 請提供相關 Discord
                            使用者、伺服器或訊息資訊，方便確認範圍；不需要提供密碼或存取憑證。
                        </p>
                    </section>
                </article>
            </main>
            <SiteFooter />
        </>
    );
}
