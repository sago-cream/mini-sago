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
    const registry = new DeveloperTaskRegistry(undefined, undefined, store);
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
      expect(registry.has(threadId)).toBe(false);
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

async function waitFor<T>(read: () => T | undefined) {
  for (let i = 0; i < 200; i++) {
    const value = read();
    if (value !== undefined) return value;
    await Bun.sleep(1);
  }
  throw new Error("Timed out waiting for recovery");
}

test.each([
  "plain",
  "concurrent",
  "merged-mentioned",
  "participant",
  "no-session",
  "status",
  "stop",
  "merged",
  "denied",
  "wrong-guild",
  "wrong-owner",
  "expired",
  "bot",
  "webhook",
])("restores persisted thread before routing: %s", async (scenario) => {
  const root = await mkdtemp(join(tmpdir(), "minisago-thread-recovery-"));
  const path = join(root, "threads.sqlite");
  const threadId = `restart-thread-${scenario}`;
  const task = {
    id: `saved-${scenario}`,
    threadId,
    guildId: guild,
    requesterUserId: owner,
    repository: "sago-cream/mini-sago",
    request: "Implement the original change.",
    title: "Original task",
    resumeSessionId: "original-session",
    requiresAddressing: scenario.startsWith("merged"),
    expiresAt: Date.now() + DEVELOPER_TASK_TTL_MS,
  };
  if (scenario === "wrong-owner") task.requesterUserId = "old-owner";
  if (scenario === "wrong-guild") task.guildId = "other-guild";
  if (scenario === "expired") task.expiresAt = Date.now() - 1;
  const first = new DeveloperThreadStore(path);
  first.save(
    scenario === "no-session" ? { ...task, resumeSessionId: undefined } : task,
  );
  first.close();
  const store = new DeveloperThreadStore(path);
  const registry = new DeveloperTaskRegistry(undefined, undefined, store);
  const oldSecret = process.env.MINISAGO_WORKER_BRIDGE_SECRET;
  process.env.MINISAGO_WORKER_BRIDGE_SECRET =
    "persistent-thread-test-secret-at-least-32-bytes";
  const sent: Array<any> = [];
  const socket = {
    data: { authenticated: false },
    send: (raw: string) => sent.push(JSON.parse(raw)),
    close: () => {},
  } as unknown as ServerWebSocket<MacAgentSocketData>;
  const posts: string[] = [];
  let routes = 0;
  const request =
    scenario === "status" || scenario === "stop"
      ? scenario
      : "find the pikpak repo and create a new branch";
  const message = {
    id: `message-${scenario}`,
    channel_id: threadId,
    guild_id: guild,
    content: request,
    author: {
      id:
        scenario === "participant" || scenario === "denied"
          ? "participant"
          : owner,
      bot: scenario === "bot",
    },
    ...(scenario === "webhook" ? { webhook_id: "webhook" } : {}),
    timestamp: new Date().toISOString(),
  };
  const featureAvailability = new FeatureAvailabilityStore(
    join(root, "features.json"),
  );
  await featureAvailability.configure({
    feature: "developer_steering",
    scope: "guild",
    targetId: guild,
    action: scenario === "participant" ? "enable" : "disable",
  });
  if (scenario === "merged-mentioned") message.content = `<@${bot}> ${request}`;
  const options = {
    message,
    botUserId: bot,
    developerTaskRegistry: registry,
    accessConfig: {
      ownerUserId: owner,
      guildIds: new Set<string>(),
      channelIds: new Set<string>(),
      roleIds: new Set<string>(),
    },
    featureAvailability,
    guildMemoryStore: {
      ensure: async () => ({ revision: 0, entries: [] }),
      mutate: async () => {
        throw new Error("Unexpected memory mutation");
      },
    },
    executionOptions: {
      lazyPreviousTrace: true,
      routeRequest: async () => {
        routes++;
        return JSON.stringify({ route: "chat", repository: "owner/other" });
      },
    },
    discordRequest: (async (_path, init) => {
      if (init?.method === "POST") {
        posts.push(String((init.body as any)?.content));
        return { id: "reply" };
      }
      return [];
    }) as DiscordRequest,
  };
  try {
    macAgentBridge.open(socket);
    macAgentBridge.message(
      socket,
      JSON.stringify({
        type: "authenticate",
        protocolVersion: CHATBOT_PROTOCOL_VERSION,
        secret: process.env.MINISAGO_WORKER_BRIDGE_SECRET,
        workerId: "oracle",
        repositories: [task.repository, "owner/other"],
      }),
    );
    macAgentBridge.message(
      socket,
      JSON.stringify({ type: "availability", available: true, capacity: 1 }),
    );
    expect(sent.filter((x) => x.type === "job")).toHaveLength(0);
    const firstMessage = handleChatbotMention(options);
    const secondMessage =
      scenario === "concurrent"
        ? handleChatbotMention({
            ...options,
            message: {
              ...message,
              id: "concurrent-follow-up",
              content: "also inspect the tests",
            },
          })
        : undefined;
    const handled = await firstMessage;
    if (secondMessage) {
      const steer = await waitFor(() => sent.find((x) => x.type === "steer"));
      expect(steer.request).toContain("also inspect the tests");
      macAgentBridge.message(
        socket,
        JSON.stringify({
          type: "steer_result",
          jobId: steer.jobId,
          requestId: steer.requestId,
          accepted: true,
        }),
      );
      expect(await secondMessage).toBe(true);
      expect(sent.filter((x) => x.type === "job")).toHaveLength(1);
    }
    expect(routes).toBe(0);
    const ignored = [
      "merged",
      "denied",
      "wrong-guild",
      "wrong-owner",
      "expired",
      "bot",
      "webhook",
    ].includes(scenario);
    expect(handled).toBe(!ignored);
    if (ignored || scenario === "status" || scenario === "stop") {
      expect(sent.filter((x) => x.type === "job")).toHaveLength(0);
      if (!ignored) expect(posts.length).toBeGreaterThan(0);
    } else {
      const answer = await waitFor(() =>
        sent.find((x) => x.type === "job" && x.job.purpose === "answer"),
      );
      expect(answer.job.executionRoute).toBe("oracle");
      expect(answer.job.repository).toBe(task.repository);
      expect(answer.job.developerTask.id).toBe(task.id);
      expect(answer.job.requesterUserId).toBe(owner);
      expect(answer.job.developerTask.currentRequesterUserId).toBe(
        message.author.id,
      );
      expect(answer.job.developerTask.resumeSessionId).toBe(
        scenario === "no-session" ? undefined : task.resumeSessionId,
      );
      expect(answer.job.request).toContain(request);
      if (scenario === "no-session")
        expect(answer.job.request).toContain(task.request);
      const progress: ChatbotTaskProgress = {
        phase: "implementing",
        summary: "Continuing",
        sessionId: "latest-session",
        completion: "pull_request_merged",
      };
      macAgentBridge.message(
        socket,
        JSON.stringify({ type: "progress", jobId: answer.job.id, progress }),
      );
      expect(store.get(threadId)?.resumeSessionId).toBe("latest-session");
      expect(store.get(threadId)?.requiresAddressing).toBe(true);
      macAgentBridge.message(
        socket,
        JSON.stringify({
          type: "result",
          jobId: answer.job.id,
          ok: true,
          content: "Recovered.",
        }),
      );
      await waitFor(() => (posts.includes("Recovered.") ? true : undefined));
    }
  } finally {
    macAgentBridge.close(socket);
    if (oldSecret === undefined)
      delete process.env.MINISAGO_WORKER_BRIDGE_SECRET;
    else process.env.MINISAGO_WORKER_BRIDGE_SECRET = oldSecret;
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
