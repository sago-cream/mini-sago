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
    readonly list?: readonly string[];
    readonly emoji?: { readonly name: string; readonly src: string };
    readonly embed?: {
        readonly author: string;
        readonly title: string;
        readonly description: string;
        readonly footer: string;
        readonly color: string;
    };
    readonly buttons?: readonly string[];
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
export const SELF_HOST_URL = `${REPOSITORY_URL}#self-host-minisago`;
export const FEATURE_SECTIONS = [
    {
        id: 'chat',
        title: '聊天與日常',
    },
    {
        id: 'files',
        title: '圖片與檔案',
    },
    {
        id: 'server',
        title: '伺服器生活',
    },
    {
        id: 'nthu',
        title: 'NTHU · 清大',
    },
    {
        id: 'nthusa',
        title: 'NTHUSA · 清大學生會',
    },
    {
        id: 'developer',
        title: '開發協作',
    },
    {
        id: 'owner',
        title: '擁有者專用',
    },
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
        description: '標記她就能開始聊天，追問時也不用重新交代背景。',
        channel: '日常聊天',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 你能幫我做什麼？',
            },
            {
                author: 'sago',
                text: '可以陪你聊、找資料、整理對話，也能處理附件或設提醒。告訴我你想做的事就好，實際能用的功能依這個聊天室的設定開放。',
            },
            {
                author: 'user',
                text: '@迷你西米露 我想辦一場 20 人的桌遊聚會，預算 3,000 元，怎麼安排比較好？',
            },
            {
                author: 'sago',
                text: '可以！場地、點心和遊戲先分開抓預算。你們比較喜歡輕鬆聊天，還是策略遊戲？',
            },
            {
                author: 'user',
                text: '輕鬆一點，而且有人第一次玩。',
            },
            {
                author: 'sago',
                text: '那我會選規則簡單、每局 15–30 分鐘的遊戲，分成四桌。先用一局暖場，再讓大家自由換桌。',
            },
        ],
        note: '',
    },
    {
        id: 'summary',
        section: 'chat',
        title: '整理對話',
        description: '從聊天室裡的討論，整理決議、待辦與還沒確認的事。',
        channel: '活動籌備',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 幫我整理剛剛的討論，把決定的事和待辦分開。',
            },
            {
                author: 'sago',
                text: '我來看一下前面的討論。',
            },
            {
                author: 'sago',
                text: '已決定\n・週五晚上七點，活動中心集合\n・每組五人，自由報名\n\n待辦\n・確認場地能否提早進場\n・明天公布報名表\n\n還沒確認：餐點預算與雨天備案。',
            },
        ],
        note: '',
    },
    {
        id: 'search',
        section: 'chat',
        title: '資料與歷史搜尋',
        description: '找網路資料或之前的訊息，整理成有來源的答案。',
        channel: '日常聊天',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 上次我們討論活動場地時，最後選了哪裡？',
            },
            {
                author: 'sago',
                text: '我找到上次的討論了：大家決定選活動中心，主要是離宿舍近，也能容納全部的人。\n\n來源：#活動籌備 的討論訊息',
            },
            {
                author: 'user',
                text: '順便幫我查怎麼申請借用。',
            },
            {
                author: 'sago',
                text: '借用流程（示範）\n1. 確認場地與時段\n2. 填寫借用申請\n3. 等待場地管理單位確認\n\n來源：場地借用說明；實際規定請以官方資訊為準。',
            },
        ],
        note: '聊天歷史只搜尋你有權限閱讀的頻道。',
    },
    {
        id: 'ask',
        section: 'chat',
        title: '私下提問',
        description: '用 /ask 提問，回答只會讓你看見。',
        channel: '日常聊天',
        messages: [
            {
                author: 'user',
                text: '/ask 這段程式碼為什麼會出現 undefined？',
            },
            {
                author: 'sago',
                text: '這裡存取了陣列中不存在的位置。先確認索引是否超出長度，再處理找不到資料的情況。\n\n你可以把完整的錯誤訊息貼給我，我再一起看。',
            },
        ],
        note: '這個示範的回答僅提問者可見；/ask 需先註冊。',
    },
    {
        id: 'memory',
        section: 'chat',
        title: '伺服器記憶',
        description: '教她聊天室裡的用語與事實，也能訂正或請她忘記。',
        channel: '日常聊天',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 我們說的「會辦」就是學生會辦公室，記住一下。',
            },
            {
                author: 'sago',
                text: '記住了，這個伺服器裡的「會辦」是學生會辦公室。',
            },
            {
                author: 'user',
                text: '那下次我說去會辦，你就知道是哪裡囉？',
            },
            {
                author: 'sago',
                text: '對，我會按這個意思理解。之後有變動，也可以直接跟我說。',
            },
        ],
        note: '記憶依伺服器分開，不用拿來保存秘密。',
    },
    {
        id: 'reminders',
        section: 'chat',
        title: '提醒與排程',
        description: '一次提醒、重複提醒，修改或取消都用說的。',
        channel: '日常聊天',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 每週五台北時間晚上六點，提醒我交週報。',
            },
            {
                author: 'sago',
                text: '好了，每週五 18:00，我會在這個頻道標記你，提醒你交週報。',
            },
            {
                author: 'user',
                text: '改成五點半好了。',
            },
            {
                author: 'sago',
                text: '已改成每週五 17:30，時區一樣是台北。',
            },
        ],
        note: '',
    },
    {
        id: 'quiet',
        section: 'chat',
        title: '暫停回覆',
        description: '想讓聊天室安靜一下，直接請她暫停。',
        channel: '日常聊天',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 先安靜三十分鐘，我們要開會。',
            },
            {
                author: 'sago',
                text: '好，這個聊天室先暫停三十分鐘。要提早恢復，再叫我就好。',
            },
            {
                author: 'user',
                text: '@迷你西米露 可以回來了。',
            },
            {
                author: 'sago',
                text: '我回來了，繼續聊吧。',
            },
        ],
        note: '',
    },
    {
        id: 'media',
        section: 'files',
        title: '圖片與影片',
        description: '調整圖片、擷取畫面，或把影片轉成 GIF、MP4、MP3。',
        channel: 'mini-sago',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 把這張圖片縮成 128 × 128 的 PNG，保留透明背景，直接傳回圖片檔。',
                file: {
                    name: 'minisago3.png',
                    detail: '圖片附件',
                    kind: 'image',
                    src: '/images/minisago3.png',
                    width: 320,
                    height: 320,
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
        note: '需先設定媒體處理服務。',
    },
    {
        id: 'documents',
        section: 'files',
        title: '表格與文件',
        description: '算數據、做圖表，處理 PDF 與文件附件。',
        channel: '檔案處理',
        messages: LANDING_CONVERSATION,
        note: '需先設定檔案處理服務。',
    },
    {
        id: 'expressions',
        section: 'files',
        title: '表情與貼圖',
        description: '用附件新增 emoji 或貼圖，也能複製、改名 emoji。',
        channel: 'mini-sago',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 把這張圖片新增成這個伺服器的 emoji，叫做 sago_site_demo。完成後傳一次這個 emoji 給我看。',
                file: {
                    name: 'minisago3.png',
                    detail: '圖片附件',
                    kind: 'image',
                    src: '/images/minisago3.png',
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
                    '@迷你西米露 把這張圖片新增成這個伺服器的 emoji，叫做 sago_site_demo。完成後傳一次這個 emoji 給我看。',
            },
        ],
        note: '所有成員都能使用；她需有表情權限。跨伺服器操作限你與她共同加入的伺服器。',
    },
    {
        id: 'social',
        section: 'server',
        title: '社群連結預覽',
        description:
            '貼上 Instagram、X 或 Threads 連結，更方便在聊天室看內容。',
        channel: '分享連結',
        messages: [
            {
                author: 'user',
                text: '剛剛看到這篇，分享給大家：\nhttps://www.instagram.com/p/示範貼文/',
            },
            {
                author: 'sago',
                text: 'https://kkinstagram.com/p/示範貼文/',
            },
        ],
        note: '需擁有者先開啟；貼連結即可，不用標記她。',
    },
    {
        id: 'feeds',
        section: 'server',
        title: '頻道訂閱',
        description: '在頻道接收 TOEFL 單字、動畫瘋優惠碼或 X 動態。',
        channel: '每日單字',
        messages: [
            {
                author: 'notice',
                text: '擁有者已設定這個頻道的 TOEFL 訂閱。',
            },
            {
                author: 'sago',
                text: '今天的單字：concise\n簡潔的、簡明的\n\nKeep your answer concise.\n讓你的回答簡潔一點。',
            },
            {
                author: 'user',
                text: '@迷你西米露 幫我用這個字造一個跟上課有關的句子。',
            },
            {
                author: 'sago',
                text: 'The professor gave a concise explanation of the topic.\n教授簡明地說明了這個主題。',
            },
        ],
        note: '由擁有者設定來源與頻道，頻道內的所有人都能接收更新。',
    },
    {
        id: 'voice',
        section: 'server',
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
                text: '我加入了，可以直接跟我說話。',
            },
            {
                author: 'notice',
                text: '語音對話：你問問題，她以語音回答。',
            },
            {
                author: 'user',
                text: '@迷你西米露 先離開語音。',
            },
            {
                author: 'sago',
                text: '好，已離開。',
            },
        ],
        note: '仍在開發中：辨識、延遲與輪流說話尚未穩定。',
    },
    {
        id: 'campus',
        section: 'nthu',
        title: '校園資訊',
        description: '查清大公車、課程、公告、餐飲與圖書館資訊。',
        channel: '清大生活',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 幫我查清大公車資訊，從校本部到南大校區。',
            },
            {
                author: 'sago',
                text: '我來查校園服務的資料，確認路線和時刻表。',
            },
            {
                author: 'sago',
                text: '校本部 → 南大校區（示範）\n已整理校區接駁路線、乘車位置與時刻表來源。出發前請再確認校方班表，留意平日、假日和停駛公告。\n來源：清大校園交通資訊。',
            },
        ],
        note: '需開啟校園查詢服務；示範不代表即時公車班次。',
    },
    {
        id: 'ccxp',
        section: 'nthu',
        title: '校務會議紀錄',
        description: '找相關校務討論與決議，附上文件來源與頁碼。',
        channel: '校務討論',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 找近幾次校務會議裡，跟課程改革有關的紀錄。',
            },
            {
                author: 'sago',
                text: '我會搜尋已核准的會議索引，找相關議題與決議。',
            },
            {
                author: 'sago',
                text: '相關紀錄（示範）\n・課程規劃：討論跨領域課程安排\n・後續工作：彙整各系意見再送審議\n\n來源：示範會議紀錄，第 12–13 頁。你想再看哪個議題？',
            },
        ],
        note: '限已開放的伺服器與核准索引。',
    },
    {
        id: 'threads',
        section: 'nthu',
        title: '校園脆文',
        description: '明確請她海巡脆，找清大、學生會或指定主題的討論。',
        channel: '清大生活',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 海巡脆，查最近的宿舍討論。',
            },
            {
                author: 'sago',
                text: '我來找清大、NTHU、學生會與宿舍相關的脆文。',
            },
            {
                author: 'sago',
                text: '宿舍討論摘要（示範）\n・有人分享入住前的準備清單\n・有人討論宿舍周邊餐飲\n\n來源：各篇脆文原文。這些是網友經驗，實際住宿規定仍以官方公告為準。',
            },
        ],
        note: '',
    },
    {
        id: 'drive',
        section: 'nthusa',
        title: '雲端文件',
        description: '在核准的學生會文件裡找企劃、紀錄與相關資料。',
        channel: '學生會辦公室',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 找上次迎新活動的企劃書，整理一下活動流程。',
            },
            {
                author: 'sago',
                text: '我先搜尋你有權限讀取的學生會文件。',
            },
            {
                author: 'sago',
                text: '迎新活動流程（示範）\n13:00 報到與分組\n13:30 開場與暖身\n14:00 分組活動\n16:00 收尾\n\n來源：迎新企劃書。工作分配在文件的第二部分，也可以接著幫你整理。',
            },
        ],
        note: '依 Discord 身分組與 Google 文件權限開放。',
    },
    {
        id: 'calendar',
        section: 'nthusa',
        title: '日曆與邀請',
        description: '查會辦空檔，安排活動；寄出邀請前會先讓你確認。',
        channel: '學生會辦公室',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 下週三下午三點開一小時的會，會辦有空嗎？幫我邀請小明和小花。',
            },
            {
                author: 'sago',
                text: '我先確認會辦空檔與聯絡人。',
            },
            {
                author: 'sago',
                text: '確認後才會建立活動並寄出邀請。',
                embed: {
                    author: '待你確認',
                    title: '會議',
                    description:
                        '下週三 15:00–16:00（台北時間）\n地點：會辦\n參加者：小明、小花',
                    footer: '15:10 到期',
                    color: '#e7bc74',
                },
                buttons: ['確認建立', '取消'],
            },
        ],
        note: '需先設定日曆；修改與邀請由原提問者確認。',
    },
    {
        id: 'reviews',
        section: 'developer',
        title: 'PR review',
        description: '在專屬討論串看 PR、補充修改方向，追蹤後續結果。',
        channel: 'PR review',
        messages: [
            {
                author: 'notice',
                text: 'GitHub 通知：有一份新的 PR 等待 review。',
            },
            {
                author: 'user',
                text: '這裡還需要處理沒有資料的情況，補一個空狀態。',
            },
            {
                author: 'sago',
                text: '這個 review 討論串會保留問題、補充方向與後續結果，方便大家接著討論。',
            },
            {
                author: 'notice',
                text: 'PR 狀態更新：已合併；後續部署結果會回報到討論串。',
            },
        ],
        note: '需擁有者設定儲存庫、webhook 與頻道；通知不等於合併或部署授權。',
    },
    {
        id: 'coding',
        section: 'owner',
        title: '程式開發',
        description: '交代修改方向，在討論串追蹤進度、補充需求或暫停。',
        channel: '程式開發',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 修好列表的空狀態，加上驗證，完成後開 draft PR。',
            },
            {
                author: 'sago',
                text: '我會先看現有列表的行為，再補空狀態與驗證。進度放在這個討論串。',
            },
            {
                author: 'user',
                text: '文案簡單一點就好。',
            },
            {
                author: 'sago',
                text: '收到，我會一起調整。',
            },
            {
                author: 'sago',
                text: '修改與驗證完成，已依你的要求開 draft PR，等待 review。',
            },
        ],
        note: '限擁有者發起；合併、部署仍需明確授權。',
    },
    {
        id: 'mac',
        section: 'owner',
        title: 'Mac 檔案',
        description: '按檔名找允許目錄裡的檔案，傳回聊天室。',
        channel: '私人工作',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 找 Mac 裡的活動海報.pdf，傳給我。',
            },
            {
                author: 'sago',
                text: '我在允許搜尋的目錄裡找這個檔名。',
            },
            {
                author: 'sago',
                text: '找到了，這份是你要的檔案。',
                file: {
                    name: '活動海報.pdf',
                    detail: '檔案附件',
                    kind: 'document',
                },
            },
        ],
        note: '限擁有者；只搜尋允許的目錄與檔名。',
    },
    {
        id: 'controls',
        section: 'owner',
        title: '功能與權限設定',
        description: '開啟服務，調整使用對象、身分組與訂閱頻道。',
        channel: '私人工作',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 開啟這個伺服器的 Calendar，只讓指定工作人員身分組使用。',
            },
            {
                author: 'sago',
                text: '我會把 Calendar 開放給指定身分組，其他人不會因此取得日曆存取權。',
            },
            {
                author: 'sago',
                text: '設定已保存，之後會按新的使用範圍提供功能。',
            },
        ],
        note: '只有迷你西米露擁有者能調整。',
    },
] as const satisfies readonly Feature[];
