import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseEnv } from "node:util";
import { AuthRequired, CcxpSource } from "./source";
import { syncMeetings } from "./sync";

type Health = {
  state: "healthy" | "auth_required" | "unavailable";
  updatedAt: string;
  episode: string;
  reason?: string;
};

async function readJson(path: string) {
  try {
    return JSON.parse(await readFile(path, "utf8"));
  } catch {
    return undefined;
  }
}
async function saveJson(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true, mode: 0o750 });
  await writeFile(`${path}.tmp`, JSON.stringify(value), { mode: 0o640 });
  await rename(`${path}.tmp`, path);
}

type Source = Pick<CcxpSource, "list" | "download" | "close">;
export async function collectOnce(
  options: {
    indexPath?: string;
    stateDir?: string;
    credentialsPath?: string;
    extensionPath?: string;
    openSource?: (
      input: Parameters<typeof CcxpSource.open>[0],
    ) => Promise<Source>;
    sync?: typeof syncMeetings;
  } = {},
) {
  const indexPath =
    options.indexPath ??
    process.env.CCXP_INDEX_PATH ??
    "/index/meetings.sqlite";
  const stateDir = options.stateDir ?? process.env.CCXP_STATE_DIR ?? "/state";
  const credentialsPath =
    options.credentialsPath ??
    process.env.CCXP_CREDENTIALS_FILE ??
    "/run/secrets/ccxp.env";
  const extensionPath = resolve(
    options.extensionPath ?? process.env.CCXP_EXTENSION_PATH ?? "/opt/ccxplite",
  );
  const statusPath = `${indexPath}.status.json`;
  const previous = (await readJson(statusPath)) as Health | undefined;
  const control = (await readJson(`${stateDir}/control.json`)) as
    | { fingerprint?: string; nextRunAt?: number }
    | undefined;
  let source: Source | undefined;
  let fingerprint = "missing";
  let health: Health;
  let nextRunAt = Date.now() + 15 * 60000;
  try {
    const text = await readFile(credentialsPath, "utf8").catch(() => "");
    fingerprint = createHash("sha256").update(text).digest("hex");
    if (
      control?.fingerprint === fingerprint &&
      (control.nextRunAt ?? 0) > Date.now() &&
      process.env.CCXP_FORCE_SYNC !== "true"
    )
      return;
    const env = parseEnv(text);
    if (!env.CCXP_ACCOUNT?.trim() || !env.CCXP_PASSWORD)
      throw new AuthRequired();
    source = await (options.openSource ?? CcxpSource.open)({
      stateDir,
      extensionPath,
      credentials: {
        account: env.CCXP_ACCOUNT.trim(),
        password: env.CCXP_PASSWORD,
      },
    });
    const coverage = await (options.sync ?? syncMeetings)(source, indexPath, {
      delayMs: 500,
    });
    health = {
      state: "healthy",
      updatedAt: new Date().toISOString(),
      episode: randomUUID(),
    };
    nextRunAt = Date.now() + (coverage.pending ? 15 * 60000 : 6 * 60 * 60000);
    console.log(JSON.stringify({ event: "ccxp_sync", ...coverage }));
  } catch (error) {
    const auth = error instanceof AuthRequired;
    health = {
      state: auth ? "auth_required" : "unavailable",
      updatedAt: new Date().toISOString(),
      episode:
        auth && previous?.state === "auth_required"
          ? previous.episode
          : randomUUID(),
      reason: auth ? error.reason : "sync_failed",
    };
    // An unchanged rejected password is never submitted again. Rotation is detected on the next poll.
    if (auth) nextRunAt = Number.MAX_SAFE_INTEGER;
    console.log(
      JSON.stringify({
        event: "ccxp_sync",
        state: health.state,
        reason: health.reason,
      }),
    );
  } finally {
    await source?.close().catch(() => {});
  }
  await saveJson(statusPath, health);
  await saveJson(`${stateDir}/control.json`, { fingerprint, nextRunAt });
}

if (import.meta.main) {
  do {
    try {
      await collectOnce();
    } catch {
      console.error("CCXP collector could not persist its state.");
    }
    if (process.argv.includes("--once")) break;
    await Bun.sleep(60000);
  } while (true);
}
