import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createCcxpSyncClient } from "./ccxp-sync";
import { CcxpSyncQueue } from "../../contracts/ccxp-sync";

test("manual sync requires the owner and a currently registered guild; input cannot override identity or paths", async () => {
  const root = await mkdtemp(join(tmpdir(), "ccxp-request-"));
  try {
    const env = {
      MINISAGO_CCXP_INDEX_PATH: join(root, "index.sqlite"),
      MINISAGO_CCXP_SYNC_QUEUE_PATH: join(root, "requests.sqlite"),
    };
    const context = {
      guildId: "guild",
      requesterId: "owner",
      ownerId: "owner",
      messageId: "message",
    };
    let enabled = true;
    const availability = { isEnabled: () => enabled };
    expect(
      createCcxpSyncClient(
        env,
        { ...context, requesterId: "member" },
        availability,
      ),
    ).toBeUndefined();
    expect(
      createCcxpSyncClient(
        env,
        { ...context, guildId: undefined },
        availability,
      ),
    ).toBeUndefined();
    expect(
      createCcxpSyncClient(env, { ...context, ownerId: "" }, availability),
    ).toBeUndefined();
    const client = createCcxpSyncClient(env, context, availability)!;
    await expect(
      client.call("request_ccxp_sync", {
        guildId: "other",
        url: "https://evil.test",
      }),
    ).rejects.toThrow();
    const queued = await client.call("request_ccxp_sync", {});
    expect(queued.status).toBe("queued");
    expect((await client.call("request_ccxp_sync", {})).request).toEqual(
      queued.request,
    );
    enabled = false;
    expect(await client.call("request_ccxp_sync", {})).toEqual({
      status: "forbidden",
    });
    expect(await client.call("get_ccxp_sync_status", {})).toEqual({
      status: "forbidden",
    });
    enabled = true;
    await writeFile(
      `${env.MINISAGO_CCXP_INDEX_PATH}.status.json`,
      JSON.stringify({ state: "auth_required", reason: "password_expired" }),
    );
    expect((await client.call("request_ccxp_sync", {})).status).toBe(
      "auth_required",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("durable queue coalesces requests, survives restart, deduplicates retries, and applies a global cooldown", async () => {
  const root = await mkdtemp(join(tmpdir(), "ccxp-queue-"));
  const path = join(root, "requests.sqlite");
  let queue = new CcxpSyncQueue(path);
  try {
    const now = Date.parse("2026-09-24T00:00:00Z");
    const a = queue.enqueue("a", now);
    expect(queue.enqueue("b", now + 1).request?.id).toBe("a");
    queue.start("a", now + 2);
    queue.close();
    queue = new CcxpSyncQueue(path);
    expect(queue.active()?.state).toBe("running");
    queue.finish("a", "completed", now + 3);
    expect(queue.active()).toBeNull();
    expect(queue.enqueue("a", now + 4).status).toBe("completed");
    expect(queue.enqueue("b", now + 6 * 60000).status).toBe("completed");
    expect(queue.enqueue("c", now + 4).status).toBe("cooldown");
    expect(queue.enqueue("c", now + 5 * 60000).status).toBe("queued");
    expect(a.request?.id).toBe("a");
  } finally {
    queue.close();
    await rm(root, { recursive: true, force: true });
  }
});
