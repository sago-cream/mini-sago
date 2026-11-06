import { describe, expect, test } from "bun:test";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  buildXPostMessage,
  getXPostMonitorConfigs,
  isXPostAuthoredBy,
  parseXPosts,
  shouldCheckpointXPostState,
  runXPostRepostTick,
} from "./x-post-monitor";

const sampleFeed = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0"><channel>
  <item>
    <title>Shortened post…</title>
    <link>https://x.com/thsottiaux/status/2078320950488297917</link>
    <guid>https://x.com/thsottiaux/status/2078320950488297917</guid>
    <pubDate>Sat, 18 Jul 2026 03:28:22 GMT</pubDate>
    <enclosure url="https://pbs.twimg.com/media/example.jpg?name=orig&amp;format=jpg" type="image/jpeg" />
    <description><![CDATA[<p>Full post &amp; details.<br />Second line.</p>
      <blockquote><a href="https://x.com/example/status/1">Quoted post</a></blockquote>]]></description>
  </item>
</channel></rss>`;

test.each(["unchanged", "empty", "unavailable", "removed subscription"])(
  "retries failed instant X destinations with an %s source without repeating successful sends",
  async (source) => {
    const directory = await mkdtemp(join(tmpdir(), "minisago-x-repost-"));
    const stateFile = join(directory, "state.json");
    const config = getXPostMonitorConfigs({
      DISCORD_BOT_TOKEN: "test",
      X_POST_DELIVERY_MODE: "instant",
    })[0]!;
    config.stateFile = stateFile;
    const destinations = [
      { guildId: "guild", channelId: "one" },
      { guildId: "guild", channelId: "two" },
    ];
    const posts = parseXPosts(sampleFeed);
    const sent: string[] = [];
    let failing = true;
    const deps = {
      fetchPosts: async () => posts,
      send: async ({ channelId }: { channelId: string }) => {
        if (channelId === "two" && failing) throw new Error("offline");
        sent.push(channelId);
      },
    };
    try {
      await writeFile(stateFile, JSON.stringify({ lastPostId: "1" }));
      await runXPostRepostTick(config, destinations, new Date(), deps);
      expect(sent).toEqual(["one"]);
      failing = false;
      await runXPostRepostTick(
        config,
        source === "removed subscription"
          ? destinations.slice(0, 1)
          : destinations,
        new Date(),
        {
          ...deps,
          fetchPosts: async () => {
            if (source === "unavailable") throw new Error("feed offline");
            return source === "empty" ? [] : posts;
          },
        },
      );
      expect(sent).toEqual(
        source === "removed subscription" ? ["one"] : ["one", "two"],
      );
      expect(JSON.parse(await readFile(stateFile, "utf8")).lastPostId).toBe(
        posts[0]!.id,
      );
      expect(
        JSON.parse(await readFile(stateFile, "utf8")).pendingReposts,
      ).toBeUndefined();
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  },
);

test("saves all collected X reposts before sending and preserves author filtering", async () => {
  const directory = await mkdtemp(join(tmpdir(), "minisago-x-repost-"));
  const stateFile = join(directory, "state.json");
  const config = getXPostMonitorConfigs({
    DISCORD_BOT_TOKEN: "test",
    X_POST_DELIVERY_MODE: "instant",
  })[0]!;
  config.stateFile = stateFile;
  config.onlyAuthoredPosts = true;
  const first = parseXPosts(sampleFeed)[0]!;
  const second = { ...first, id: "2078320950488297918" };
  const retweet = {
    ...first,
    id: "2078320950488297919",
    url: "https://x.com/someone_else/status/2078320950488297919",
  };
  const destinations = [{ guildId: "guild", channelId: "one" }];
  const sent: string[] = [];
  let failing = true;
  const deps = {
    fetchPosts: async () => [retweet, second, first],
    send: async (_destination: unknown, post: { id: string }) => {
      if (failing) throw new Error("offline");
      sent.push(post.id);
    },
  };
  try {
    await runXPostRepostTick(config, destinations, new Date(), deps);
    expect(sent).toEqual([]);
    await writeFile(stateFile, JSON.stringify({ lastPostId: "1" }));
    await expect(
      runXPostRepostTick(config, destinations, new Date(), deps),
    ).rejects.toThrow("Every service destination failed");
    const state = JSON.parse(await readFile(stateFile, "utf8"));
    expect(state.pendingReposts).toHaveLength(2);
    expect(state.lastPostId).toBe(retweet.id);
    failing = false;
    await runXPostRepostTick(config, destinations, new Date(), {
      ...deps,
      fetchPosts: async () => [],
    });
    expect(sent).toEqual([first.id, second.id]);
    expect(
      JSON.parse(await readFile(stateFile, "utf8")).pendingReposts,
    ).toBeUndefined();
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

describe("X post monitor", () => {
  test("parses post identity, full text, date, and image from FxTwitter RSS", () => {
    expect(parseXPosts(sampleFeed)).toEqual([
      {
        id: "2078320950488297917",
        text: "Full post & details.\nSecond line.",
        url: "https://x.com/thsottiaux/status/2078320950488297917",
        publishedAt: "Sat, 18 Jul 2026 03:28:22 GMT",
        imageUrl:
          "https://pbs.twimg.com/media/example.jpg?name=orig&format=jpg",
      },
    ]);
  });

  test("builds a Discord-friendly FxTwitter link without mentions", () => {
    const [post] = parseXPosts(sampleFeed);

    expect(buildXPostMessage(post)).toEqual({
      content: "https://fxtwitter.com/thsottiaux/status/2078320950488297917",
      allowed_mentions: { parse: [] },
    });
  });

  test("keeps a post with out-of-range numeric entities readable", () => {
    const feed = sampleFeed.replace(
      "Full post &amp; details.",
      "Full post &#x110000; &#999999999999; details.",
    );
    expect(parseXPosts(feed)[0].text).toBe(
      "Full post &#x110000; &#999999999999; details.\nSecond line.",
    );
  });

  test("identifies posts authored by the monitored account", () => {
    expect(
      isXPostAuthoredBy(
        {
          id: "1",
          text: "Official post",
          url: "https://x.com/hololive_dreams/status/1",
        },
        "hololive_dreams",
      ),
    ).toBe(true);
    expect(
      isXPostAuthoredBy(
        {
          id: "2",
          text: "Retweeted member post",
          url: "https://x.com/oozorasubaru/status/2",
        },
        "hololive_dreams",
      ),
    ).toBe(false);
  });

  test("includes additional Discord pipes with isolated state", () => {
    const configs = getXPostMonitorConfigs({
      DISCORD_BOT_TOKEN: "test-token",
      DISCORD_GUILD_ID: "guild-1",
      X_POST_STATE_FILE: "/app/state/x-post-state.json",
    });

    expect(
      configs.map(
        ({ service, handle, feedUrl, stateFile, onlyAuthoredPosts }) => ({
          service,
          handle,
          feedUrl,
          stateFile,
          onlyAuthoredPosts,
        }),
      ),
    ).toEqual([
      {
        service: "x_posts_primary",
        handle: "thsottiaux",
        feedUrl: "https://fxtwitter.com/thsottiaux/feed.xml?count=20",
        stateFile: "/app/state/x-post-state.json",
        onlyAuthoredPosts: false,
      },
      {
        service: "x_posts_thsottiaux",
        handle: "thsottiaux",
        feedUrl: "https://fxtwitter.com/thsottiaux/feed.xml?count=20",
        stateFile: "/app/state/x-post-thsottiaux-additional-state.json",
        onlyAuthoredPosts: false,
      },
      {
        service: "x_posts_hololive_dreams",
        handle: "hololive_dreams",
        feedUrl: "https://fxtwitter.com/hololive_dreams/feed.xml?count=20",
        stateFile: "/app/state/x-post-hololive-dreams-state.json",
        onlyAuthoredPosts: true,
      },
    ]);
  });

  test("checkpoints idle state no more than once per hour", () => {
    const now = new Date("2026-07-18T06:00:00.000Z");

    expect(shouldCheckpointXPostState(undefined, now)).toBe(true);
    expect(shouldCheckpointXPostState("2026-07-18T05:30:00.000Z", now)).toBe(
      false,
    );
    expect(shouldCheckpointXPostState("2026-07-18T05:00:00.000Z", now)).toBe(
      true,
    );
  });
});
