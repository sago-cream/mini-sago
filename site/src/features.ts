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
        text: '@迷你西米露 幫我整理這份範例報名表：算出總人數和各組人數，做成長條圖 PNG，並把整理後的 CSV 一起傳給我。',
        file: {
            name: '活動報名.csv',
            detail: '1 KB',
            kind: 'text',
            preview: '組別,人數\nA 組,18\nB 組,14\nC 組,16',
            src: '/demos/registration.csv',
        },
    },
    {
        author: 'sago',
        text: '我算好了 總共 48 人',
        file: {
            name: 'python-539d1000-5711-4473-b722-73a64b3a80ad.zip',
            detail: '19.50 KB',
            kind: 'document',
            src: '/demos/python-539d1000-5711-4473-b722-73a64b3a80ad.zip',
        },
    },
    {
        author: 'sago',
        text: '',
        list: ['A 組 18 人', 'B 組 14 人', 'C 組 16 人'],
    },
    {
        author: 'sago',
        text: '已附上 ZIP 內含長條圖 PNG 和加入總計列的 CSV\n圖表使用英文標籤 CSV 保留中文組名',
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
                text: '@迷你西米露 我想辦 20 人的桌遊聚會，預算 3,000 元，有人第一次玩。幫我想一下怎麼安排。',
            },
            {
                author: 'sago',
                text: '你想偏輕鬆聊天，還是大家一起玩需要動腦的遊戲？',
            },
            {
                author: 'user',
                text: '@迷你西米露 輕鬆一點，晚上七點開始，而且有兩個人吃素。',
            },
            {
                author: 'sago',
                text: '可以分成四桌，每桌五人，先用短局遊戲暖場。',
                list: [
                    '19:00–19:15 報到、說明規則',
                    '19:15–20:00 第一輪，安排熟手帶新手',
                    '20:00–20:15 吃點心、自由換桌',
                    '20:15–21:00 第二輪',
                ],
            },
            {
                author: 'sago',
                text: '預算可以抓場地 1,000、點心 1,200、遊戲租借 300，剩下 500 當備用。點心把素食分開標示，報名表也加上飲食需求。',
            },
            {
                author: 'user',
                text: '@迷你西米露 那報名表要問什麼？',
            },
            {
                author: 'sago',
                text: '姓名、聯絡方式、桌遊經驗、飲食需求，再加一欄「想和誰同桌」。不需要收跟活動無關的個資。',
            },
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
                text: '@迷你西米露 幫我找上週的活動討論，整理成懶人包：決議、待辦和還沒決定的事。',
            },
            {
                author: 'sago',
                text: '上週討論的決議：本週五 19:00，活動中心集合，每組五人。',
                list: [
                    '小安：確認能否提早進場',
                    '小晴：公布報名表（當時預計隔天）',
                ],
            },
            {
                author: 'sago',
                text: '當時還沒決定：餐點預算、雨天備案。這段討論裡還沒有待辦完成的更新。',
                links: [
                    {
                        label: '查看原始活動討論（示範訊息）',
                        href: '/demos/activity-discussion.txt',
                    },
                ],
            },
            {
                author: 'user',
                text: '幫我縮成一段可以貼公告的版本。',
            },
            {
                author: 'sago',
                text: '本週五晚上 7 點在活動中心集合，每組 5 人。報名資訊、餐點與雨天備案待確認後補充。',
            },
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
                author: 'sago',
                text: 'users 是空陣列時，users[0] 就是 undefined，接著讀取 .name 才會報錯。先處理沒有第一筆資料的情況：',
                command: {
                    name: 'ask',
                    prompt: 'users[0].name 出現 undefined，users 有時是空陣列，要怎麼改？',
                },
                ephemeral: true,
                code: "const user = users[0];\nconst name = user?.name ?? '尚無使用者';\n\n// 或先判斷沒有資料時要顯示的內容\nif (!user) return '目前沒有使用者';",
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
                text: '@迷你西米露 我們這裡說的「會辦」就是學生會辦公室，記住一下。',
            },
            {
                author: 'sago',
                text: '記住了，在這個伺服器裡，「會辦」是學生會辦公室。',
            },
            {
                author: 'notice',
                text: '隔天・新的對話',
            },
            {
                author: 'user',
                text: '@迷你西米露 我要去會辦開會，幫我列一下要帶的東西。',
            },
            {
                author: 'sago',
                text: '去學生會辦公室開會，可以帶筆電、充電器、議程和要討論的文件。需要展示資料的話，再確認轉接頭。',
            },
            {
                author: 'user',
                text: '我們現在不叫會辦了，請忘記這個說法。',
            },
            {
                author: 'sago',
                text: '已移除這個記憶項目，之後不再把「會辦」當成固定用語。',
            },
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
                text: '@迷你西米露 加入我的語音頻道。',
            },
            {
                author: 'sago',
                text: '已加入你的語音頻道，可以開始說話。',
            },
            {
                author: 'notice',
                text: '語音頻道・以下以逐字稿示範',
            },
            {
                author: 'user',
                text: '明天考試，但我只有一小時能複習，怎麼分配？',
                spoken: true,
            },
            {
                author: 'sago',
                text: '単語を二十分、読解を二十分、復習を二十分に分けましょう。苦手なところから始めるといいですよ。',
                spoken: true,
            },
            {
                author: 'user',
                text: '@迷你西米露 先離開語音。',
            },
            {
                author: 'sago',
                text: '已離開語音頻道。',
            },
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
                text: '@迷你西米露 幫我找 Discord 官方的 Markdown 說明，公告想用粗體和條列，要怎麼寫？',
            },
            {
                author: 'sago',
                text: '找到 Discord 官方的 Markdown 說明了。粗體用兩個星號包住文字；條列在每行開頭加上減號和空格。',
                code: '**活動公告**\n- 週五晚上 7 點集合\n- 記得帶水壺',
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
                text: '@迷你西米露 找迎新企劃，整理活動流程和誰負責什麼。',
            },
            {
                author: 'sago',
                text: '迎新流程',
                list: [
                    '13:00 報到與分組',
                    '13:30 開場與暖身',
                    '14:00 分組活動',
                    '16:00 收尾',
                ],
                links: [
                    {
                        label: '迎新企劃（示範文件）',
                        href: '/demos/welcome-plan.md',
                    },
                ],
            },
            {
                author: 'sago',
                text: '分工：小安負責場地，小晴負責報到，你負責器材。',
            },
            {
                author: 'user',
                text: '@迷你西米露 我只想確認器材要提前多久準備。',
            },
            {
                author: 'sago',
                text: '企劃的器材欄寫 12:30 到場測試，比報到時間提早半小時。建議先確認投影與音響都能使用。',
                quote: '器材負責人：12:30 完成投影與音響測試。',
            },
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
                text: '@迷你西米露 我在清大校本部，想搭校車去南大，要去哪裡搭？',
            },
            {
                author: 'sago',
                text: '可以搭兩校區區間車，校本部上車點包含北校門口、綜二館等站點。不同路線還會經過不同的校內站點，先看班表上那一班的路線。',
                links: [
                    {
                        label: '清大兩校區區間車時刻表',
                        href: 'https://affairs.site.nthu.edu.tw/p/412-1165-20979.php?Lang=zh-tw',
                    },
                ],
            },
            {
                author: 'user',
                text: '假日也一樣嗎？',
            },
            {
                author: 'sago',
                text: '要確認當期公告的假日班表與停駛日期，不能直接沿用平日班次。剛剛的校方頁面會列出適用期間與最新公告。',
            },
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
                text: '@迷你西米露 找校務會議裡討論跨領域課程的紀錄，告訴我最後決定了什麼。',
            },
            {
                author: 'sago',
                text: '這份示範紀錄提到先彙整各系意見，再送下一次會議討論；這一頁沒有通過正式方案的決議。',
                quote: '請教務處彙整各系意見，於下次會議提出跨領域課程規劃。',
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
            {
                author: 'sago',
                text: '對。這段紀錄只能支持「正在規劃、待後續討論」，不能當作已核定的開課公告。',
            },
        ],
        note: '',
    },
    {
        id: 'threads',
        section: 'lookup',
        title: '脆海巡',
        description: '在 Threads 上海巡清大、學生會與指定主題的討論。',
        channel: '清大生活',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 海巡脆，找清大宿舍入住前要準備什麼。',
            },
            {
                author: 'sago',
                text: '這兩則是示範貼文：一則提醒先確認床墊尺寸，另一則整理網路線、延長線與清潔用品。',
                links: [
                    {
                        label: '示範貼文摘錄與來源標記',
                        href: '/demos/threads-sample.txt',
                    },
                ],
            },
            {
                author: 'user',
                text: '整理成打包清單，哪些要先問宿舍？',
            },
            {
                author: 'sago',
                text: '打包：寢具、網路線、清潔用品、換洗衣物。\n先確認：床墊尺寸、插座與用電規定、入住時間。網友的經驗可以參考，規定要以你住的宿舍公告為準。',
            },
        ],
        note: '',
    },
    {
        id: 'documents',
        section: 'office',
        title: '文件處理',
        description: '算數據、做圖表，處理 PDF 與文件附件。',
        channel: '檔案處理',
        messages: [
            ...LANDING_CONVERSATION,
            { author: 'user', text: '哪些組超過平均人數？' },
            {
                author: 'sago',
                text: '平均每組 16 人。A 組 18 人，超過平均；C 組剛好 16 人，B 組 14 人低於平均。',
            },
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
                text: '@迷你西米露 我要拿這張圖當表情，把它縮成 128 × 128 的 PNG，保留透明背景，直接傳回圖片檔。',
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
                text: '我已縮成 128 × 128 PNG 並保留透明背景',
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
                text: '@迷你西米露 找 Mac 上的活動報名.csv，傳給我。',
            },
            {
                author: 'sago',
                text: '找到兩份同名檔：活動資料夾裡的匯出檔，和下載資料夾裡的舊版本。你要哪份？',
            },
            {
                author: 'user',
                text: '活動資料夾的最新版。',
            },
            {
                author: 'sago',
                text: '這份是活動資料夾中的匯出檔。',
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
                text: '@迷你西米露 下週三下午三點開一小時的迎新籌備會，幫我確認會辦空檔，邀請小安和小晴。',
            },
            {
                author: 'sago',
                text: '該時段目前沒有衝突。這是活動與邀請的預覽，請確認後再建立。',
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
                replaces: 2,
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
                text: '@迷你西米露 每週五台北時間晚上六點，提醒我交週報。',
                time: '今天 下午3:24',
            },
            {
                author: 'sago',
                text: '已設定每週五 18:00（台北時間），在這個頻道提醒你交週報。',
                time: '今天 下午3:25',
            },
            {
                author: 'user',
                text: '改成五點半好了。',
                time: '今天 下午3:26',
            },
            {
                author: 'sago',
                text: '已改成每週五 17:30。',
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
                text: '收到！下週開始不用提醒了，幫我取消。',
                time: '週五 下午5:31',
            },
            {
                author: 'sago',
                text: '已取消這個每週提醒，下週不會再發送。',
                time: '週五 下午5:32',
            },
        ],
        note: '',
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
                text: '@迷你西米露 把這張圖片新增成這個伺服器的 emoji，叫做 sago_site_demo。完成後傳一次給我看。',
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
                author: 'sago',
                text: '我已新增 sago_site_demo 也傳了一次給你看',
                replyTo:
                    '把這張圖片新增成這個伺服器的 emoji，叫做 sago_site_demo。',
            },
            {
                author: 'user',
                text: '再幫我改名成 sago_wave，複製到我們都加入的 Sago Lab。',
            },
            {
                author: 'sago',
                text: '已改名，也複製到 Sago Lab。',
                emoji: {
                    name: 'sago_wave',
                    src: '/demos/sago-site-demo.webp',
                },
            },
        ],
        note: '',
    },
    {
        id: 'social',
        section: 'discord',
        title: '補全轉發內容',
        description:
            '調整 Instagram、X 和 Threads 的連結，讓內容能直接在 Discord 閱讀。',
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
        note: '',
    },
    {
        id: 'feeds',
        section: 'discord',
        title: '訂閱資訊推播',
        description:
            '從托福單字、雀魂禮品碼到 codex reset 推文，讓你滑 DC 也能接收各種資訊。',
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
        description: '隨時銜接群組討論進行開發，也能請她修好自己。',
        channel: '程式開發',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 修好列表沒資料時整塊空白的問題，加上驗證，完成後開 draft PR。',
            },
            {
                author: 'sago',
                text: '會把進度放在這個開發討論串，先檢查列表和現有驗證。',
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
                text: '@迷你西米露 把自訂狀態改成「mini.sagocream.com」，保持在線。',
            },
            {
                author: 'sago',
                text: '已儲存並送出狀態更新：mini.sagocream.com；在線狀態為在線。',
            },
            { author: 'user', text: '改成閒置，狀態文字不變。' },
            {
                author: 'sago',
                text: '已儲存並送出狀態更新：mini.sagocream.com；在線狀態為閒置。',
            },
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
            {
                author: 'sago',
                text: '已傳送到 Sago Lab 的 #公告：明天晚上七點開會，請帶上活動企劃。',
            },
        ],
        note: '僅限擁有者。頻道名稱須能明確對應，也可以直接提供頻道 ID。',
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
                text: '@迷你西米露 查這個伺服器目前開放的功能。',
            },
            {
                author: 'sago',
                text: '目前開放：聊天、提醒、表情管理。Calendar 尚未開放；每日單字已訂閱到 #每日單字。',
            },
            {
                author: 'user',
                text: '開啟 Calendar，只讓「工作人員」身分組使用。',
            },
            {
                author: 'sago',
                text: '已保存：Calendar 開放給「工作人員」，其他成員仍不能使用。',
            },
            {
                author: 'user',
                text: '再幫我確認一次設定。',
            },
            {
                author: 'sago',
                text: 'Calendar：已開啟\n使用對象：工作人員\n每日單字：#每日單字（未變更）',
            },
        ],
        note: '',
    },
] as const satisfies readonly Feature[];
