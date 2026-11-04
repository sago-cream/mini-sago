import { expect, spyOn, test } from "bun:test";
import { DeveloperTaskRegistry } from "./t3-coding";
import {
  DeveloperThreadStore,
  type SavedDeveloperThread,
} from "./developer-thread-store";
import { handleChatbotMention } from "./chatbot";
import type { T3Connection, T3ThreadRead } from "./t3-client";
import type { DiscordMessage, DiscordRequest } from "./chatbot-context";
import type { OracleAnswerJob } from "../../contracts/worker-contract";

const access = {
  ownerUserId: "owner",
  guildIds: new Set<string>(),
  channelIds: new Set<string>(),
  roleIds: new Set<string>(),
};
const message = (
  content: string,
  id = "message",
  author = "owner",
): DiscordMessage => ({
  id,
  channel_id: "discord-thread",
  guild_id: "guild",
  author: { id: author },
  content,
  timestamp: new Date().toISOString(),
});
const job: OracleAnswerJob = {
  id: "job",
  requesterUserId: "owner",
  purpose: "answer",
  executionRoute: "oracle",
  repository: "owner/repo",
  channelId: "discord-thread",
  requestMessageId: "message",
  request: "Fix the bug",
  messages: [],
  mcpAccessToken: "must-not-reach-t3",
};
function fixture(
  relayTimers?: ConstructorParameters<typeof DeveloperTaskRegistry>[3],
) {
  const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
  const posts: Array<{ path: string; method?: string; body: any }> = [];
  let items: T3ThreadRead["items"] = [];
  let status = "idle";
  let failSend = false;
  let failStop = false;
  const store = new DeveloperThreadStore(":memory:");
  const client: T3Connection = {
    url: "https://t3.example/mcp",
    async call(name, args) {
      calls.push({ name, args });
      if (name === "t3_project_list")
        return {
          projects: [
            {
              id: "project",
              repositoryIdentity: {
                locator: { remoteUrl: "git@github.com:owner/repo.git" },
              },
            },
          ],
          nextCursor: null,
        };
      if (name === "t3_thread_launch")
        return {
          threadId: "t3-thread",
          projectId: "project",
          link: "https://t3.example/thread/t3-thread",
        };
      if (name === "t3_thread_send" || name === "t3_thread_send_attachments") {
        if (failSend) throw new Error("network failure");
        return { threadId: "t3-thread", runId: "run", delivery: "started" };
      }
      if (name === "t3_thread_interrupt") {
        if (failStop) throw new Error("offline");
        return {};
      }
      if (name === "t3_thread_read")
        return {
          thread: {
            threadId: "t3-thread",
            projectId: "project",
            title: "Fix",
            link: "https://t3.example/thread/t3-thread",
            status,
            model: "project-model",
            runtimeMode: "full-access",
            pendingRequestCount: 0,
            branch: "fix/bug",
            archived: false,
          },
          items: items.filter(
            (item) => item.position > Number(args.afterPosition ?? -1),
          ),
          hasMore: false,
          nextPosition: items.at(-1)?.position ?? null,
        };
      throw new Error(`Unexpected tool ${name}`);
    },
  };
  const discord = (async (path, init) => {
    posts.push({ path, method: init?.method, body: init?.body });
    return { type: 11, id: `discord-${posts.length}` };
  }) as DiscordRequest;
  const registry = new DeveloperTaskRegistry(
    client,
    store,
    undefined,
    relayTimers,
  );
  return {
    calls,
    posts,
    store,
    client,
    discord,
    registry,
    setItems(next: typeof items) {
      items = next;
    },
    setStatus(next: string) {
      status = next;
    },
    failSend() {
      failSend = true;
    },
    failStop() {
      failStop = true;
    },
    start: () =>
      registry.start({
        message: message(job.request),
        job,
        title: "Fix bug",
        discordRequest: discord,
      }),
    handle: (content: string, id = content) =>
      registry.handle(message(content, id), "bot", access, discord),
  };
}
function item(
  position: number,
  text: string,
  status = "completed",
  type = "assistant_message",
) {
  return {
    position,
    itemId: `item-${position}`,
    sourceThreadId: "t3-thread",
    visibility: "local",
    type,
    status,
    text,
    textTruncated: false,
    runId: "run",
  };
}

