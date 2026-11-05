import { REGISTERED_FEATURE_IDS } from "../../src/discord/features";
import { readFileSync } from "node:fs";
import type {
  ChatbotMessage,
  ChatbotServerMemory,
} from "../../contracts/worker-contract";

export type DemoCopyCase = {
  id: string;
  conversation: string;
  request: string;
  features?: string[];
  messages?: ChatbotMessage[];
  tools?: Record<string, unknown>;
  attachmentText?: string[];
  memory?: ChatbotServerMemory;
  spoken?: boolean;
  executionRoute?: "mac";
};
const read = (file: string) =>
  readFileSync(
    new URL(`../../site/public/demos/${file}`, import.meta.url),
    "utf8",
  );
export const demoId = (n: number) => String(100000000000000000n + BigInt(n));
const message = (
  author: string,
  content: string,
  index: number,
): ChatbotMessage => ({
  id: demoId(index + 100),
  author,
  authorId: demoId(author === "小安" ? 10 : author === "小晴" ? 11 : 12),
  channelId: demoId(2),
  role: "user",
  timestamp: "2026-10-09T07:24:00.000Z",
  content,
  attachments: [],
});
const discussion = [
  message("小安", "下週五晚上七點在活動中心，每組五人，就先這樣？", 0),
  message("小晴", "好，我明天發報名表。餐點預算跟雨天備案還沒決定。", 1),
  message("小安", "我問一下能不能提早進場。", 2),
];
const context = (messages: ChatbotMessage[] = []) => ({
  history: { status: "complete", messages },
  search: { status: "complete", results: messages },
  members: { status: "not_requested", results: [] },
  previousTrace: { status: "not_requested" },
});
const guild = {
  id: demoId(1),
  name: "Sago Lab",
  canCreateExpressions: true,
  canManageExpressions: true,
};
const orgMemory: ChatbotServerMemory = {
  revision: 1,
  entries: [
    {
      id: "mem_012345abcdef",
      content: `這裡是 Sago Lab，伺服器 ID ${demoId(1)}，目前頻道 ID ${demoId(2)}，公告頻道 ID ${demoId(3)}；工作人員身分組 ID ${demoId(5)}。`,
    },
  ],
};
const policy = (enabled: boolean, filtered = false) => ({
  defaultEnabled: false,
  rules: [
    {
      scope: "guild",
      targetId: demoId(1),
      enabled,
      ...(enabled && filtered ? { allowRoleIds: [demoId(5)] } : {}),
    },
  ],
});
const featurePolicy = (enabled: boolean) => ({
  status: "complete",
  currentGuildId: demoId(1),
  policy: {
    version: 1,
    features: {
      ...Object.fromEntries(
        REGISTERED_FEATURE_IDS.map((id) => [id, policy(false)]),
      ),
      chatbot: policy(true),
      calendar: policy(enabled, true),
    },
  },
});
const artifact = "python-539d1000-5711-4473-b722-73a64b3a80ad.zip";
const report = {
  status: "complete",
  mediaId: artifact,
  filename: artifact,
  contents: ["registration-chart.png", "registration-with-total.csv"],
  output: { groups: { A: 18, B: 14, C: 16 }, total: 48, average: 16 },
};
const welcome = read("welcome-plan.md");
const meeting = read("meeting-sample.txt");
const threads = read("threads-sample.txt");
const source = (file: string) => `https://mini.sagocream.com/demos/${file}`;
const commandInspection = (registered: boolean) => ({
  status: "complete",
  guildId: demoId(1),
  globalCommands: [],
  guildCommands: registered ? [{ id: demoId(70), name: "ask", type: 1 }] : [],
  permissions: { status: "complete", commandPermissionOverwrites: [] },
});

