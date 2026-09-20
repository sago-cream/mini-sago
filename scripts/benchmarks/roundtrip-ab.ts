/** Production-host replay, with real Discord REST, Jev, Codex, MCP and loopback WebSocket. */
import { randomUUID } from "node:crypto";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Database } from "bun:sqlite";
import type { TimingEvent } from "../../src/observability/timing";
import type { MacAgentSocketData } from "../../src/chatbot/bridge";
import type { ChatbotJob } from "../../contracts/worker-contract";

const input = JSON.parse(await Bun.stdin.text()) as {
  apiKey: string;
  channelId: string;
  messageId: string;
  pairs?: number;
  warm?: boolean;
};
if (
  !/^\d{17,20}$/.test(input.channelId) ||
  !/^\d{17,20}$/.test(input.messageId)
)
  throw new Error("Invalid benchmark target");
const coreEnv = JSON.parse(
  await readFile(process.env.BENCH_CORE_ENV_FILE!, "utf8"),
);
Object.assign(process.env, coreEnv);
const bridgeSecret = randomUUID() + randomUUID();
process.env.MINISAGO_WORKER_BRIDGE_SECRET = bridgeSecret;
process.env.MINISAGO_WORKER_ID = "benchmark-worker";
delete process.env.MINISAGO_MAC_BRIDGE_SECRET;
process.env.MINISAGO_GUILD_MEMORY_DIRECTORY =
  process.env.BENCH_MEMORY_DIRECTORY || "/tmp/minisago-ab-memory";

const [
  chatbot,
  { macAgentBridge },
  { handleChatbotMcpRequest },
  { createDiscordRequest },
  { DiscordReactionBroker },
  { getChatbotAccessConfig },
  { runCodexJob, codexProfileForJob },
  { jevRequest, parseJevResponse },
  { CHATBOT_PROTOCOL_VERSION },
] = await Promise.all([
  import("../../src/chatbot/chatbot"),
  import("../../src/chatbot/bridge"),
  import("../../src/chatbot/mcp"),
  import("../../src/discord/api/request"),
  import("../../src/discord/api/reactions"),
  import("../../src/chatbot/access"),
  import("../../worker/src/codex"),
  import("./owner-routing"),
  import("../../contracts/worker-contract"),
]);
const { CodexAppServerManager } =
  await import("../../worker/src/codex-app-server");
const warmManager = new CodexAppServerManager();
const { timing } = await import("../../src/observability/timing");
const { ChatbotTraceStore } = await import("../../worker/src/trace-store");
const traceDirectory = await mkdtemp(join(tmpdir(), "minisago-benchmark-"));
const benchmarkTraces = new ChatbotTraceStore(join(traceDirectory, "traces.sqlite"));
const discord = createDiscordRequest(process.env.DISCORD_BOT_TOKEN!);
const access = getChatbotAccessConfig();
const [self, channel, original, latest] = await Promise.all([
  discord<any>("/users/@me"),
  discord<any>(`/channels/${input.channelId}`),
  discord<any>(`/channels/${input.channelId}/messages/${input.messageId}`),
  discord<any[]>(`/channels/${input.channelId}/messages?limit=1`),
]);
if (original.author.id !== access.ownerUserId)
  throw new Error("Benchmark input must be the owner's message");
if (
  original.content
    .replace(/<@!?\d+>/g, "")
    .trim()
    .toLowerCase() !== "yo"
)
  throw new Error("This replay only authorizes the existing yo test");
const message = { ...original, guild_id: channel.guild_id };
const traceDb = new Database(
  process.env.MINISAGO_TRACE_DATABASE_PATH || "/var/lib/minisago/traces.sqlite",
  { readonly: true },
);
const captured = traceDb
  .query(
    "SELECT input_json FROM chatbot_trace_jobs WHERE request_message_id = ? AND purpose = 'execution_route' ORDER BY started_at DESC LIMIT 1",
  )
  .get(input.messageId) as { input_json: string } | null;
