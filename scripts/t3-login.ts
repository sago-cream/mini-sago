import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { UnauthorizedError } from "@modelcontextprotocol/sdk/client/auth.js";
import { T3OAuthProvider, t3Config } from "../src/chatbot/t3-auth";

const config = t3Config();
if (!config)
  throw new Error("Set MINISAGO_T3_URL to the environment's MCP URL first.");
const callback = Promise.withResolvers<string>();
const provider = new T3OAuthProvider(config, (url) =>
  console.log(`Approve MiniSago's access in your browser:\n${url}`),
);
const redirect = new URL(provider.redirectUrl);
const server = Bun.serve({
  hostname: "127.0.0.1",
  port: Number(redirect.port),
  fetch(request) {
    const url = new URL(request.url);
    if (url.pathname !== redirect.pathname)
      return new Response("Not found", { status: 404 });
    if (url.searchParams.get("state") !== provider.state())
      return new Response("Invalid state", { status: 400 });
    const code = url.searchParams.get("code");
    if (!code) {
      callback.reject(new Error("T3 sign-in declined."));
      return new Response("Sign-in declined", { status: 400 });
    }
    callback.resolve(code);
    return new Response("MiniSago sign-in received. You can close this page.");
  },
});
const client = new Client({ name: "minisago-discord", version: "1" });
const transport = new StreamableHTTPClientTransport(new URL(config.url), {
  authProvider: provider,
});
try {
  try {
    await client.connect(transport);
  } catch (error) {
    if (!(error instanceof UnauthorizedError)) throw error;
    const code = await Promise.race([
      callback.promise,
      new Promise<never>((_, reject) =>
        setTimeout(
          () => reject(new Error("T3 sign-in timed out.")),
          10 * 60_000,
        ).unref(),
      ),
    ]);
    await transport.finishAuth(code);
    await client.connect(transport);
  }
  await client.callTool({ name: "t3_project_list", arguments: { limit: 1 } });
  console.log(
    `T3 connected. Private credentials saved to ${config.credentialsPath}.`,
  );
} finally {
  server.stop(true);
  await client.close();
}
