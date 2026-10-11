import { expect, test } from "bun:test";
import type { ChatbotAccessConfig } from "./access";
import type { MacAgentJobResult, WorkflowLease } from "./bridge";
import type { DiscordMessage, DiscordRequest } from "./chatbot-context";
import type {
  ChatbotTaskProgress,
  OracleAnswerJob,
  PreservedDeveloperTask,
} from "../../contracts/worker-contract";
import { ChatbotRequestResources, DeveloperTaskRegistry } from "./chatbot";

const access: ChatbotAccessConfig = {
  ownerUserId: "owner",
  guildIds: new Set(["guild"]),
  channelIds: new Set(),
  roleIds: new Set(),
};
const message = (content: string, user = "owner"): DiscordMessage => ({
  id: `message-${content}`,
  channel_id: "thread",
  guild_id: "guild",
  author: { id: user, username: user },
  content,
  timestamp: "2026-10-11T00:00:00.000Z",
});

function fixture() {
  const turns: Array<{
    job: OracleAnswerJob;
    progress?: (progress: ChatbotTaskProgress) => void;
    result: ReturnType<typeof Promise.withResolvers<MacAgentJobResult>>;
  }> = [];
  const posts: string[] = [];
  const stopped: string[] = [];
  let releases = 0;
  let revocations = 0;
  let extensions = 0;
  let previousLoads = 0;
  let contextChannel: string | undefined;
  let participantAllowed = false;
  let preserved: PreservedDeveloperTask | undefined;
  let expiry: (() => void) | undefined;
  let idle = Promise.withResolvers<void>();
  let steer = async (_id: string, _request: string) => true;
  const workflow: WorkflowLease = {
    availableRepositories: ["owner/repo"],
    dispatch(job, progress) {
      const result = Promise.withResolvers<MacAgentJobResult>();
      turns.push({ job: job as OracleAnswerJob, progress, result });
      return { status: "accepted", result: result.promise, cancel: () => true };
    },
    steer: (id, request) => steer(id, request),
    stop: (id) => {
      stopped.push(id);
      return true;
    },
    route: () => ({ status: "accepted" }),
    getCodexUsage: async () => null,
    release: () => {
      releases++;
    },
  };
  const resources = new ChatbotRequestResources(workflow);
  resources.attachSession({
    snapshot: () => ({ searchUnavailable: false }),
    extend: () => {
      extensions++;
    },
    revoke: () => {
      revocations++;
      return true;
    },
  });
  const registry = new DeveloperTaskRegistry(
    () => ({ status: "accepted", workflow }),
    (expire) => {
      expiry = expire;
      idle.resolve();
      return () => {
        expiry = undefined;
      };
    },
  );
  const discord = (async (_path, options) => {
    if (
      options?.body &&
      typeof options.body === "object" &&
      "content" in options.body
    )
      posts.push(String(options.body.content));
    return { type: 11, id: "thread" };
  }) as DiscordRequest;
  const job: OracleAnswerJob = {
    id: "initial-job",
    purpose: "answer",
    executionRoute: "oracle",
    repository: "owner/repo",
    requesterUserId: "owner",
    channelId: "thread",
    requestMessageId: "initial-message",
    request: "Implement the change.",
    messages: [],
    mcpAccessToken: "fixture-token",
  };
  return {
    registry,
    resources,
    turns,
    posts,
    stopped,
    get releases() {
      return releases;
    },
    get revocations() {
      return revocations;
    },
    get extensions() {
      return extensions;
    },
    get previousLoads() {
      return previousLoads;
    },
    get contextChannel() {
      return contextChannel;
    },
    get expiry() {
      return expiry;
    },
    allowParticipants() {
      participantAllowed = true;
    },
    preserve(task: PreservedDeveloperTask) {
      preserved = task;
    },
    setSteer(next: typeof steer) {
      steer = next;
    },
    async start(discordRequest = discord) {
      await registry.start({
        message: message(job.request),
        job,
        title: "  Add   a feature  ",
        resources,
        loadPreviousTask: async () => {
          previousLoads++;
          return preserved;
        },
        allowParticipantSteering: () => participantAllowed,
        activateContext: (channel) => {
          contextChannel = channel;
        },
        refreshContext: async () => [],
        discordRequest,
      });
    },
    async finish(result: MacAgentJobResult = { ok: true, content: "Done." }) {
      const done = idle.promise;
      turns.at(-1)!.result.resolve(result);
      await done;
      idle = Promise.withResolvers<void>();
    },
  };
}

test("task owns initialization and retains MCP until idle expiry", async () => {
  const f = fixture();
  await f.start();
  expect(f.contextChannel).toBe("thread");
  expect(f.registry.has("thread")).toBe(true);
  expect(f.turns[0]!.job.developerTask).toMatchObject({
    title: "Add a feature",
  });
  f.resources.release();
  expect(f.releases).toBe(0);
  expect(f.revocations).toBe(0);
  await f.finish();
  expect(f.posts).toEqual(["Done."]);
  expect(f.releases).toBe(1);
  expect(f.revocations).toBe(0);
  f.expiry!();
  expect(f.revocations).toBe(1);
  expect(f.registry.has("thread")).toBe(false);
});

