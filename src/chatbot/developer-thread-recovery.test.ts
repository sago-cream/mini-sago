import { expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  handleChatbotMention,
  DeveloperTaskRegistry,
  type DiscordRequest,
} from "./chatbot";
import {
  DeveloperThreadStore,
  DEVELOPER_TASK_TTL_MS,
} from "./developer-thread-store";
import { macAgentBridge, type MacAgentSocketData } from "./bridge";
import {
  CHATBOT_PROTOCOL_VERSION,
  type ChatbotTaskProgress,
} from "../../contracts/worker-contract";
import { FeatureAvailabilityStore } from "../discord/feature-availability";

const owner = "917446775873343600";
const bot = "123456789012345678";
const guild = "917436845187563610";

test.each(["owner", "target", "member", "bot", "webhook", "wrong-guild"])(
  "ending a saved thread without a worker uses trusted identity: %s",
  async (scenario) => {
    const root = await mkdtemp(join(tmpdir(), "minisago-thread-end-"));
    const path = join(root, "threads.sqlite");
    const threadId = "123456789012345679";
    const store = new DeveloperThreadStore(path);
    store.save({
      id: "saved-task",
      threadId,
      guildId: guild,
      requesterUserId: owner,
      repository: "sago-cream/mini-sago",
      request: "Implement the change",
      requiresAddressing: false,
      expiresAt: Date.now() + DEVELOPER_TASK_TTL_MS,
    });
    const registry = new DeveloperTaskRegistry(undefined, store);
    const posts: string[] = [];
    const message = {
      id: "end-message",
      channel_id: scenario === "target" ? "parent-channel" : threadId,
      guild_id: scenario === "wrong-guild" ? "other-guild" : guild,
      author: {
        id: scenario === "member" ? "member" : owner,
        bot: scenario === "bot",
      },
      ...(scenario === "webhook" ? { webhook_id: "webhook" } : {}),
      content:
        scenario === "target"
          ? `end dev thread <#${threadId}>`
          : `<@${bot}> end this dev thread`,
      timestamp: new Date().toISOString(),
    };
    try {
      await handleChatbotMention({
        message,
        botUserId: bot,
        developerTaskRegistry: registry,
        accessConfig: {
          ownerUserId: owner,
          guildIds: new Set(),
          channelIds: new Set(),
          roleIds: new Set(),
        },
        discordRequest: (async (_path, init) => {
          if (init?.method === "POST")
            posts.push(String((init.body as any)?.content));
          return [];
        }) as DiscordRequest,
      });
      const ended = scenario === "owner" || scenario === "target";
      expect(registry.has(threadId)).toBe(!ended);
      expect(Boolean(store.get(threadId))).toBe(!ended);
      if (ended) {
        expect(posts).toHaveLength(1);
        expect(posts[0]).toContain("Development thread ended");
        expect(
          await handleChatbotMention({
            message: {
              ...message,
              channel_id: threadId,
              content: "Just chatting",
            },
            botUserId: bot,
            developerTaskRegistry: registry,
            accessConfig: {
              ownerUserId: owner,
              guildIds: new Set(),
              channelIds: new Set(),
              roleIds: new Set(),
            },
            discordRequest: (async () => {
              throw new Error("Unexpected Discord request");
            }) as DiscordRequest,
          }),
        ).toBe(false);
      }
      store.close();
      const reopened = new DeveloperThreadStore(path);
      expect(Boolean(reopened.get(threadId))).toBe(!ended);
      reopened.close();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
