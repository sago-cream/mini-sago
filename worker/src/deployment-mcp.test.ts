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

test("deployment MCP pins the destination and accepts only a full commit", async () => {
  const root = await mkdtemp(join(tmpdir(), "deploy-mcp-"));
  const socket = join(root, "sock");
  const commit = "a".repeat(40);
  const requests: string[] = [];
  const server = createServer((connection) =>
    connection.once("data", (data) => {
      requests.push(data.toString());
      connection.end(`accepted ${commit}\n`);
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
          MINISAGO_DISCORD_CHANNEL_ID: "123456789012345678",
        },
        stderr: "pipe",
      }),
    );
    expect((await client.listTools()).tools.map((t) => t.name)).toEqual([
      "deploy_minisago",
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
    expect(requests).toEqual([`deploy ${commit} 123456789012345678\n`]);
  } finally {
    await client.close();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(root, { recursive: true, force: true });
  }
});