if (!captured) throw new Error("Original route trace missing");
const oldJob = JSON.parse(captured.input_json);
const repositories = oldJob.availableRepositories;
let latestId: string | undefined = latest[0]?.id;
const events: Array<TimingEvent & { run: string; scope: string }> = [];
const runs: any[] = [];
const jobs = new Map<string, { run: string; scope: string }>();
const sessions = new Map<string, string>();
let registeringRun: string | undefined;
const activeRuns = new Map<string, any>();
const sink = (run: string, scope: string) => (event: TimingEvent) =>
  events.push({ ...event, run, scope });
const server = Bun.serve<MacAgentSocketData>({
  hostname: "127.0.0.1",
  port: 0,
  async fetch(request, server) {
    if (new URL(request.url).pathname === "/bridge")
      return macAgentBridge.handleUpgrade(request, server);
    if (new URL(request.url).pathname !== "/mcp")
      return new Response("Not found", { status: 404 });
    const token =
      request.headers.get("authorization")?.replace(/^Bearer /, "") || "";
    const run = sessions.get(token);
    let method = "transport";
    try {
      const body = (await request.clone().json()) as any;
      method = [
        "initialize",
        "tools/list",
        "notifications/initialized",
      ].includes(body.method)
        ? body.method
        : body.method === "tools/call"
          ? "tools/call"
          : "transport";
      if (
        body.method === "tools/call" &&
        body.params?.name !== "resolve_context"
      ) {
        throw new Error(
          "The yo benchmark does not authorize tool side effects",
        );
      }
    } catch (error) {
      if (error instanceof Error && error.message.includes("side effects"))
        return new Response("Benchmark tool denied", { status: 403 });
    }
    return timing(run ? sink(run, "mcp") : undefined).span(
      `mcp.${method}`,
      () => handleChatbotMcpRequest(request),
    );
  },
  websocket: {
    open(socket) {
      macAgentBridge.open(socket);
    },
    message(socket, data) {
      macAgentBridge.message(socket, data);
    },
    close(socket) {
      macAgentBridge.close(socket);
    },
  },
});
// Attribute host dispatch synchronously, before handing bytes to the real WebSocket.
const originalDispatch = macAgentBridge.acquireWorkflow.bind(macAgentBridge);
macAgentBridge.acquireWorkflow = (() => {
  const acquired = originalDispatch();
  if (acquired.status !== "accepted") return acquired;
  const run = registeringRun!;
  const dispatch = acquired.workflow.dispatch;
  acquired.workflow.dispatch = (job, onProgress) => {
    const scope =
      job.purpose === "execution_route"
        ? "route"
        : job.purpose === "answer"
          ? "answer"
          : "trace";
    jobs.set(job.id, { run, scope });
    if (job.mcpAccessToken) sessions.set(job.mcpAccessToken, run);
    timing(sink(run, scope)).mark("bridge.sent");
    const result = dispatch(job, onProgress);
    if (result.status === "accepted")
      void result.result.then(() =>
        timing(sink(run, scope)).mark("bridge.result_received"),
      );
    return result;
  };
  return acquired;
}) as typeof macAgentBridge.acquireWorkflow;
const ws = new WebSocket(`ws://127.0.0.1:${server.port}/bridge`);
await new Promise<void>((resolve, reject) => {
  ws.onopen = () => resolve();
  ws.onerror = () => reject(new Error("Benchmark bridge failed"));
});
ws.send(
  JSON.stringify({
    type: "authenticate",
    protocolVersion: CHATBOT_PROTOCOL_VERSION,
    secret: bridgeSecret,
    workerId: "benchmark-worker",
    repositories,
    chatbotRepository: oldJob.chatbotRepository,
  }),
);
ws.send(JSON.stringify({ type: "availability", available: true, capacity: 2 }));
const heartbeat = setInterval(
  () => ws.send(JSON.stringify({ type: "heartbeat" })),
  10000,
);
const workerOptions = {
  codexHome: process.env.MINISAGO_CODEX_HOME!,
  codexPath: process.env.MINISAGO_CODEX_PATH || "/usr/local/bin/codex",
  githubConfigDir:
    process.env.MINISAGO_GITHUB_CONFIG_DIR || "/tmp/unused-github",
  githubRepositories: repositories,
  chatbotRepository: oldJob.chatbotRepository,
  githubWorktreeRoot: "/tmp/minisago-ab-worktrees",
  workspaceRoot: "/tmp/minisago-ab-workspace",
  macFileRoots: [],
  mcpUrl: `http://127.0.0.1:${server.port}/mcp`,
  sandboxUrl: process.env.MINISAGO_SANDBOX_URL || "http://sandbox:8080",
  chatbotAccess: access,
};
ws.onmessage = (event) => {
  const payload = JSON.parse(String(event.data));
  if (payload.type !== "job") return;
  const job = payload.job as ChatbotJob;
  const attribution = jobs.get(job.id)!;
  const clock = timing(sink(attribution.run, attribution.scope));
  clock.mark("bridge.worker_received");
  void (async () => {
    try {
      let content: string;
      if (job.purpose === "trace_lookup") {
        // An empty snapshot matches the original empty-channel request.
        const trace = await clock.span("worker.trace_sql", async () =>
          benchmarkTraces.previousTrace(job.channelId, job.requestMessageId),
        );
        content = JSON.stringify(
          trace ? { status: "complete", trace } : { status: "not_found" },
        );
      } else {
        if (job.purpose !== "answer" && job.purpose !== "execution_route")
          throw new Error("Unexpected job");
        if (job.purpose === "answer" && job.executionRoute !== "chat")
          throw new Error("Replay must stay in chat");
        const record = activeRuns.get(attribution.run);
        record.profiles[attribution.scope] = codexProfileForJob(job, access);
        record.contextCounts[attribution.scope] = job.messages.length;
        const startSaved = clock.start("worker.trace_write_start");
        benchmarkTraces.start(job, Date.now(), {
          model: record.profiles[attribution.scope].model,
        });
        startSaved();
        const result = await runCodexJob(job, {
          ...workerOptions,
          ...(input.warm && record.variant === "optimized"
            ? { appServer: warmManager, warmChat: true }
            : { warmChat: false }),
          onTiming: sink(attribution.run, attribution.scope),
          onPromptCompiled: (value) => {
            record.prompts[attribution.scope] = value;
            const saved = clock.start("worker.trace_write_prompt");
            benchmarkTraces.recordPrompt(job.id, value);
            saved();
          },
          onMcpToolCall: (call) => record.toolNames.push(call.name),
        });
        const saved = clock.start("worker.trace_write_finish");
        benchmarkTraces.finish(job.id, result.content);
        saved();
        record.warmRuntime = warmManager.warmStatus();
        content = result.content;
        if (job.purpose === "answer") record.answer = JSON.parse(content);
      }
      clock.mark("bridge.worker_result_sent");
      ws.send(
        JSON.stringify({ type: "result", jobId: job.id, ok: true, content }),
      );
    } catch (error) {
      activeRuns.get(attribution.run).failed = true;
      console.error(
        `Worker ${attribution.scope} failed: ${error instanceof Error ? error.message : "unknown"}`,
      );
      ws.send(
        JSON.stringify({
          type: "result",
          jobId: job.id,
          ok: false,
          error: "Benchmark worker failed",
          failureKind: "internal",
        }),
      );
    }
  })();
};
for (let attempt = 0; macAgentBridge.getStatus() !== "available"; attempt++) {
  if (attempt > 300) throw new Error("Benchmark worker authentication failed");
  await Bun.sleep(10);
}
await Bun.sleep(30);
const brokers = {
  baseline: new DiscordReactionBroker(),
  optimized: new DiscordReactionBroker(),
};
function requestLabel(path: string, method = "GET") {
  if (path.endsWith("/typing")) return "discord.typing";
  if (path.includes("?around=")) return "discord.nearby_history";
  if (path.endsWith("messages?limit=1")) return "discord.latest_message";
  if (path.endsWith("/messages") && method === "POST")
    return "discord.post_reply";
  if (path.includes("/members/")) return "discord.bot_permissions";
  if (path.endsWith("/roles")) return "discord.guild_roles";
  if (path.endsWith("/emojis")) return "discord.guild_emojis";
  if (/^\/channels\/\d+$/.test(path)) return "discord.channel_permissions";
  return "discord.other";
}
async function run(
  variant: "baseline" | "optimized",
  pair: number,
  mode: "parallel" | "serial",
) {
  const id = `${mode}-${pair}-${variant}`;
  const record: any = {
    id,
    variant,
    pair,
    mode,
    profiles: {},
    prompts: {},
    toolNames: [],
    contextCounts: {},
    cache: pair === 1 ? "cold reaction cache" : "warm reaction cache",
  };
  activeRuns.set(id, record);
  const clock = timing(sink(id, "host"));
  const requests: Promise<unknown>[] = [];
  const request: typeof discord = (path, options) => {
    const label = requestLabel(path, options?.method);
    const promise = clock.span(label, async () => {
      const timedRequest = createDiscordRequest(
        process.env.DISCORD_BOT_TOKEN!,
        (event) =>
          sink(id, "http")({ ...event, name: `${label}.${event.name}` }),
      );
      const response = await timedRequest<any>(path, options);
      if (label === "discord.post_reply") {
        latestId = response.id;
        record.replyCreatedAt = Date.parse(response.timestamp);
        record.replyId = response.id;
        clock.mark("discord.reply_acknowledged");
      }
      // Replay only history that existed when the original message was sent.
      if (label === "discord.nearby_history")
        return response.filter(
          (item: any) => BigInt(item.id) <= BigInt(input.messageId),
        );
      return response;
    });
    requests.push(promise);
    return promise;
  };
  const optimized = input.warm || variant === "optimized";
  record.startedAt = performance.timeOrigin + performance.now();
  registeringRun = id;
  const handled = await chatbot.handleChatbotMention({
    message,
    botUserId: self.id,
    accessConfig: access,
    discordRequest: request,
    reactionBroker: brokers[variant],
    executionOptions: {
      onTiming: sink(id, "host"),
      nonBlockingTyping: optimized,
      lazyPreviousTrace: optimized,
      ...(optimized
        ? {
            latestMessageId: () => latestId,
            routeRequest: async (job: any) => {
              try {
                const response = await fetch(
                  "https://api.typesafe.ai/v1/systemone",
                  {
                    method: "POST",
                    headers: {
                      Authorization: `Bearer ${input.apiKey}`,
                      "Content-Type": "application/json",
                    },
                    body: JSON.stringify(jevRequest(job)),
                    signal: AbortSignal.timeout(3000),
                  },
                );
                if (!response.ok) throw new Error("Jev unavailable");
                const parsed = parseJevResponse(await response.json(), job);
                record.jev = {
                  model: parsed.model,
                  route: parsed.answers.route.choice,
                  confidence: parsed.answers.route.confidence,
                  usage: parsed.usage,
                };
                const route = parsed.answers.route;
                const repo = parsed.answers.repository;
                if (
                  route.confidence < 0.8 ||
                  (route.choice === "oracle" && repo.confidence < 0.8)
                ) {
                  record.fallback = "uncertain";
                  return undefined;
                }
                return JSON.stringify({
                  route: route.choice,
                  repository:
                    route.choice === "oracle" && repo.choice !== "unknown"
                      ? repo.choice
                      : null,
                  threadTitle: null,
                  reason: "Jev routing",
                });
              } catch {
                record.fallback = "service_error";
                return undefined;
              }
            },
          }
        : {}),
    },
  });
  record.finishedAt = performance.timeOrigin + performance.now();
  record.handled = handled;
  record.elapsedMs = record.finishedAt - record.startedAt;
  await Promise.allSettled(requests);
  runs.push(record);
  console.log(
    JSON.stringify({
      run: id,
      elapsedMs: record.elapsedMs,
      failed: !!record.failed,
      fallback: record.fallback,
      answer: record.answer?.reply,
    }),
  );
  return record;
}
try {
  for (let pair = 1; pair <= (input.pairs || 3); pair++) {
    // Alternate dispatch order to avoid always giving one variant the first socket request.
    const variants =
      pair % 2
        ? (["baseline", "optimized"] as const)
        : (["optimized", "baseline"] as const);
    await Promise.all(
      variants.map((variant) => run(variant, pair, "parallel")),
    );
  }
  await run("optimized", 4, "serial");
  await run("baseline", 4, "serial");
  let idle;
  if (input.warm) {
    const sample = async () => {
      const root = warmManager.warmStatus().pid;
      const { readdir, readFile } = await import("node:fs/promises");
      const all = [];
      for (const name of await readdir("/proc")) {
        if (!/^\d+$/.test(name)) continue;
        try {
          const stat = (await readFile(`/proc/${name}/stat`, "utf8"))
            .split(") ")[1]!
            .split(" ");
          all.push({
            pid: Number(name),
            parent: Number(stat[1]),
            ticks: Number(stat[11]) + Number(stat[12]),
            rssBytes: Number(stat[21]) * 4096,
          });
        } catch {}
      }
      const ids = new Set([root]);
      for (let i = 0; i < all.length; i++)
        for (const process of all)
          if (ids.has(process.parent)) ids.add(process.pid);
      const processes = all.filter((p) => ids.has(p.pid));
      return {
        at: Date.now(),
        processes,
        cpuTicks: processes.reduce((a, p) => a + p.ticks, 0),
        rssBytes: processes.reduce((a, p) => a + p.rssBytes, 0),
      };
    };
    // Allow request cleanup to settle before measuring the idle runtime.
    console.log("Warm runtime idle settling; measuring CPU/RAM next.");
    await Bun.sleep(15000);
    const start = await sample();
    await Bun.sleep(30000);
    const end = await sample();
    idle = {
      start,
      end,
      durationMs: end.at - start.at,
      cpuPercentOfOneCore:
        ((end.cpuTicks - start.cpuTicks) / 100 / ((end.at - start.at) / 1000)) *
        100,
      clockTicksPerSecond: 100,
    };
    console.log(
      JSON.stringify({
        idleCpuPercent: idle.cpuPercentOfOneCore,
        rssMiB: end.rssBytes / 1048576,
        processes: end.processes.length,
      }),
    );
  }
  const report = {
    comparison: input.warm ? "optimized-cold-vs-warm" : "original-vs-optimized",
    idle,
    version: 1,
    collectedAt: new Date().toISOString(),
    method:
      "Same original owner yo replayed through real handleChatbotMention, Discord REST, loopback WebSocket, fresh Codex CLI/MCP, SQLite trace persistence, and Jev on the production worker machine. Three concurrent A/B pairs and one serial control pair. Does not measure Discord ingress; starts at handler entry and ends when Discord POST response is received. Both variants use Luna high for answers. History is restricted to messages at or before the original request. Reply cache is seeded before measured runs; reaction caches start cold and then warm independently. No deployed bot changes.",
    runs,
    events,
  };
  const output = process.env.BENCH_OUTPUT || "/tmp/minisago-roundtrip-ab.json";
  await Bun.write(output, JSON.stringify(report, null, 2));
  if (runs.some((run) => run.failed || !run.replyId)) process.exitCode = 1;
} finally {
  warmManager.close();
  clearInterval(heartbeat);
  ws.close();
  traceDb.close();
  benchmarkTraces.close();
  server.stop(true);
  await rm(traceDirectory, { recursive: true, force: true });
}
