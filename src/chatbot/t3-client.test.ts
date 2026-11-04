import { expect, test } from "bun:test";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { T3Client, t3Projects } from "./t3-client";
import { T3OAuthProvider, t3Config } from "./t3-auth";

async function mcpFixture() {
  const root = await mkdtemp(join(tmpdir(), "minisago-t3-"));
  let fail = false;
  let initializations = 0;
  let releaseWait!: () => void;
  let beginWait!: () => void;
  const waiting = new Promise<void>((resolve) => {
    releaseWait = resolve;
  });
  const waitStarted = new Promise<void>((resolve) => {
    beginWait = resolve;
  });
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    async fetch(request) {
      const body = await request
        .clone()
        .json()
        .catch(() => undefined);
      if (body?.method === "initialize") initializations++;
      const mcp = new McpServer({ name: "t3-test", version: "1" });
      mcp.registerTool("t3_wait", { inputSchema: {} }, async () => {
        beginWait();
        await waiting;
        return { content: [{ type: "text" as const, text: '{"done":true}' }] };
      });
      mcp.registerTool(
        "t3_project_list",
        {
          inputSchema: {
            cursor: z.number().optional(),
            limit: z.number().optional(),
          },
        },
        async ({ cursor }) => {
          if (fail)
            return {
              isError: true,
              content: [{ type: "text" as const, text: "private diagnostic" }],
            };
          const result =
            cursor === 0
              ? {
                  projects: [
                    {
                      id: "a",
                      repositoryIdentity: {
                        locator: { remoteUrl: "git@github.com:owner/repo.git" },
                      },
                    },
                    {
                      id: "archived",
                      archivedAt: "2026-01-01",
                      repositoryIdentity: {
                        locator: {
                          remoteUrl: "https://github.com/owner/archived",
                        },
                      },
                    },
                  ],
                  nextCursor: 1,
                }
              : {
                  projects: [
                    {
                      id: "b",
                      repositoryIdentity: {
                        locator: {
                          remoteUrl: "https://github.com/owner/other.git",
                        },
                      },
                    },
                    {
                      id: "not-github",
                      repositoryIdentity: {
                        locator: {
                          remoteUrl: "https://gitlab.com/owner/third",
                        },
                      },
                    },
                  ],
                  nextCursor: null,
                };
          return {
            content: [{ type: "text" as const, text: JSON.stringify(result) }],
            structuredContent: result,
          };
        },
      );
      const transport = new WebStandardStreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
      await mcp.connect(transport);
      return transport.handleRequest(request);
    },
  });
  const client = new T3Client({
    url: `http://127.0.0.1:${server.port}/mcp`,
    credentialsPath: join(root, "auth.json"),
  });
  return {
    client,
    fail(value = true) {
      fail = value;
    },
    initializations: () => initializations,
    waitStarted,
    releaseWait: () => releaseWait(),
    async close() {
      releaseWait();
      await client.close();
      server.stop(true);
      await rm(root, { recursive: true, force: true });
    },
  };
}

test("uses standard MCP transport, structured results, and project pagination", async () => {
  const f = await mcpFixture();
  try {
    expect(await t3Projects(f.client)).toEqual([
      { id: "a", repository: "owner/repo" },
      { id: "b", repository: "owner/other" },
    ]);
  } finally {
    await f.close();
  }
});

test("does not expose a T3 tool error payload or retry failed mutations", async () => {
  const f = await mcpFixture();
  f.fail();
  try {
    await expect(f.client.call("t3_project_list", {})).rejects.toThrow(
      "Check the T3 session and connection permissions",
    );
  } finally {
    await f.close();
  }
});

test("rejects repeated project cursors rather than looping indefinitely", async () => {
  await expect(
    t3Projects({
      url: "https://t3.example/mcp",
      call: async () => ({ projects: [], nextCursor: 0 }),
    }),
  ).rejects.toThrow("invalid project cursor");
});

test("validates the endpoint without permitting credentials in its URL", () => {
  expect(t3Config({})).toBeUndefined();
  expect(t3Config({ MINISAGO_T3_URL: "http://localhost:3773" })!.url).toBe(
    "http://localhost:3773/mcp",
  );
  expect(
    t3Config({
      MINISAGO_T3_URL: "http://t3:3773/mcp",
      MINISAGO_T3_WEB_URL: "https://oracle.example:8443",
    })!.webUrl,
  ).toBe("https://oracle.example:8443");
  for (const url of [
    "http://public.example/mcp",
    "https://user:secret@example.com/mcp",
    "https://example.com/mcp?token=secret",
  ])
    expect(() => t3Config({ MINISAGO_T3_URL: url })).toThrow();
});

test("keeps a separate, private OAuth grant bound to the selected environment", async () => {
  const root = await mkdtemp(join(tmpdir(), "minisago-t3-oauth-"));
  const config = {
    url: "https://t3.example/mcp",
    credentialsPath: join(root, "private", "oauth.json"),
  };
  try {
    const provider = new T3OAuthProvider(config);
    provider.saveTokens({
      access_token: "private-token",
      token_type: "Bearer",
    });
    provider.saveCodeVerifier("private-verifier");
    expect((await stat(config.credentialsPath)).mode & 0o777).toBe(0o600);
    expect(new T3OAuthProvider(config).tokens()!.access_token).toBe(
      "private-token",
    );
    expect(
      () =>
        new T3OAuthProvider({ ...config, url: "https://other.example/mcp" }),
    ).toThrow("another environment");
    provider.invalidateCredentials("tokens");
    expect(await readFile(config.credentialsPath, "utf8")).not.toContain(
      "private-token",
    );
    expect(() => provider.redirectToAuthorization(new URL(config.url))).toThrow(
      "t3:login",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("a tool rejection preserves other calls and reuses the healthy connection", async () => {
  const f = await mcpFixture();
  try {
    const waiting = f.client.call("t3_wait", {}).then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
    await f.waitStarted;
    f.fail();
    await expect(f.client.call("t3_project_list", {})).rejects.toThrow(
      "Check the T3 session and connection permissions",
    );
    f.releaseWait();
    expect(await waiting).toEqual({ value: { done: true } });
    f.fail(false);
    expect(await t3Projects(f.client)).toHaveLength(2);
    expect(f.initializations()).toBe(1);
  } finally {
    await f.close();
  }
});