test("concurrent project discovery shares a lookup with coding startup", async () => {
  const f = fixture();
  try {
    const repositories = await Promise.all([
      f.registry.availableRepositories(),
      f.registry.availableRepositories(),
    ]);
    expect(repositories).toEqual([["owner/repo"], ["owner/repo"]]);
    await f.start();
    expect(
      f.calls.filter((call) => call.name === "t3_project_list"),
    ).toHaveLength(1);
  } finally {
    f.store.close();
  }
});

test("failed project discovery can be retried when starting a task", async () => {
  const f = fixture();
  const call = f.client.call.bind(f.client);
  let fail = true;
  f.client.call = async (name, args) => {
    if (name === "t3_project_list" && fail) throw new Error("offline");
    return call(name, args);
  };
  try {
    expect(await f.registry.availableRepositories()).toEqual([]);
    fail = false;
    await f.start();
    expect(f.calls.some((call) => call.name === "t3_thread_send")).toBe(true);
  } finally {
    f.store.close();
  }
});

test("coding startup refreshes expired project metadata before launching", async () => {
  const f = fixture();
  await f.registry.availableRepositories();
  const now = spyOn(Date, "now").mockReturnValue(Date.now() + 60_001);
  const call = f.client.call.bind(f.client);
  f.client.call = async (name, args) =>
    name === "t3_project_list"
      ? { projects: [], nextCursor: null }
      : call(name, args);
  try {
    await expect(f.start()).rejects.toThrow("Register one active T3 project");
    expect(f.calls.some((call) => call.name === "t3_thread_launch")).toBe(
      false,
    );
  } finally {
    now.mockRestore();
    f.store.close();
  }
});

test("starts an ordinary T3 worktree with project defaults and sends the owner's unwrapped request", async () => {
  const f = fixture();
  await f.start();
  const launch = f.calls.find((call) => call.name === "t3_thread_launch")!.args;
  expect(launch).toEqual({
    projectId: "project",
    title: "Fix bug",
    workspaceStrategy: {
      type: "worktree",
      baseRef: "HEAD",
      startFromOrigin: true,
    },
    clientRequestId: "discord-thread:discord-thread",
  });
  const send = f.calls.find((call) => call.name === "t3_thread_send")!.args;
  expect(send.message).toStartWith("Fix the bug\n");
  expect(send.message).toContain(
    "https://discord.com/channels/guild/discord-thread",
  );
  expect(send.mode).toBe("auto");
  expect(JSON.stringify(f.calls)).not.toContain("must-not-reach-t3");
  expect(
    f.posts.some((post) => post.body?.content?.includes("[Open in T3]")),
  ).toBe(true);
  expect(f.store.get("discord-thread")!.t3!.threadId).toBe("t3-thread");
  f.store.close();
});

test("continuations and status work without a coding worker or rerouting, and duplicate Discord deliveries do not rerun", async () => {
  const f = fixture();
  await f.start();
  const reopened = new DeveloperTaskRegistry(f.client, f.store);
  await handleChatbotMention({
    message: message("Use a simpler implementation", "followup"),
    botUserId: "bot",
    accessConfig: access,
    discordRequest: f.discord,
    developerTaskRegistry: reopened,
  });
  await reopened.handle(
    message("Use a simpler implementation", "followup"),
    "bot",
    access,
    f.discord,
  );
  const sent = f.calls.filter((call) => call.name === "t3_thread_send");
  expect(sent).toHaveLength(2);
  expect(sent[1]!.args.message).toBe("Use a simpler implementation");
  await reopened.handle(
    message("status", "status-message"),
    "bot",
    access,
    f.discord,
  );
  expect(f.calls.filter((call) => call.name === "t3_thread_send")).toHaveLength(
    2,
  );
  f.store.close();
});

