import { expect, test } from "bun:test";
import OpenAI from "openai";
import { runOpenAIChat } from "./openai-chat";
import type { ChatbotMcpTraceCall } from "../../contracts/worker-contract";

const schema = {
  type: "object",
  additionalProperties: false,
  required: ["reply"],
  properties: { reply: { type: "string" } },
};
const options = {
  apiKey: "test-key",
  model: "gpt-6.1-sol",
  reasoningEffort: "medium" as const,
  instructions: "Answer as MiniSago.",
  prompt: "Find the plan.",
  schema,
};
function streamResponse(output: unknown[], text?: string) {
  const response = {
    id: "resp-test",
    object: "response",
    status: "completed",
    output,
  };
  const events: Record<string, unknown>[] = [
    {
      type: "response.created",
      response: { ...response, status: "in_progress", output: [] },
    },
  ];
  if (text)
    events.push(
      {
        type: "response.output_item.added",
        output_index: 0,
        item: {
          id: "msg-test",
          type: "message",
          role: "assistant",
          status: "in_progress",
          content: [],
        },
      },
      {
        type: "response.content_part.added",
        item_id: "msg-test",
        output_index: 0,
        content_index: 0,
        part: { type: "output_text", text: "", annotations: [] },
      },
      {
        type: "response.output_text.delta",
        item_id: "msg-test",
        output_index: 0,
        content_index: 0,
        delta: text,
      },
    );
  events.push({ type: "response.completed", response });
  return new Response(
    events
      .map(
        (event, index) =>
          `event: ${event.type}\ndata: ${JSON.stringify({ ...event, sequence_number: index })}\n\n`,
      )
      .join(""),
    { headers: { "Content-Type": "text/event-stream" } },
  );
}
const answer = (reply: string) => [
  {
    id: "msg-test",
    type: "message",
    role: "assistant",
    status: "completed",
    content: [{ type: "output_text", text: reply, annotations: [] }],
  },
];

test("uses API-key auth, stateless structured replies, and streamed text", async () => {
  const requests: any[] = [];
  const deltas: string[] = [];
  const client = new OpenAI({
    apiKey: "test-key",
    fetch: async (_url, init) => {
      expect(new Headers(init?.headers).get("Authorization")).toBe(
        "Bearer test-key",
      );
      requests.push(JSON.parse(String(init?.body)));
      return streamResponse(
        answer('{"reply":"我找到行程了"}'),
        '{"reply":"我找到行程了"}',
      );
    },
  });
  expect(
    await runOpenAIChat({
      ...options,
      client,
      webSearch: true,
      onTextDelta: (delta) => deltas.push(delta),
    }),
  ).toBe('{"reply":"我找到行程了"}');
  expect(deltas.join("")).toBe('{"reply":"我找到行程了"}');
  expect(requests[0]).toMatchObject({
    model: "gpt-6.1-sol",
    store: false,
    reasoning: { effort: "medium" },
    tools: [{ type: "web_search" }],
    text: { format: { type: "json_schema", strict: true, schema } },
  });
  expect(JSON.stringify(requests)).not.toContain("test-key");
});

test("runs only advertised MCP tools with request-bound context and preserves reasoning", async () => {
  const requests: any[] = [];
  const traces: ChatbotMcpTraceCall[] = [];
  const client = new OpenAI({
    apiKey: "test-key",
    fetch: async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      requests.push(body);
      if (requests.length === 1)
        return streamResponse([
          {
            id: "reasoning-test",
            type: "reasoning",
            summary: [],
            encrypted_content: "encrypted-test",
          },
          {
            type: "function_call",
            name: "minisago__lookup",
            call_id: "call-test",
            arguments: '{"query":"plan"}',
          },
        ]);
      expect(body.instructions).toContain("Respect the host-bound requester.");
      expect(body.input).toContainEqual({
        type: "function_call_output",
        call_id: "call-test",
        output: [
          {
            type: "input_text",
            text: '{"query":"plan","requester":"member-1"}',
          },
        ],
      });
      expect(
        body.input.some(
          (item: any) => item.encrypted_content === "encrypted-test",
        ),
      ).toBe(true);
      return streamResponse(answer('{"reply":"Found"}'));
    },
  });
  expect(
    await runOpenAIChat({
      ...options,
      client,
      servers: [
        {
          name: "minisago",
          command: process.execPath,
          args: [`${import.meta.dir}/test-fixtures/chat-mcp.ts`],
          env: { PATH: process.env.PATH!, TEST_REQUESTER: "member-1" },
        },
      ],
      onMcpToolCall: (call) => traces.push(call),
    }),
  ).toBe('{"reply":"Found"}');
  expect(traces).toEqual([
    { name: "lookup", arguments: { query: "plan" }, status: "complete" },
  ]);
  expect(requests).toHaveLength(2);
});

test("rejects unadvertised tools and exhausted API credit without a Codex fallback", async () => {
  const client = new OpenAI({
    apiKey: "test-key",
    fetch: async () =>
      streamResponse([
        {
          type: "function_call",
          name: "run_shell",
          call_id: "call-test",
          arguments: "{}",
        },
      ]),
  });
  await expect(runOpenAIChat({ ...options, client })).rejects.toThrow(
    "unadvertised tool",
  );
  const exhausted = new OpenAI({
    apiKey: "test-key",
    maxRetries: 0,
    fetch: async () =>
      Response.json(
        {
          error: {
            message: "No API credits remain",
            type: "insufficient_quota",
            code: "credit_balance_exhausted",
          },
        },
        { status: 429 },
      ),
  });
  await expect(
    runOpenAIChat({ ...options, client: exhausted }),
  ).rejects.toThrow("No API credits remain");
});

test("cancels before connecting tools or sending an API request", async () => {
  let calls = 0;
  const client = new OpenAI({
    apiKey: "test-key",
    fetch: async () => {
      calls++;
      return streamResponse(answer("{}"));
    },
  });
  const controller = new AbortController();
  controller.abort();
  await expect(
    runOpenAIChat({ ...options, client, signal: controller.signal }),
  ).rejects.toThrow();
  expect(calls).toBe(0);
});
