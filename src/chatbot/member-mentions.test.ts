import { expect, test } from "bun:test";
import type { DiscordRequest } from "./chatbot-context";
import { createMemberMentionHandler } from "./member-mentions";

const memberId = (index: number) => String(100000000000000000n + BigInt(index));

function setup({ failPost = false } = {}) {
  const posts: Array<{ path: string; body: any }> = [];
  const paths: string[] = [];
  const discordRequest: DiscordRequest = async (path, options) => {
    paths.push(path);
    if (options?.method === "POST") {
      posts.push({ path, body: options.body });
      if (failPost) throw new Error("Response lost");
      return { id: "posted-message" } as never;
    }
    const query = new URL(`https://discord.test${path}`).searchParams.get(
      "query",
    );
    if (path.endsWith(memberId(99))) throw new Error("404 Unknown Member");
    if (query === "unavailable") throw new Error("503 Discord unavailable");
    if (query === "missing") return [] as never;
    if (query === "ambiguous") {
      return [
        { nick: query, user: { id: memberId(50), username: "first" } },
        { nick: query, user: { id: memberId(51), username: "second" } },
      ] as never;
    }
    if (!query)
      return {
        nick: "0",
        user: { id: memberId(0), username: "user-0" },
      } as never;
    return [
      {
        nick: query,
        user: { id: memberId(Number(query)), username: `user-${query}` },
      },
    ] as never;
  };
  return {
    posts,
    paths,
    mention: createMemberMentionHandler({
      guildId: "current-guild",
      channelId: "current-channel",
      requestMessageId: "request-message",
      discordRequest,
    }),
  };
}

test("notifies a 20-member list in the host-bound channel with an explicit allowlist", async () => {
  const { mention, posts } = setup();
  const queries = Array.from({ length: 20 }, (_, index) => String(index));
  const ids = queries.map((_, index) => memberId(index));
  const result = await mention({
    queries,
    content: `Attendance reminder @everyone <@&123456789012345678> <@${memberId(99)}>`,
  });
  expect(result).toEqual({
    status: "complete",
    messageId: "posted-message",
    memberIds: ids,
    unresolvedQueries: [],
  });
  expect(posts).toHaveLength(1);
  expect(posts[0]).toMatchObject({
    path: "/channels/current-channel/messages",
    body: {
      message_reference: {
        message_id: "request-message",
        fail_if_not_exists: false,
      },
      allowed_mentions: { parse: [], users: ids, replied_user: false },
    },
  });
  expect(posts[0]!.body.content.length).toBeLessThanOrEqual(2000);
  for (const id of ids) expect(posts[0]!.body.content).toContain(`<@${id}>`);
});

test("notifies resolved members and reports missing or ambiguous names", async () => {
  const { mention, posts } = setup();
  const result = await mention({ queries: ["0", "missing", "ambiguous"] });
  expect(result).toMatchObject({
    status: "complete",
    memberIds: [memberId(0)],
    unresolvedQueries: ["missing", "ambiguous"],
  });
  expect(posts[0]!.body.allowed_mentions.users).toEqual([memberId(0)]);
});

test("posts nothing when no names resolve and accepts a clarified retry", async () => {
  const { mention, posts } = setup();
  expect(await mention({ queries: ["missing", "ambiguous"] })).toEqual({
    status: "needs_clarification",
    unresolvedQueries: ["missing", "ambiguous"],
  });
  expect(posts).toHaveLength(0);
  expect(await mention({ queries: ["0"] })).toMatchObject({
    status: "complete",
  });
  expect(posts).toHaveLength(1);
});

test("deduplicates aliases and repeated or concurrent deliveries", async () => {
  const { mention, posts, paths } = setup();
  const input = { queries: ["0", "0", `<@${memberId(0)}>`, memberId(0)] };
  const results = await Promise.all([mention(input), mention(input)]);
  expect(results[0]).toEqual(results[1]);
  expect(results[0]).toMatchObject({ memberIds: [memberId(0)] });
  expect(posts).toHaveLength(1);
  expect(paths).toContain(`/guilds/current-guild/members/${memberId(0)}`);
  await mention(input);
  expect(posts).toHaveLength(1);
});

test("does not retry a notification after an uncertain network failure", async () => {
  const { mention, posts } = setup({ failPost: true });
  await expect(mention({ queries: ["0"] })).rejects.toThrow("Response lost");
  await expect(mention({ queries: ["0"] })).rejects.toThrow("Response lost");
  expect(posts).toHaveLength(1);
});

test("rejects oversized input before Discord requests", async () => {
  const { mention, paths } = setup();
  await expect(
    mention({
      queries: Array.from({ length: 21 }, (_, index) => String(index)),
    }),
  ).rejects.toThrow("1–20");
  await expect(
    mention({ queries: ["0"], content: "x".repeat(1401) }),
  ).rejects.toThrow("1400");
  expect(paths).toEqual([]);
});

test("does not notify a user ID from outside the current guild", async () => {
  const { mention, posts } = setup();
  expect(await mention({ queries: [memberId(99)] })).toEqual({
    status: "needs_clarification",
    unresolvedQueries: [memberId(99)],
  });
  expect(posts).toEqual([]);
});

test("posts nothing when member lookup fails", async () => {
  const { mention, posts } = setup();
  await expect(mention({ queries: ["0", "unavailable"] })).rejects.toThrow(
    "503",
  );
  expect(posts).toEqual([]);
});
