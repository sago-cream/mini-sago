import OpenAI from "openai";
import { toResponseInputItems } from "openai/lib/responses/ResponseInputItems";
import type {
  ResponseInput,
  ResponseInputContent,
  Tool,
} from "openai/resources/responses/responses";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import type { ChatbotMcpTraceCall } from "../../contracts/worker-contract";

export type ChatToolServer = {
  name: string;
  url?: string;
  token?: string;
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  optional?: boolean;
};

type ChatOptions = {
  apiKey: string;
  model: string;
  reasoningEffort: "low" | "medium" | "high";
  instructions: string;
  prompt: string;
  schema: Record<string, unknown>;
  imagePaths?: string[];
  servers?: ChatToolServer[];
  webSearch?: boolean;
  onTextDelta?: (delta: string) => void;
  onMcpToolCall?: (call: ChatbotMcpTraceCall) => void;
  signal?: AbortSignal;
  client?: OpenAI;
};

type BoundTool = { client: Client; name: string };
const MAX_TOOL_ROUNDS = 24;

/** The model only sees advertised tools; request-bound MCP hosts authorize every call. */
export async function runOpenAIChat(options: ChatOptions): Promise<string> {
  const openai = options.client ?? new OpenAI({ apiKey: options.apiKey });
  const clients: Client[] = [];
  const tools: Tool[] = options.webSearch ? [{ type: "web_search" }] : [];
  const boundTools = new Map<string, BoundTool>();
  const serverInstructions: string[] = [];
  try {
    for (const server of options.servers ?? []) {
      options.signal?.throwIfAborted();
      const client = new Client({ name: "minisago-chat", version: "1.0.0" });
      clients.push(client);
      const serverTools: Tool[] = [];
      const bindings = new Map<string, BoundTool>();
      try {
        const transport = server.url
          ? new StreamableHTTPClientTransport(new URL(server.url), {
              requestInit: {
                ...(server.token
                  ? { headers: { Authorization: `Bearer ${server.token}` } }
                  : {}),
              },
            })
          : new StdioClientTransport({
              command: server.command!,
              args: server.args,
              env: server.env,
              stderr: "ignore",
            });
        await client.connect(transport, {
          signal: options.signal,
          timeout: 10_000,
        });
        const instructions = client.getInstructions();
        let cursor: string | undefined;
        do {
          const listing = await client.listTools(cursor ? { cursor } : {}, {
            signal: options.signal,
            timeout: 10_000,
          });
          for (const tool of listing.tools) {
            const name = `${server.name}__${tool.name}`;
            if (name.length > 64 || !/^[a-zA-Z0-9_-]+$/u.test(name))
              throw new Error("MCP tool name is not supported by the API.");
            if (boundTools.has(name) || bindings.has(name))
              throw new Error("Duplicate MCP tool name.");
            serverTools.push({
              type: "function",
              name,
              description: tool.description ?? tool.name,
              parameters: tool.inputSchema,
              // MCP schemas retain optional fields and are validated by the host.
              strict: false,
            });
            bindings.set(name, { client, name: tool.name });
          }
          cursor = listing.nextCursor;
        } while (cursor);
        tools.push(...serverTools);
        for (const [name, tool] of bindings) boundTools.set(name, tool);
        if (instructions) serverInstructions.push(instructions);
      } catch (error) {
        await client.close().catch(() => undefined);
        if (!server.optional || options.signal?.aborted) throw error;
        console.warn(`Optional chat tool server ${server.name} unavailable.`);
      }
    }

    const content: ResponseInputContent[] = [
      { type: "input_text", text: options.prompt },
    ];
    for (const path of options.imagePaths ?? []) {
      const file = Bun.file(path);
      content.push({
        type: "input_image",
        image_url: `data:${file.type};base64,${Buffer.from(await file.arrayBuffer()).toString("base64")}`,
        detail: "auto",
      });
    }
    const input: ResponseInput = [{ role: "user", content }];
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      options.signal?.throwIfAborted();
      const stream = openai.responses.stream(
        {
          model: options.model,
          instructions: [options.instructions, ...serverInstructions].join(
            "\n\n",
          ),
          input,
          tools,
          // Retain encrypted reasoning locally for stateless tool continuations.
          store: false,
          include: ["reasoning.encrypted_content"],
          reasoning: { effort: options.reasoningEffort },
          parallel_tool_calls: false,
          text: {
            verbosity: "medium",
            format: {
              type: "json_schema",
              name: "minisago_reply",
              schema: options.schema,
              strict: true,
            },
          },
        },
        { signal: options.signal },
      );
      stream.on("response.output_text.delta", (event) =>
        options.onTextDelta?.(event.delta),
      );
      const response = await stream.finalResponse();
      if (response.status !== "completed")
        throw new Error(`OpenAI chat response ${response.status}.`);
      const calls = response.output.filter(
        (item) => item.type === "function_call",
      );
      if (!calls.length) {
        if (!response.output_text)
          throw new Error("OpenAI chat returned no answer.");
        return response.output_text;
      }
      input.push(...toResponseInputItems(response.output));
      for (const call of calls) {
        options.signal?.throwIfAborted();
        const tool = boundTools.get(call.name);
        if (!tool) throw new Error("OpenAI requested an unadvertised tool.");
        const args: unknown = JSON.parse(call.arguments);
        if (!args || typeof args !== "object" || Array.isArray(args))
          throw new Error("OpenAI returned invalid tool arguments.");
        const arguments_ = args as Record<string, unknown>;
        const result = CallToolResultSchema.parse(
          await tool.client.callTool(
            { name: tool.name, arguments: arguments_ },
            CallToolResultSchema,
            { signal: options.signal, timeout: 270_000 },
          ),
        );
        const structured = result.structuredContent as
          | Record<string, unknown>
          | undefined;
        options.onMcpToolCall?.({
          name: tool.name,
          arguments: arguments_,
          ...(typeof structured?.status === "string"
            ? { status: structured.status }
            : {}),
        });
        const output: ResponseInputContent[] = [];
        for (const block of result.content) {
          if (block.type === "text")
            output.push({ type: "input_text", text: block.text });
          else if (block.type === "image")
            output.push({
              type: "input_image",
              image_url: `data:${block.mimeType};base64,${block.data}`,
              detail: "auto",
            });
        }
        if (!output.length)
          output.push({ type: "input_text", text: JSON.stringify(result) });
        if (result.isError)
          output.unshift({
            type: "input_text",
            text: "Tool execution failed.",
          });
        input.push({
          type: "function_call_output",
          call_id: call.call_id,
          output,
        });
      }
    }
    throw new Error("OpenAI chat exceeded its tool-call limit.");
  } finally {
    await Promise.allSettled(clients.map((client) => client.close()));
  }
}