export const SITE_DEMO_COPY_CASES: DemoCopyCase[] = [
  {
    id: "chat-banter",
    conversation: "chat",
    request: "我把報告放枕頭下面睡一晚 可以用滲透壓吸收知識嗎",
  },
  {
    id: "chat-plan",
    conversation: "chat",
    request:
      "好啦 認真問 我想辦 20 人的桌遊聚會 預算 3000 元 有人第一次玩 先給我三個安排重點就好",
  },
  {
    id: "chat-schedule",
    conversation: "chat",
    request: "輕鬆聊天那種 晚上七點開始 兩個人吃素 幫我排三小時流程 簡短一點",
  },
  {
    id: "chat-signup",
    conversation: "chat",
    request: "那報名表要問什麼 五個欄位就好",
  },
  {
    id: "summary",
    conversation: "summary",
    request:
      "幫我找上週的活動討論 整理成懶人包 決議 待辦 還沒決定的事都要 簡短就好",
    features: ["discord_context"],
    tools: { resolve_context: context(discussion) },
  },
  {
    id: "summary-announcement",
    conversation: "summary",
    request: "幫我縮成一段可以貼公告的版本",
  },
  {
    id: "ask",
    conversation: "ask",
    request:
      "users[0].name 出現 undefined，users 有時是空陣列，要怎麼改？簡短說明，給一個例子就好。",
  },
  {
    id: "memory-save",
    conversation: "memory",
    request: "我們這裡說的「會辦」就是學生會辦公室 記住一下",
    features: ["server_memory"],
    tools: {
      manage_server_memory: {
        status: "complete",
        action: "add",
        revision: 2,
        entryId: "mem_012345abcdef",
      },
    },
  },
  {
    id: "memory-use",
    conversation: "memory",
    request: "我要去會辦開會 幫我列一下要帶的東西 簡短就好",
    memory: {
      revision: 2,
      entries: [
        { id: "mem_012345abcdef", content: "本伺服器的會辦指學生會辦公室。" },
      ],
    },
  },
  {
    id: "memory-remove",
    conversation: "memory",
    request: "我們現在不叫會辦了 請忘記這個說法",
    memory: {
      revision: 2,
      entries: [
        { id: "mem_012345abcdef", content: "本伺服器的會辦指學生會辦公室。" },
      ],
    },
    features: ["server_memory"],
    tools: {
      manage_server_memory: {
        status: "complete",
        action: "remove",
        revision: 3,
        entryId: "mem_012345abcdef",
      },
    },
  },
  {
    id: "voice-join",
    conversation: "voice",
    request: "加入我的語音頻道",
    features: ["voice_presence"],
    tools: { join_voice_channel: { status: "joined", channelId: demoId(8) } },
  },
  {
    id: "voice-spoken",
    conversation: "voice-spoken",
    request: "明日試験なのに、復習できるのはあと一時間だけ。どう使えばいい？",
    spoken: true,
  },
  {
    id: "voice-leave",
    conversation: "voice",
    request: "先離開語音",
    features: ["voice_presence"],
    tools: { leave_voice_channel: { status: "left" } },
  },
  {
    id: "search",
    conversation: "search",
    request:
      "幫我找 Discord 官方的 Markdown 說明 公告想用粗體和條列 要怎麼寫 簡短給範例就好",
    features: ["link_read"],
    tools: {
      read_link: {
        status: "complete",
        url: "https://support.discord.com/hc/en-us/articles/210298617-Markdown-Text-101-Chat-Formatting-Bold-Italic-Underline",
        title: "Markdown Text 101",
        excerpt:
          "Bold text: **text**. Bulleted lists: start a line with - followed by a space. Markdown tables are not supported.",
        truncated: false,
      },
    },
    messages: [
      message(
        "你",
        "官方說明連結 https://support.discord.com/hc/en-us/articles/210298617-Markdown-Text-101-Chat-Formatting-Bold-Italic-Underline",
        9,
      ),
    ],
  },
  {
    id: "drive",
    conversation: "drive",
    request: "找迎新企劃 整理活動流程和誰負責什麼 簡短就好",
    features: ["drive", "link_read"],
    tools: {
      read_link: {
        status: "complete",
        url: source("welcome-plan.md"),
        title: "迎新企劃（示範）",
        excerpt: welcome,
        truncated: false,
      },
      list_shared_drives: {
        status: "complete",
        drives: [{ id: "drive-demo", name: "活動企劃" }],
      },
      search_drive_files: {
        status: "complete",
        files: [
          {
            id: "welcome-demo",
            name: "迎新企劃",
            mimeType: "text/markdown",
            webViewLink: source("welcome-plan.md"),
          },
        ],
      },
      read_drive_file: {
        status: "complete",
        content: welcome,
        sourceUrl: source("welcome-plan.md"),
        truncated: false,
      },
    },
  },
  {
    id: "drive-equipment",
    conversation: "drive",
    request: "我只想確認器材要提前多久準備",
  },
  {
    id: "ccxp",
    conversation: "ccxp",
    request: "找校務會議裡討論跨領域課程的紀錄 告訴我最後決定了什麼 簡短就好",
    features: ["ccxp_meetings"],
    tools: {
      search_ccxp_meetings: {
        status: "complete",
        results: [
          {
            documentId: "0123456789abcdef0123456789abcdef",
            title: "校務會議紀錄（示範）",
            sourceUrl: source("meeting-sample.txt"),
            page: 2,
          },
        ],
      },
      read_ccxp_meeting: {
        status: "complete",
        title: "校務會議紀錄（示範）",
        text: meeting,
        pageCount: 2,
        nextOffset: null,
        page: 2,
        sourceUrl: source("meeting-sample.txt"),
        truncated: false,
      },
    },
  },
  {
    id: "ccxp-followup",
    conversation: "ccxp",
    request: "所以還不能說下學期確定會開？",
  },
  {
    id: "threads",
    conversation: "threads",
    request: "海巡脆 找清大宿舍入住前要準備什麼 簡短整理",
    features: ["threads_search"],
    tools: {
      search_threads: {
        status: "complete",
        posts: [{ text: threads, sourceUrl: source("threads-sample.txt") }],
        truncated: false,
      },
    },
  },
  {
    id: "threads-packing",
    conversation: "threads",
    request: "整理成打包清單 哪些要先問宿舍",
  },
  {
    id: "documents",
    conversation: "documents",
    request:
      "幫我整理這份範例報名表 算出總人數和各組人數 做成長條圖 PNG 並把整理後的 CSV 一起傳給我 用 ZIP 打包 簡短回覆就好",
    features: ["media_processing"],
    attachmentText: [
      "Attachment: 活動報名.csv\n組別,人數\nA 組,18\nB 組,14\nC 組,16",
    ],
    tools: { run_python: report },
  },
  {
    id: "documents-average",
    conversation: "documents",
    request: "哪些組超過平均人數",
    tools: {
      run_python: {
        status: "complete",
        output: "平均16人；A組18人超過；B組14人低於；C組16人等於平均。",
      },
    },
    features: ["media_processing"],
  },
  {
    id: "media",
    conversation: "media",
    request:
      "我要拿這張圖當表情 把它縮成 128 × 128 的 PNG 保留透明背景 直接傳回圖片檔",
    features: ["media_processing"],
    tools: {
      transform_image: {
        status: "complete",
        mediaId: "media-f111ee3f-f470-4496-aa80-3d66da2a585e.png",
        width: 128,
        height: 128,
        contentType: "image/png",
        transparent: true,
      },
    },
  },
  {
    id: "mac-choose",
    executionRoute: "mac",
    features: ["mac_file_delivery"],
    conversation: "mac",
    request: "找 Mac 上的活動報名.csv 傳給我",
    tools: {
      search_files: {
        status: "complete",
        files: [
          {
            path: "/Users/demo/活動/活動報名.csv",
            modifiedAt: "2026-10-14T00:00:00Z",
          },
          {
            path: "/Users/demo/Downloads/活動報名.csv",
            modifiedAt: "2026-10-01T00:00:00Z",
          },
        ],
      },
    },
  },
  {
    id: "mac-send",
    executionRoute: "mac",
    features: ["mac_file_delivery"],
    conversation: "mac",
    request: "活動資料夾的最新版",
    tools: {
      search_files: {
        status: "complete",
        files: [{ path: "/Users/demo/活動/活動報名.csv", size: 1024 }],
      },
    },
  },
  {
    id: "reminder-create",
    conversation: "reminders",
    request: "每週五台北時間晚上六點 提醒我交週報",
    features: ["reminders"],
    tools: {
      create_reminder: {
        id: "a0000000-0000-4000-8000-000000000001",
        content: "交週報",
        cron: "0 18 * * 5",
        timezone: "Asia/Taipei",
        nextRunAt: "2026-10-16T10:00:00Z",
      },
    },
  },
  {
    id: "reminder-edit",
    conversation: "reminders",
    request: "改成五點半好了",
    features: ["reminders"],
    tools: {
      list_reminders: {
        status: "complete",
        reminders: [
          {
            id: "a0000000-0000-4000-8000-000000000001",
            content: "交週報",
            cron: "0 18 * * 5",
            timezone: "Asia/Taipei",
            nextRunAt: "2026-10-16T10:00:00Z",
          },
        ],
      },
      edit_reminder: {
        status: "complete",
        id: "a0000000-0000-4000-8000-000000000001",
        content: "交週報",
        cron: "30 17 * * 5",
        timezone: "Asia/Taipei",
        nextRunAt: "2026-10-16T09:30:00Z",
      },
    },
  },
  {
    id: "reminder-cancel",
    conversation: "reminders",
    request: "收到 下週開始不用提醒了 幫我取消",
    features: ["reminders"],
    tools: {
      list_reminders: {
        status: "complete",
        reminders: [
          {
            id: "a0000000-0000-4000-8000-000000000001",
            content: "交週報",
            cron: "30 17 * * 5",
            timezone: "Asia/Taipei",
            nextRunAt: "2026-10-23T09:30:00Z",
          },
        ],
      },
      cancel_reminder: {
        status: "complete",
        cancelled: true,
        reminderId: "a0000000-0000-4000-8000-000000000001",
      },
    },
  },
  {
    id: "image-edit",
    conversation: "image",
    request:
      "把這個藍色表符改成紅色 再戴上耳機 背景透明 傳圖片給我 也新增成 mascot_headphones",
    features: ["media_processing", "custom_expressions"],
    tools: {
      generate_image: {
        status: "complete",
        mediaId: "mascot_headphones.png",
        contentType: "image/png",
        width: 128,
        height: 128,
      },
      add_guild_expression: {
        status: "complete",
        kind: "emoji",
        name: "mascot_headphones",
        id: demoId(30),
        guild,
      },
    },
  },
  {
    id: "expression-add",
    conversation: "expressions",
    request:
      "把這張圖片新增成這個伺服器的 emoji 叫做 sago_site_demo 完成後傳一次給我看",
    features: ["custom_expressions"],
    tools: {
      add_guild_expression: {
        status: "complete",
        kind: "emoji",
        name: "sago_site_demo",
        id: demoId(30),
        guild,
      },
    },
  },
  {
    id: "expression-copy",
    conversation: "expressions",
    request: "再幫我改名成 sago_wave 複製到我們都加入的 Sago Lab",
    features: ["custom_expressions"],
    tools: {
      list_shared_guilds: { status: "complete", guilds: [guild] },
      rename_guild_emoji: {
        status: "complete",
        kind: "emoji",
        name: "sago_wave",
        id: demoId(30),
        guild,
      },
      add_guild_expression: {
        status: "complete",
        kind: "emoji",
        name: "sago_wave",
        id: demoId(31),
        sourceGuild: { ...guild, id: demoId(4), name: "活動籌備" },
        guild,
      },
    },
  },
  {
    id: "member-names",
    conversation: "members",
    request: "請標記小明 提醒他確認分工",
    features: ["member_mentions"],
    tools: {
      mention_members: {
        status: "complete",
        memberIds: [demoId(10)],
        messageIds: [demoId(90)],
        unresolvedQueries: [],
      },
    },
  },
  {
    id: "status-online",
    conversation: "status",
    request: "把自訂狀態改成「mini.sagocream.com」保持在線",
    features: ["bot_status"],
    tools: {
      update_custom_status: {
        status: "updated",
        text: "mini.sagocream.com",
        presence: "online",
      },
    },
  },
  {
    id: "status-idle",
    conversation: "status",
    request: "改成閒置 狀態文字不變",
    features: ["bot_status"],
    tools: {
      update_custom_status: {
        status: "updated",
        text: "mini.sagocream.com",
        presence: "idle",
      },
    },
  },
  {
    id: "channel-message",
    conversation: "send",
    request: "在 Sago Lab 的 #公告 傳送「明天晚上七點開會，請帶上活動企劃。」",
    features: ["channel_messaging"],
    tools: {
      send_channel_message: {
        status: "complete",
        id: demoId(91),
        guildId: guild.id,
        guildName: guild.name,
        channelId: demoId(3),
        channelName: "公告",
        jumpUrl: `https://discord.com/channels/${guild.id}/${demoId(3)}/${demoId(91)}`,
      },
    },
  },
  {
    id: "commands-inspect",
    conversation: "commands",
    request: "已開啟聊天 但伺服器的指令列表看不到 /ask 幫我檢查",
    memory: orgMemory,
    features: ["discord_commands"],
    tools: { inspect_discord_commands: commandInspection(false) },
  },
  {
    id: "commands-sync",
    conversation: "commands",
    request: "幫這個伺服器重新同步 /ask",
    memory: orgMemory,
    features: ["discord_commands"],
    tools: {
      sync_discord_commands: {
        status: "synced",
        guildId: demoId(1),
        command: { id: demoId(70), name: "ask" },
        verified: true,
      },
      inspect_discord_commands: commandInspection(true),
    },
  },
  {
    id: "controls-list",
    conversation: "controls",
    request: "查這個伺服器目前開放的功能",
    memory: orgMemory,
    features: ["feature_availability", "managed_services"],
    tools: {
      list_feature_availability: featurePolicy(false),
      list_managed_services: {
        status: "complete",
        services: [
          {
            id: "toefl_vocab",
            name: "每日單字",
            destinations: [
              {
                guildId: guild.id,
                channelId: demoId(9),
                channelName: "每日單字",
                channelMention: `<#${demoId(9)}>`,
              },
            ],
          },
        ],
      },
    },
  },
  {
    id: "controls-enable",
    conversation: "controls",
    request: `開啟 Calendar 只讓「工作人員」身分組使用`,
    memory: orgMemory,
    features: ["feature_availability"],
    tools: {
      configure_feature_availability: {
        status: "complete",
        feature: "calendar",
        policy: policy(true, true),
      },
    },
  },
  {
    id: "controls-check",
    conversation: "controls",
    request: "再幫我確認一次設定",
    memory: orgMemory,
    features: ["feature_availability", "managed_services"],
    tools: {
      list_feature_availability: featurePolicy(true),
      list_managed_services: {
        status: "complete",
        services: [
          {
            id: "toefl_vocab",
            name: "每日單字",
            destinations: [{ channelId: demoId(9), channelName: "每日單字" }],
          },
        ],
      },
    },
  },
  {
    id: "showcase-discussion",
    conversation: "showcase-discussion",
    request: "剛剛訊息好多 幫我整理決議 誰要做什麼 還有沒決定的事 簡短就好",
    messages: discussion.map((m) => ({
      ...m,
      timestamp: "2026-10-14T07:24:00Z",
      content: m.content.replace("下週五", "週五"),
    })),
  },
  {
    id: "showcase-emote-add",
    conversation: "showcase-emotes",
    request: "把這張圖片新增成這裡的 emoji 叫做 sago_site_demo 傳一次給我看",
    features: ["custom_expressions"],
    tools: {
      add_guild_expression: {
        status: "complete",
        kind: "emoji",
        name: "sago_site_demo",
        id: demoId(30),
        guild: { ...guild, id: demoId(4), name: "表情工坊" },
      },
    },
  },
  {
    id: "showcase-emote-copy",
    conversation: "showcase-emotes",
    request: "順便丟到另一個群組 Sago Lab",
    features: ["custom_expressions"],
    tools: {
      list_shared_guilds: {
        status: "complete",
        guilds: [guild, { ...guild, id: demoId(4), name: "表情工坊" }],
      },
      add_guild_expression: {
        status: "complete",
        kind: "emoji",
        name: "sago_site_demo",
        id: demoId(31),
        sourceGuild: { ...guild, id: demoId(4), name: "表情工坊" },
        guild,
      },
    },
  },
];

