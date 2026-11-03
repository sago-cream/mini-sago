import { homedir, hostname } from "node:os";
import { isIP } from "node:net";
import { isAbsolute, join, resolve } from "node:path";
import { resolveCodexPath } from "./codex-path";

import {
  getChatbotAccessConfig,
  type ChatbotAccessConfig,
} from "../../src/chatbot/access";

export type MacAgentConfig = {
  bridgeUrl: string;
  bridgeSecret: string;
  codexHome: string;
  codexPath: string;
  deploySocketPath?: string;
  githubConfigDir: string;
  chatbotAccess: ChatbotAccessConfig;
  maxConcurrentJobs: number;
  macFileRoots: string[];
  mcpUrl: string;
  sandboxUrl: string;
  headless: boolean;
  sessionMonitorPath: string;
  skillbookRepository?: string;
  skillbookSyncIntervalMs: number;
  traceDatabasePath: string;
  workspaceRoot: string;
  workerId: string;
};

const defaultApplicationSupport =
  process.platform === "darwin"
    ? join(homedir(), "Library", "Application Support", "MiniSago")
    : join(homedir(), ".local", "state", "minisago");

export function macFileRoots(
  configured = process.env.MINISAGO_MAC_FILE_ROOTS,
  home = homedir(),
) {
  const defaults = [
    "Desktop",
    "Documents",
    "Downloads",
    "Movies",
    "Music",
    "Pictures",
    join("Library", "Mobile Documents", "com~apple~CloudDocs"),
  ].map((path) => join(home, path));
  const candidates = configured?.trim()
    ? configured.split(":").map((path) => path.trim())
    : defaults;

  return [
    ...new Set(candidates.filter(isAbsolute).map((path) => resolve(path))),
  ];
}

export function deploySocketPath(
  configured = process.env.MINISAGO_DEPLOY_SOCKET,
) {
  const path = configured?.trim();
  if (!path) return undefined;
  if (!isAbsolute(path)) {
    throw new Error("MINISAGO_DEPLOY_SOCKET must be an absolute path.");
  }
  return resolve(path);
}

export function configuredSkillbookRepository(
  headless: boolean,
  configured = process.env.MINISAGO_SKILLBOOK_REPOSITORY,
) {
  return configured?.trim() || (headless ? "sago-cream/skills" : undefined);
}

export function validateBridgeUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/gu, "");
  const ipVersion = isIP(hostname);
  const isLocal =
    ["localhost", "127.0.0.1", "::1"].includes(hostname) ||
    (ipVersion === 0 && !hostname.includes(".") && !hostname.includes(":"));

  if (url.protocol !== "wss:" && !(isLocal && url.protocol === "ws:")) {
    throw new Error(
      "MINISAGO_BRIDGE_URL must use wss:// unless it is local or container-local.",
    );
  }

  return url.toString();
}

export function validateMcpUrl(value: string) {
  const url = new URL(value);
  const hostname = url.hostname.replace(/^\[|\]$/gu, "");
  const ipVersion = isIP(hostname);
  const isLocal =
    ["localhost", "127.0.0.1", "::1"].includes(hostname) ||
    (ipVersion === 0 && !hostname.includes(".") && !hostname.includes(":"));

  if (url.protocol !== "https:" && !(isLocal && url.protocol === "http:")) {
    throw new Error(
      "MINISAGO_MCP_URL must use https:// unless it is local or container-local.",
    );
  }

  return url.toString();
}

function defaultMcpUrl(bridgeUrl: string) {
  const url = new URL(bridgeUrl);
  url.protocol = url.protocol === "wss:" ? "https:" : "http:";
  url.pathname = "/api/chatbot/mcp";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export async function loadMacAgentConfig(): Promise<MacAgentConfig> {
  const chatbotAccess = getChatbotAccessConfig();
  const bridgeSecret = process.env.MINISAGO_MAC_BRIDGE_SECRET?.trim();

  if (!bridgeSecret || Buffer.byteLength(bridgeSecret) < 32) {
    throw new Error(
      "MINISAGO_MAC_BRIDGE_SECRET must contain at least 32 bytes.",
    );
  }

  const headless =
    process.env.MINISAGO_HEADLESS === "true" || process.platform !== "darwin";
  const defaultWorkerId = `${headless ? "cloud" : "mac"}-${hostname()}`
    .toLowerCase()
    .replace(/[^a-z0-9._-]/g, "-")
    .slice(0, 64);
  const workerId = process.env.MINISAGO_WORKER_ID?.trim() || defaultWorkerId;
  if (!/^[a-z0-9][a-z0-9._-]{0,63}$/u.test(workerId)) {
    throw new Error("MINISAGO_WORKER_ID must be a safe 1-64 character ID.");
  }
  const githubConfigDir =
    process.env.MINISAGO_GITHUB_CONFIG_DIR?.trim() ||
    join(defaultApplicationSupport, "github");
  const workspaceRoot =
    process.env.MINISAGO_WORKSPACE_ROOT?.trim() || join(homedir(), "Projects");
  const bridgeUrl = validateBridgeUrl(
    process.env.MINISAGO_BRIDGE_URL?.trim() ||
      "wss://bot.hsichen.dev/api/mac-agent/ws",
  );

  return {
    bridgeUrl,
    bridgeSecret,
    codexHome:
      process.env.MINISAGO_CODEX_HOME?.trim() ||
      join(defaultApplicationSupport, "codex-home"),
    codexPath: await resolveCodexPath(),
    deploySocketPath: deploySocketPath(),
    githubConfigDir,
    chatbotAccess,
    headless,
    maxConcurrentJobs: Math.max(
      1,
      Math.min(
        16,
        Number.parseInt(process.env.MINISAGO_MAX_CONCURRENT_JOBS || "2", 10) ||
          2,
      ),
    ),
    macFileRoots: macFileRoots(),
    mcpUrl: validateMcpUrl(
      process.env.MINISAGO_MCP_URL?.trim() || defaultMcpUrl(bridgeUrl),
    ),
    sandboxUrl: validateMcpUrl(
      process.env.MINISAGO_SANDBOX_URL?.trim() || "http://sandbox:8080",
    ),
    sessionMonitorPath:
      process.env.MINISAGO_SESSION_MONITOR_PATH?.trim() ||
      join(defaultApplicationSupport, "bin", "session-monitor"),
    skillbookRepository: configuredSkillbookRepository(headless),
    skillbookSyncIntervalMs: Math.max(
      60_000,
      Number.parseInt(
        process.env.MINISAGO_SKILLBOOK_SYNC_INTERVAL_MS || "900000",
        10,
      ) || 900_000,
    ),
    traceDatabasePath:
      process.env.MINISAGO_TRACE_DATABASE_PATH?.trim() ||
      join(defaultApplicationSupport, "traces.sqlite"),
    workspaceRoot,
    workerId,
  };
}
