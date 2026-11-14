import { demoReply } from './demo-reply';
import type { DiscordTextBlock } from './discord-lists';

export interface DemoFile {
    readonly name: string;
    readonly detail: string;
    readonly kind: 'document' | 'image' | 'text';
    readonly src?: string;
    readonly preview?: string;
    readonly width?: number;
    readonly height?: number;
}
export interface DemoMessage {
    readonly author: 'user' | 'sago' | 'notice';
    readonly userName?: string;
    readonly text: string;
    readonly blocks?: readonly DiscordTextBlock[];
    readonly file?: DemoFile;
    readonly replyTo?: string;
    readonly replyUserName?: string;
    readonly time?: string;
    readonly command?: { readonly name: string; readonly prompt: string };
    readonly ephemeral?: boolean;
    readonly spoken?: boolean;
    readonly app?: boolean;
    readonly replaces?: number;
    readonly code?: string;
    readonly heading?: string;
    readonly prelude?: string;
    readonly quote?: string;
    readonly list?: readonly string[];
    readonly emoji?: { readonly name: string; readonly src: string };
    readonly embed?: {
        readonly author: string;
        readonly title: string;
        readonly description: string;
        readonly footer: string;
        readonly color: string;
    };
    readonly confirmation?: {
        readonly confirmLabel: string;
        readonly cancelLabel: string;
    };
    readonly links?: ReadonlyArray<{
        readonly label: string;
        readonly href: string;
    }>;
}
export interface Feature {
    readonly id: string;
    readonly section: string;
    readonly title: string;
    readonly description: string;
    readonly channel: string;
    readonly messages: readonly DemoMessage[];
    readonly note: string;
}
export const REPOSITORY_URL = 'https://github.com/sago-cream/mini-sago';
export const SELF_HOST_URL = `${REPOSITORY_URL}#self-host-mini-sago`;
export const FEATURE_SECTIONS = [
    { id: 'chat', title: '聊天與互動' },
    { id: 'lookup', title: '查詢資料' },
    { id: 'office', title: '文書處理' },
    { id: 'discord', title: 'Discord 工具' },
    { id: 'developer', title: '開發協作' },
    { id: 'management', title: 'Bot 管理' },
] as const;
export const LANDING_CONVERSATION = [
    {
        author: 'user',
        text: '@迷你西米露 幫我整理這份範例報名表 算出總人數和各組人數 做成長條圖 PNG 並把整理後的 CSV 一起傳給我 用 ZIP 打包 簡短回覆就好',
        file: {
            name: '活動報名.csv',
            detail: '1 KB',
            kind: 'text',
            preview: '組別,人數\nA 組,18\nB 組,14\nC 組,16',
            src: '/demos/registration.csv',
        },
    },
    {
        ...demoReply('documents'),
        author: 'sago',
        file: {
            name: 'python-539d1000-5711-4473-b722-73a64b3a80ad.zip',
            detail: '19.50 KB',
            kind: 'document',
            src: '/demos/python-539d1000-5711-4473-b722-73a64b3a80ad.zip',
        },
    },
] as const satisfies readonly DemoMessage[];
export const FEATURES = [
    {
        id: 'chat',
        section: 'chat',
        title: '聊天與提問',
        description: '標記她就能開始聊天。',
        channel: '日常聊天',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 我把報告放枕頭下面睡一晚 可以用滲透壓吸收知識嗎',
            },
            { author: 'sago', ...demoReply('chat-banter') },

            {
                author: 'user',
                text: '@迷你西米露 好啦 認真問 我想辦 20 人的桌遊聚會 預算 3000 元 有人第一次玩 先給我三個安排重點就好',
            },
            { ...demoReply('chat-plan'), author: 'sago' },
            {
                author: 'user',
                text: '@迷你西米露 輕鬆聊天那種 晚上七點開始 兩個人吃素 幫我排三小時流程 簡短一點',
            },
            { ...demoReply('chat-schedule'), author: 'sago' },
            {
                author: 'user',
                text: '@迷你西米露 那報名表要問什麼 五個欄位就好',
            },
            { ...demoReply('chat-signup'), author: 'sago' },
        ],
        note: '自動接續預設在所有伺服器關閉；Bot 擁有者可為個別伺服器啟用 90 秒內的下一則訊息接續。未啟用時，請再次標記她、回覆並通知她，或使用 /ask。',
    },
    {
        id: 'summary',
        section: 'chat',
        title: '整理對話懶人包',
        description: '從當前或過去的群組討論整理出懶人包。',
        channel: '活動籌備',
        messages: [
            {
                author: 'user',
                text: '下週五晚上七點在活動中心，每組五人，就先這樣？',
                userName: '小安',
                time: '上週五 下午3:24',
            },
            {
                author: 'user',
                text: '好，我明天發報名表。餐點預算跟雨天備案還沒決定。',
                userName: '小晴',
                time: '上週五 下午3:25',
            },
            {
                author: 'user',
                text: '我問一下能不能提早進場。',
                userName: '小安',
                time: '上週五 下午3:26',
            },
            {
                author: 'notice',
                text: '一週後・示範快轉',
            },
            {
                author: 'user',
                text: '@迷你西米露 幫我找上週的活動討論 整理成懶人包 決議 待辦 還沒決定的事都要 簡短就好',
            },
            { ...demoReply('summary'), author: 'sago' },
            {
                author: 'user',
                text: '幫我縮成一段可以貼公告的版本',
            },
            { ...demoReply('summary-announcement'), author: 'sago' },
        ],
        note: '',
    },
    {
        id: 'ask',
        section: 'chat',
        title: '私下提問',
        description: '/ask 以偷偷問她問題。',
        channel: '日常聊天',
        messages: [
            {
                ...demoReply('ask'),
                author: 'sago',
                command: {
                    name: 'ask',
                    prompt: 'users[0].name 出現 undefined，users 有時是空陣列，要怎麼改？簡短說明，給一個例子就好。',
                },
                ephemeral: true,
            },
        ],
        note: '',
    },
    {
        id: 'quiet',
        section: 'chat',
        title: '暫停回覆',
        description: '她一直插話時也能直接請她安靜。',
        channel: '日常聊天',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 先安靜三十分鐘，我們要開會。',
            },
            {
                author: 'notice',
                text: '暫停期間・她不再插話',
            },
            {
                author: 'user',
                text: '場地我確認了，下午一點可以進去。',
                userName: '小安',
            },
            {
                author: 'user',
                text: '我十二點半先去拿器材。',
                userName: '小晴',
            },
            {
                author: 'user',
                text: '@迷你西米露 可以回覆了。',
            },
            {
                author: 'sago',
                text: '我回來了！',
            },
        ],
        note: '',
    },
    {
        id: 'memory',
        section: 'chat',
        title: '伺服器記憶',
        description: '教她慣用語或奇怪事實。',
        channel: '日常聊天',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 我們這裡說的「會辦」就是學生會辦公室 記住一下',
            },
            { ...demoReply('memory-save'), author: 'sago' },
            {
                author: 'notice',
                text: '隔天・新的對話',
            },
            {
                author: 'user',
                text: '@迷你西米露 我要去會辦開會 幫我列一下要帶的東西 簡短就好',
            },
            { ...demoReply('memory-use'), author: 'sago' },
            {
                author: 'user',
                text: '我們現在不叫會辦了 請忘記這個說法',
            },
            { ...demoReply('memory-remove'), author: 'sago' },
        ],
        note: '',
    },
    {
        id: 'voice',
        section: 'chat',
        title: '語音聊天',
        description: '請她加入你的語音頻道，用說的繼續聊。',
        channel: '日常聊天',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 加入我的語音頻道',
            },
            { ...demoReply('voice-join'), author: 'sago' },
            {
                author: 'notice',
                text: '語音頻道・以下以逐字稿示範',
            },
            {
                author: 'user',
                text: '明日試験なのに、復習できるのはあと一時間だけ。どう使えばいい？',
                spoken: true,
            },
            { ...demoReply('voice-spoken'), author: 'sago', spoken: true },
            {
                author: 'user',
                text: '@迷你西米露 先離開語音',
            },
            { ...demoReply('voice-leave'), author: 'sago' },
        ],
        note: '語音部分以逐字稿示範；目前回覆語音為日文，辨識與輪流說話仍在開發中。',
    },
    {
        id: 'search',
        section: 'lookup',
        title: '網路資料搜尋',
        description: '根據網路資料，整理成有確切來源的答案。',
        channel: '日常聊天',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 幫我找 Discord 官方的 Markdown 說明 公告想用粗體和條列 要怎麼寫 簡短給範例就好',
            },
            {
                ...demoReply('search'),
                author: 'sago',
                links: [
                    {
                        label: 'Discord 官方 · Markdown Text 101',
                        href: 'https://support.discord.com/hc/en-us/articles/210298617-Markdown-Text-101-Chat-Formatting-Bold-Italic-Underline',
                    },
                ],
            },
        ],
        note: '',
    },
    {
        id: 'drive',
        section: 'lookup',
        title: '查詢雲端文件',
        description: '在核准的學生會文件裡找企劃、紀錄與相關資料。',
        channel: '學生會辦公室',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 找迎新企劃 整理活動流程和誰負責什麼 簡短就好',
            },
            {
                ...demoReply('drive'),
                author: 'sago',
                links: [
                    {
                        label: '迎新企劃（示範文件）',
                        href: '/demos/welcome-plan.md',
                    },
                ],
            },
            {
                author: 'user',
                text: '@迷你西米露 我只想確認器材要提前多久準備',
            },
            { ...demoReply('drive-equipment'), author: 'sago' },
        ],
        note: '',
    },
    {
        id: 'campus',
        section: 'lookup',
        title: '校園資訊',
        description: '查清大公車、課程、公告、餐飲與圖書館資訊。',
        channel: '清大生活',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 我在清大校本部 想搭校車去南大 要去哪裡搭 簡短就好',
            },
            {
                ...demoReply('campus'),
                author: 'sago',
                links: [
                    {
                        label: '清大兩校區區間車時刻表',
                        href: 'https://affairs.site.nthu.edu.tw/p/412-1165-20979.php?Lang=zh-tw',
                    },
                ],
            },
            {
                author: 'user',
                text: '假日也一樣嗎',
            },
            { ...demoReply('campus-weekend'), author: 'sago' },
        ],
        note: '',
    },
    {
        id: 'ccxp',
        section: 'lookup',
        title: '校務會議紀錄',
        description: '找相關校務討論與決議，附上文件來源與頁碼。',
        channel: '校務討論',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 找校務會議裡討論跨領域課程的紀錄 告訴我最後決定了什麼 簡短就好',
            },
            {
                ...demoReply('ccxp'),
                author: 'sago',
                links: [
                    {
                        label: '示範校務會議紀錄 · 第 2 頁',
                        href: '/demos/meeting-sample.txt',
                    },
                ],
            },
            {
                author: 'user',
                text: '所以還不能說下學期確定會開？',
            },
            { ...demoReply('ccxp-followup'), author: 'sago' },
        ],
        note: '',
    },
    {
        id: 'threads',
        section: 'lookup',
        title: '脆海巡',
        description: '依要求搜尋 Threads 指定主題，整理公開貼文與來源。',
        channel: '清大生活',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 海巡脆 找清大宿舍入住前要準備什麼 簡短整理',
            },
            {
                ...demoReply('threads'),
                author: 'sago',
                links: [
                    {
                        label: '示範貼文摘錄與來源標記',
                        href: '/demos/threads-sample.txt',
                    },
                ],
            },
            {
                author: 'user',
                text: '整理成打包清單 哪些要先問宿舍',
            },
            { ...demoReply('threads-packing'), author: 'sago' },
        ],
        note: '海巡搜尋需要明確要求；對話中相關的分享連結則會先讀取再回答。',
    },
    {
        id: 'documents',
        section: 'office',
        title: '文件處理',
        description: '算數據、做圖表，處理 PDF 與文件附件。',
        channel: '檔案處理',
        messages: [
            ...LANDING_CONVERSATION,
            { author: 'user', text: '哪些組超過平均人數' },
            { ...demoReply('documents-average'), author: 'sago' },
        ],
        note: '',
    },
    {
        id: 'media',
        section: 'office',
        title: '影音處理',
        description: '調整圖片、擷取畫面，或把影片轉成 GIF、MP4、MP3。',
        channel: 'mini-sago',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 我要拿這張圖當表情 把它縮成 128 × 128 的 PNG 保留透明背景 直接傳回圖片檔',
                file: {
                    name: 'minisago3.png',
                    detail: '圖片附件',
                    kind: 'image',
                    src: '/images/minisago3.png',
                    width: 240,
                    height: 240,
                },
            },
            {
                ...demoReply('media'),
                author: 'sago',
                file: {
                    name: 'media-f111ee3f-f470-4496-aa80-3d66da2a585e.png',
                    detail: '128 × 128',
                    kind: 'image',
                    src: '/demos/minisago-128.webp',
                    width: 128,
                    height: 128,
                },
            },
        ],
        note: '',
    },
    {
        id: 'mac',
        section: 'office',
        title: '取得 Mac 檔案',
        description: '連接 Mac，尋找檔案並回傳。',
        channel: '私人工作',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 找 Mac 上的活動報名.csv 傳給我',
            },
            { ...demoReply('mac-choose'), author: 'sago' },
            {
                author: 'user',
                text: '活動資料夾的最新版',
            },
            {
                ...demoReply('mac-send'),
                author: 'sago',
                file: {
                    name: '活動報名.csv',
                    detail: '1 KB',
                    kind: 'document',
                    src: '/demos/registration.csv',
                },
            },
        ],
        note: '檔案為示範資料。',
    },
    {
        id: 'calendar',
        section: 'office',
        title: '日曆操作',
        description: '透過 Google Calendar 幫你安排活動。',
        channel: '學生會辦公室',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 下週三下午三點開一小時的迎新籌備會 幫我確認會辦空檔 邀請小安和小晴',
            },
            {
                author: 'sago',
                text: '',
                embed: {
                    author: '待你確認',
                    title: '迎新籌備會',
                    description:
                        '2026-10-21 15:00 → 2026-10-21 16:00（台北時間）\ndiscord-calendar · 會辦\n地點：學生會辦公室\n邀請：小安、小晴',
                    footer: '15:35 到期',
                    color: '#e7bc74',
                },
                confirmation: {
                    confirmLabel: '確認建立',
                    cancelLabel: '取消',
                },
            },
            {
                author: 'sago',
                text: '',
                replaces: 1,
                embed: {
                    author: '已建立 · 會辦待回覆',
                    title: '迎新籌備會',
                    description:
                        '2026-10-21 15:00 → 2026-10-21 16:00（台北時間）\ndiscord-calendar · 會辦\n地點：學生會辦公室\n邀請：小安、小晴\n活動已建立，邀請已寄出；會辦是否接受仍待日曆回覆。',
                    footer: '',
                    color: '#81c79b',
                },
            },
        ],
        note: '',
    },
    {
        id: 'reminders',
        section: 'discord',
        title: '設置提醒',
        description: '設置一次性或重複提醒。',
        channel: '日常聊天',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 每週五台北時間晚上六點 提醒我交週報',
                time: '今天 下午3:24',
            },
            {
                ...demoReply('reminder-create'),
                author: 'sago',
                time: '今天 下午3:25',
            },
            {
                author: 'user',
                text: '改成五點半好了',
                time: '今天 下午3:26',
            },
            {
                ...demoReply('reminder-edit'),
                author: 'sago',
                time: '今天 下午3:27',
            },
            {
                author: 'notice',
                text: '週五 17:30・示範快轉',
            },
            {
                author: 'sago',
                text: '@你 ⏰ 交週報',
                time: '週五 下午5:30',
            },
            {
                author: 'user',
                text: '收到 下週開始不用提醒了 幫我取消',
                time: '週五 下午5:31',
            },
            {
                ...demoReply('reminder-cancel'),
                author: 'sago',
                time: '週五 下午5:32',
            },
        ],
        note: '',
    },
    {
        id: 'image-generation',
        section: 'discord',
        title: '圖片生成與改圖',
        description:
            '生成圖片，或修改附件、頭像和現有表符；成品會以 Discord 附件傳回，也能依要求新增為表符或貼圖。',
        channel: 'mini-sago',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 把這個藍色表符改成紅色 再戴上耳機 背景透明 傳圖片給我 也新增成 mascot_headphones',
                file: {
                    name: 'mascot.png',
                    detail: '原始表符',
                    kind: 'image',
                    src: '/demos/imagegen-original-emoji.png',
                    width: 128,
                    height: 128,
                },
            },
            {
                ...demoReply('image-edit'),
                author: 'sago',
                file: {
                    name: 'mascot_headphones.png',
                    detail: '128 × 128 · 透明 PNG',
                    kind: 'image',
                    src: '/demos/imagegen-edited-emoji.png',
                    width: 128,
                    height: 128,
                },
            },
        ],
        note: '動態來源會以靜態圖片改圖；新增表符或貼圖需明確提出，並受 Discord 權限與大小限制。',
    },
    {
        id: 'reaction-voters',
        section: 'discord',
        title: '投票反應統計',
        description: '讀取表情反應的人數與成員名單。',
        channel: '活動籌備',
        messages: [
            {
                author: 'user',
                userName: '主辦人',
                text: '報名名單：小明、小安、小晴、小雨\n21:00 用拇指表情投票 22:00 用勾勾表情投票',
            },

            {
                author: 'user',
                text: '@迷你西米露 幫我統計這則投票各表情有誰按 並對照報名名單 簡短就好',
                replyTo: '行前說明會時段投票',
            },
            { ...demoReply('reaction-voters'), author: 'sago' },
        ],
        note: '回覆投票訊息即可查詢，不需要上傳截圖；明確要求通知時才會標記成員。',
    },
    {
        id: 'expressions',
        section: 'discord',
        title: '表符管理',
        description:
            '用附件新增表符或貼圖，或對其進行複製、改名，甚至搬去別的伺服器。',
        channel: 'mini-sago',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 把這張圖片新增成這個伺服器的 emoji 叫做 sago_site_demo 完成後傳一次給我看',
                file: {
                    name: 'minisago3.png',
                    detail: '圖片附件',
                    kind: 'image',
                    src: '/images/minisago3.png',
                    width: 240,
                    height: 240,
                },
            },
            {
                author: 'sago',
                text: '',
                emoji: {
                    name: 'sago_site_demo',
                    src: '/demos/sago-site-demo.webp',
                },
            },
            {
                ...demoReply('expression-add'),
                author: 'sago',
                replyTo:
                    '把這張圖片新增成這個伺服器的 emoji，叫做 sago_site_demo。',
            },
            {
                author: 'user',
                text: '再幫我改名成 sago_wave 複製到我們都加入的 Sago Lab',
            },
            {
                ...demoReply('expression-copy'),
                author: 'sago',
                emoji: {
                    name: 'sago_wave',
                    src: '/demos/sago-site-demo.webp',
                },
            },
        ],
        note: '',
    },
    {
        id: 'member-names',
        section: 'discord',
        title: '成員姓名與標記',
        description: '從伺服器暱稱對照帳號，按要求通知成員。',
        channel: '活動籌備',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 請標記小明 提醒他確認分工',
            },
            { ...demoReply('member-names'), author: 'sago' },
        ],
        note: '以目前頻道的帳號與伺服器成員資料核對，無法確認或同名時會請你補充；明確要求通知才會標記。',
    },
    {
        id: 'social',
        section: 'discord',
        title: '讀取分享連結',
        description:
            '回答前先讀取相關的公開網頁、Instagram、X 與 Threads 連結，附上來源；也能自動展開社群預覽。',
        channel: '分享連結',
        messages: [
            {
                author: 'user',
                text: '這個 Discord 回覆好好笑\nhttps://x.com/discord/status/1012592360163827712',
            },
            {
                author: 'notice',
                text: '自動展開連結・示範',
            },
            {
                author: 'user',
                text: '這個 Discord 回覆好好笑',
                app: true,
                replaces: 0,
                links: [
                    {
                        label: '原始貼文',
                        href: 'https://x.com/discord/status/1012592360163827712',
                    },
                    {
                        label: '在聊天室展開預覽',
                        href: 'https://fxtwitter.com/discord/status/1012592360163827712',
                    },
                ],
                embed: {
                    author: 'Discord (@discord)',
                    title: 'Discord',
                    description: '[magic conch voice] maybe someday! …',
                    footer: 'FxTwitter · 公開貼文節錄',
                    color: '#5865f2',
                },
            },
        ],
        note: 'X 帳號連結可讀取最多 20 則近期貼文、回覆與媒體網址，不代表完整時間軸；讀取失敗或截斷時會說明，不會把預覽當作全文或影片逐字稿。私人資料仍透過已授權的工具讀取。',
    },
    {
        id: 'feeds',
        section: 'discord',
        title: '訂閱資訊推播',
        description:
            '訂閱托福單字、雀魂禮品碼與 X 推文。雀魂論壇通知會保留原文，並將文字中辨識到的每組禮品碼獨立傳送，方便手機複製。每日摘要需逐項啟用，目前僅 Holodori 官方帳號預設啟用，每天台灣時間晚上 9 點送出繁體中文摘要與原文連結；其他帳號維持逐則轉發。',
        channel: '每日單字',
        messages: [
            {
                author: 'notice',
                text: '每日單字頻道・已由擁有者設定訂閱',
            },
            {
                author: 'sago',
                text: 'verb · 容納；適應',
                prelude: 'TOEFL Word of the Day',
                heading: 'accommodate',
                quote: 'The model was revised to accommodate newly discovered evidence.',
                links: [
                    {
                        label: 'Wiktionary · accommodate',
                        href: 'https://en.wiktionary.org/wiki/accommodate',
                    },
                    {
                        label: 'CC BY-SA 4.0',
                        href: 'https://creativecommons.org/licenses/by-sa/4.0/',
                    },
                ],
            },
            {
                author: 'notice',
                text: '隔天・自動送達下一個單字',
            },
            {
                author: 'sago',
                text: 'noun · 類比；比擬',
                prelude: 'TOEFL Word of the Day',
                heading: 'analogy',
                quote: 'The professor used an analogy to explain how electrical circuits function.',
                links: [
                    {
                        label: 'Wiktionary · analogy',
                        href: 'https://en.wiktionary.org/wiki/analogy',
                    },
                    {
                        label: 'CC BY-SA 4.0',
                        href: 'https://creativecommons.org/licenses/by-sa/4.0/',
                    },
                ],
            },
        ],
        note: '',
    },
    {
        id: 'coding',
        section: 'developer',
        title: '程式開發',
        description:
            '擁有者可從 Discord 開啟 T3 開發工作階段，沿用專案的模型、工具與技能；在 Discord 或 T3 接續同一份工作，進度會同步到討論串。支援附件、停止與結束開發；經授權的自我部署不會中斷 T3 工作，結果會在機器人重新連線後同步。',
        channel: '程式開發',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 修好列表沒資料時整塊空白的問題，加上驗證，完成後開 draft PR。',
            },
            {
                author: 'sago',
                text: '已建立 T3 工作階段，會把進度同步到這個討論串。你也可以開啟 T3 查看程式差異並繼續工作。',
            },
            {
                author: 'user',
                text: '文案用「目前沒有資料」，不用加插圖。',
            },
            {
                author: 'sago',
                text: '已補空狀態，空陣列會顯示提示；有資料時保留原本列表。',
                code: 'if (items.length === 0) {\n  return <p>目前沒有資料</p>;\n}\nreturn <ItemList items={items} />;',
            },
            {
                author: 'sago',
                text: '驗證完成：空陣列、有資料的列表都通過。已依你的要求開 draft PR（#42，示範），等待 review；還沒有合併或部署。',
            },
            {
                author: 'user',
                text: '結束這個開發討論串。',
            },
            {
                author: 'sago',
                text: '已停止工作並結束 Discord 開發連線，這串回到一般聊天。T3 工作階段和檔案會保留。',
            },
        ],
        note: '',
    },
    {
        id: 'reviews',
        section: 'developer',
        title: 'PR review',
        description:
            '自動建立 PR 對應討論串、傳送請求 review 通知，並在 merge 後關閉。',
        channel: 'PR review',
        messages: [
            {
                author: 'sago',
                text: '@你 please review 列表空狀態（PR #42，示範）',
            },
            {
                author: 'user',
                text: '空資料時現在只會顯示空白，請補一個「目前沒有資料」提示。',
            },
            {
                author: 'user',
                text: '已補空狀態，也加了空陣列的驗證。可以再看一次嗎？',
                userName: 'PR 作者',
            },
            {
                author: 'notice',
                text: 'GitHub 上完成 review・示範快轉',
            },
            {
                author: 'user',
                text: '看過了，這版可以。',
                userName: 'Reviewer',
            },
            {
                author: 'notice',
                text: 'PR 已合併・GitHub webhook 通知',
            },
            {
                author: 'sago',
                text: 'Merged by @你, closing.',
            },
            {
                author: 'notice',
                text: '討論串已封存',
            },
        ],
        note: '',
    },
    {
        id: 'status',
        section: 'management',
        title: '更新自訂狀態',
        description: '由擁有者更新她的狀態文字與在線狀態。',
        channel: '私人工作',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 把自訂狀態改成「mini.sagocream.com」保持在線',
            },
            { ...demoReply('status-online'), author: 'sago' },
            { author: 'user', text: '改成閒置 狀態文字不變' },
            { ...demoReply('status-idle'), author: 'sago' },
        ],
        note: '僅限擁有者。狀態會持續保存，重新連線或程式重啟後自動套用。',
    },
    {
        id: 'channel-message',
        section: 'management',
        title: '傳送頻道訊息',
        description: '由擁有者指定伺服器與頻道，請她代為傳送訊息。',
        channel: '私人工作',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 在 Sago Lab 的 #公告 傳送「明天晚上七點開會，請帶上活動企劃。」',
            },
            { ...demoReply('channel-message'), author: 'sago' },
        ],
        note: '僅限擁有者。頻道名稱須能明確對應，也可以直接提供頻道 ID。',
    },
    {
        id: 'slash-commands',
        section: 'management',
        title: '斜線指令檢查與同步',
        description:
            '由擁有者檢查 Discord 指令註冊與指令權限，並指定伺服器重新同步 /ask。',
        channel: '私人工作',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 已開啟聊天 但伺服器的指令列表看不到 /ask 幫我檢查',
            },
            { ...demoReply('commands-inspect'), author: 'sago' },
            {
                author: 'user',
                text: '幫這個伺服器重新同步 /ask',
            },
            { ...demoReply('commands-sync'), author: 'sago' },
        ],
        note: '僅限擁有者。同步只更新指定伺服器的 /ask；保留既有權限與其他指令。無法讀取的檢查會標示未知。',
    },
    {
        id: 'controls',
        section: 'management',
        title: '功能與權限設定',
        description: '由擁有者調整功能的啟用位置與使用身分組。',
        channel: '私人工作',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 查這個伺服器目前開放的功能',
            },
            { ...demoReply('controls-list'), author: 'sago' },
            {
                author: 'user',
                text: '開啟 Calendar 只讓「工作人員」身分組使用',
            },
            { ...demoReply('controls-enable'), author: 'sago' },
            {
                author: 'user',
                text: '再幫我確認一次設定',
            },
            { ...demoReply('controls-check'), author: 'sago' },
        ],
        note: '',
    },
] as const satisfies readonly Feature[];
