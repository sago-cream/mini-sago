import { expect, test } from "bun:test";
import { createMessageReactionReader } from "./message-reactions";
import type { DiscordRequest } from "../discord/api/request";

const messageId = "123456789012345678";
const userId = "223456789012345678";
function fixture(
  users = [{ id: userId, username: "caramel", global_name: "Caramel" }],
) {
  const calls: string[] = [];
  const discordRequest: DiscordRequest = async <T>(path: string) => {
    calls.push(path);
    if (path.includes("/members/")) return { nick: "社群組_測試成員" } as T;
    if (path.includes("/reactions/")) return users as T;
    return {
      reactions: [
        {
          emoji: { name: "👍" },
          count: 3,
          count_details: { normal: 2, burst: 1 },
        },
        {
          emoji: { name: "wave", id: "323456789012345678", animated: true },
          count: 1,
        },
      ],
    } as T;
  };
  return {
    calls,
    read: createMessageReactionReader({
      guildId: "guild",
      channelId: "channel",
      defaultMessageId: messageId,
      discordRequest,
    }),
  };
}

test("reads live counts from the replied-to message without listing users", async () => {
  const f = fixture();
  const result = await f.read({});
  expect(result).toMatchObject({
    status: "complete",
    messageId,
    reactions: [
      { emoji: "👍", count: 3, normalCount: 2, burstCount: 1 },
      {
        emoji: "wave:323456789012345678",
        count: 1,
        normalCount: 1,
        burstCount: 0,
      },
    ],
  });
  expect(f.calls).toEqual([`/channels/channel/messages/${messageId}`]);
});

test("returns stable voter IDs, guild nicknames and separate burst pages with shared member reads", async () => {
  const f = fixture();
  const normal = await f.read({ emoji: "👍" });
  expect(normal).toMatchObject({
    participants: [
      {
        id: userId,
        mention: `<@${userId}>`,
        names: ["社群組_測試成員", "Caramel", "caramel"],
        memberResolved: true,
      },
    ],
    nextAfter: null,
  });
  await f.read({ emoji: "👍", reactionType: "burst", after: userId });
  expect(f.calls).toContain(
    `/channels/channel/messages/${messageId}/reactions/${encodeURIComponent("👍")}?type=1&limit=100&after=${userId}`,
  );
  expect(f.calls.filter((p) => p.includes("/members/"))).toHaveLength(1);
});

test("encodes custom emoji and exposes a cursor for a full page", async () => {
  const f = fixture(
    Array.from({ length: 100 }, (_, i) => ({
      id: String(BigInt(userId) + BigInt(i)),
      username: `user${i}`,
      global_name: "Test",
    })),
  );
  const result = await f.read({ emoji: "<a:wave:323456789012345678>" });
  expect(result).toMatchObject({ nextAfter: String(BigInt(userId) + 99n) });
  expect(f.calls).toContain(
    `/channels/channel/messages/${messageId}/reactions/wave%3A323456789012345678?type=0&limit=100`,
  );
});

test("retains account identity when a member lookup fails, but propagates roster failures", async () => {
  const discordRequest: DiscordRequest = async <T>(path: string) => {
    if (path.includes("/members/")) throw new Error("404 Unknown Member");
    if (path.includes("/reactions/"))
      return [{ id: userId, username: "former_member" }] as T;
    return { reactions: [{ emoji: { name: "✅" }, count: 1 }] } as T;
  };
  const read = createMessageReactionReader({
    guildId: "guild",
    channelId: "channel",
    defaultMessageId: messageId,
    discordRequest,
  });
  expect(await read({ emoji: "✅" })).toMatchObject({
    participants: [
      { id: userId, names: ["former_member"], memberResolved: false },
    ],
  });
  const fail = createMessageReactionReader({
    guildId: "guild",
    channelId: "channel",
    defaultMessageId: messageId,
    discordRequest: async () => {
      throw new Error("403 Missing Access");
    },
  });
  await expect(fail({})).rejects.toThrow("403");
});

test("rejects invalid IDs, cursors and emoji before reading any roster", async () => {
  const f = fixture();
  await expect(f.read({ messageId: "../elsewhere" })).rejects.toThrow();
  await expect(f.read({ after: userId })).rejects.toThrow();
  await expect(f.read({ emoji: "not-on-message" })).rejects.toThrow();
  expect(f.calls.some((p) => p.includes("/reactions/"))).toBe(false);
});
