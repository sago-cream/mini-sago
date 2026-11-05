/** Generate demo dialogue with the production Sago prompt and local integration fixtures. */
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, writeFile } from "node:fs/promises";
import { homedir, tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { AjvJsonSchemaValidator } from "@modelcontextprotocol/sdk/validation/ajv";
import {
  buildPromptPlan,
  outputSchemaForJob,
  PROMPT_VERSION,
  PROMPT_PLAN_VERSIONS,
} from "../worker/src/prompts";
import {
  COMMUNITY_CHATBOT_PROFILE,
  VOICE_CHATBOT_PROFILE,
  CHATBOT_MODEL_VERBOSITY,
} from "../worker/src/codex";
import {
  handleChatbotMcpRequest,
  registerChatbotMcpSession,
} from "../src/chatbot/mcp";
import { featureCapability, type FeatureId } from "../src/discord/features";
import type { AnswerJob, ChatbotMessage } from "../contracts/worker-contract";
import { pythonToolSchema } from "../worker/src/media/python";
import { imageGenerationSchema } from "../worker/src/media/image-generation";
import {
  SITE_DEMO_COPY_CASES,
  demoId,
  type DemoCopyCase,
} from "./fixtures/site-demo-copy";

type Tool = {
  name: string;
  description?: string;
  inputSchema: Record<string, unknown>;
};
type Generated = {
  id: string;
  request: string;
  promptHash: string;
  model: string;
  effort: string;
  reply: string | null;
  artifacts?: string[];
  files?: string[];
  calls: Array<{ tool: string; input: unknown; result: unknown }>;
};
const arg = (name: string) => {
  const index = Bun.argv.indexOf(name);
  return index < 0 ? undefined : Bun.argv[index + 1];
};
const outputPath = resolve(
  arg("--output") ?? "/tmp/minisago-site-replies.json",
);
const runRoot = await mkdtemp(join(tmpdir(), "minisago-site-copy-"));
const catalog = await toolCatalog();
const cases = SITE_DEMO_COPY_CASES.filter(
  (c) =>
    (!arg("--case") || c.id === arg("--case")) &&
    (!arg("--conversation") ||
      arg("--conversation")!.split(",").includes(c.conversation)),
);
const groups = Map.groupBy(cases, (c) => c.conversation);
const results: Generated[] = [];
const queue = [...groups.values()];
let failed = false;
let saving = Promise.resolve();
await Promise.all(
  Array.from({ length: 4 }, async () => {
    for (;;) {
      const group = queue.shift();
      if (!group) return;
      const history: ChatbotMessage[] = [];
      const conversationTools: Record<string, unknown> = {};
      const conversationFeatures = new Set<string>();
      for (const testCase of group) {
        try {
          Object.assign(conversationTools, testCase.tools);
          for (const feature of testCase.features ?? [])
            conversationFeatures.add(feature);
          const result = await generate(
            {
              ...testCase,
              tools: conversationTools,
              features: [...conversationFeatures],
            },
            history,
          );
          results.push(result);
          history.push({
            id: demoId(200 + history.length),
            role: "user",
            author: "你",
            timestamp: "2026-10-14T07:24:00Z",
            content: testCase.request,
            attachments: [],
          });
          if (result.reply)
            history.push({
              id: demoId(200 + history.length),
              role: "assistant",
              author: "迷你西米露",
              timestamp: "2026-10-14T07:25:00Z",
              content: result.reply,
              attachments: [],
            });
          console.log(
            `${testCase.id}: ${result.reply?.slice(0, 100) ?? "[host-delivered response]"}`,
          );
          await save();
        } catch (error) {
          failed = true;
          console.error(
            `${testCase.id}: ${error instanceof Error ? error.message : error}`,
          );
          break;
        }
      }
    }
  }),
);
await save();
console.log(
  `Generated ${results.length}/${cases.length} responses: ${outputPath}`,
);
if (failed) process.exitCode = 1;

async function save() {
  const content =
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        promptVersion: PROMPT_VERSION,
        promptPlanVersions: PROMPT_PLAN_VERSIONS,
        fixtureSource: "scripts/fixtures/site-demo-copy.ts",
        results: results.toSorted(
          (a, b) =>
            cases.findIndex((c) => c.id === a.id) -
            cases.findIndex((c) => c.id === b.id),
        ),
      },
      null,
      2,
    ) + "\n";
  saving = saving.then(() => writeFile(outputPath, content));
  return saving;
}

