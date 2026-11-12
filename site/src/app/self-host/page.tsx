import type { Metadata } from 'next';

import { SiteFooter, SiteHeader } from '@/components/SiteChrome';
import { REPOSITORY_URL } from '@/features';
import { pageMetadata } from '@/metadata';

import './self-host.css';

export const metadata: Metadata = pageMetadata(
    '開源自架指南 — mini sago',
    '從 Discord 應用程式、Bot 設定與聊天 Worker，到第一則回覆與日常維運，依序架設自己的迷你西米露。',
    '/self-host/'
);

const sections = [
    { id: 'requirements', title: '準備環境' },
    { id: 'discord', title: '建立 Discord Bot' },
    { id: 'core', title: '啟動 Bot 主程式' },
    { id: 'worker', title: '連接聊天 Worker' },
    { id: 'verify', title: '確認第一則回覆' },
    { id: 'operations', title: '維運與進階功能' },
] as const;

function doc(path: string): string {
    return `${REPOSITORY_URL}/blob/main/${path}`;
}

export default function SelfHostPage() {
    return (
        <>
            <SiteHeader activePage='self-host' />
            <main className='self-host-page section-width' id='main'>
                <header className='self-host-heading'>
                    <h1>架設自己的迷你西米露</h1>
                    <p>
                        從一個 Discord Bot 開始，讓她在你的伺服器裡回覆訊息。
                        先完成基本聊天，再依需要串接語音、信箱與開發工具。
                    </p>
                    <a href={doc('docs/self-host.md')}>
                        在 GitHub 閱讀英文指南
                    </a>
                </header>
                <div className='self-host-layout'>
                    <nav aria-label='自架指南章節' className='self-host-nav'>
                        <ol>
                            {sections.map(({ id, title }) => (
                                <li key={id}>
                                    <a href={`#${id}`}>{title}</a>
                                </li>
                            ))}
                        </ol>
                    </nav>
                    <article className='self-host-content'>
                        <section
                            aria-labelledby='requirements-title'
                            id='requirements'
                        >
                            <h2 id='requirements-title'>1. 準備環境</h2>
                            <p>
                                基本聊天需要 Bot 主程式與至少一個已登入的
                                Worker。 Worker
                                主動連回主程式，兩者可以放在不同主機。
                            </p>
                            <dl className='self-host-requirements'>
                                <div>
                                    <dt>Bot 主程式</dt>
                                    <dd>
                                        Discord 應用程式、Bun
                                        與可持續執行的主機。 對外提供
                                        HTTPS，反向代理需支援 WebSocket。
                                    </dd>
                                </div>
                                <div>
                                    <dt>聊天 Worker</dt>
                                    <dd>
                                        已登入 Codex
                                        的執行環境、持久儲存空間，以及對外
                                        HTTPS／WSS 連線。本頁採 Linux Docker
                                        Compose； Mac 可改用{' '}
                                        <a
                                            href={doc(
                                                'docs/workers.md#mac-helper'
                                            )}
                                        >
                                            Mac helper
                                        </a>
                                        。
                                    </dd>
                                </div>
                                <div>
                                    <dt>T3 開發環境（選用）</dt>
                                    <dd>
                                        擁有者的程式開發工作另由 T3 執行。
                                        先完成聊天，再設定專案與模型供應商。
                                    </dd>
                                </div>
                            </dl>
                            <p>
                                想先了解各服務如何分工，可閱讀{' '}
                                <a href={doc('docs/architecture.md')}>
                                    系統架構
                                </a>
                                。 網站本身是靜態頁面，架設網站不會啟動 Discord
                                Bot。
                            </p>
                        </section>
                        <section aria-labelledby='discord-title' id='discord'>
                            <h2 id='discord-title'>2. 建立 Discord Bot</h2>
                            <ol>
                                <li>
                                    在 Discord Developer Portal 建立應用程式與
                                    Bot。
                                </li>
                                <li>
                                    開啟 Bot → Privileged Gateway Intents →
                                    Message Content。
                                </li>
                                <li>
                                    將 Installation → Install Link 設為 Discord
                                    Provided Link。
                                </li>
                                <li>
                                    準備應用程式 ID、Bot token、你的使用者 ID
                                    與測試伺服器 ID。
                                </li>
                            </ol>
                            <p>
                                Token 請放在私有環境檔中。
                                完整邀請與權限說明請見{' '}
                                <a href={doc('docs/discord-setup.md')}>
                                    Discord 設定
                                </a>
                                。
                            </p>
                        </section>
                        <section aria-labelledby='core-title' id='core'>
                            <h2 id='core-title'>3. 啟動 Bot 主程式</h2>
                            <p>
                                取得程式、安裝依賴，並產生一組 Worker 連線密鑰：
                            </p>
                            <pre aria-label='下載與安裝指令' tabIndex={0}>
                                <code>{`git clone https://github.com/sago-cream/mini-sago.git
cd mini-sago
bun install --frozen-lockfile
bun install --cwd worker --frozen-lockfile
cp .env.example .env.local
chmod 600 .env.local
openssl rand -hex 32`}</code>
                            </pre>
                            <p>
                                將產生的密鑰私下保存，編輯{' '}
                                <code>.env.local</code>：
                            </p>
                            <ul className='self-host-settings'>
                                <li>
                                    <code>DISCORD_APPLICATION_ID</code>、
                                    <code>DISCORD_BOT_TOKEN</code>：你的應用程式
                                    ID 與 token。
                                </li>
                                <li>
                                    <code>DISCORD_GUILD_ID</code>：測試伺服器
                                    ID，也決定 <code>/ask</code> 的註冊範圍。
                                </li>
                                <li>
                                    <code>MINISAGO_CHATBOT_OWNER_USER_ID</code>
                                    ：你的 Discord 使用者 ID。
                                </li>
                                <li>
                                    <code>MINISAGO_CHATBOT_GUILD_IDS</code>
                                    ：允許聊天的伺服器 ID，多個以逗號分隔。
                                </li>
                                <li>
                                    <code>MINISAGO_WORKER_BRIDGE_SECRET</code>
                                    ：剛產生的 Linux Worker 密鑰。
                                </li>
                            </ul>
                            <p>
                                啟動前請逐項檢查範例檔，換成自己的
                                ID、網域與服務目的地。
                                尤其要檢查排程通知、日曆、信箱與校園整合；
                                複製範例不代表這些服務已設定完成。詳見{' '}
                                <a href={doc('docs/configuration.md')}>
                                    環境設定
                                </a>
                                。
                            </p>
                            <pre aria-label='註冊指令並啟動主程式' tabIndex={0}>
                                <code>{`bun run sync:install
bun run dev`}</code>
                            </pre>
                            <p>
                                用 Discord 提供的安裝連結，以 <code>bot</code>{' '}
                                scope
                                將她加入測試伺服器，確認她能查看頻道、傳送訊息與讀取歷史。
                                完整權限清單見{' '}
                                <a
                                    href={doc(
                                        'docs/discord-setup.md#permissions'
                                    )}
                                >
                                    Bot 權限
                                </a>
                                。
                            </p>
                            <p>
                                主程式預設使用 port 3000。以你的 HTTPS
                                網域反向代理， 並為{' '}
                                <code>/api/mac-agent/ws</code> 保留 WebSocket
                                upgrade。 例如網域是{' '}
                                <code>https://bot.example.com</code>， Worker
                                連線網址就是{' '}
                                <code>
                                    wss://bot.example.com/api/mac-agent/ws
                                </code>
                                。
                            </p>
                            <aside className='self-host-note'>
                                <strong>
                                    同一個 Bot token 只執行一個 Gateway 連線。
                                </strong>
                                <p>
                                    若正式環境已使用相同 token，暫時測試的純
                                    HTTP 實例請設
                                    <code>DISCORD_GATEWAY_DISABLED=true</code>
                                    ；該實例不會透過 Gateway 接收 Discord 訊息。
                                </p>
                            </aside>
                        </section>
                        <section aria-labelledby='worker-title' id='worker'>
                            <h2 id='worker-title'>4. 連接聊天 Worker</h2>
                            <p>
                                在同一份 checkout 中建立 Worker 的私有環境檔。
                                以下需要 Docker Engine 與 Compose plugin。
                            </p>
                            <pre aria-label='建立 Worker 環境檔' tabIndex={0}>
                                <code>{`cp .env.worker.example .env.worker
chmod 600 .env.worker`}</code>
                            </pre>
                            <ul className='self-host-settings'>
                                <li>
                                    <code>MINISAGO_BRIDGE_URL</code>：你的{' '}
                                    <code>wss://…/api/mac-agent/ws</code> 網址。
                                </li>
                                <li>
                                    <code>MINISAGO_MAC_BRIDGE_SECRET</code>
                                    ：與主程式的{' '}
                                    <code>
                                        MINISAGO_WORKER_BRIDGE_SECRET
                                    </code>{' '}
                                    相同。
                                </li>
                                <li>
                                    <code>MINISAGO_CHATBOT_OWNER_USER_ID</code>
                                    ：與主程式相同的擁有者 ID。
                                </li>
                            </ul>
                            <p>
                                Linux Worker 也使用名稱含 <code>MAC</code>{' '}
                                的這個密鑰欄位。 設定完成後，建置、登入並啟動：
                            </p>
                            <pre
                                aria-label='建置、登入與啟動 Worker'
                                tabIndex={0}
                            >
                                <code>{String.raw`docker compose --project-directory . -f deploy/compose.worker.yaml build
docker compose --project-directory . -f deploy/compose.worker.yaml run --rm \
  worker codex login --device-auth
docker compose --project-directory . -f deploy/compose.worker.yaml up -d
docker compose --project-directory . -f deploy/compose.worker.yaml logs -f worker`}</code>
                            </pre>
                            <p>
                                預設以 ChatGPT 登入的 Codex 執行聊天；若在
                                Worker 設定
                                <code>OPENAI_API_KEY</code>，聊天會改走 OpenAI
                                Responses API。 圖片生成仍需保留 Codex
                                登入。詳見{' '}
                                <a
                                    href={doc(
                                        'docs/workers.md#openai-api-chat'
                                    )}
                                >
                                    API 聊天設定
                                </a>
                                。
                            </p>
                            <p>
                                Headless Worker 預設也會嘗試同步 Skillbook。
                                專用 GitHub 登入、持久儲存與 sandbox 設定請依{' '}
                                <a href={doc('docs/workers.md#oracle-worker')}>
                                    Worker 安裝指南
                                </a>
                                完成； Skillbook 同步不會阻擋聊天連線。
                            </p>
                        </section>
                        <section aria-labelledby='verify-title' id='verify'>
                            <h2 id='verify-title'>5. 確認第一則回覆</h2>
                            <ol>
                                <li>
                                    將下方網址換成你的網域，確認健康狀態為{' '}
                                    <code>ok: true</code>
                                    、必要設定已填妥，且至少有一個可用
                                    Worker。沒有 Mac helper 時，
                                    <code>mac: offline</code> 是正常的。
                                </li>
                                <li>
                                    在允許的測試頻道標記 Bot，問一個簡短問題。
                                </li>
                                <li>
                                    在指定的測試伺服器試用 <code>/ask</code>
                                    ，確認只有發問者能看到回覆。
                                </li>
                            </ol>
                            <pre aria-label='檢查服務健康狀態' tabIndex={0}>
                                <code>
                                    curl https://bot.example.com/api/health
                                </code>
                            </pre>
                            <h3>沒有回覆時，從這裡檢查</h3>
                            <dl className='self-host-troubleshooting'>
                                <div>
                                    <dt>Gateway 出現 4014</dt>
                                    <dd>確認已開啟 Message Content intent。</dd>
                                </div>
                                <div>
                                    <dt>沒有可用 Worker</dt>
                                    <dd>
                                        檢查兩端密鑰、擁有者 ID、WSS 連線、Codex
                                        登入與工作容量，並查看 Worker logs。
                                    </dd>
                                </div>
                                <div>
                                    <dt>已上線卻忽略頻道</dt>
                                    <dd>
                                        檢查聊天開放範圍、功能註冊與 Discord
                                        頻道權限。
                                    </dd>
                                </div>
                                <div>
                                    <dt>找不到 /ask</dt>
                                    <dd>
                                        確認應用程式與伺服器 ID，重新執行{' '}
                                        <code>bun run sync:install</code>，或依{' '}
                                        <a
                                            href={doc(
                                                'docs/bot-management.md#slash-command-diagnostics-and-repair'
                                            )}
                                        >
                                            指令診斷指南
                                        </a>
                                        處理。
                                    </dd>
                                </div>
                            </dl>
                        </section>
                        <section
                            aria-labelledby='operations-title'
                            id='operations'
                        >
                            <h2 id='operations-title'>6. 維運與進階功能</h2>
                            <p>
                                <code>bun run dev</code>{' '}
                                適合開發測試。長期運行請使用服務管理器， 或依{' '}
                                <a
                                    href={doc(
                                        'docs/operations.md#container-images'
                                    )}
                                >
                                    容器部署指南
                                </a>
                                使用已發布的映像檔與正式環境設定。 保留主程式的{' '}
                                <code>/app/state</code>、Worker
                                登入與儲存空間，替換服務前先備份。
                            </p>
                            <p>
                                <a
                                    href={doc(
                                        'docs/operations.md#durable-state-backup-and-restore'
                                    )}
                                >
                                    備份與還原
                                </a>
                                中提到的帳號與 Sago Cloud 部署屬於管理者的環境，
                                請依自己的主機調整。也請閱讀{' '}
                                <a href={doc('docs/security.md')}>安全邊界</a>，
                                並為你的實例提供隱私說明與聯絡方式。
                            </p>
                            <ul className='self-host-resources'>
                                <li>
                                    <a
                                        href={doc(
                                            'docs/feature-registration.md'
                                        )}
                                    >
                                        功能開放範圍
                                    </a>
                                    ：設定伺服器、頻道與角色。
                                </li>
                                <li>
                                    <a href={doc('docs/t3-coding.md')}>
                                        T3 開發協作
                                    </a>
                                    ：連接擁有者的專案與開發工作。
                                </li>
                                <li>
                                    <a href={doc('docs/workers.md#mac-helper')}>
                                        Mac 檔案助手
                                    </a>
                                    ：從已解鎖的 Mac 讀取檔案。
                                </li>
                                <li>
                                    <a
                                        href={doc(
                                            'docs/discord-setup.md#permissions'
                                        )}
                                    >
                                        語音服務
                                    </a>
                                    ：設定語音權限與 Whisper／VOICEVOX。
                                </li>
                                <li>
                                    <a href={doc('docs/mail.md')}>唯讀 Gmail</a>
                                    與{' '}
                                    <a href={doc('docs/ccxp-meetings.md')}>
                                        CCXP 會議資料
                                    </a>
                                    ：依需要串接。
                                </li>
                                <li>
                                    <a href={doc('docs/bot-management.md')}>
                                        Bot 管理
                                    </a>
                                    與{' '}
                                    <a href={doc('docs/operations.md')}>
                                        維運手冊
                                    </a>
                                    ：查詢指令、日誌與復原流程。
                                </li>
                            </ul>
                            <p>
                                啟用語音時，請標示{' '}
                                <strong>VOICEVOX:猫使ビィ</strong>， 並在 Bot 的
                                Discord 個人檔案連結至{' '}
                                <a href={`${REPOSITORY_URL}#voice-credits`}>
                                    語音來源致謝
                                </a>
                                。
                            </p>
                        </section>
                    </article>
                </div>
            </main>
            <SiteFooter />
        </>
    );
}