test.each(["member", "bot", "webhook", "wrong-guild", "changed-owner"])(
  "rejects unauthorized T3 control: %s",
  async (scenario) => {
    const f = fixture();
    await f.start();
    const before = f.calls.length;
    const input = message(
      "Merge and deploy",
      "untrusted",
      scenario === "member" ? "member" : "owner",
    );
    if (scenario === "bot") input.author!.bot = true;
    if (scenario === "webhook") input.webhook_id = "webhook";
    if (scenario === "wrong-guild") input.guild_id = "other";
    expect(
      await f.registry.handle(
        input,
        "bot",
        scenario === "changed-owner"
          ? { ...access, ownerUserId: "replacement" }
          : access,
        f.discord,
      ),
    ).toBe(false);
    expect(f.calls).toHaveLength(before);
    f.store.close();
  },
);

test("streams assistant updates by editing the same Discord message and relays T3 UI output after restart", async () => {
  const f = fixture();
  await f.start();
  f.setItems([item(0, "Inspecting", "running")]);
  await f.registry.sync(f.registry.saved("discord-thread")!, f.discord);
  const streamed = f.posts.at(-1)!;
  expect(streamed.method).toBe("POST");
  f.setItems([
    item(0, "Inspecting the project.", "completed"),
    item(1, "private reasoning", "completed", "reasoning"),
    item(2, "Fixed from the T3 UI."),
  ]);
  const reopened = new DeveloperTaskRegistry(f.client, f.store);
  await reopened.sync(reopened.saved("discord-thread")!, f.discord);
  expect(
    f.posts.some(
      (post) =>
        post.method === "PATCH" &&
        post.body?.content === "Inspecting the project.",
    ),
  ).toBe(true);
  expect(
    f.posts.some((post) => post.body?.content === "private reasoning"),
  ).toBe(false);
  expect(
    f.posts.some((post) => post.body?.content === "Fixed from the T3 UI."),
  ).toBe(true);
  const count = f.posts.length;
  await reopened.sync(reopened.saved("discord-thread")!, f.discord);
  expect(f.posts).toHaveLength(count);
  expect(f.store.get("discord-thread")!.t3!.cursor).toBe(2);
  f.store.close();
});

test("preserves long replies rather than dropping text at Discord's message limit", async () => {
  const f = fixture();
  await f.start();
  f.setItems([item(0, "a".repeat(5000))]);
  await f.registry.sync(f.registry.saved("discord-thread")!, f.discord);
  const chunks = f.posts.filter((post) =>
    /^a+$/u.test(post.body?.content ?? ""),
  );
  expect(chunks.map((post) => post.body?.content).join("")).toHaveLength(5000);
  expect(
    chunks.every((post) => post.body.allowed_mentions.parse.length === 0),
  ).toBe(true);
  f.store.close();
});

test("stop and end use T3 Stop semantics and preserve the T3 session", async () => {
  const f = fixture();
  await f.start();
  await f.handle("stop");
  expect(
    f.calls.find((call) => call.name === "t3_thread_interrupt")!.args.stop,
  ).toBe(true);
  await f.registry.end("discord-thread", "guild", "owner", f.discord);
  expect(f.store.get("discord-thread")).toBeUndefined();
  expect(f.calls.some((call) => /delete|archive/u.test(call.name))).toBe(false);
  f.store.close();
});

test("keeps the association when T3 cannot confirm a stop", async () => {
  const f = fixture();
  await f.start();
  f.failStop();
  expect(
    (await f.registry.end("discord-thread", "guild", "owner", f.discord))
      .status,
  ).toBe("unavailable");
  expect(f.store.get("discord-thread")).toBeDefined();
  f.store.close();
});

test("does not replay an ambiguous send failure or start another session after a connection change", async () => {
  const f = fixture();
  await f.start();
  f.failSend();
  await f.handle("Do the change", "uncertain");
  await f.handle("Do the change", "uncertain");
  expect(f.calls.filter((call) => call.name === "t3_thread_send")).toHaveLength(
    2,
  );
  expect(
    f.posts.some((post) =>
      post.body?.content?.includes("could not be confirmed"),
    ),
  ).toBe(true);
  const other = new DeveloperTaskRegistry(
    { ...f.client, url: "https://another.example/mcp" },
    f.store,
  );
  await other.handle(message("continue", "next"), "bot", access, f.discord);
  expect(f.calls.filter((call) => call.name === "t3_thread_send")).toHaveLength(
    2,
  );
  f.store.close();
});

