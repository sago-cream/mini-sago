import { describe, expect, test } from "bun:test";

import { PROMPT_CASES, type PromptCase, type PromptCaseSource } from "./cases";
import { evaluatePromptCase, type PromptCaseOutput } from "./evaluate";

const validOutput: PromptCaseOutput = {
  reply: "完成了",
  reaction: null,
  artifacts: [],
  referenceResolution: [],
};

describe("prompt evaluation cases", () => {
  test("cover the stratified production sample without identifying members", () => {
    const sampled = PROMPT_CASES.filter(
      (
        testCase,
      ): testCase is PromptCase & {
        source: Extract<PromptCaseSource, { kind: "stratified-v42-sample" }>;
      } => testCase.source.kind === "stratified-v42-sample",
    );
    expect(new Set(PROMPT_CASES.map(({ id }) => id)).size).toBe(
      PROMPT_CASES.length,
    );
    expect(
      new Set(sampled.map(({ source }) => source.guild)).size,
    ).toBeGreaterThanOrEqual(3);
    expect(
      new Set(sampled.map(({ source }) => source.requester)).size,
    ).toBeGreaterThanOrEqual(6);
    expect(
      new Set(sampled.map(({ source }) => source.task)).size,
    ).toBeGreaterThanOrEqual(8);
    expect(
      sampled.every(
        ({ source, job }) =>
          /^requester-\d+$/u.test(source.requester) &&
          job.requesterUserId === "prompt-eval-requester",
      ),
    ).toBe(true);
  });

  test("reports missing tools, inline emoji, and attachment contract failures", () => {
    const testCase = PROMPT_CASES.find(
      ({ id }) => id === "generated-attachment",
    )!;
    const failures = evaluatePromptCase(testCase, {
      output: { ...validOutput, reply: "傳好了 🙂" },
      tools: [],
      exitCode: 0,
    });

    expect(failures).toContain("Missing tool call: run_python");
    expect(failures).toContain("Reply contains inline emoji");
    expect(failures).toContain("Missing artifact: media-edited.webp");
  });

  test("accepts a complete media result", () => {
    const testCase = PROMPT_CASES.find(
      ({ id }) => id === "generated-attachment",
    )!;
    expect(
      evaluatePromptCase(testCase, {
        output: {
          ...validOutput,
          reply: "調亮後的版本在這裡",
          artifacts: ["media-edited.webp"],
        },
        tools: ["run_python"],
        exitCode: 0,
      }),
    ).toEqual([]);
  });

  test("requires recoverable actions and concrete blockers", () => {
    const recoverable = PROMPT_CASES.find(
      ({ id }) => id === "recover-bounded-action",
    )!;
    const blocked = PROMPT_CASES.find(
      ({ id }) => id === "blocked-bounded-action",
    )!;

    expect(
      evaluatePromptCase(recoverable, {
        output: validOutput,
        tools: [],
        exitCode: 0,
      }),
    ).toContain("Missing tool call: create_reminder");
    expect(
      evaluatePromptCase(blocked, {
        output: { ...validOutput, reply: "抱歉 我剛剛沒做到" },
        tools: [],
        exitCode: 0,
      }).some((failure) =>
        failure.startsWith("Reply did not name required detail"),
      ),
    ).toBe(true);
  });

  test("requires a retry to recover lost intent before transforming media", () => {
    const retry = PROMPT_CASES.find(({ id }) => id === "recover-retry-intent")!;

    const failures = evaluatePromptCase(retry, {
      output: { ...validOutput, reply: "你要我怎麼處理這張圖" },
      tools: [],
      exitCode: 0,
    });

    expect(failures).toContain("Missing tool call: resolve_context");
    expect(failures).toContain("Missing tool call: run_python");
    expect(failures).toContain(
      "Missing artifact: media-background-removed.png",
    );
    expect(
      failures.some((failure) =>
        failure.startsWith("Reply matched forbidden claim"),
      ),
    ).toBe(true);
  });

  test("requires guild member identification to search server context", () => {
    const identification = PROMPT_CASES.find(
      ({ id }) => id === "guild-member-identification",
    )!;

    expect(
      evaluatePromptCase(identification, {
        output: validOutput,
        tools: [],
        exitCode: 0,
      }),
    ).toContain("Missing tool call: resolve_context");
  });
});

