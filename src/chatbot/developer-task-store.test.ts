import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  DeveloperTaskStore,
  type StoredDeveloperTask,
} from "./developer-task-store";

export function storedTask(): StoredDeveloperTask {
  return {
    id: "task",
    threadId: "thread",
    requesterUserId: "owner",
    repository: "sago-cream/mini-sago",
    request: "Implement and open a PR",
    state: "running",
    summary: "Preparing",
    job: {
      id: "first",
      purpose: "answer",
      executionRoute: "oracle",
      requesterUserId: "owner",
      repository: "sago-cream/mini-sago",
      channelId: "thread",
      requestMessageId: "first-message",
      request: "Implement and open a PR",
      messages: [],
      developerTask: { id: "task" },
    },
  };
}

test("restart retains task, directions and undelivered output without persisting bearer tokens", async () => {
  const root = await mkdtemp(join(tmpdir(), "dev-task-store-"));
  const path = join(root, "tasks.sqlite");
  let store = new DeveloperTaskStore(path);
  try {
    const task = {
      ...storedTask(),
      sessionId: "codex-session",
      workerId: "oracle",
      job: { ...storedTask().job, mcpAccessToken: "must-not-persist" },
    };
    store.save(task);
    expect(store.enqueue(task.id, "message", "Also update docs")).toBe(true);
    expect(store.enqueue(task.id, "message", "duplicate")).toBe(false);
    const lease = store.claim(task.id, "controller-1")!;
    expect(store.claim(task.id, "controller-2")).toBeUndefined();
    store.complete({ ...task, state: "ready_for_review" }, [
      { content: "Created PR", nonce: "reply" },
    ]);
    store.close();
    store = new DeveloperTaskStore(path);
    expect(store.list()[0]).toMatchObject({
      sessionId: "codex-session",
      workerId: "oracle",
      state: "ready_for_review",
    });
    expect(JSON.stringify(store.list())).not.toContain("must-not-persist");
    expect(store.directions(task.id)).toEqual(["Also update docs"]);
    expect(store.outbox()[0]?.content).toBe("Created PR");
    store.release(task.id, "wrong-owner", lease);
    expect(store.claim(task.id, "controller-2")).toBeUndefined();
    store.release(task.id, "controller-1", lease);
    const nextLease = store.claim(task.id, "controller-2")!;
    expect(nextLease).toBeGreaterThan(lease);
    expect(store.owns(task.id, "controller-1", lease)).toBe(false);
    expect(store.owns(task.id, "controller-2", nextLease)).toBe(true);
    store.delivered(store.outbox()[0]!.id);
    expect(store.outbox()).toEqual([]);
  } finally {
    store.close();
    await rm(root, { recursive: true, force: true });
  }
});
