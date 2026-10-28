import { describe, expect, spyOn, test } from "bun:test";

import { macAgentBridge } from "../../chatbot/bridge";
import { parseChatbotJob } from "../../../contracts/worker-contract";

import {
  buildXPostDigest,
  getXPostDigestSchedule,
  queueXPost,
  summarizeXPosts,
  xPostDigestDueDate,
} from "./x-post-digest";
import {
  getXPostMonitorConfigs,
  runXPostDigestTick,
  type XPost,
  type XPostState,
} from "./x-post-monitor";

const schedule = { time: "21:00", timezone: "Asia/Taipei" };
const before = new Date("2026-10-27T12:59:00Z");
const after = new Date("2026-10-27T13:00:00Z");
const destinations = [
  { guildId: "guild", channelId: "one" },
  { guildId: "guild", channelId: "two" },
];
const post = (
  id: string,
  text = "A new feature",
  publishedAt = "2026-10-27T12:00:00Z",
): XPost => ({
  id,
  text,
  publishedAt,
  url: `https://x.com/thsottiaux/status/${id}`,
});
const summaries = (posts: XPost[]) =>
  JSON.stringify({
    summaries: posts.map(({ id }) => ({
      id,
      summary: "推出新功能，將逐步開放使用。",
    })),
  });

function fixture(initial: XPostState = { lastPostId: "1" }) {
  const config = getXPostMonitorConfigs({ DISCORD_BOT_TOKEN: "test" })[0]!;
  let state = structuredClone(initial);
  let feed = [post("2"), post("1")];
  const sent: Array<{ channelId: string; content: string }> = [];
  let summaryCalls = 0;
  const deps = {
    readState: async () => structuredClone(state),
    saveState: async (next: XPostState) => {
      state = structuredClone(next);
    },
    fetchPosts: async () => structuredClone(feed),
    summarize: async (posts: XPost[]) => {
      summaryCalls++;
      return summaries(posts);
    },
    send: async (destination: { channelId: string }, content: string) => {
      sent.push({ channelId: destination.channelId, content });
    },
  };
  return {
    config,
    deps,
    sent,
    get state() {
      return state;
    },
    get summaryCalls() {
      return summaryCalls;
    },
    setFeed: (next: XPost[]) => {
      feed = next;
    },
    tick: (now = after) => runXPostDigestTick(config, destinations, now, deps),
  };
}

