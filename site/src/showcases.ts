import { demoReply } from './demo-reply';
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
                text: '@迷你西米露 剛剛訊息好多 幫我整理決議 誰要做什麼 還有沒決定的事 簡短就好',
            },
            {
                author: 'sago',
                ...demoReply('showcase-discussion'),
            },
        ],
    },
    {
        id: 'documents',
        title: '日常文書處理',
        channel: '活動籌備',
        messages: LANDING_CONVERSATION,
    },
    {
        id: 'emotes',
        title: '製作與搬移表情',
        channel: '表情工坊',
        messages: [
            {
                author: 'user',
                text: '@迷你西米露 把這張圖片新增成這裡的 emoji 叫做 sago_site_demo 傳一次給我看',
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
                ...demoReply('showcase-emote-add'),
                emoji: {
                    name: 'sago_site_demo',
                    src: '/demos/sago-site-demo.webp',
                },
            },
            {
                author: 'user',
                text: '順便丟到另一個群組 Sago Lab',
            },
            {
                author: 'sago',
                replyTo: '順便丟到另一個群組 Sago Lab',
                ...demoReply('showcase-emote-copy'),
                emoji: {
                    name: 'sago_site_demo',
                    src: '/demos/sago-site-demo.webp',
                },
            },
        ],
    },
] as const satisfies readonly Showcase[];