test("setup failure leaves request cleanup in charge", async () => {
  const f = fixture();
  const discord = (async () => {
    throw new Error("Discord unavailable");
  }) as DiscordRequest;
  await expect(f.start(discord)).rejects.toThrow("Discord unavailable");
  expect(f.resources.retained).toBe(false);
  expect(f.turns).toHaveLength(0);
  expect(f.registry.has("thread")).toBe(false);
  f.resources.release();
  f.resources.release();
  expect(f.releases).toBe(1);
  expect(f.revocations).toBe(1);
});

test.each([
  { requesterUserId: "owner", repository: "owner/repo", recover: true },
  { requesterUserId: "participant", repository: "owner/repo", recover: false },
  { requesterUserId: "owner", repository: "owner/other", recover: false },
])(
  "recovery requires the same owner and repository: %j",
  async ({ requesterUserId, repository, recover }) => {
    const f = fixture();
    f.preserve({
      id: "preserved-task",
      requesterUserId,
      repository,
      request: "Original change",
      title: "Preserved title",
      resumeSessionId: "session-1",
    });
    await f.start();
    const task = f.turns[0]!.job.developerTask!;
    expect(task.resumeSessionId).toBe(recover ? "session-1" : undefined);
    expect(task.id === "preserved-task").toBe(recover);
    await f.finish();
  },
);

test("stopping preserves the session and resuming cancels idle expiry", async () => {
  const f = fixture();
  await f.start();
  f.turns[0]!.progress!({
    phase: "implementing",
    summary: "Working",
    sessionId: "session-1",
  });
  await f.registry.handle(message("stop"), "bot", access);
  expect(f.stopped).toEqual([f.turns[0]!.job.id]);
  await f.finish({
    ok: false,
    stopped: true,
    error: "Stopped",
    failureKind: "internal",
  });
  expect(f.releases).toBe(1);
  expect(f.revocations).toBe(0);
  expect(f.expiry).toBeDefined();
  const previousExtensions = f.extensions;
  await f.registry.handle(message("continue"), "bot", access);
  expect(f.expiry).toBeUndefined();
  expect(f.extensions).toBeGreaterThan(previousExtensions);
  expect(f.turns[1]!.job.developerTask!.resumeSessionId).toBe("session-1");
  await f.finish();
  expect(f.releases).toBe(2);
});

test("a failed steer after completion starts exactly one follow-up turn", async () => {
  const f = fixture();
  const steering = Promise.withResolvers<boolean>();
  const entered = Promise.withResolvers<void>();
  f.setSteer(async () => {
    entered.resolve();
    return steering.promise;
  });
  await f.start();
  const followUp = f.registry.handle(message("Add tests too."), "bot", access);
  await entered.promise;
  await f.finish();
  steering.resolve(false);
  await followUp;
  expect(f.turns).toHaveLength(2);
  expect(f.turns[1]!.job.request).toContain("Add tests too.");
  await f.finish();
});

test("participant steering retains owner identity and requires explicit addressing after merge", async () => {
  const f = fixture();
  const steering: string[] = [];
  f.setSteer(async (_id, request) => {
    steering.push(request);
    return true;
  });
  await f.start();
  expect(
    await f.registry.handle(message("Add tests", "participant"), "bot", access),
  ).toBe(false);
  f.allowParticipants();
  expect(
    await f.registry.handle(message("Add tests", "participant"), "bot", access),
  ).toBe(true);
  expect(steering[0]).toContain(
    "cannot authorize a pull request merge or deployment",
  );
  f.turns[0]!.progress!({
    phase: "implementing",
    summary: "Merged",
    completion: "pull_request_merged",
  });
  await f.finish();
  expect(
    await f.registry.handle(
      message("More changes", "participant"),
      "bot",
      access,
    ),
  ).toBe(false);
  expect(
    await f.registry.handle(
      message("<@bot> More changes", "participant"),
      "bot",
      access,
    ),
  ).toBe(true);
  expect(f.turns[1]!.job.requesterUserId).toBe("owner");
  expect(f.turns[1]!.job.developerTask!.currentRequesterUserId).toBe(
    "participant",
  );
  await f.finish();
});

test("new Discord threads do not recover an unrelated parent-channel task", async () => {
  const f = fixture();
  const discord = (async (_path, options) =>
    options?.method === "POST"
      ? { id: "new-thread" }
      : { type: 0 }) as DiscordRequest;
  await f.start(discord);
  expect(f.previousLoads).toBe(0);
  expect(f.contextChannel).toBe("new-thread");
  expect(f.turns[0]!.job.channelId).toBe("new-thread");
  await f.finish();
});
