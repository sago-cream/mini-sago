import type { Metadata } from 'next';
import Link from 'next/link';

import { PolicyPage } from '@/components/PolicyPage';
import { SELF_HOST_URL } from '@/features';
import { pageMetadata } from '@/metadata';

export const metadata: Metadata = pageMetadata(
    '使用條款 — mini sago',
    '迷你西米露的使用範圍、服務限制、語音來源與聯絡方式。',
    '/terms/'
);

export default function TermsPage() {
    return (
        <PolicyPage
            intro='迷你西米露是個人營運的 Discord 小幫手。使用前，請了解以下範圍與限制。'
            title='使用條款'
        >
            <section>
                <h2>使用範圍與開放方式</h2>
                <p>
                    因計算資源有限，目前僅在管理者開放的部分伺服器與頻道中提供服務。
                    各功能會依伺服器設定、使用者權限與已串接的服務而有所不同。
                    如果你認識管理者並想取得使用權限，可以直接詢問；自行架設則請參考{' '}
                    <a href={SELF_HOST_URL}>開源自架指南</a>。
                </p>
            </section>
            <section>
                <h2>使用時請尊重其他人</h2>
                <p>
                    請遵守 Discord 的使用條款、社群規範與所在伺服器的規則。
                    不得利用服務騷擾他人、散布違法內容、侵害他人權利、繞過權限或破壞服務。
                    上傳檔案與要求處理其他人的內容前，請確認你有使用與分享的權限。
                </p>
                <p>
                    請勿提供密碼、存取憑證或不適合交給第三方服務處理的機密資料。
                    管理者可依資源狀況、伺服器規則或濫用情況限制或停止使用權限。
                </p>
            </section>
            <section>
                <h2>AI 回答與工具操作</h2>
                <p>
                    回答由 AI 生成，可能有錯誤、遺漏或過時資訊。
                    使用重要資訊前，請確認原始來源；不要把回答當作專業意見的替代。
                    網站上的 Discord
                    對話是情境示範，不代表每次使用都會得到相同結果。
                </p>
                <p>
                    依你的要求，工具可能建立提醒、調整伺服器表情、處理檔案或修改已授權的外部服務。
                    請清楚描述目標與範圍，並確認完成後的結果。
                </p>
            </section>
            <section>
                <h2>可用性與服務變更</h2>
                <p>
                    這是個人營運的服務，沒有保證固定的上線時間、回應速度或功能可用性。
                    維護、資源限制與第三方服務異常可能影響回答、檔案處理或提醒送達。
                    重要的期限與資料，請保留自己的提醒與備份。
                </p>
                <p>
                    功能、開放範圍與本條款可能隨服務調整而更新。
                    更新時會在本頁標示日期；如有疑問，可以透過下方信箱聯絡管理者。
                </p>
            </section>
            <section aria-labelledby='voice-credits-title' id='voice-credits'>
                <h2 id='voice-credits-title'>語音來源與致謝</h2>
                <p>
                    迷你西米露的語音合成使用 <strong>VOICEVOX:猫使ビィ</strong>
                    。 感謝 VOICEVOX
                    與猫使ビィ的創作者提供語音引擎與音聲資料庫。
                </p>
                <p>
                    詳細使用規範請見{' '}
                    <a href='https://voicevox.hiroshiba.jp/term/'>
                        VOICEVOX 利用規約
                    </a>
                    與{' '}
                    <a href='https://nekotukarb.wixsite.com/nekonohako/利用規約'>
                        猫使音聲資料庫利用規約
                    </a>
                    。
                </p>
            </section>
            <section>
                <h2>隱私與自行架設</h2>
                <p>
                    訊息、附件與作業紀錄的處理方式，以及更正與刪除資料的聯絡管道，請見{' '}
                    <Link href='/privacy/'>隱私權政策</Link>。
                    其他人自行架設的版本由該管理者營運；本條款不替其他實例提供服務承諾。
                    開源程式的使用與散布，依專案儲存庫的授權條款辦理。
                </p>
            </section>
        </PolicyPage>
    );
}
