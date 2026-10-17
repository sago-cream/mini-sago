import { expect, test } from "bun:test";
import { mkdtemp, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import {
  DeveloperThreadStore,
  DEVELOPER_TASK_TTL_MS,
  developerThreadStorePath,
} from "./developer-thread-store";

test("reopens task identity and session checkpoints with expiry and private file permissions", async () => {
  const root = await mkdtemp(join(tmpdir(), "minisago-developer-threads-"));
  const path = join(root, "tasks.sqlite");
  try {
    const task = {
      id: "task-1",
      threadId: "thread-1",
      guildId: "guild-1",
      requesterUserId: "owner",
      repository: "owner/repo",
      request: "Finish the change",
      title: "Original task",
      requiresAddressing: false,
      expiresAt: Date.now() + DEVELOPER_TASK_TTL_MS,
    };
    const first = new DeveloperThreadStore(path);
    first.save(task);
    first.save({
      ...task,
      resumeSessionId: "session-1",
      requiresAddressing: true,
    });
    first.close();
    const reopened = new DeveloperThreadStore(path);
    expect(reopened.get(task.threadId)).toEqual({
      ...task,
      resumeSessionId: "session-1",
      requiresAddressing: true,
    });
    expect(reopened.get(task.threadId, task.expiresAt)).toBeUndefined();
    expect(reopened.get("other-thread")).toBeUndefined();
    expect((await stat(path)).mode & 0o777).toBe(0o600);
    reopened.remove(task.threadId);
    expect(reopened.get(task.threadId)).toBeUndefined();
    reopened.close();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("defaults production records to the persistent core volume", () => {
  expect(developerThreadStorePath({ NODE_ENV: "production" })).toBe(
    "/app/state/developer-threads.sqlite",
  );
  expect(
    developerThreadStorePath({
      MINISAGO_DEVELOPER_THREADS_PATH: "/custom/tasks.sqlite",
    }),
  ).toBe("/custom/tasks.sqlite");
});
