import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createServer } from "node:net";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  StdioClientTransport,
  getDefaultEnvironment,
} from "@modelcontextprotocol/sdk/client/stdio.js";

test("deployment MCP submits and reads status without Discord credentials", async () => {
  const root = await mkdtemp(join(tmpdir(), "deploy-mcp-"));
  const socket = join(root, "sock");
  const commit = "a".repeat(40);
  const requests: string[] = [];
  const server = createServer((connection) =>
    connection.once("data", (data) => {
      requests.push(data.toString());
      connection.end(
        data.toString().startsWith("status ")
          ? JSON.stringify({
              commit,
              status: "complete",
              exitCode: 0,
              updatedAt: "2026-11-14T00:00:00Z",
            }) + "\n"
          : `accepted ${commit}\n`,
      );
    }),
  );
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socket, resolve);
  });
  const client = new Client(
    { name: "deployment-test", version: "1" },
    { capabilities: {} },
  );
  try {
    await client.connect(
      new StdioClientTransport({
        command: process.execPath,
        args: [join(import.meta.dir, "deployment-mcp.ts")],
        env: {
          ...getDefaultEnvironment(),
          MINISAGO_DEPLOY_SOCKET: socket,
        },
        stderr: "pipe",
      }),
    );
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
      "deploy_minisago",
      "get_minisago_deployment",
    ]);
    expect(
      (
        await client.callTool({
          name: "deploy_minisago",
          arguments: { commit: "main" },
        })
      ).isError,
    ).toBe(true);
    expect(requests).toEqual([]);
    const response = await client.callTool({
      name: "deploy_minisago",
      arguments: { commit, channelId: "999999999999999999" },
    });
    expect(response.isError).not.toBe(true);
    expect(requests).toEqual([`deploy ${commit}\n`]);
    const status = await client.callTool({
      name: "get_minisago_deployment",
      arguments: { commit },
    });
    expect(status.isError).not.toBe(true);
    expect(requests.at(-1)).toBe(`status ${commit}\n`);
  } finally {
    await client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
