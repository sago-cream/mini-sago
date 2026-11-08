import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const server = new McpServer(
  { name: "chat-test", version: "1.0.0" },
  { instructions: "Respect the host-bound requester." },
);
server.registerTool(
  "lookup",
  {
    inputSchema: { query: z.string() },
  },
  async ({ query }) => ({
    content: [
      {
        type: "text",
        text: JSON.stringify({ query, requester: process.env.TEST_REQUESTER }),
      },
    ],
    structuredContent: { status: "complete" },
  }),
);
await server.connect(new StdioServerTransport());
