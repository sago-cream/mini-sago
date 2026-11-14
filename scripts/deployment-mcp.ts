import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import {
  getMinisagoDeployment,
  requestMinisagoDeployment,
} from "./deploy-socket";

// The host exposes only the fixed deployment protocol, never a shell or Docker access.
export function createDeploymentServer(socketPath: string) {
  const server = new McpServer({
    name: "minisago-deployment",
    version: "2.0.0",
  });
  const inputSchema = { commit: z.string().regex(/^[0-9a-f]{40}$/u) };
  server.registerTool(
    "deploy_minisago",
    {
      description:
        "Deploy the current merged MiniSago main commit, only with explicit owner authorization. When CD is enabled, merging main already schedules deployment; read status instead of submitting a duplicate. Acceptance is not completion. T3 stays running: use get_minisago_deployment until complete or failed and report the result in your reply, which the Discord relay delivers after the bot reconnects.",
      inputSchema,
    },
    async ({ commit }) => ({
      content: [
        {
          type: "text",
          text: await requestMinisagoDeployment(socketPath, commit),
        },
      ],
    }),
  );
  server.registerTool(
    "get_minisago_deployment",
    {
      description:
        "Read the host deployment status for a full MiniSago commit SHA. Complete means core and chat worker passed their container health checks. Reading status never starts or retries deployment.",
      inputSchema,
    },
    async ({ commit }) => ({
      content: [
        {
          type: "text",
          text: JSON.stringify(await getMinisagoDeployment(socketPath, commit)),
        },
      ],
    }),
  );
  return server;
}

if (import.meta.main) {
  const socket = process.env.MINISAGO_DEPLOY_SOCKET;
  if (!socket) throw new Error("Deployment service configuration is missing.");
  await createDeploymentServer(socket).connect(new StdioServerTransport());
}
