import { expect, test } from "bun:test";
import type { ServerWebSocket } from "bun";
import { macAgentBridge, type MacAgentSocketData } from "./bridge";
import { handleChatbotMention, postChatbotResponse } from "./chatbot";
import { handleChatbotMcpRequest } from "./mcp";
import { CHATBOT_PROTOCOL_VERSION } from "../../contracts/worker-contract";

test("cached reply placement avoids a GET and uses an explicit reply when unknown", async () => {
  for (const latest of [undefined, "request", "newer"]) {
    const calls: any[] = [];
    await postChatbotResponse(
      {
        id: "request",
        channel_id: "channel",
        timestamp: new Date().toISOString(),
      },
      "hi",
      async (path, options) => {
        calls.push({ path, ...options });
        return {} as never;
      },
      [],
      () => latest,
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].method).toBe("POST");
    expect(Boolean(calls[0].body.message_reference)).toBe(latest !== "request");
  }
});

test("typing does not block answering and a lazy trace can run during the answer", async () => {
  const oldSecret = process.env.MINISAGO_WORKER_BRIDGE_SECRET;
  const secret = "latency-test-secret-at-least-32-bytes";
  process.env.MINISAGO_WORKER_BRIDGE_SECRET = secret;
  const sent: any[] = [];
  let unblockTyping!: () => void;
  const typing = new Promise<void>((resolve) => {
    unblockTyping = resolve;
  });
  const socket = {
    data: { authenticated: false },
    send(text: string) {
      sent.push(JSON.parse(text));
    },
    close() {},
  } as unknown as ServerWebSocket<MacAgentSocketData>;
  macAgentBridge.open(socket);
  macAgentBridge.message(
    socket,
    JSON.stringify({
      type: "authenticate",
      protocolVersion: CHATBOT_PROTOCOL_VERSION,
      secret,
      workerId: process.env.MINISAGO_WORKER_ID || "oracle",
      repositories: ["sago-cream/mini-sago"],
    }),
  );
  macAgentBridge.message(
    socket,
    JSON.stringify({ type: "availability", available: true, capacity: 1 }),
  );
  const calls: string[] = [];
  const waitFor = async (purpose: string) => {
    for (let i = 0; i < 100; i++) {
      const job = sent.find(
        (item) => item.type === "job" && item.job.purpose === purpose,
      )?.job;
      if (job) return job;
      await Bun.sleep(1);
    }
    throw new Error(`Missing ${purpose}`);
  };
  try {
    const handled = handleChatbotMention({
      message: {
        id: "request",
        channel_id: "channel",
        content: "yo",
        timestamp: new Date().toISOString(),
        author: { id: "owner", username: "owner" },
      },
      botUserId: "bot",
      accessConfig: {
        ownerUserId: "owner",
        guildIds: new Set(),
        channelIds: new Set(),
        roleIds: new Set(),
      },
      discordRequest: async (path) => {
        calls.push(path);
        if (path.endsWith("/typing")) await typing;
        return [] as never;
      },
      executionOptions: {
        nonBlockingTyping: true,
        lazyPreviousTrace: true,
        latestMessageId: () => undefined,
        routeRequest: async () =>
          JSON.stringify({
            route: "chat",
            repository: null,
            threadTitle: null,
            reason: "test",
          }),
      },
    });
    const answer = await waitFor("answer");
    expect(sent.some((item) => item.job?.purpose === "trace_lookup")).toBe(
      false,
    );
    expect(sent.some((item) => item.job?.purpose === "execution_route")).toBe(
      false,
    );
    expect(calls.some((path) => path.endsWith("/typing"))).toBe(true);
    const resolve = () =>
      handleChatbotMcpRequest(
        new Request("http://localhost/mcp", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${answer.mcpAccessToken}`,
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
          },
          body: JSON.stringify({
            jsonrpc: "2.0",
            id: 1,
            method: "tools/call",
            params: {
              name: "resolve_context",
              arguments: {
                historyCount: 0,
                includePreviousTrace: true,
                queries: [],
                memberQueries: [],
              },
            },
          }),
        }),
      );
    const lookup = resolve();
    const trace = await waitFor("trace_lookup");
    macAgentBridge.message(
      socket,
      JSON.stringify({
        type: "result",
        jobId: trace.id,
        ok: true,
        content: '{"status":"not_found"}',
      }),
    );
    const response = await lookup;
    expect(await response.text()).toContain("not_found");
    expect(macAgentBridge.getStatus()).toBe("busy");
    await resolve();
    expect(
      sent.filter((item) => item.job?.purpose === "trace_lookup"),
    ).toHaveLength(1);
    macAgentBridge.message(
      socket,
      JSON.stringify({
        type: "result",
        jobId: answer.id,
        ok: true,
        content: JSON.stringify({
          reply: "yo",
          reaction: null,
          referenceResolution: [],
        }),
      }),
    );
    expect(await handled).toBe(true);
    expect(calls.some((path) => path.endsWith("messages?limit=1"))).toBe(false);
  } finally {
    unblockTyping();
    macAgentBridge.close(socket);
    if (oldSecret === undefined)
      delete process.env.MINISAGO_WORKER_BRIDGE_SECRET;
    else process.env.MINISAGO_WORKER_BRIDGE_SECRET = oldSecret;
  }
});
