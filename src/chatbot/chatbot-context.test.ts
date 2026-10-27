import { expect, test } from "bun:test";
import {
  discordMessageAttachments,
  toChatbotMessage,
  getNearbyHumanMessages,
  getRecentHumanMessages,
  searchGuildMessages,
  type DiscordMessage,
} from "./chatbot-context";

const image = {
  id: "image",
  filename: "image.png",
  size: 3,
  content_type: "image/png",
  url: "https://cdn.discordapp.com/image.png",
};
const forward: DiscordMessage = {
  id: "forward",
  channel_id: "destination",
  timestamp: "2026-10-17T09:25:00Z",
  content: "",
  attachments: [],
  message_snapshots: [
    {
      message: {
        timestamp: "2026-10-14T00:00:00Z",
        content: "這邊要加一個全選的勾勾",
        attachments: [image],
        embeds: [{ title: "PikPak RSS" }],
      },
    },
  ],
};

test("normalizes forwarded snapshots on a reply with the forwarding message's source identity", () => {
  const message = toChatbotMessage({
    ...forward,
    id: "request",
    content: "<@bot> pr",
    message_snapshots: [],
    referenced_message: forward,
  });
  expect(message.content).toBe("<@bot> pr");
  expect(message.attachments).toEqual([]);
  expect(message.referencedMessage).toMatchObject({
    id: "forward",
    channelId: "destination",
    content: "[Forwarded message]\n這邊要加一個全選的勾勾\nPikPak RSS",
    attachments: [{ id: "image", filename: "image.png" }],
  });
});

test("keeps directly forwarded text and deduplicates attachments with the direct copy first", () => {
  expect(toChatbotMessage(forward).content).toContain("PikPak RSS");
  expect(toChatbotMessage(forward).attachments).toHaveLength(1);
  const fresh = { ...image, url: "https://cdn.discordapp.com/fresh.png" };
  expect(
    discordMessageAttachments({ ...forward, attachments: [fresh] }),
  ).toEqual([fresh]);
});

test("keeps webhook post previews in nearby history, recent history and search without member authority", async () => {
  const proxy: DiscordMessage = {
    id: "social-proxy",
    channel_id: "channel",
    timestamp: "2026-10-27T10:00:00Z",
    webhook_id: "webhook",
    author: {
      id: "bot",
      username: "Owner",
      global_name: "Owner alias",
      bot: true,
    },
    content: "https://fixthreads.seria.moe/@alice/post/ABC",
    embeds: [{ description: "The shared post text" }],
  };
  const nearby = await getNearbyHumanMessages({
    channelId: "channel",
    requestMessageId: "request",
    botUserId: "bot",
    discordRequest: async () => [proxy] as never,
  });
  const recent = await getRecentHumanMessages({
    channelId: "channel",
    requestMessageId: "request",
    botUserId: "bot",
    discordRequest: async () => [proxy] as never,
  });
  const search = await searchGuildMessages({
    guildId: "guild",
    requesterUserId: "member",
    requesterRoleIds: ["role"],
    currentChannelId: "channel",
    requestMessageId: "request",
    queries: [{ linkHostname: "fixthreads.seria.moe" }],
    discordRequest: async (path) => {
      if (path.endsWith("/roles"))
        return [{ id: "guild", permissions: "66560" }] as never;
      if (path.endsWith("/channels"))
        return [{ id: "channel", type: 0 }] as never;
      expect(path).not.toContain("author_type=user");
      return {
        messages: [
          [proxy, { ...proxy, id: "ordinary-bot", webhook_id: undefined }],
        ],
      } as never;
    },
  });
  for (const messages of [nearby, recent, search]) {
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({
      role: "user",
      author: "Owner alias (webhook)",
    });
    expect(messages[0]?.authorAliases).toBeUndefined();
    expect(messages[0]?.content).toContain("The shared post text");
  }
});
