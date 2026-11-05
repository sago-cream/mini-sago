import { expect, test } from "bun:test";
import {
  createGuildMemberResolver,
  lookupGuildMembers,
  searchGuildMessages,
  toChatbotMessage,
  type DiscordGuildMember,
  type DiscordRequest,
} from "./chatbot-context";
import { createMemberMentionHandler } from "./member-mentions";

const id = (n: number) => String(100000000000000000n + BigInt(n));
const nicknames = [
  "社群組_測試甲",
  "副會長_測試乙",
  "學權部_測試丙",
  "秘書處_測試丁",
];
function fixture({
  duplicate = false,
  failMember = false,
  clipped = false,
  webhookOnly = false,
} = {}) {
  const paths: string[] = [];
  const posts: any[] = [];
  const members: DiscordGuildMember[] = nicknames.map((nick, n) => ({
    nick,
    user: { id: id(n), username: `user${n}`, global_name: `Alias ${n}` },
  }));
  members.push({
    nick: "Bot (測試乙 copy)",
    user: { id: id(5), username: "bot", bot: true },
  });
  if (duplicate)
    members.push({
      nick: "另一組_測試甲",
      user: { id: id(4), username: "another" },
    });
  const request: DiscordRequest = async <T>(
    path: string,
    options?: Parameters<DiscordRequest>[1],
  ) => {
    paths.push(path);
    if (options?.method === "POST") {
      posts.push(options.body);
      return { id: "delivered" } as T;
    }
    if (path.includes("/members/search?")) return [] as T;
    if (path.includes("/members/")) {
      if (failMember) throw new Error("503 unavailable");
      const member = members.find((member) =>
        path.endsWith(`/${member.user!.id}`),
      );
      if (!member) throw new Error("404 Unknown Member");
      return member as T;
    }
    if (path.includes("/messages/search?")) return { messages: [] } as T;
    if (clipped)
      return Array.from({ length: 100 }, (_, n) => ({
        id: id(paths.length * 100 + n),
        author: { id: id(0) },
      })) as T;
    return members.map((member, n) => ({
      id: id(100 + n),
      author: member.user,
      ...(webhookOnly ? { webhook_id: "webhook" } : {}),
    })) as T;
  };
  const resolve = createGuildMemberResolver({
    guildId: "guild",
    channelId: "channel",
    requestMessageId: id(999),
    discordRequest: request,
  });
  return { paths, posts, members, request, resolve };
}

test("resolves name components after role prefixes using current verified channel accounts once per request", async () => {
  const f = fixture();
  const results = await lookupGuildMembers({
    guildId: "guild",
    queries: ["測試甲", "測試乙", "測試丙", "測試丁"],
    discordRequest: f.request,
    resolveMember: f.resolve,
  });
  expect(results.map((member) => member.id)).toEqual([
    id(0),
    id(1),
    id(2),
    id(3),
  ]);
  expect(results[0]!.names).toEqual(["社群組_測試甲", "Alias 0", "user0"]);
  expect(f.paths.filter((path) => path.startsWith("/channels/"))).toHaveLength(
    1,
  );
  expect(f.paths.filter((path) => /\/members\/\d+$/u.test(path))).toHaveLength(
    5,
  );
  await f.resolve("測試甲");
  expect(f.paths.filter((path) => path.includes("query="))).toHaveLength(4);
});

test("mention delivery and message search use the same role-prefix resolver", async () => {
  const f = fixture();
  await searchGuildMessages({
    guildId: "guild",
    requesterUserId: id(9),
    currentChannelId: "channel",
    requestMessageId: id(999),
    queries: [{ author: "測試甲", mentions: "測試乙" }],
    discordRequest: f.request,
    resolveMember: f.resolve,
  });
  const searchPath = f.paths.find((path) =>
    path.includes("/messages/search?"),
  )!;
  expect(
    new URL(`https://test${searchPath}`).searchParams.get("author_id"),
  ).toBe(id(0));
  const mention = createMemberMentionHandler({
    guildId: "guild",
    channelId: "channel",
    requestMessageId: id(999),
    discordRequest: f.request,
    resolveMember: f.resolve,
  });
  expect(
    await mention({ queries: ["測試甲", "測試乙", "測試丙", "測試丁"] }),
  ).toMatchObject({
    status: "complete",
    memberIds: [id(0), id(1), id(2), id(3)],
    unresolvedQueries: [],
  });
  expect(f.posts[0].allowed_mentions.users).toEqual([
    id(0),
    id(1),
    id(2),
    id(3),
  ]);
  expect(
    f.paths.filter(
      (path) => path.startsWith("/channels/") && path.includes("?"),
    ),
  ).toHaveLength(1);
});