async function generate(
  testCase: DemoCopyCase,
  history: ChatbotMessage[],
): Promise<Generated> {
  const directory = join(runRoot, testCase.id);
  await mkdir(directory);
  const calls: Generated["calls"] = [];
  const tools = { ...(testCase.tools ?? {}) };
  const validator = new AjvJsonSchemaValidator();
  for (const name of Object.keys(tools))
    if (!catalog.has(name))
      throw new Error(`Missing production tool schema: ${name}`);
  const fallbackContext = {
    history: {
      status: "complete",
      messages: [...(testCase.messages ?? []), ...history],
    },
    search: { status: "not_requested", results: [] },
    members: { status: "not_requested", results: [] },
    previousTrace: { status: "not_requested" },
  };
  tools.resolve_context ??= fallbackContext;
  const host = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      if (request.method !== "POST") return new Response(null, { status: 405 });
      const input = await request.json();
      if (input.method?.startsWith("notifications/"))
        return new Response(null, { status: 204 });
      let result: unknown;
      if (input.method === "initialize")
        result = {
          protocolVersion: "2025-03-26",
          capabilities: { tools: {} },
          serverInfo: { name: "minisago-site-fixtures", version: "1" },
        };
      else if (input.method === "tools/list")
        result = {
          tools: Object.keys(tools).map((name) => {
            const tool = catalog.get(name);
            if (!tool)
              throw new Error(`Missing production tool schema: ${name}`);
            return tool;
          }),
        };
      else if (input.method === "tools/call") {
        const { name, arguments: args } = input.params;
        const validation = catalog.has(name)
          ? validator.getValidator(catalog.get(name)!.inputSchema)(args ?? {})
          : { valid: false, errorMessage: "Unknown tool" };
        const fixture = tools[name];
        const value = !validation.valid
          ? { status: "invalid", error: validation.errorMessage }
          : typeof fixture === "function"
            ? fixture(args)
            : (fixture ?? {
                status: "unavailable",
                error: "This tool has no local demo fixture.",
              });
        calls.push({ tool: name, input: args, result: value });
        result = {
          content: [{ type: "text", text: JSON.stringify(value) }],
          structuredContent: value,
        };
      } else
        return Response.json({
          jsonrpc: "2.0",
          id: input.id,
          error: { code: -32601, message: "Unsupported fixture method" },
        });
      return Response.json({ jsonrpc: "2.0", id: input.id, result });
    },
  });
  const mediaId = [
    "media",
    "image-edit",
    "expression-add",
    "showcase-emote-add",
  ].includes(testCase.id)
    ? "input-demo-image.png"
    : undefined;
  const job = {
    id: testCase.id,
    requesterUserId: demoId(10),
    purpose: "answer",
    executionRoute: testCase.executionRoute ?? "chat",
    mcpAccessToken: "fixture-only",
    channelId: demoId(2),
    requestMessageId: demoId(100),
    request: testCase.request,
    requestMessage: {
      id: demoId(100),
      author: "你",
      timestamp: "2026-10-14T07:24:00Z",
      content: testCase.request,
      attachments: mediaId
        ? [
            {
              id: mediaId,
              filename: mediaId,
              contentType: "image/png",
              size: 1024,
              url: "https://example.invalid/fixture.png",
            },
          ]
        : [],
    },
    messages: [...(testCase.messages ?? []), ...history],
    capabilities: [
      featureCapability("conversation", { availability: "available" }),
      ...(testCase.features ?? []).map((id) =>
        featureCapability(id as FeatureId, { availability: "available" }),
      ),
    ],
    ...(testCase.memory ? { serverMemory: testCase.memory } : {}),
    ...(testCase.spoken ? { streamReply: true } : {}),
  };
  const plan = buildPromptPlan(
    job as AnswerJob,
    testCase.attachmentText ?? [],
    [],
    undefined,
    ["/Users/demo/活動", "/Users/demo/Downloads"],
  );
  const profile = testCase.spoken
    ? VOICE_CHATBOT_PROFILE
    : COMMUNITY_CHATBOT_PROFILE;
  const schemaPath = join(directory, "schema.json");
  const finalPath = join(directory, "final.json");
  await writeFile(
    schemaPath,
    JSON.stringify(outputSchemaForJob(job as AnswerJob)),
  );
  // The prompt and tool fixtures are reproducible; no unrelated skills, shell,
  // live web research, Discord, Google or media mutations are available here.
  try {
    const child = Bun.spawn(
      [
        arg("--codex") ?? process.env.MINISAGO_CODEX_PATH ?? "codex",
        "exec",
        "--json",
        "--ephemeral",
        "--skip-git-repo-check",
        "--ignore-user-config",
        "--strict-config",
        "--model",
        profile.model,
        "--sandbox",
        "read-only",
        "--cd",
        directory,
        "--output-schema",
        schemaPath,
        "--output-last-message",
        finalPath,
        ...[
          `model_reasoning_effort="${profile.reasoningEffort}"`,
          `model_verbosity="${CHATBOT_MODEL_VERBOSITY}"`,
          'approval_policy="never"',
          'web_search="disabled"',
          "features.hooks=false",
          "features.memories=false",
          "features.shell_tool=false",
          "project_doc_max_bytes=0",
          `developer_instructions=${JSON.stringify(plan.developerInstructions)}`,
          `mcp_servers.${testCase.executionRoute === "mac" ? "mac_files" : "minisago"}.url=${JSON.stringify(host.url.href)}`,
          `mcp_servers.${testCase.executionRoute === "mac" ? "mac_files" : "minisago"}.required=true`,
          `mcp_servers.${testCase.executionRoute === "mac" ? "mac_files" : "minisago"}.default_tools_approval_mode="approve"`,
        ].flatMap((value) => ["--config", value]),
        plan.taskInstruction,
      ],
      {
        stdin: "pipe",
        stdout: "pipe",
        stderr: "pipe",
        env: {
          ...process.env,
          CODEX_HOME:
            arg("--codex-home") ??
            process.env.MINISAGO_CODEX_HOME ??
            join(homedir(), "Library/Application Support/MiniSago/codex-home"),
          NO_COLOR: "1",
        },
      },
    );
    const timer = setTimeout(() => child.kill(), 180_000);
    child.stdin.write(plan.context);
    child.stdin.end();
    const [events, errors, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    clearTimeout(timer);
    if (code !== 0)
      throw new Error(
        `Codex exited ${code}: ${errors.slice(-500)} ${events.slice(-500)}`,
      );
    const output = JSON.parse(await readFile(finalPath, "utf8"));
    if (
      !testCase.spoken &&
      output.reply &&
      /\p{Extended_Pictographic}/u.test(output.reply)
    )
      throw new Error("Generated reply contains inline emoji");
    return {
      id: testCase.id,
      request: testCase.request,
      promptHash: createHash("sha256")
        .update(
          plan.developerInstructions + plan.taskInstruction + plan.context,
        )
        .digest("hex"),
      model: profile.model,
      effort: profile.reasoningEffort,
      reply: output.reply,
      ...(output.artifacts ? { artifacts: output.artifacts } : {}),
      ...(output.files ? { files: output.files } : {}),
      calls,
    };
  } finally {
    host.stop(true);
  }
}

