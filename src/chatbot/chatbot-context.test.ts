import { expect, test } from "bun:test";
import {
  discordMessageAttachments,
  toChatbotMessage,
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