test("uploads original Discord attachments through T3's upload contract", async () => {
  const f = fixture();
  await f.start();
  const uploadedBytes: number[][] = [];
  const transport: T3Connection = {
    url: f.client.url,
    async call(name, args) {
      if (name === "t3_attachment_prepare_upload") {
        f.calls.push({ name, args });
        return {
          attachmentId: "upload-1",
          relativeUrl: "/api/attachments/upload/test",
        };
      }
      return f.client.call(name, args);
    },
  };
  const fetcher = (async (url, init) => {
    if (String(url).startsWith("https://cdn.discordapp.com/"))
      return new Response(new Uint8Array([1, 2, 3]), {
        headers: { "Content-Type": "image/png" },
      });
    uploadedBytes.push([...new Uint8Array(init!.body as Uint8Array)]);
    return new Response(null, { status: 204 });
  }) as typeof fetch;
  const registry = new DeveloperTaskRegistry(transport, f.store, fetcher);
  const input = message("Use this screenshot", "with-image");
  input.attachments = [
    {
      id: "image",
      filename: "screenshot.png",
      content_type: "image/png",
      size: 3,
      url: "https://cdn.discordapp.com/attachments/image.png",
    },
  ];
  await registry.handle(input, "bot", access, f.discord);
  expect(uploadedBytes).toEqual([[1, 2, 3]]);
  const sent = f.calls.find(
    (call) => call.name === "t3_thread_send_attachments",
  )!;
  expect(sent.args).toMatchObject({
    threadId: "t3-thread",
    message: "Use this screenshot",
    attachments: [
      {
        id: "upload-1",
        name: "screenshot.png",
        type: "image",
        mimeType: "image/png",
        sizeBytes: 3,
      },
    ],
  });
  f.store.close();
});

test("initial owner routing selects T3 projects and releases the chat worker without dispatching code execution", async () => {
  const { macAgentBridge } = await import("./bridge");
  const { CHATBOT_PROTOCOL_VERSION } =
    await import("../../contracts/worker-contract");
  const f = fixture();
  const oldSecret = process.env.MINISAGO_WORKER_BRIDGE_SECRET;
  const secret = "t3-routing-test-secret-at-least-32-bytes";
  process.env.MINISAGO_WORKER_BRIDGE_SECRET = secret;
  const sent: any[] = [];
  const socket = {
    data: { authenticated: false },
    send(raw: string) {
      sent.push(JSON.parse(raw));
    },
    close() {},
  } as any;
  try {
    macAgentBridge.open(socket);
    macAgentBridge.message(
      socket,
      JSON.stringify({
        type: "authenticate",
        protocolVersion: CHATBOT_PROTOCOL_VERSION,
        secret,
        workerId: "oracle",
        repositories: ["unrelated/worker-repo"],
      }),
    );
    macAgentBridge.message(
      socket,
      JSON.stringify({ type: "availability", available: true, capacity: 1 }),
    );
    const input = message(
      "<@123456789012345678> Fix the bug",
      "initial-routing",
    );
    const discord = (async (path, init) => {
      if (path.includes("messages?")) {
        expect(f.calls.some((call) => call.name === "t3_project_list")).toBe(
          true,
        );
        return [];
      }
      return f.discord(path, init);
    }) as DiscordRequest;
    let advertised: string[] = [];
    await handleChatbotMention({
      message: input,
      botUserId: "123456789012345678",
      accessConfig: access,
      discordRequest: discord,
      developerTaskRegistry: f.registry,
      executionOptions: {
        lazyPreviousTrace: true,
        routeRequest: async (routeJob) => {
          advertised = routeJob.availableRepositories;
          return JSON.stringify({
            route: "oracle",
            repository: "owner/repo",
            threadTitle: "Fix bug",
          });
        },
      },
      guildMemoryStore: {
        ensure: async () => ({ revision: 0, entries: [] }),
        mutate: async () => {
          throw new Error("Unexpected memory write");
        },
      } as any,
    });
    expect(advertised).toEqual(["owner/repo"]);
    expect(
      f.calls.filter((call) => call.name === "t3_project_list"),
    ).toHaveLength(1);
    expect(f.calls.some((call) => call.name === "t3_thread_send")).toBe(true);
    expect(
      sent.some(
        (message) =>
          message.type === "job" && message.job.executionRoute === "oracle",
      ),
    ).toBe(false);
    const available = macAgentBridge.acquireWorkflow(["chat"]);
    expect(available.status).toBe("accepted");
    if (available.status === "accepted") available.workflow.release();
  } finally {
    macAgentBridge.close(socket);
    f.store.close();
    if (oldSecret === undefined)
      delete process.env.MINISAGO_WORKER_BRIDGE_SECRET;
    else process.env.MINISAGO_WORKER_BRIDGE_SECRET = oldSecret;
  }
});

