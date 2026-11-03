import type { OAuthClientProvider } from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationMixed,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import {
  chmodSync,
  mkdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname } from "node:path";
import { isIP } from "node:net";
import { randomUUID } from "node:crypto";

export type T3Config = {
  url: string;
  credentialsPath: string;
  webUrl?: string;
};

export function t3Config(environment = process.env): T3Config | undefined {
  const configured = environment.MINISAGO_T3_URL?.trim();
  if (!configured) return undefined;
  const url = new URL(configured);
  const hostname = url.hostname.replace(/^\[|\]$/gu, "");
  const local =
    ["localhost", "127.0.0.1", "::1"].includes(hostname) ||
    (isIP(hostname) === 0 &&
      !hostname.includes(".") &&
      !hostname.includes(":"));
  if (
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    (url.protocol !== "https:" && !(url.protocol === "http:" && local))
  )
    throw new Error(
      "MINISAGO_T3_URL must be an HTTPS MCP URL, or HTTP on a local/container-local host, without embedded credentials.",
    );
  if (url.pathname === "/") url.pathname = "/mcp";
  const webUrl = environment.MINISAGO_T3_WEB_URL?.trim();
  if (webUrl) {
    const web = new URL(webUrl);
    if (
      web.protocol !== "https:" ||
      web.username ||
      web.password ||
      web.search ||
      web.hash ||
      web.pathname !== "/"
    )
      throw new Error(
        "MINISAGO_T3_WEB_URL must be an HTTPS origin without credentials.",
      );
  }
  return {
    url: url.toString(),
    ...(webUrl ? { webUrl: new URL(webUrl).origin } : {}),
    credentialsPath:
      environment.MINISAGO_T3_CREDENTIALS_PATH?.trim() ||
      (environment.NODE_ENV === "production"
        ? "/app/state/t3/oauth.json"
        : ".data/t3/oauth.json"),
  };
}

type Credentials = {
  serverUrl: string;
  redirectUrl: string;
  client?: OAuthClientInformationMixed;
  tokens?: OAuthTokens;
  verifier?: string;
};

/** A separate, revocable T3 client grant. Never reuse an agent's session token. */
export class T3OAuthProvider implements OAuthClientProvider {
  private value: Credentials;
  private readonly stateValue = randomUUID();

  constructor(
    private config: T3Config,
    private authorize?: (url: URL) => void,
    redirectUrl = "http://127.0.0.1:38471/callback",
  ) {
    try {
      this.value = JSON.parse(readFileSync(config.credentialsPath, "utf8"));
      if (this.value.serverUrl !== config.url)
        throw new Error(
          "The saved T3 grant belongs to another environment. Run bun run t3:login.",
        );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      this.value = { serverUrl: config.url, redirectUrl };
    }
  }
  get redirectUrl() {
    return this.value.redirectUrl;
  }
  get clientMetadata() {
    return {
      client_name: "MiniSago Discord coding",
      redirect_uris: [this.redirectUrl],
      grant_types: ["authorization_code"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
    };
  }
  state() {
    return this.stateValue;
  }
  clientInformation() {
    return this.value.client;
  }
  saveClientInformation(client: OAuthClientInformationMixed) {
    this.value.client = client;
    this.save();
  }
  tokens() {
    return this.value.tokens;
  }
  saveTokens(tokens: OAuthTokens) {
    this.value.tokens = tokens;
    this.save();
  }
  saveCodeVerifier(verifier: string) {
    this.value.verifier = verifier;
    this.save();
  }
  codeVerifier() {
    if (!this.value.verifier)
      throw new Error("T3 sign-in has no code verifier.");
    return this.value.verifier;
  }
  redirectToAuthorization(url: URL) {
    if (!this.authorize)
      throw new Error(
        "T3 sign-in required. Run bun run t3:login on the bot host.",
      );
    this.authorize(url);
  }
  invalidateCredentials(
    scope: "all" | "client" | "tokens" | "verifier" | "discovery",
  ) {
    if (scope === "all" || scope === "client") delete this.value.client;
    if (scope === "all" || scope === "tokens") delete this.value.tokens;
    if (scope === "all" || scope === "verifier") delete this.value.verifier;
    this.save();
  }
  private save() {
    mkdirSync(dirname(this.config.credentialsPath), {
      recursive: true,
      mode: 0o700,
    });
    const temporary = `${this.config.credentialsPath}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.value), { mode: 0o600 });
    chmodSync(temporary, 0o600);
    renameSync(temporary, this.config.credentialsPath);
  }
}