test("evaluation host validates requests and distinguishes failed and completed actions", async () => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } =
    await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const { mkdtemp, readFile, rm, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const { startPromptEvalHost } = await import("./mock-mcp");
  const directory = await mkdtemp(join(tmpdir(), "minisago-eval-tools-"));
  const log = join(directory, "calls.jsonl");
  await writeFile(log, "");
  const host = startPromptEvalHost(log);
  const client = new Client({ name: "prompt-eval-test", version: "1.0.0" });
  try {
    await client.connect(
      new StreamableHTTPClientTransport(new URL(host.url), {
        requestInit: { headers: { Authorization: `Bearer ${host.token}` } },
      }),
    );
    const invalidSearch = await client.callTool({
      name: "resolve_context",
      arguments: { queries: [{ query: "budget" }] },
    });
    expect(invalidSearch.isError).toBe(true);
    const invalidReminder = await client.callTool({
      name: "create_reminder",
      arguments: { content: "draw" },
    });
    expect(invalidReminder.structuredContent).toMatchObject({
      status: "invalid",
    });
    const invalidMemory = await client.callTool({
      name: "manage_server_memory",
      arguments: { action: "replace", content: "a correction" },
    });
    expect(invalidMemory.structuredContent).toMatchObject({
      status: "invalid",
    });
    const unknownChannel = await client.callTool({
      name: "send_channel_message",
      arguments: { channel: "missing", content: "hi" },
    });
    expect(unknownChannel.structuredContent).toMatchObject({
      status: "invalid",
    });
    const rejected = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(rejected).toHaveLength(4);
    expect(rejected.every(({ success }) => !success)).toBe(true);
    const reminder = await client.callTool({
      name: "create_reminder",
      arguments: { content: " draw ", runAt: "2026-08-28T09:00:00+08:00" },
    });
    expect(reminder.structuredContent).toMatchObject({
      status: "complete",
      reminder: { content: "draw", nextRunAt: "2026-08-28T01:00:00.000Z" },
    });
    const accepted = JSON.parse(
      (await readFile(log, "utf8")).trim().split("\n").at(-1)!,
    );
    expect(accepted).toMatchObject({ tool: "create_reminder", success: true });
    const recoverable = PROMPT_CASES.find(
      ({ id }) => id === "recover-bounded-action",
    )!;
    expect(
      evaluatePromptCase(recoverable, {
        output: validOutput,
        tools: ["create_reminder"],
        successfulTools: [],
        exitCode: 0,
      }),
    ).toContain("Missing tool call: create_reminder");
    const blocked = PROMPT_CASES.find(
      ({ id }) => id === "blocked-bounded-action",
    )!;
    expect(
      evaluatePromptCase(blocked, {
        output: validOutput,
        tools: ["send_channel_message"],
        successfulTools: [],
        exitCode: 0,
      }),
    ).toContain("Unexpected tool call: send_channel_message");
  } finally {
    await client.close();
    host.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test("media evaluation validates arguments and records fixture delivery failures", async () => {
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } =
    await import("@modelcontextprotocol/sdk/client/stdio.js");
  const { mkdtemp, readFile, rm, writeFile } = await import("node:fs/promises");
  const { join } = await import("node:path");
  const { tmpdir } = await import("node:os");
  const directory = await mkdtemp(join(tmpdir(), "minisago-eval-media-"));
  const log = join(directory, "calls.jsonl");
  await writeFile(log, "");
  const client = new Client({
    name: "prompt-eval-media-test",
    version: "1.0.0",
  });
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [join(import.meta.dir, "mock-mcp.ts")],
        env: {
          MINISAGO_PROMPT_EVAL_CALL_LOG: log,
          MINISAGO_PROMPT_EVAL_MEDIA_ID: "media-edited.webp",
        },
        stderr: "pipe",
      }),
    );
    const invalid = await client.callTool({
      name: "run_python",
      arguments: { code: "", mediaIds: [] },
    });
    expect(invalid.isError).toBe(true);
    expect(await readFile(log, "utf8")).toBe("");
    const arguments_ = { code: "pass", mediaIds: [], outputExtension: "png" };
    const missing = await client.callTool({
      name: "run_python",
      arguments: arguments_,
    });
    expect(missing.structuredContent).toMatchObject({ status: "unavailable" });
    const delivered = await client.callTool({
      name: "run_python",
      arguments: { ...arguments_, outputExtension: "webp" },
    });
    expect(delivered.structuredContent).toMatchObject({
      status: "complete",
      mediaId: "media-edited.webp",
    });
    const calls = (await readFile(log, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line));
    expect(calls.map(({ success }) => success)).toEqual([false, true]);
  } finally {
    await client.close();
    await rm(directory, { recursive: true, force: true });
  }
});