test("answers a single native task question through Discord without granting a tool approval", async () => {
  const f = fixture();
  await f.start();
  const client: T3Connection = {
    ...f.client,
    async call(name, args) {
      if (name === "t3_pending_request") {
        f.calls.push({ name, args });
        if (args.action === "list") return { requestIds: ["question-request"] };
        if (args.action === "read")
          return {
            requestId: "question-request",
            questions: [
              {
                id: "approach",
                question: "Which approach?",
                options: [{ label: "Simple" }],
              },
            ],
          };
        return {};
      }
      return f.client.call(name, args);
    },
  };
  const registry = new DeveloperTaskRegistry(client, f.store);
  f.setItems([
    item(0, "working command", "running", "command_execution"),
    item(1, "question", "pending", "user_input_request"),
  ]);
  await registry.sync(registry.saved("discord-thread")!, f.discord);
  expect(
    f.posts.some((post) => post.body?.content?.includes("Which approach?")),
  ).toBe(true);
  await registry.handle(message("Simple", "answer"), "bot", access, f.discord);
  const answer = f.calls.find(
    (call) =>
      call.name === "t3_pending_request" && call.args.action === "respond",
  )!;
  expect(answer.args).toMatchObject({
    requestId: "question-request",
    answers: { approach: "Simple" },
  });
  expect(f.calls.filter((call) => call.name === "t3_thread_send")).toHaveLength(
    1,
  );
  expect(f.calls.some((call) => call.name.includes("approval"))).toBe(false);
  f.store.close();
});

test("uses the reachable UI origin for Discord links when MCP uses a Docker hostname", async () => {
  const f = fixture();
  const registry = new DeveloperTaskRegistry(
    { ...f.client, webUrl: "https://oracle.example:8443" },
    f.store,
  );
  await registry.start({
    message: message(job.request),
    job,
    discordRequest: f.discord,
  });
  expect(registry.saved("discord-thread")!.t3!.link).toBe(
    "https://oracle.example:8443/thread/t3-thread",
  );
  expect(
    f.posts.some((post) =>
      post.body?.content?.includes(
        "https://oracle.example:8443/thread/t3-thread",
      ),
    ),
  ).toBe(true);
  f.store.close();
});

test("keeps emoji chunks within Discord's string limit and removes stale chunks after a rewrite", async () => {
  const f = fixture();
  await f.start();
  f.setItems([item(0, "🙂".repeat(2400), "running")]);
  await f.registry.sync(f.registry.saved("discord-thread")!, f.discord);
  const chunks = f.posts.filter((post) => post.body?.content?.includes("🙂"));
  expect(chunks.every((post) => post.body.content.length <= 2000)).toBe(true);
  expect(chunks.map((post) => post.body.content).join("")).toBe(
    "🙂".repeat(2400),
  );
  f.setItems([item(0, "Done.")]);
  await f.registry.sync(f.registry.saved("discord-thread")!, f.discord);
  expect(f.posts.filter((post) => post.method === "DELETE")).toHaveLength(2);
  f.store.close();
});

