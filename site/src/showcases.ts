import type { DemoMessage } from './features';
import { LANDING_CONVERSATION } from './features';

interface Showcase {
    readonly id: string;
    readonly title: string;
    readonly channel: string;
    readonly messages: readonly DemoMessage[];
}

export const SHOWCASES = [
    {
        id: 'emotes',
        title: '製作與搬移表情',
        channel: '表情工坊',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 把這張圖片新增成這裡的 emoji，叫做 sago_site_demo，傳一次給我看。',
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
                text: '新增好了，這顆就是 sago_site_demo。',
                emoji: {
                    name: 'sago_site_demo',
                    src: '/demos/sago-site-demo.webp',
                },
            },
            {
                author: 'user',
                text: '再把這顆 emoji 複製到我們都加入的 Sago Lab。',
            },
            {
                author: 'sago',
                replyTo: '再把這顆 emoji 複製到我們都加入的 Sago Lab。',
                text: '也複製到 Sago Lab 了，兩邊都能使用。',
                emoji: {
                    name: 'sago_site_demo',
                    src: '/demos/sago-site-demo.webp',
                },
            },
        ],
    },
    {
        id: 'discussion',
        title: '整理對話懶人包',
        channel: '活動討論',
        messages: [
            {
                author: 'user',
                userName: '小安',
                text: '週五晚上七點在活動中心，大家可以嗎？一組五個人。',
            },
            {
                author: 'user',
                userName: '小晴',
                text: '可以！我明天發報名表。餐點預算還沒定，雨天備案也要想一下。',
            },
            {
                author: 'user',
                userName: '小安',
                text: '那我去問能不能提早進場，時間跟分組就先這樣。',
            },
            {
                author: 'user',
                text: '@迷你西米露 剛剛訊息好多，幫我整理決議、誰要做什麼，還有沒決定的事。',
            },
            {
                author: 'sago',
                text: '決議',
                list: ['週五 19:00，活動中心集合', '每組五人'],
            },
            {
                author: 'sago',
                text: '待辦',
                list: ['小安：確認能否提早進場', '小晴：明天公布報名表'],
            },
            {
                author: 'sago',
                text: '還沒決定：餐點預算、雨天備案。',
            },
        ],
    },
    {
        id: 'documents',
        title: '統計報名資料',
        channel: '活動籌備',
        messages: LANDING_CONVERSATION,
    },
] as const satisfies readonly Showcase[];
