import { createHash, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { parseEnv } from "node:util";
import { AuthRequired, CcxpSource } from "./source";
import { syncMeetings } from "./sync";

import {
  CcxpSyncQueue,
  type CcxpCollectorStatus,
} from "../../contracts/ccxp-sync";

// Taiwan has no daylight-saving transitions: 03:00 Asia/Taipei is 19:00 UTC.
export function nextNightly(now: number) {
  const next = new Date(now);
  next.setUTCHours(19, 0, 0, 0);
  if (next.getTime() <= now) next.setUTCDate(next.getUTCDate() + 1);
  return next.getTime();
}

function nextSync(now: number, pending: number) {
  return Math.min(nextNightly(now), pending ? now + 15 * 60000 : Infinity);
}

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
    queuePath?: string;
    now?: () => number;
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
  const now = options.now ?? Date.now;
  const queue = new CcxpSyncQueue(
    options.queuePath ??
      process.env.CCXP_SYNC_QUEUE_PATH ??
      "/control/requests.sqlite",
  );
  try {
    const statusPath = `${indexPath}.status.json`;
    const previous = (await readJson(statusPath)) as
      | CcxpCollectorStatus
      | undefined;
    const control = (await readJson(`${stateDir}/control.json`)) as
      | { fingerprint?: string; nextRunAt?: number; scheduleVersion?: number }
      | undefined;
    let source: Source | undefined;
    let fingerprint = "missing";
    let health: CcxpCollectorStatus;
    let nextRunAt = nextSync(now(), previous?.coverage?.pending ?? 0);
    const request = queue.active();
    try {
      const text = await readFile(credentialsPath, "utf8").catch(() => "");
      fingerprint = createHash("sha256").update(text).digest("hex");
      const unchanged = control?.fingerprint === fingerprint;
      if (
        unchanged &&
        previous?.state === "auth_required" &&
        !previous.running
      ) {
        if (request) queue.finish(request.id, "auth_required", now());
        return;
      }
      if (
        unchanged &&
        control?.scheduleVersion === 1 &&
        (control.nextRunAt ?? 0) > now() &&
        !request &&
        !previous?.running &&
        process.env.CCXP_FORCE_SYNC !== "true"
      )
        return;
      if (request) queue.start(request.id, now());
      await saveJson(statusPath, {
        ...previous,
        state: previous?.state ?? "unavailable",
        episode: previous?.episode ?? randomUUID(),
        updatedAt: previous?.updatedAt ?? new Date(now()).toISOString(),
        running: true,
        nextRunAt: new Date(nextRunAt).toISOString(),
      });
      // A restart must not turn a completed nightly run into another startup run.
      await saveJson(`${stateDir}/control.json`, {
        fingerprint,
        nextRunAt,
        scheduleVersion: 1,
      });
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
        coverage,
        updatedAt: new Date(now()).toISOString(),
        episode: randomUUID(),
      };
      nextRunAt = nextSync(now(), coverage.pending);
      console.log(JSON.stringify({ event: "ccxp_sync", ...coverage }));
    } catch (error) {
      const auth = error instanceof AuthRequired;
      health = {
        state: auth ? "auth_required" : "unavailable",
        coverage: previous?.coverage,
        updatedAt: new Date(now()).toISOString(),
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
    await saveJson(statusPath, {
      ...health,
      running: false,
      nextRunAt:
        health.state === "auth_required"
          ? null
          : new Date(nextRunAt).toISOString(),
    });
    await saveJson(`${stateDir}/control.json`, {
      fingerprint,
      nextRunAt,
      scheduleVersion: 1,
    });
    if (request)
      queue.finish(
        request.id,
        health.state === "healthy"
          ? "completed"
          : health.state === "auth_required"
            ? "auth_required"
            : "failed",
        now(),
      );
  } finally {
    queue.close();
  }
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