const poll = {
  status: "complete",
  channelId: demoId(2),
  messageId: demoId(60),
  jumpUrl: `https://discord.com/channels/${demoId(1)}/${demoId(2)}/${demoId(60)}`,
  reactions: [
    { emoji: "👍", count: 2, normalCount: 2, burstCount: 0 },
    { emoji: "✅", count: 2, normalCount: 2, burstCount: 0 },
  ],
};
const voter = (name: string, n: number) => ({
  id: demoId(n),
  mention: `<@${demoId(n)}>`,
  names: [`工作組_${name}`, name],
  memberResolved: true,
});
SITE_DEMO_COPY_CASES.push(
  {
    id: "reaction-voters",
    conversation: "reaction-voters",
    request: "幫我統計這則投票各表情有誰按 並對照報名名單 簡短就好",
    messages: [
      message(
        "你",
        "報名名單：小明、小安、小晴、小雨。時段投票：21:00 用 👍，22:00 用 ✅。投票訊息 ID " +
          demoId(60),
        7,
      ),
    ],
    features: ["reaction_lookup"],
    tools: {
      read_message_reactions: (input: { emoji?: string }) =>
        input.emoji
          ? {
              ...poll,
              emoji: input.emoji,
              reactionType: "normal",
              participants:
                input.emoji === "👍"
                  ? [voter("小明", 10), voter("小安", 11)]
                  : [voter("小安", 11), voter("小晴", 12)],
              nextAfter: null,
            }
          : poll,
    },
  },
  {
    id: "calendar",
    conversation: "calendar",
    request:
      "下週三下午三點開一小時的迎新籌備會 幫我確認會辦空檔 邀請小安和小晴",
    features: ["calendar"],
    memory: {
      revision: 1,
      entries: [
        {
          id: "mem_012345abcdef",
          content:
            "會辦指學生會辦公室。小安 an@example.test、小晴 sunny@example.test。",
        },
      ],
    },
    tools: {
      list_calendar_events: { status: "complete", events: [], conflicts: [] },
      create_calendar_event: {
        status: "pending_confirmation",
        replyDelivered: true,
        calendarDraftId: "draft-demo",
        title: "迎新籌備會",
        start: "2026-10-21T15:00:00+08:00",
        end: "2026-10-21T16:00:00+08:00",
      },
    },
  },
  {
    id: "campus",
    conversation: "campus",
    request: "我在清大校本部 想搭校車去南大 要去哪裡搭 簡短就好",
    features: ["nthu_campus"],
    tools: {
      get_bus_stops: {
        status: "complete",
        route: "兩校區區間車",
        stops: [{ name: "北校門口" }, { name: "綜二館" }],
        sourceUrl:
          "https://affairs.site.nthu.edu.tw/p/412-1165-20979.php?Lang=zh-tw",
        coverage: "示範摘錄；實際停靠依當期路線",
      },
    },
  },
  {
    id: "campus-weekend",
    conversation: "campus",
    request: "假日也一樣嗎",
    tools: {
      get_next_buses: {
        status: "unavailable",
        reason: "此示範沒有最新假日班表；需確認校方當期公告。",
        sourceUrl:
          "https://affairs.site.nthu.edu.tw/p/412-1165-20979.php?Lang=zh-tw",
      },
    },
  },
);
