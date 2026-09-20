import { expect, test } from "bun:test";
import { CodexAppServerManager } from "./codex-app-server";
import { warmThreadConfig } from "./codex";
const options = (id: string) => ({
  jobId: id,
  taskId: id,
  command: [
    process.execPath,
    `${import.meta.dir}/test-fixtures/fake-warm-codex.ts`,
  ],
  cwd: import.meta.dir,
  environment: { PATH: process.env.PATH! },
  model: "test",
  effort: "high",
  developerInstructions: id,
  prompt: id,
  imagePaths: [],
  threadConfig: { requestToken: id },
});
test("one runtime isolates fresh conversations and releases them; concurrent work falls back", async () => {
  const manager = new CodexAppServerManager();
  try {
    const first = manager.runWarm(options("first"));
    expect(await manager.runWarm(options("busy"))).toBeUndefined();
    const a = JSON.parse((await first)!);
    const pid = manager.warmStatus().pid;
    const b = JSON.parse((await manager.runWarm(options("second")))!);
    expect(manager.warmStatus()).toEqual({ pid, healthy: true, busy: false });
    expect(a.id).not.toBe(b.id);
    expect(a.config).toEqual({ requestToken: "first" });
    expect(b.config).toEqual({ requestToken: "second" });
    expect(b.developerInstructions).toBe("second");
    expect(b.ephemeral).toBe(false);
    expect(b.released).toBe(1);
    await expect(
      manager.runWarm({ ...options("failure"), cwd: "fail" }),
    ).rejects.toThrow("Simulated configuration failure");
    expect(manager.warmStatus().healthy).toBe(false);
    await manager.runWarm(options("replacement"));
    expect(manager.warmStatus().pid).not.toBe(pid);
  } finally {
    manager.close();
  }
});
test("warm MCP configuration binds each request's credentials instead of inheriting stale environment", () => {
  const args = [
    "--config",
    'mcp_servers.host={url="https://example.test/mcp",bearer_token_env_var="JOB_TOKEN"}',
    "--config",
    'mcp_servers.media={command="bun",env_vars=["MANIFEST"]}',
  ];
  const a = warmThreadConfig(args, { JOB_TOKEN: "first", MANIFEST: "/first" });
  const b = warmThreadConfig(args, {
    JOB_TOKEN: "second",
    MANIFEST: "/second",
  });
  expect(JSON.stringify(a)).toContain("Bearer first");
  expect(JSON.stringify(b)).toContain("Bearer second");
  expect(JSON.stringify(b)).not.toContain("first");
  expect(JSON.stringify(b)).toContain("/second");
  expect(JSON.stringify(b)).not.toContain("bearer_token_env_var");
});

test("prewarming initializes one runtime without starting a conversation", async () => {
  const manager = new CodexAppServerManager();
  try {
    await manager.prewarm(options("boot"));
    const pid = manager.warmStatus().pid;
    const result = JSON.parse((await manager.runWarm(options("first")))!);
    expect(manager.warmStatus().pid).toBe(pid);
    expect(result.id).toBe("fresh-1");
    expect(result.released).toBe(0);
  } finally {
    manager.close();
  }
});
