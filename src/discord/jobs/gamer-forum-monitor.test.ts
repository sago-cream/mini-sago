import { describe, expect, spyOn, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { DiscordRequest } from "../api/request";

import {
  buildForumPageUrl,
  buildForumReaderUrl,
  buildGamerForumPostMessagePayload,
  formatGamerForumPostMessage,
  GAMER_FORUM_READER_HEADERS,
  getForumCurrentPageNumber,
  getForumLastPageNumber,
  parseGamerForumMarkdownPosts,
  parseGamerForumPosts,
  parseForumCheckTimes,
  sendGamerForumAlertsIfNeeded,
} from "./gamer-forum-monitor";

const watchUrl = "https://m.gamer.com.tw/forum/C.php?bsn=36476&snA=3047&to=112";

const sampleHtml = `
<link rel="canonical" href="https://forum.gamer.com.tw/C.php?bsn=36476&amp;snA=3047&amp;page=6">
<select onchange="changePage(this.value, 6);">
<option value="6" selected>6 頁 / 7 頁</option><option value="7">7 頁 / 7 頁</option>
</select>
<div class="cbox article-cont " id="post_15233">
<div class="cbox_man ">
<div class="cbox_man-author">
<a href="/home/home.php?owner=nerv911120">
<img src="https://avatar2.bahamut.com.tw/avataruserpic/n/e/nerv911120/nerv911120_s.png" id="avatar_fpath15233"/>
</a>
<span>Guistar (nerv911120)</span>
<span>2026-07-05 20:11:06</span>
<div class="c-user__honor" data-honors="16,222,269"></div>
</div>
<span class="cbox_man-floor">#116</span>
</div>
<article class="cbox_txt" id="cf15233"><div>比賽&nbsp;禮品碼: <font>Y4C7W9Z3T<br></font>不可奉納的紫色隨機禮物 喵趣券 寶玉各 X1<br><a class="photoswipe-image" href="https://truth.bahamut.com.tw/s01/202607/forum/36476/code.WEBP"><img class="lazyload" data-src="https://truth.bahamut.com.tw/s01/202607/forum/36476/code.WEBP?w=600"></a></div></article>
</div>
<div class="halac_form"></div>
`;

const sampleMarkdown = `
[![Avatar](https://avatar2.bahamut.com.tw/avatar.png)](https://m.gamer.com.tw/home/home.php?owner=nerv911120)Guistar (nerv911120)2026-07-05 20:11:06

[![Honor](https://p2.bahamut.com.tw/HOME/honor/16.gif)](javascript:;)

#116

比賽 禮品碼: Y4C7W9Z3T

不可奉納的紫色隨機禮物 喵趣券 寶玉各 X1

[![Image](https://truth.bahamut.com.tw/s01/202607/forum/36476/code.WEBP)](https://truth.bahamut.com.tw/s01/202607/forum/36476/code.WEBP)

[](javascript:;)69

[](javascript:;)0

[關閉圖片影片](javascript:MB_showAdvancedUseDownloadApp();)[收藏](javascript:otheraction(15233);)[回覆本篇](https://m.gamer.com.tw/forum/post1.php?sn=15233)

#117 此文章已由原作者刪除
`;

describe("Gamer forum page helpers", () => {
  test("reads current and last page numbers", () => {
    expect(getForumCurrentPageNumber(sampleHtml, watchUrl)).toBe(6);
    expect(getForumLastPageNumber(sampleHtml)).toBe(7);
  });

  test("builds a latest-page URL from the watched anchor URL", () => {
    expect(buildForumPageUrl(watchUrl, 7)).toBe(
      "https://m.gamer.com.tw/forum/C.php?bsn=36476&snA=3047&page=7",
    );
  });

  test("routes forum requests through the reader service", () => {
    expect(buildForumReaderUrl(watchUrl)).toBe(`https://r.jina.ai/${watchUrl}`);
    expect(buildForumReaderUrl(watchUrl, "https://reader.example.test")).toBe(
      `https://reader.example.test/${watchUrl}`,
    );
  });

  test("identifies honestly to the reader instead of impersonating a browser", () => {
    expect(GAMER_FORUM_READER_HEADERS).toEqual({
      "User-Agent": "MiniSago/0.1",
      "X-Cache-Tolerance": "300",
      "X-Respond-With": "html",
    });
  });
});

test.each([200, 403])(
  "follows Reader pagination and preserves the checkpoint if the last page returns HTTP %i",
  async (status) => {
    const directory = await mkdtemp(join(tmpdir(), "minisago-forum-"));
    const stateFile = join(directory, "state.json");
    const config = {
      botToken: "test",
      watchUrl,
      readerBaseUrl: "https://reader.example.test/",
      stateFile,
      checkTimes: [510],
      timezone: "Asia/Taipei",
    };
    const lastPageUrl = buildForumPageUrl(watchUrl, 7);
    const fetchMock = spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(sampleHtml))
      .mockResolvedValueOnce(
        new Response(
          status === 200
            ? sampleHtml.replaceAll("15233", "15234").replace("#116", "#120")
            : "Access denied",
          { status },
        ),
      );
    const sent: unknown[] = [];
    const options = {
      destinations: [{ guildId: "guild", channelId: "one" }],
      discordRequest: (async (_path, request) => {
        if (request?.method !== "POST") return { guild_id: "guild" };
        sent.push(request.body);
        return { id: "message" };
      }) as DiscordRequest,
    };
    try {
      await writeFile(stateFile, JSON.stringify({ lastPostId: "15232" }));
      const run = sendGamerForumAlertsIfNeeded(config, new Date(), options);
      if (status === 403) {
        await expect(run).rejects.toThrow(
          "Gamer forum reader returned HTTP 403",
        );
        expect(sent).toHaveLength(0);
        expect(JSON.parse(await readFile(stateFile, "utf8"))).toEqual({
          lastPostId: "15232",
        });
      } else {
        await run;
        expect(sent).toEqual([
          expect.objectContaining({ content: expect.stringContaining("#116") }),
          expect.objectContaining({ content: expect.stringContaining("#120") }),
        ]);
        expect(JSON.parse(await readFile(stateFile, "utf8")).lastPostId).toBe(
          "15234",
        );
      }
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
        buildForumReaderUrl(watchUrl, config.readerBaseUrl),
        buildForumReaderUrl(lastPageUrl, config.readerBaseUrl),
      ]);
      for (const [, request] of fetchMock.mock.calls) {
        expect(request?.headers).toEqual(GAMER_FORUM_READER_HEADERS);
      }
    } finally {
      fetchMock.mockRestore();
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test.each(["unchanged", "empty", "unavailable", "removed subscription"])(
  "retries a failed forum destination with an %s source without repeating successful sends",
  async (source) => {
    const directory = await mkdtemp(join(tmpdir(), "minisago-forum-"));
    const stateFile = join(directory, "state.json");
    const config = {
      botToken: "test",
      watchUrl,
      readerBaseUrl: "https://reader.example.test/",
      stateFile,
      checkTimes: [510],
      timezone: "Asia/Taipei",
    };
    const sent: string[] = [];
    let failing = true;
    const options = {
      destinations: [
        { guildId: "guild", channelId: "one" },
        { guildId: "guild", channelId: "two" },
      ],
      fetchPosts: async () => parseGamerForumPosts(sampleHtml, watchUrl),
      discordRequest: (async (path, request) => {
        if (request?.method !== "POST") return { guild_id: "guild" };
        if (path.includes("/two/") && failing) throw new Error("offline");
        sent.push(path);
        return { id: "message" };
      }) as DiscordRequest,
    };
    try {
      await writeFile(stateFile, JSON.stringify({ lastPostId: "15232" }));
      await sendGamerForumAlertsIfNeeded(config, new Date(), options);
      expect(sent).toEqual(["/channels/one/messages"]);
      failing = false;
      await sendGamerForumAlertsIfNeeded(config, new Date(), {
        ...options,
        destinations:
          source === "removed subscription"
            ? options.destinations.slice(0, 1)
            : options.destinations,
        fetchPosts: async () => {
          if (source === "unavailable") throw new Error("reader offline");
          return source === "empty" ? [] : options.fetchPosts();
        },
      });
      expect(sent).toEqual(
        source === "removed subscription"
          ? ["/channels/one/messages"]
          : ["/channels/one/messages", "/channels/two/messages"],
      );
      expect(JSON.parse(await readFile(stateFile, "utf8"))).toMatchObject({
        lastPostId: "15233",
      });
      expect(
        JSON.parse(await readFile(stateFile, "utf8")).pendingPosts,
      ).toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("saves every collected forum post before delivery and retries an all-destination failure", async () => {
  const directory = await mkdtemp(join(tmpdir(), "minisago-forum-"));
  const stateFile = join(directory, "state.json");
  const config = {
    botToken: "test",
    watchUrl,
    readerBaseUrl: "https://reader.example.test/",
    stateFile,
    checkTimes: [510],
    timezone: "Asia/Taipei",
  };
  const post = parseGamerForumPosts(sampleHtml, watchUrl)[0]!;
  const posts = [post, { ...post, id: "15234", text: "newer post" }];
  const sent: string[] = [];
  let failing = true;
  const options = {
    destinations: [{ guildId: "guild", channelId: "one" }],
    fetchPosts: async () => posts,
    discordRequest: (async (_path, request) => {
      if (request?.method !== "POST") return { guild_id: "guild" };
      if (failing) throw new Error("offline");
      sent.push((request.body as { content: string }).content);
      return { id: "message" };
    }) as DiscordRequest,
  };
  try {
    // New installations seed a checkpoint without reposting history.
    await sendGamerForumAlertsIfNeeded(config, new Date(), options);
    expect(sent).toEqual([]);
    await writeFile(stateFile, JSON.stringify({ lastPostId: "15232" }));
    await expect(
      sendGamerForumAlertsIfNeeded(config, new Date(), options),
    ).rejects.toThrow("Every service destination failed");
    expect(
      JSON.parse(await readFile(stateFile, "utf8")).pendingPosts,
    ).toHaveLength(2);
    failing = false;
    await sendGamerForumAlertsIfNeeded(config, new Date(), {
      ...options,
      fetchPosts: async () => [],
    });
    expect(sent).toHaveLength(2);
    expect(sent[0]).toContain("Y4C7W9Z3T");
    expect(sent[1]).toContain("newer post");
    expect(
      JSON.parse(await readFile(stateFile, "utf8")).pendingPosts,
    ).toBeUndefined();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("Gamer forum schedule", () => {
  test("keeps healthy channels current and recovers failed channels in post order", async () => {
    const directory = await mkdtemp(join(tmpdir(), "minisago-forum-"));
    const stateFile = join(directory, "state.json");
    const config = {
      botToken: "test",
      watchUrl,
      readerBaseUrl: "https://reader.example.test/",
      stateFile,
      checkTimes: [510],
      timezone: "Asia/Taipei",
    };
    const post = parseGamerForumPosts(sampleHtml, watchUrl)[0]!;
    const posts = [post, { ...post, id: "15234", text: "newer post" }];
    const sent: string[] = [];
    let failing = true;
    const options = {
      destinations: [
        { guildId: "guild", channelId: "one" },
        { guildId: "guild", channelId: "two" },
      ],
      fetchPosts: async () => posts,
      discordRequest: (async (path, request) => {
        if (request?.method !== "POST") return { guild_id: "guild" };
        const channelId = path.split("/")[2]!;
        if (failing && channelId === "two") throw new Error("offline");
        const newer = (request.body as { content: string }).content.includes(
          "newer post",
        );
        sent.push(`${channelId}:${newer ? "15234" : "15233"}`);
        return { id: "message" };
      }) as DiscordRequest,
    };
    try {
      await writeFile(stateFile, JSON.stringify({ lastPostId: "15232" }));
      await sendGamerForumAlertsIfNeeded(config, new Date(), options);
      expect(sent).toEqual(["one:15233", "one:15234"]);
      failing = false;
      await sendGamerForumAlertsIfNeeded(config, new Date(), options);
      expect(sent).toEqual([
        "one:15233",
        "one:15234",
        "two:15233",
        "two:15234",
      ]);
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  const checkTimes = parseForumCheckTimes("08:30,20:30");

  test("parses two unique daily wall-clock times", () => {
    expect(checkTimes).toEqual([510, 1230]);
    expect(() => parseForumCheckTimes("08:30,08:30")).toThrow();
  });
});

describe("parseGamerForumPosts", () => {
  test("extracts post identity, text, author, date, and first image", () => {
    expect(parseGamerForumPosts(sampleHtml, watchUrl)).toEqual([
      {
        id: "15233",
        floor: 116,
        author: "Guistar (nerv911120)",
        postedAt: "2026-07-05 20:11:06",
        text: "比賽 禮品碼: Y4C7W9Z3T\n不可奉納的紫色隨機禮物 喵趣券 寶玉各 X1",
        imageUrl:
          "https://truth.bahamut.com.tw/s01/202607/forum/36476/code.WEBP",
        url: "https://forum.gamer.com.tw/Co.php?bsn=36476&sn=15233",
      },
    ]);
  });

  test("extracts the same fields from the reader's Markdown response", () => {
    expect(parseGamerForumMarkdownPosts(sampleMarkdown, watchUrl)).toEqual([
      {
        id: "15233",
        floor: 116,
        author: "Guistar (nerv911120)",
        postedAt: "2026-07-05 20:11:06",
        text: "比賽 禮品碼: Y4C7W9Z3T\n不可奉納的紫色隨機禮物 喵趣券 寶玉各 X1",
        imageUrl:
          "https://truth.bahamut.com.tw/s01/202607/forum/36476/code.WEBP",
        url: "https://forum.gamer.com.tw/Co.php?bsn=36476&sn=15233",
      },
    ]);
  });
});

describe("Gamer forum Discord message", () => {
  test("keeps text in content and image in an embed", () => {
    const post = parseGamerForumPosts(sampleHtml, watchUrl)[0];
    const payload = buildGamerForumPostMessagePayload(post);

    expect(formatGamerForumPostMessage(post)).toContain("Y4C7W9Z3T");
    expect(payload.content).toContain("New Gamer forum post (#116");
    expect(payload.embeds).toEqual([
      {
        title: "Gamer forum post #116",
        url: "https://forum.gamer.com.tw/Co.php?bsn=36476&sn=15233",
        image: {
          url: "https://truth.bahamut.com.tw/s01/202607/forum/36476/code.WEBP",
        },
      },
    ]);
    expect(payload.allowed_mentions.parse).toEqual([]);
  });
});
