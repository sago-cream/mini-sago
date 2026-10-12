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
                text: '@迷你西米露 把這張圖縮成 128 × 128，保留透明背景，新增成這裡的 emoji，叫做 sago_site_demo。再把它複製到我們都加入的 Sago Lab。',
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
                text: '先縮成 128 × 128，透明背景保留了。',
                file: {
                    name: 'minisago-128.png',
                    detail: '128 × 128',
                    kind: 'image',
                    src: '/demos/minisago-128.webp',
                    width: 128,
                    height: 128,
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
                author: 'sago',
                replyTo:
                    '@迷你西米露 把這張圖縮成 128 × 128，保留透明背景，新增成這裡的 emoji，叫做 sago_site_demo。再把它複製到我們都加入的 Sago Lab。',
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
        title: '整理聊天討論',
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
        id: 'campus',
        title: '安排校園活動',
        channel: '活動籌備',
        messages: [
            {
                ...LANDING_CONVERSATION[0],
                text: '@迷你西米露 幫我統計這份報名表、做長條圖，把整理後的 CSV 一起傳給我。活動在南大，順便查從清大校本部過去的交通資訊，明天台北時間晚上八點提醒我把結果和交通資訊傳給大家。',
            },
            ...LANDING_CONVERSATION.slice(1),
            {
                author: 'sago',
                text: '校本部和南大之間有校區區間車。這裡是校方的路線與時刻表，出發前可以確認當天班次。',
                links: [
                    {
                        label: '清大兩校區區間車時刻表',
                        href: 'https://affairs.site.nthu.edu.tw/p/412-1165-20979.php?Lang=zh-tw',
                    },
                ],
            },
            {
                author: 'sago',
                text: '提醒也設好了。明天 20:00（台北時間），我會在這裡標記你，提醒你把統計結果和交通資訊傳給大家。',
            },
        ],
    },
] as const satisfies readonly Showcase[];
