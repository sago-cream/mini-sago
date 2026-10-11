export type Audience = 'general' | 'nthu' | 'nthusa' | 'owner' | 'developer';

export interface Feature {
    readonly id: string;
    readonly audience: Audience;
    readonly title: string;
    readonly description: string;
    readonly example: string;
}

const REPO = 'https://github.com/sago-cream/mini-sago';
export const REPOSITORY_URL = REPO;
export const INVITE_URL =
    'https://discord.com/oauth2/authorize?client_id=1487474617017831494&integration_type=0&scope=bot&permissions=9124124388416';

export const AUDIENCE_GROUPS = [
    {
        audience: 'general',
        title: '一般使用者',
        description: '在已開放的聊天室使用；部分功能需擁有者先設定。',
    },
    {
        audience: 'nthu',
        title: 'NTHU · 清大',
        description: '',
    },
    {
        audience: 'nthusa',
        title: 'NTHUSA · 清大學生會',
        description: '依伺服器與身分組開放。',
    },
    {
        audience: 'developer',
        title: '開發協作',
        description: '需擁有者設定 GitHub 儲存庫與通知頻道。',
    },
    {
        audience: 'owner',
        title: '擁有者',
        description: '限迷你西米露的擁有者操作。',
    },
] as const satisfies ReadonlyArray<{
    readonly audience: Audience;
    readonly title: string;
    readonly description: string;
}>;

export const FEATURES = [
    {
        id: 'chat',
        audience: 'general',
        title: '聊天',
        description: '提問、查資料、整理重點，也能找回之前的對話。',
        example: '@迷你西米露 你能幫我做什麼？',
    },
    {
        id: 'reminders',
        audience: 'general',
        title: '提醒',
        description: '到時間標記你，一次或定期都可以。',
        example: '@迷你西米露 明天台北時間晚上八點提醒我交報告',
    },
    {
        id: 'expressions',
        audience: 'general',
        title: '表情與貼圖',
        description: '新增 emoji 和貼圖，複製或改名 emoji。',
        example: '@迷你西米露 把這張圖加成 sago_happy emoji',
    },
    {
        id: 'social',
        audience: 'general',
        title: '連結預覽',
        description: '貼上 Instagram、X、Threads 連結，直接看內容。',
        example: '貼上連結即可，不用標記她。',
    },
    {
        id: 'feeds',
        audience: 'general',
        title: '頻道訂閱',
        description: '接收 TOEFL 單字、動畫瘋優惠碼或 X 動態。',
        example: '請擁有者設定訂閱來源與頻道，之後就會自動收到更新。',
    },
    {
        id: 'files',
        audience: 'general',
        title: '處理檔案',
        description: '改圖、轉影片、算表格，整理 PDF 和文件。',
        example: '@迷你西米露 把這支影片轉成 GIF',
    },
    {
        id: 'voice',
        audience: 'general',
        title: '語音聊天',
        description: '加入語音頻道和你說話，目前仍在開發中。',
        example: '@迷你西米露 加入我的語音頻道',
    },
    {
        id: 'campus',
        audience: 'nthu',
        title: '校園查詢',
        description: '查公車、課程、公告、校務紀錄與校園脆文。',
        example: '@迷你西米露 查清大公車資訊',
    },
    {
        id: 'drive',
        audience: 'nthusa',
        title: '雲端文件',
        description: '找學生會的企劃、紀錄和其他文件。',
        example: '@迷你西米露 找上次活動的企劃書',
    },
    {
        id: 'calendar',
        audience: 'nthusa',
        title: '日曆與邀請',
        description: '查會辦空檔、排活動，確認後寄出邀請。',
        example: '@迷你西米露 下週三下午三點開會，會辦有空嗎？',
    },
    {
        id: 'reviews',
        audience: 'developer',
        title: 'PR review',
        description: '在討論串 review PR，追蹤修改與部署結果。',
        example: '收到 PR 通知後，直接在 review 討論串回覆。',
    },
    {
        id: 'coding',
        audience: 'owner',
        title: '程式開發',
        description: '交代修改方向，追蹤進度，完成後開 PR。',
        example: '@迷你西米露 修這個問題，完成後開 draft PR',
    },
    {
        id: 'mac',
        audience: 'owner',
        title: 'Mac 檔案',
        description: '按檔名找 Mac 裡的檔案，傳回聊天室。',
        example: '@迷你西米露 找 Mac 裡的活動海報.pdf',
    },
    {
        id: 'controls',
        audience: 'owner',
        title: '功能設定',
        description: '開啟服務、調整使用對象與訂閱頻道。',
        example: '@迷你西米露 開啟 Calendar，限指定身分組',
    },
] as const satisfies readonly Feature[];
