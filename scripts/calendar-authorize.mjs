import { createHash, randomBytes } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";

const [clientPath, outputPath] = process.argv.slice(2);
if (!clientPath || !outputPath) {
  console.error(
    "Usage: bun scripts/calendar-authorize.mjs CLIENT_JSON OUTPUT_JSON",
  );
  process.exit(1);
}
const expectedEmail =
  process.env.DISCORD_CALENDAR_ACCOUNT || "nthusa@gapp.nthu.edu.tw";
const expectedProject =
  process.env.DISCORD_CALENDAR_PROJECT_ID || "nthusa-discord-calendar";
const client = JSON.parse(readFileSync(clientPath, "utf8")).installed;
if (
  client?.project_id !== expectedProject ||
  !client.client_id ||
  !client.client_secret
)
  throw new Error(
    `Use the downloaded Desktop OAuth client for ${expectedProject}.`,
  );
// Reserve a private output file before requesting a new authorization.
writeFileSync(outputPath, "", { mode: 0o600, flag: "wx" });
const state = randomBytes(32).toString("base64url");
const verifier = randomBytes(48).toString("base64url");
let redirect;
let exchanging = false;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, redirect);
  if (
    req.method !== "GET" ||
    url.pathname !== "/callback" ||
    url.searchParams.get("state") !== state
  ) {
    res.writeHead(400).end("Invalid authorization callback.");
    return;
  }
  if (exchanging) {
    res.writeHead(409).end("Authorization is being processed.");
    return;
  }
  exchanging = true;
  try {
    const code = url.searchParams.get("code");
    if (!code || url.searchParams.has("error"))
      throw new Error("Authorization was not granted.");
    const response = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      body: new URLSearchParams({
        client_id: client.client_id,
        client_secret: client.client_secret,
        code,
        code_verifier: verifier,
        redirect_uri: redirect,
        grant_type: "authorization_code",
      }),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error("Google token exchange failed.");
    const token = await response.json();
    const identity = await fetch(
      "https://openidconnect.googleapis.com/v1/userinfo",
      {
        headers: { Authorization: `Bearer ${token.access_token}` },
        signal: AbortSignal.timeout(15000),
      },
    );
    const user = identity.ok ? await identity.json() : {};
    if (user.email !== expectedEmail || user.email_verified !== true)
      throw new Error(`Wrong Google account; authorize ${expectedEmail}.`);
    if (
      !token.refresh_token ||
      !token.scope
        ?.split(" ")
        .includes("https://www.googleapis.com/auth/calendar.events")
    )
      throw new Error("Offline Calendar access was not granted.");
    writeFileSync(
      outputPath,
      JSON.stringify({
        client_id: client.client_id,
        client_secret: client.client_secret,
        refresh_token: token.refresh_token,
        account: expectedEmail,
        scope: token.scope,
        ...(token.refresh_token_expires_in
          ? { refresh_token_expires_in: token.refresh_token_expires_in }
          : {}),
      }) + "\n",
      { mode: 0o600 },
    );
    res
      .writeHead(200, {
        "Content-Type": "text/plain; charset=utf-8",
        "Cache-Control": "no-store",
        "Referrer-Policy": "no-referrer",
      })
      .end("Calendar authorization saved securely. You can close this tab.");
    console.log(
      `Authorized ${expectedEmail}; credentials saved to the requested private file.`,
    );
    if (token.refresh_token_expires_in)
      console.warn(
        "Google returned a time-limited refresh token; inspect account policy and OAuth publishing status before deploying.",
      );
  } catch (error) {
    res
      .writeHead(400, {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store",
      })
      .end(error.message);
    console.error(error.message);
    process.exitCode = 1;
  } finally {
    clearTimeout(timeout);
    server.close();
  }
});
const timeout = setTimeout(() => {
  console.error("Authorization timed out.");
  server.close();
  process.exitCode = 1;
}, 15 * 60000);
server.listen(0, "127.0.0.1", () => {
  redirect = `http://127.0.0.1:${server.address().port}/callback`;
  const parameters = new URLSearchParams({
    client_id: client.client_id,
    redirect_uri: redirect,
    response_type: "code",
    scope: "openid email https://www.googleapis.com/auth/calendar.events",
    access_type: "offline",
    prompt: "consent",
    login_hint: expectedEmail,
    state,
    code_challenge: createHash("sha256").update(verifier).digest("base64url"),
    code_challenge_method: "S256",
  });
  console.log(
    `Open in your browser:\nhttps://accounts.google.com/o/oauth2/v2/auth?${parameters}`,
  );
});