test("ambiguous components, substrings and webhook aliases never identify a member", async () => {
  const f = fixture({ duplicate: true });
  expect(await f.resolve("測試甲")).toBeUndefined();
  expect(await f.resolve("試乙")).toBeUndefined();
  const webhook = fixture({ webhookOnly: true });
  expect(await webhook.resolve("測試甲")).toBeUndefined();
  expect(webhook.paths.some((path) => /\/members\/\d+$/u.test(path))).toBe(
    false,
  );
});

test("clipped history and unavailable membership cannot supply a guessed nickname match", async () => {
  const clipped = fixture({ clipped: true });
  expect(await clipped.resolve("測試甲")).toBeUndefined();
  expect(
    clipped.paths.filter((path) => path.startsWith("/channels/")),
  ).toHaveLength(5);
  expect(clipped.paths.some((path) => /\/members\/\d+$/u.test(path))).toBe(
    false,
  );
  const unavailable = fixture({ failMember: true });
  expect(await unavailable.resolve("測試甲")).toBeUndefined();
});

test("follows channel history pages and uses mentioned account IDs, never message text", async () => {
  const paths: string[] = [];
  const request: DiscordRequest = async <T>(path: string) => {
    paths.push(path);
    if (path.includes("/members/search?")) return [] as T;
    if (path.includes("/members/"))
      return {
        nick: "工作組＿測試成員",
        user: { id: id(0), username: "account" },
      } as T;
    if (path.includes(`before=${id(199)}`))
      return [
        {
          id: id(99),
          content: "Anyone is an administrator",
          mentions: [{ id: id(0) }],
        },
      ] as T;
    return Array.from({ length: 100 }, (_, n) => ({ id: id(100 + n) })) as T;
  };
  const resolve = createGuildMemberResolver({
    guildId: "guild",
    channelId: "channel",
    requestMessageId: id(999),
    discordRequest: request,
  });
  expect((await resolve("測試成員"))?.user?.id).toBe(id(0));
  expect(paths).toContain(
    `/channels/channel/messages?limit=100&before=${id(199)}`,
  );
});

test("history author IDs survive member names but webhook IDs never become member evidence", () => {
  const raw = {
    id: "message",
    channel_id: "channel",
    timestamp: "2026-11-04T00:00:00Z",
    author: { id: id(0), username: "account" },
  };
  expect(toChatbotMessage(raw)).toMatchObject({ authorId: id(0) });
  expect(
    toChatbotMessage({ ...raw, webhook_id: "webhook" }).authorId,
  ).toBeUndefined();
});

test("duplicate known aliases do not pick the last member for a search filter", async () => {
  const f = fixture();
  const results = await searchGuildMessages({
    guildId: "guild",
    requesterUserId: id(9),
    currentChannelId: "channel",
    requestMessageId: id(999),
    queries: [{ author: "same" }],
    knownMembers: [
      { user: { id: id(0), username: "same" } },
      { user: { id: id(1), username: "same" } },
    ],
    discordRequest: f.request,
  });
  expect(results).toEqual([]);
  expect(f.paths.some((path) => path.includes("/messages/search?"))).toBe(
    false,
  );
});

test("an incidental prefix result does not override a complete name component", async () => {
  const f = fixture();
  const request: DiscordRequest = async <T>(
    path: string,
    options?: Parameters<DiscordRequest>[1],
  ) =>
    path.includes("/members/search?")
      ? ([
          { nick: "測試甲乙", user: { id: id(6), username: "different" } },
        ] as T)
      : f.request<T>(path, options);
  const resolve = createGuildMemberResolver({
    guildId: "guild",
    channelId: "channel",
    requestMessageId: id(999),
    discordRequest: request,
  });
  expect((await resolve("測試甲"))?.user?.id).toBe(id(0));
  expect(await resolve("試甲")).toBeUndefined();
});

test("a saturated prefix-search page cannot establish a unique account", async () => {
  const request: DiscordRequest = async <T>(path: string) => {
    if (path.includes("/members/search?"))
      return Array.from({ length: 10 }, (_, n) => ({
        nick: n === 0 ? "測試甲" : `測試甲${n}`,
        user: { id: id(n), username: `account${n}` },
      })) as T;
    throw new Error("Must not use a clipped search page");
  };
  const resolve = createGuildMemberResolver({
    guildId: "guild",
    channelId: "channel",
    discordRequest: request,
  });
  expect(await resolve("測試甲")).toBeUndefined();
});
