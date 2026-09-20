import { constants } from "node:fs";
import { mkdir, open } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { jevRequest, parseJevResponse } from "../../src/chatbot/jev-routing";

import { supplementalCapabilities } from "../../src/chatbot/chatbot";
import { parseExecutionRoute } from "../../src/chatbot/chatbot-routing";
import { registerChatbotMcpSession } from "../../src/chatbot/mcp";
import type { ExecutionRouteJob } from "../../contracts/worker-contract";
import {
  checkCodexAuthentication,
  OWNER_ROUTER_PROFILE,
  runCodexJob,
} from "../../worker/src/codex";
import { buildPromptPlan } from "../../worker/src/prompts";

export const ROUTING_CASES = [
  {
    id: "chat-reminder",
    expectedRoute: "chat",
    message: "十分鐘後提醒我去拿外送",
  },
  {
    id: "mac-file",
    expectedRoute: "mac",
    message: "幫我找 Mac 下載資料夾裡最新的 PDF，傳給我",
  },
  {
    id: "repository-analysis",
    expectedRoute: "oracle",
    message:
      "檢查 sago-cream/mini-sago 的 owner request routing，找出可以降低延遲的地方",
  },
] as const;

export const TYPESAFE_KEY_PATH = join(
  homedir(),
  ".config",
  "minisago",
  "typesafe-api-key",
);

export async function readTypesafeKey(path = TYPESAFE_KEY_PATH) {
  const environmentKey = process.env.TYPESAFE_API_KEY?.trim();
  if (environmentKey) return environmentKey;
  const file = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW,
  ).catch(() => {
    throw new Error(
      "TypeSafe key unavailable. Run python3 scripts/set-typesafe-key.py in your terminal first.",
    );
  });
  try {
    const metadata = await file.stat();
    if (
      !metadata.isFile() ||
      metadata.size > 8192 ||
      (metadata.mode & 0o077) !== 0 ||
      metadata.uid !== process.getuid?.()
    ) {
      throw new Error("TypeSafe key file must be owned by you with mode 600.");
    }
    const key = (await file.readFile("utf8")).trim();
    if (!key || /\s/u.test(key)) {
      throw new Error("TypeSafe key file is empty or contains whitespace.");
    }
    return key;
  } finally {
    await file.close();
  }
}

export { jevRequest, parseJevResponse } from "../../src/chatbot/jev-routing";
function benchmarkCapabilities() {
  const unavailable = (): never => {
    throw new Error("Routing benchmark cannot execute tools.");
  };
  const session = registerChatbotMcpSession({
    supplementalCapabilities: supplementalCapabilities({
      isOwner: true,
      hasAttachments: false,
      hasReactions: true,
      availableRepositories: ["sago-cream/mini-sago"],
      chatbotRepository: "sago-cream/mini-sago",
      executionRoute: "chat",
    }),
    resolveContext: unavailable,
    getCodexUsage: unavailable,
    listFeatureAvailability: unavailable,
    configureFeatureAvailability: unavailable,
    listManagedServices: unavailable,
    configureServiceSubscription: unavailable,
    manageServerMemory: unavailable,
    searchThreads: unavailable,
    sendChannelMessage: unavailable,
    pauseChannelActivity: unavailable,
    joinVoiceChannel: unavailable,
    leaveVoiceChannel: unavailable,
    listSharedGuilds: unavailable,
    listGuildEmojis: unavailable,
    addGuildExpression: unavailable,
    renameGuildEmoji: unavailable,
    createReminder: unavailable,
    listReminders: unavailable,
    editReminder: unavailable,
    cancelReminder: unavailable,
  });
  session.revoke();
  return session.capabilities;
}

