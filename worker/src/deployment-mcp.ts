import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { requestMinisagoDeployment } from "../../scripts/deploy-socket";

// This process runs outside the coding shell sandbox. It exposes only the fixed
// deployment protocol, never a shell, arbitrary socket, channel, or repository.
export function createDeploymentServer(socketPath: string, channelId: string) {
  const server = new McpServer({
    name: "minisago-deployment",
    version: "1.0.0",
  });
  server.registerTool(
    "deploy_minisago",
    {
      description:
        "Request deployment of a full MiniSago commit SHA. Call only with explicit owner authorization to deploy this task. Acceptance is not deployment completion; the deployment service reports the final result in this Discord thread.",
      inputSchema: { commit: z.string().regex(/^[0-9a-f]{40}$/u) },
    },
    async ({ commit }) => ({
      content: [
        {
          type: "text",
          text: await requestMinisagoDeployment(socketPath, commit, channelId),
        },
      ],
    }),
  );
  return server;
}

if (import.meta.main) {
  const socket = process.env.MINISAGO_DEPLOY_SOCKET;
  const channel = process.env.MINISAGO_DISCORD_CHANNEL_ID;
  if (!socket || !channel)
    throw new Error("Deployment service configuration is missing.");
  await createDeploymentServer(socket, channel).connect(
    new StdioServerTransport(),
  );
}
