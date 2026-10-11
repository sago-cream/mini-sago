import { appendFileSync } from "node:fs";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  handleChatbotMcpRequest,
  registerChatbotMcpSession,
} from "../../../src/chatbot/mcp";
import type {
  ChatbotMemberResult,
  ChatbotMessage,
} from "../../../contracts/worker-contract";
import { pythonToolSchema } from "../media/python";

export type PromptEvalContext = {
  history?: Array<Pick<ChatbotMessage, "author" | "content">>;
  members?: Array<Pick<ChatbotMemberResult, "query" | "names" | "id">>;
  channels?: Array<{ name: string; id: string }>;
};

function record(path: string, tool: string, input: unknown, success = true) {
  appendFileSync(path, `${JSON.stringify({ tool, input, success })}\n`);
}

export function startPromptEvalHost(
  callLog: string,
  context: PromptEvalContext = {},
) {
  const session = registerChatbotMcpSession({
    resolveContext: async () => {
      return {
        history: {
          status: "complete",
          messages: (context.history ?? []).map((message, index) => ({
            ...message,
            id: `history-${index}`,
            timestamp: "2026-08-27T00:00:00.000Z",
            attachments: [],
          })),
        },
        search: { status: "not_requested", results: [] },
        members: {
          status: "complete",
          results: (context.members ?? []).map((member) => ({
            ...member,
            mention: `<@${member.id}>`,
            avatar: {
              mediaId: `avatar-${member.id}`,
              filename: "avatar.png",
              contentType: "image/png",
            },
          })),
        },
        previousTrace: { status: "not_requested" },
      };
    },
    manageServerMemory: async (input) => {
      return { revision: 2, action: input.action, entryId: "mem_012345abcdef" };
    },
    createReminder: async (input) => {
      return {
        id: "reminder-eval",
        ...input,
        nextRunAt: input.runAt ?? "2026-08-28T00:00:00.000Z",
      };
    },
    listReminders: async () => [],
    editReminder: async () => undefined,
    cancelReminder: async () => false,
    sendChannelMessage: async (input) => {
      const channel = context.channels?.find((channel) =>
        input.channelId
          ? channel.id === input.channelId
          : channel.name === input.channel,
      );
      if (!channel)
        throw new Error("No matching channel in the evaluation fixture.");
      return {
        id: "message-eval",
        channelId: channel.id,
        channelName: channel.name,
        guildId: "guild-eval",
        jumpUrl: `https://discord.com/channels/guild-eval/${channel.id}/message-eval`,
      };
    },
  });
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    async fetch(request) {
      const message =
        request.method === "POST" ? await request.clone().json() : undefined;
      const response = await handleChatbotMcpRequest(request);
      if (message?.method === "tools/call") {
        const body = await response.clone().json();
        const result = body.result;
        const status = result?.structuredContent?.status;
        record(
          callLog,
          message.params.name,
          message.params.arguments,
          Boolean(
            result && !result.isError && (!status || status === "complete"),
          ),
        );
      }
      return response;
    },
  });
  return {
    url: server.url.href,
    token: session.token,
    close() {
      session.revoke();
      server.stop(true);
    },
  };
}

if (import.meta.main) {
  const callLog = process.env.MINISAGO_PROMPT_EVAL_CALL_LOG;
  if (!callLog) throw new Error("MINISAGO_PROMPT_EVAL_CALL_LOG is required");
  const mediaId = process.env.MINISAGO_PROMPT_EVAL_MEDIA_ID;
  const server = new McpServer({
    name: "minisago-prompt-eval-media",
    version: "1.0.0",
  });
  server.registerTool(
    "run_python",
    {
      description:
        "Run bounded Python for request-local computation. If outputExtension is set, write one result to MINISAGO_OUTPUT_PATH and return its mediaId.",
      inputSchema: pythonToolSchema,
    },
    async (input) => {
      const success = Boolean(
        mediaId &&
        input.outputExtension &&
        mediaId.endsWith(`.${input.outputExtension}`),
      );
      record(callLog, "run_python", input, success);
      const value = success
        ? { status: "complete", mediaId }
        : {
            status: "unavailable",
            reason: "No matching media result in the evaluation fixture.",
          };
      return {
        content: [{ type: "text", text: JSON.stringify(value) }],
        structuredContent: value,
      };
    },
  );
  await server.connect(new StdioServerTransport());
}