test("includes forwarded requirements and nearby context when opening the coding session", async () => {
  const f = fixture();
  const input = message("pr", "forwarded-task");
  input.message_snapshots = [
    {
      message: {
        content: "The empty list needs an explanation.",
        timestamp: input.timestamp,
        attachments: [],
      },
    },
  ];
  await f.registry.start({
    message: input,
    job: {
      ...job,
      request: "pr",
      messages: [
        {
          id: "earlier",
          author: "Owner",
          timestamp: input.timestamp,
          content: "Keep the current visual style.",
          attachments: [],
        },
      ],
    },
    discordRequest: f.discord,
  });
  const sent = f.calls.find((call) => call.name === "t3_thread_send")!;
  expect(sent.args.message).toContain("The empty list needs an explanation.");
  expect(sent.args.message).toContain("Keep the current visual style.");
  f.store.close();
});

function relayClock() {
  let pending: { run: () => void; delay: number } | undefined;
  const handle = { unref() {} } as ReturnType<typeof setTimeout>;
  return {
    timers: {
      schedule: ((run: () => void, delay: number) => {
        expect(pending).toBeUndefined();
        pending = { run, delay };
        return handle;
      }) as typeof setTimeout,
      cancel: (() => {
        pending = undefined;
      }) as typeof clearTimeout,
    },
    delay: () => pending?.delay,
    async run() {
      const next = pending!;
      pending = undefined;
      next.run();
      await Bun.sleep(0);
    },
  };
}

test("relay sleeps until a refresh is due and wakes for new Discord work", async () => {
  const clock = relayClock();
  const f = fixture(clock.timers);
  try {
    f.registry.startRelay(f.discord, "owner");
    await Bun.sleep(0);
    expect(clock.delay()).toBe(30_000);
    expect(f.calls).toHaveLength(0);
    await f.start();
    expect(clock.delay()).toBe(0);
    await clock.run();
    expect(clock.delay()).toBeGreaterThan(14_000);
    expect(clock.delay()).toBeLessThanOrEqual(15_000);
    f.setStatus("running");
    await f.handle("Continue", "continue-running");
    expect(clock.delay()).toBe(0);
    await clock.run();
    expect(clock.delay()).toBeGreaterThan(2_000);
    expect(clock.delay()).toBeLessThanOrEqual(3_000);
    await f.registry.end("discord-thread", "guild", "owner", f.discord);
    await clock.run();
    expect(clock.delay()).toBe(30_000);
    f.registry.close();
    expect(clock.delay()).toBeUndefined();
  } finally {
    f.registry.close();
    f.store.close();
  }
});

test("relay backs off failed reads without overlapping refreshes", async () => {
  const clock = relayClock();
  const f = fixture(clock.timers);
  try {
    await f.start();
    let reads = 0;
    const call = f.client.call.bind(f.client);
    f.client.call = async (name, args) => {
      if (name === "t3_thread_read") {
        reads++;
        throw new Error("offline");
      }
      return call(name, args);
    };
    // A fresh registry catches up persisted associations immediately.
    const restored = new DeveloperTaskRegistry(
      f.client,
      f.store,
      undefined,
      clock.timers,
    );
    try {
      restored.startRelay(f.discord, "owner");
      restored.startRelay(f.discord, "owner");
      await Bun.sleep(0);
      expect(reads).toBe(1);
      expect(clock.delay()).toBeGreaterThan(29_000);
      expect(clock.delay()).toBeLessThanOrEqual(30_000);
    } finally {
      restored.close();
    }
  } finally {
    f.store.close();
  }
});

test("closing an in-flight relay prevents it from rearming a timer", async () => {
  const clock = relayClock();
  const f = fixture(clock.timers);
  await f.start();
  const call = f.client.call.bind(f.client);
  let release!: () => void;
  const blocked = new Promise<void>((resolve) => {
    release = resolve;
  });
  f.client.call = async (name, args) => {
    if (name === "t3_thread_read") await blocked;
    return call(name, args);
  };
  const restored = new DeveloperTaskRegistry(
    f.client,
    f.store,
    undefined,
    clock.timers,
  );
  try {
    restored.startRelay(f.discord, "owner");
    await Bun.sleep(0);
    restored.close();
    release();
    await Bun.sleep(0);
    expect(clock.delay()).toBeUndefined();
    restored.startRelay(f.discord, "owner");
    await Bun.sleep(0);
    expect(clock.delay()).toBeGreaterThan(14_000);
  } finally {
    release();
    restored.close();
    f.store.close();
  }
});