async function toolCatalog() {
  const noop = async () => ({});
  const handlers: any = {
    resolveContext: noop,
    calendar: { call: noop },
    drive: { call: noop },
    ccxpMeetings: { call: noop },
    discordCommands: { inspect: noop, sync: noop },
  };
  for (const key of [
    "listFeatureAvailability",
    "configureFeatureAvailability",
    "listManagedServices",
    "configureServiceSubscription",
    "readLink",
    "searchThreads",
    "manageServerMemory",
    "createReminder",
    "listReminders",
    "editReminder",
    "cancelReminder",
    "sendChannelMessage",
    "joinVoiceChannel",
    "leaveVoiceChannel",
    "updateCustomStatus",
    "listSharedGuilds",
    "listGuildEmojis",
    "addGuildExpression",
    "renameGuildEmoji",
    "readMessageReactions",
    "mentionMembers",
  ])
    handlers[key] = noop;
  const session = registerChatbotMcpSession(handlers, {
    featureAccess: () => ({ available: () => true, allowed: async () => true }),
  });
  const call = (method: string) =>
    handleChatbotMcpRequest(
      new Request("http://localhost/api/chatbot/mcp", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.token}`,
          "Content-Type": "application/json",
          Accept: "application/json, text/event-stream",
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method,
          params:
            method === "initialize"
              ? {
                  protocolVersion: "2025-03-26",
                  capabilities: {},
                  clientInfo: { name: "site-copy", version: "1" },
                }
              : {},
        }),
      }),
    );
  await call("initialize");
  const payload = await (await call("tools/list")).json();
  session.revoke();
  const catalog = new Map<string, Tool>(
    (payload.result.tools as Tool[]).map((tool) => [tool.name, tool]),
  );
  catalog.set("run_python", {
    name: "run_python",
    description:
      "Run bounded Python for request-local computation. If outputExtension is set, write one result to MINISAGO_OUTPUT_PATH and return its mediaId.",
    inputSchema: z.toJSONSchema(z.object(pythonToolSchema), {
      target: "draft-7",
    }),
  });
  catalog.set("generate_image", {
    name: "generate_image",
    description:
      "Generate or edit an image using request-local mediaIds; returns the completed image mediaId.",
    inputSchema: z.toJSONSchema(z.object(imageGenerationSchema), {
      target: "draft-7",
    }),
  });
  catalog.set("transform_image", {
    name: "transform_image",
    description:
      "Convert, resize, fit, or rotate request-scoped image media. Returns a mediaId that can be passed directly to another media or Discord tool.",
    inputSchema: {
      type: "object",
      properties: {
        mediaId: { type: "string" },
        width: { type: "integer" },
        height: { type: "integer" },
        format: { type: "string" },
      },
      required: ["mediaId"],
    },
  });
  catalog.set("search_files", {
    name: "search_files",
    description:
      "Search filenames in the owner's authorized Mac folders. Return matching paths and metadata only.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string" } },
      required: ["query"],
    },
  });
  for (const name of ["get_bus_stops", "get_next_buses"])
    catalog.set(name, {
      name,
      description:
        name === "get_bus_stops"
          ? "Get NTHU campus shuttle stops and route information."
          : "Get next NTHU campus shuttle departures for the requested route and date.",
      inputSchema: {
        type: "object",
        properties: {},
        additionalProperties: true,
      },
    });
  return catalog;
}