async function main() {
  const value = (name: string) => {
    const index = Bun.argv.indexOf(name);
    return index < 0 ? undefined : Bun.argv[index + 1];
  };
  const provider = value("--provider") ?? "jev";
  if (provider !== "jev" && provider !== "codex") {
    throw new Error("--provider must be jev or codex.");
  }
  const dryRun = Bun.argv.includes("--dry-run");
  const outputPath = resolve(
    value("--output") ?? `.data/benchmarks/owner-routing-${provider}.json`,
  );
  const applicationSupport = join(
    homedir(),
    "Library",
    "Application Support",
    "MiniSago",
  );
  const config = {
    codexHome:
      process.env.MINISAGO_CODEX_HOME ?? join(applicationSupport, "codex-home"),
    codexPath:
      process.env.MINISAGO_CODEX_PATH ??
      "/Applications/ChatGPT.app/Contents/Resources/codex",
    githubConfigDir: join(applicationSupport, "github"),
    githubRepositories: ["sago-cream/mini-sago"],
    chatbotRepository: "sago-cream/mini-sago",
    githubWorktreeRoot: join(dirname(outputPath), "unused-worktrees"),
    workspaceRoot: dirname(outputPath),
    macFileRoots: [],
    mcpUrl: "http://127.0.0.1:1/unused",
    sandboxUrl: "http://127.0.0.1:1/unused",
    chatbotAccess: {
      ownerUserId: "100000000000000001",
      guildIds: new Set<string>(),
      channelIds: new Set<string>(),
      roleIds: new Set<string>(),
    },
  };
  const capabilities = benchmarkCapabilities();
  const key =
    !dryRun && provider === "jev" ? await readTypesafeKey() : undefined;
  if (
    !dryRun &&
    provider === "codex" &&
    !(await checkCodexAuthentication(config))
  ) {
    throw new Error("Worker Codex authentication unavailable.");
  }
  const report = {
    startedAt: new Date().toISOString(),
    provider,
    profile:
      provider === "jev" ? { model: "jev-latest" } : OWNER_ROUTER_PROFILE,
    dryRun,
    method:
      "Three sequential requests, one per message, no retry or explicit warmup. Codex time includes fresh process startup and cleanup; Jev time includes request construction, HTTPS, inference, and validation. Excludes Discord, bridge dispatch, worker queue, and action execution. Jev selects route and repository; Codex additionally generates a title and reason.",
    environment: {
      platform: process.platform,
      nearbyMessageCount: 0,
      availableRepositories: config.githubRepositories,
      capabilityCount: capabilities.length,
    },
    results: [] as Array<Record<string, unknown>>,
  };
  await mkdir(dirname(outputPath), { recursive: true });
  for (const test of ROUTING_CASES) {
    const job: ExecutionRouteJob = {
      id: `routing-benchmark-${test.id}-${Date.now()}`,
      requesterUserId: config.chatbotAccess.ownerUserId,
      purpose: "execution_route",
      channelId: "100000000000000002",
      requestMessageId: "100000000000000003",
      request: test.message,
      requestMessage: {
        id: "100000000000000003",
        role: "user",
        author: "Hsi",
        timestamp: new Date().toISOString(),
        content: test.message,
        attachments: [],
      },
      messages: [],
      capabilities,
      availableRepositories: config.githubRepositories,
      chatbotRepository: config.chatbotRepository,
    };
    console.log(`Starting ${provider}: ${test.id}`);
    const started = performance.now();
    try {
      let result: Record<string, unknown>;
      if (dryRun) {
        result = {
          request:
            provider === "jev" ? jevRequest(job) : buildPromptPlan(job, [], []),
        };
      } else if (provider === "jev") {
        const response = await fetch("https://api.typesafe.ai/v1/systemone", {
          method: "POST",
          redirect: "error",
          headers: {
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(jevRequest(job)),
          signal: AbortSignal.timeout(30_000),
        });
        if (!response.ok)
          throw new Error(`TypeSafe returned HTTP ${response.status}.`);
        const parsed = parseJevResponse(await response.json(), job);
        const route = parsed.answers.route.choice;
        const repository =
          route === "oracle" && parsed.answers.repository.choice !== "unknown"
            ? parsed.answers.repository.choice
            : undefined;
        result = {
          decision: { route, ...(repository ? { repository } : {}) },
          answers: parsed.answers,
          model: parsed.model,
          usage: parsed.usage,
          correct:
            route === test.expectedRoute &&
            (route !== "oracle" || repository === config.chatbotRepository),
        };
      } else {
        const response = await runCodexJob(job, config);
        const decision = parseExecutionRoute(
          response.content,
          config.githubRepositories,
        );
        result = {
          decision,
          rawDecision: JSON.parse(response.content),
          correct:
            decision.route === test.expectedRoute &&
            (decision.route !== "oracle" ||
              decision.repository === config.chatbotRepository),
        };
      }
      const record = {
        ...test,
        elapsedMs: performance.now() - started,
        ...result,
      };
      report.results.push(record);
      console.log(
        JSON.stringify(dryRun ? { id: test.id, dryRun: true } : record),
      );
    } catch (error) {
      const message =
        error instanceof z.ZodError
          ? "Jev returned an invalid response shape."
          : String(error);
      const safeMessage = key ? message.replaceAll(key, "[redacted]") : message;
      report.results.push({
        ...test,
        elapsedMs: performance.now() - started,
        error: safeMessage,
      });
      console.error(`${test.id}: ${safeMessage}`);
      process.exitCode = 1;
    }
    await Bun.write(outputPath, JSON.stringify(report, null, 2));
  }
  console.log(`Report: ${outputPath}`);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Benchmark failed.");
    process.exitCode = 1;
  });
}
