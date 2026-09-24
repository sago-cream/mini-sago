import { test, expect } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { createCcxpAuthNotifier } from "./ccxp-auth-notifications";
import type { DiscordRequest } from "../api/request";

test("auth notices DM only the owner, persist deduplication, and retry failed delivery", async () => {
  const root = await mkdtemp(join(tmpdir(), "ccxp-notice-"));
  try {
    const indexPath = join(root, "index");
    const calls: { path: string; body: unknown }[] = [];
    let fail = true;
    const request: DiscordRequest = async <T>(
      path: string,
      options: Parameters<DiscordRequest>[1],
    ) => {
      calls.push({ path, body: options?.body });
      if (path.endsWith("/messages") && fail) throw new Error("DM unavailable");
      return { id: "owner-dm" } as T;
    };
    const options = {
      indexPath,
      checkpointPath: join(root, "notice"),
      ownerId: "owner",
      request,
    };
    const health = {
      state: "auth_required",
      reason: "password_expired",
      episode: randomUUID(),
    };
    await writeFile(`${indexPath}.status.json`, JSON.stringify(health));
    const poll = createCcxpAuthNotifier(options);
    await poll();
    fail = false;
    await poll();
    expect(calls).toHaveLength(4);
    expect(calls[0]).toEqual({
      path: "/users/@me/channels",
      body: { recipient_id: "owner" },
    });
    expect(calls[3].body).toMatchObject({
      enforce_nonce: true,
      allowed_mentions: { parse: [] },
    });
    await createCcxpAuthNotifier(options)();
    expect(calls).toHaveLength(4);
    await writeFile(
      `${indexPath}.status.json`,
      JSON.stringify({ ...health, state: "healthy", episode: randomUUID() }),
    );
    await poll();
    expect(calls).toHaveLength(4);
    await writeFile(
      `${indexPath}.status.json`,
      JSON.stringify({ ...health, episode: randomUUID() }),
    );
    await poll();
    expect(calls).toHaveLength(6);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
