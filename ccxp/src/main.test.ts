import { CcxpSyncQueue } from "../../contracts/ccxp-sync";
import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { collectOnce } from "./main";
import { AuthRequired } from "./source";

test("rejected credentials pause login across restarts; file rotation resumes and clears health", async () => {
  const root = await mkdtemp(join(tmpdir(), "ccxp-rotation-"));
  try {
    const indexPath = join(root, "index.sqlite");
    const credentialsPath = join(root, "ccxp.env");
    await writeFile(
      credentialsPath,
      "CCXP_ACCOUNT=test\nCCXP_PASSWORD=old-password\n",
    );
    let opens = 0,
      closes = 0;
    const options = {
      indexPath,
      queuePath: join(root, "control/requests.sqlite"),
      credentialsPath,
      stateDir: join(root, "state"),
      openSource: async (input: { credentials: { password: string } }) => {
        opens++;
        if (input.credentials.password !== "new-password")
          throw new AuthRequired("password_expired");
        return {
          list: async () => [],
          download: async () => ({ bytes: new Uint8Array(), contentType: "" }),
          close: async () => {
            closes++;
          },
        };
      },
      sync: async () => ({
        checkedAt: new Date().toISOString(),
        listed: 1,
        indexed: 1,
        pending: 0,
        empty: 0,
        unsupported: 0,
      }),
    };
    await collectOnce(options);
    const blocked = await Bun.file(`${indexPath}.status.json`).json();
    expect(blocked).toMatchObject({
      state: "auth_required",
      reason: "password_expired",
    });
    await collectOnce(options);
    expect(opens).toBe(1);
    await writeFile(
      credentialsPath,
      "CCXP_ACCOUNT=test\nCCXP_PASSWORD=another-old-password\n",
    );
    await collectOnce(options);
    expect(opens).toBe(2);
    expect((await Bun.file(`${indexPath}.status.json`).json()).episode).toBe(
      blocked.episode,
    );
    await writeFile(
      credentialsPath,
      "CCXP_ACCOUNT=test\nCCXP_PASSWORD=new-password\n",
    );
    await collectOnce(options);
    expect(opens).toBe(3);
    expect(closes).toBe(1);
    expect((await Bun.file(`${indexPath}.status.json`).json()).state).toBe(
      "healthy",
    );
    await collectOnce(options);
    expect(opens).toBe(3);
    expect(await Bun.file(`${indexPath}.status.json`).text()).not.toContain(
      "password=",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("nightly schedule survives polls/restarts and downtime; manual sync runs early and recovers interrupted requests", async () => {
  const root = await mkdtemp(join(tmpdir(), "ccxp-nightly-"));
  const queuePath = join(root, "control/requests.sqlite");
  const queue = new CcxpSyncQueue(queuePath);
  try {
    let time = Date.parse("2026-09-24T10:00:00Z");
    const indexPath = join(root, "index.sqlite");
    const credentialsPath = join(root, "ccxp.env");
    await writeFile(credentialsPath, "CCXP_ACCOUNT=test\nCCXP_PASSWORD=test\n");
    let syncs = 0,
      fail = false;
    const options = {
      indexPath,
      credentialsPath,
      queuePath,
      stateDir: join(root, "state"),
      now: () => time,
      openSource: async () => ({
        list: async () => [],
        download: async () => ({ bytes: new Uint8Array(), contentType: "" }),
        close: async () => {},
      }),
      sync: async () => {
        syncs++;
        if (fail) throw new Error("unavailable");
        return {
          checkedAt: new Date(time).toISOString(),
          listed: 3,
          indexed: 1,
          pending: 2,
          empty: 0,
          unsupported: 0,
        };
      },
    };
    await collectOnce(options);
    expect(syncs).toBe(1);
    const status = () => Bun.file(`${indexPath}.status.json`).json();
    expect((await status()).nextRunAt).toBe("2026-09-24T19:00:00.000Z");
    time += 16 * 60000;
    await collectOnce(options);
    expect(syncs).toBe(1); // Pending backfill no longer triggers a 15-minute run.
    time = Date.parse("2026-09-24T18:59:59Z");
    await collectOnce(options);
    expect(syncs).toBe(1);
    time += 1000;
    await collectOnce(options);
    expect(syncs).toBe(2);
    expect((await status()).nextRunAt).toBe("2026-09-25T19:00:00.000Z");
    time += 1000;
    queue.enqueue("manual", time);
    queue.start("manual", time); // The collector died with this request in progress.
    await collectOnce(options);
    expect(syncs).toBe(3);
    expect(queue.latest()?.state).toBe("completed");
    expect((await status()).coverage.pending).toBe(2);
    await collectOnce(options);
    expect(syncs).toBe(3);
    time = Date.parse("2026-09-28T12:00:00Z");
    fail = true;
    queue.enqueue("failure", time);
    await collectOnce(options);
    expect(syncs).toBe(4);
    expect(queue.latest()?.state).toBe("failed");
    expect((await status()).nextRunAt).toBe("2026-09-28T19:00:00.000Z");
    expect((await status()).running).toBe(false);
  } finally {
    queue.close();
    await rm(root, { recursive: true, force: true });
  }
});

test("manual requests cannot resubmit rejected credentials, even with the diagnostic override", async () => {
  const root = await mkdtemp(join(tmpdir(), "ccxp-blocked-"));
  const queuePath = join(root, "requests.sqlite");
  const queue = new CcxpSyncQueue(queuePath);
  const previousForce = process.env.CCXP_FORCE_SYNC;
  try {
    const credentialsPath = join(root, "ccxp.env");
    await writeFile(
      credentialsPath,
      "CCXP_ACCOUNT=test\nCCXP_PASSWORD=rejected\n",
    );
    let attempts = 0;
    const options = {
      queuePath,
      credentialsPath,
      indexPath: join(root, "index.sqlite"),
      stateDir: join(root, "state"),
      openSource: async () => {
        attempts++;
        throw new AuthRequired();
      },
    };
    await collectOnce(options);
    queue.enqueue("manual");
    process.env.CCXP_FORCE_SYNC = "true";
    await collectOnce(options);
    expect(attempts).toBe(1);
    expect(queue.latest()?.state).toBe("auth_required");
  } finally {
    if (previousForce === undefined) delete process.env.CCXP_FORCE_SYNC;
    else process.env.CCXP_FORCE_SYNC = previousForce;
    queue.close();
    await rm(root, { recursive: true, force: true });
  }
});