describe("X daily Chinese digest", () => {
  test("dispatches bounded input to an authenticated chat worker without an MCP token", async () => {
    const previousOwner = process.env.MINISAGO_CHATBOT_OWNER_USER_ID;
    process.env.MINISAGO_CHATBOT_OWNER_USER_ID = "test-owner";
    const dispatch = spyOn(macAgentBridge, "dispatch").mockReturnValue({
      status: "accepted",
      result: Promise.resolve({ ok: true, content: summaries([post("2")]) }),
      cancel: () => false,
    });
    try {
      await summarizeXPosts([post("2", "x".repeat(5_000))], destinations[0]!);
      const [job, capabilities] = dispatch.mock.calls[0]!;
      expect(parseChatbotJob(job)?.purpose).toBe("x_post_digest");
      expect(job.requesterUserId).toBe("test-owner");
      expect(capabilities).toEqual(["chat"]);
      expect(job.mcpAccessToken).toBeUndefined();
      expect(JSON.parse(job.request)[0].text).toHaveLength(4_000);
      dispatch.mockReturnValue({ status: "busy" });
      await expect(
        summarizeXPosts([post("2")], destinations[0]!),
      ).rejects.toThrow("busy");
      dispatch.mockReturnValue({
        status: "accepted",
        result: Promise.resolve({
          ok: false,
          error: "unavailable",
          failureKind: "unavailable",
        }),
        cancel: () => false,
      });
      await expect(
        summarizeXPosts([post("2")], destinations[0]!),
      ).rejects.toThrow("unavailable");
    } finally {
      dispatch.mockRestore();
      if (previousOwner === undefined)
        delete process.env.MINISAGO_CHATBOT_OWNER_USER_ID;
      else process.env.MINISAGO_CHATBOT_OWNER_USER_ID = previousOwner;
    }
  });

  test("validates destination guilds and disables mentions and embeds in real Discord payloads", async () => {
    const f = fixture();
    const { send: _send, ...deps } = f.deps;
    const bodies: Array<Record<string, unknown>> = [];
    let wrongGuild = false;
    const fetchMock = spyOn(globalThis, "fetch").mockImplementation(
      Object.assign(
        async (_url: RequestInfo | URL, init?: RequestInit) => {
          if (init?.method === "POST") {
            bodies.push(JSON.parse(String(init.body)));
            return Response.json({ id: "sent" });
          }
          return Response.json({
            guild_id: wrongGuild ? "another-guild" : "guild",
          });
        },
        { preconnect() {} },
      ),
    );
    try {
      await runXPostDigestTick(f.config, destinations, after, deps);
      expect(bodies).toHaveLength(2);
      expect(bodies[0]?.allowed_mentions).toEqual({ parse: [] });
      expect(bodies[0]?.flags).toBe(4);
      wrongGuild = true;
      const other = fixture();
      const { send: _otherSend, ...otherDeps } = other.deps;
      await expect(
        runXPostDigestTick(other.config, destinations, after, otherDeps),
      ).rejects.toThrow("saved for retry");
      expect(bodies).toHaveLength(2);
      expect(other.state.digest).toBeDefined();
    } finally {
      fetchMock.mockRestore();
    }
  });
  test("defaults to 21:00 Taipei, validates configuration, and supports per-service instant delivery", () => {
    expect(getXPostDigestSchedule({})).toEqual(schedule);
    expect(() =>
      getXPostDigestSchedule({ X_POST_DIGEST_TIME: "25:00" }),
    ).toThrow();
    expect(() =>
      getXPostDigestSchedule({ X_POST_DIGEST_TIMEZONE: "invalid" }),
    ).toThrow();
    expect(
      getXPostMonitorConfigs({
        DISCORD_BOT_TOKEN: "test",
        X_POST_DELIVERY_MODE: "instant",
      }).every((config) => !config.digestSchedule),
    ).toBe(true);
    expect(
      getXPostMonitorConfigs({
        DISCORD_BOT_TOKEN: "test",
        X_POST_DIGEST_SERVICES: "x_posts_primary",
      }).map((config) => Boolean(config.digestSchedule)),
    ).toEqual([true, false, false]);
    expect(() =>
      getXPostMonitorConfigs({
        DISCORD_BOT_TOKEN: "test",
        X_POST_DELIVERY_MODE: "typo",
      }),
    ).toThrow();
    expect(() =>
      getXPostMonitorConfigs({
        DISCORD_BOT_TOKEN: "test",
        X_POST_DIGEST_SERVICES: "unknown",
      }),
    ).toThrow();
  });

  test("assigns posts to local 21:00 cutoffs across days, years and DST", () => {
    expect(xPostDigestDueDate(before, schedule)).toBe("2026-10-26");
    expect(xPostDigestDueDate(after, schedule)).toBe("2026-10-27");
    expect(queueXPost(post("2"), after, schedule).dateKey).toBe("2026-10-27");
    expect(
      queueXPost(post("2", "late", "2026-10-27T13:00:00Z"), after, schedule)
        .dateKey,
    ).toBe("2026-10-28");
    expect(xPostDigestDueDate(new Date("2027-01-01T00:00:00Z"), schedule)).toBe(
      "2026-12-31",
    );
    expect(
      xPostDigestDueDate(new Date("2026-11-01T07:00:00Z"), {
        time: "21:00",
        timezone: "America/New_York",
      }),
    ).toBe("2026-10-31");
    expect(
      queueXPost(post("2", "unknown", "invalid"), before, schedule).dateKey,
    ).toBe("2026-10-27");
  });

  test("seeds the cursor without sending old feed posts", async () => {
    const f = fixture({});
    await f.tick();
    expect(f.state.lastPostId).toBe("2");
    expect(f.state.pendingPosts).toEqual([]);
    expect(f.summaryCalls).toBe(0);
    expect(f.sent).toEqual([]);
  });

  test("persists collection, deduplicates polls, and sends at 21:00 exactly once", async () => {
    const f = fixture();
    await f.tick(before);
    expect(f.state.lastPostId).toBe("2");
    expect(f.state.pendingPosts?.map(({ post }) => post.id)).toEqual(["2"]);
    expect(f.sent).toEqual([]);
    await f.tick(before);
    expect(f.state.pendingPosts).toHaveLength(1);
    await f.tick();
    expect(f.summaryCalls).toBe(1);
    expect(f.sent).toHaveLength(2);
    expect(f.sent[0]?.content).toContain("每日推文中文摘要｜2026-10-27");
    expect(f.sent[0]?.content).toContain("推出新功能");
    expect(f.sent[0]?.content).toContain(
      "https://fxtwitter.com/thsottiaux/status/2",
    );
    expect(f.state.pendingPosts).toEqual([]);
    await f.tick();
    expect(f.sent).toHaveLength(2);
  });

  test("keeps collected posts when generation is unavailable and retries later", async () => {
    const f = fixture();
    const summarize = f.deps.summarize;
    f.deps.summarize = async () => {
      throw new Error("offline");
    };
    await expect(f.tick()).rejects.toThrow("offline");
    expect(f.state.pendingPosts).toHaveLength(1);
    expect(f.state.lastPostId).toBe("2");
    f.deps.summarize = summarize;
    await f.tick();
    expect(f.sent).toHaveLength(2);
  });

  test("resumes saved message progress per destination without regenerating or resending confirmed parts", async () => {
    const f = fixture({
      lastPostId: "1",
      pendingPosts: Array.from({ length: 10 }, (_, i) =>
        queueXPost(post(String(i + 2)), after, schedule),
      ),
    });
    f.deps.summarize = async (posts) =>
      JSON.stringify({
        summaries: posts.map(({ id }) => ({ id, summary: "中".repeat(500) })),
      });
    let attempts = 0;
    const send = f.deps.send;
    f.deps.send = async (destination, content) => {
      if (destination.channelId === "two" && ++attempts === 2)
        throw new Error("Discord unavailable");
      await send(destination, content);
    };
    await expect(f.tick()).rejects.toThrow("saved for retry");
    const firstDestinationCount = f.sent.filter(
      ({ channelId }) => channelId === "one",
    ).length;
    expect(firstDestinationCount).toBeGreaterThan(1);
    expect(f.state.digest?.delivered.two).toBe(1);
    // Recreate the monitor from persisted data, as on a process restart.
    const restarted = fixture(f.state);
    restarted.deps.summarize = async () => {
      throw new Error("must use cached summary");
    };
    await restarted.tick();
    expect(restarted.sent.every(({ channelId }) => channelId === "two")).toBe(
      true,
    );
    expect(restarted.sent).toHaveLength(firstDestinationCount - 1);
    expect(restarted.state.pendingPosts).toEqual([]);
    expect(restarted.state.digest).toBeUndefined();
  });

  test("delivers saved posts during a feed outage, and queues after-cutoff posts for tomorrow", async () => {
    const f = fixture();
    await f.tick(before);
    f.deps.fetchPosts = async () => {
      throw new Error("feed unavailable");
    };
    await f.tick();
    expect(f.sent).toHaveLength(2);
    const late = fixture();
    late.setFeed([post("3", "new", "2026-10-27T13:01:00Z")]);
    await late.tick(new Date("2026-10-27T13:02:00Z"));
    expect(late.sent).toEqual([]);
    expect(late.state.pendingPosts?.[0]?.dateKey).toBe("2026-10-28");
    await late.tick(new Date("2026-10-28T13:00:00Z"));
    expect(late.sent).toHaveLength(2);
  });

  test("filters retweets for official-only pipes and drains backlogs in bounded batches", async () => {
    const f = fixture();
    f.config.onlyAuthoredPosts = true;
    f.setFeed([
      post("2"),
      { ...post("3"), url: "https://x.com/other/status/3" },
    ]);
    await f.tick(before);
    expect(f.state.lastPostId).toBe("3");
    expect(f.state.pendingPosts?.map(({ post }) => post.id)).toEqual(["2"]);
    const backlog = fixture({
      lastPostId: "20",
      pendingPosts: Array.from({ length: 12 }, (_, i) =>
        queueXPost(post(String(i + 2)), after, schedule),
      ),
    });
    await backlog.tick();
    expect(backlog.state.pendingPosts).toHaveLength(2);
    await backlog.tick();
    expect(backlog.state.pendingPosts).toEqual([]);
    expect(backlog.summaryCalls).toBe(2);
  });

  test("rejects incomplete or invalid worker output and keeps real authors and message limits", () => {
    expect(() =>
      buildXPostDigest([post("2")], "2026-10-27", "thsottiaux", "{}"),
    ).toThrow();
    expect(() =>
      buildXPostDigest(
        [post("2")],
        "2026-10-27",
        "thsottiaux",
        summaries([post("3")]),
      ),
    ).toThrow();
    expect(() =>
      buildXPostDigest(
        [post("2")],
        "2026-10-27",
        "thsottiaux",
        JSON.stringify({ summaries: [{ id: "2", summary: "English only" }] }),
      ),
    ).toThrow();
    const retweet = { ...post("2"), url: "https://x.com/other/status/2" };
    const digest = buildXPostDigest(
      [retweet],
      "2026-10-27",
      "thsottiaux",
      JSON.stringify({
        summaries: [
          {
            id: "2",
            summary: "中文 @everyone <@123> https://untrusted.example/",
          },
        ],
      }),
    );
    expect(digest.messages[0]).toContain(
      "https://fxtwitter.com/other/status/2",
    );
    expect(digest.messages[0]).not.toContain("@everyone");
    expect(digest.messages[0]).not.toContain("untrusted.example");
    const posts = Array.from({ length: 10 }, (_, i) => post(String(i + 2)));
    const long = buildXPostDigest(
      posts,
      "2026-10-27",
      "thsottiaux",
      JSON.stringify({
        summaries: posts.map(({ id }) => ({ id, summary: "中".repeat(500) })),
      }),
    );
    expect(long.messages.every((message) => message.length <= 1_900)).toBe(
      true,
    );
  });
});
