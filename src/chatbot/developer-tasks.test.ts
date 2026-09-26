import { expect, test } from "bun:test";
import { DeveloperTaskRegistry } from "./developer-tasks";
import {
  DeveloperTaskStore,
  type StoredDeveloperTask,
} from "./developer-task-store";
import type { WorkflowLease, MacAgentJobResult } from "./bridge";
import type { DiscordMessage, DiscordRequest } from "./chatbot-context";
import type { OracleAnswerJob } from "../../contracts/worker-contract";

const access = {
  ownerUserId: "owner",
  guildIds: new Set<string>(),
  channelIds: new Set<string>(),
  roleIds: new Set<string>(),
};
const presentation = {
  formatOne: (s: string) => s,
  formatMany: (s: string) => [s],
  addressed: () => true,
  extract: (m: DiscordMessage) => m.content ?? null,
};
const record: StoredDeveloperTask = {
  id: "task",
  threadId: "thread",
  requesterUserId: "owner",
  repository: "sago-cream/mini-sago",
  request: "Implement this",
  state: "running",
  summary: "Preparing",
  sessionId: "session",
  workerId: "oracle",
  job: {
    id: "first",
    purpose: "answer",
    executionRoute: "oracle",
    requesterUserId: "owner",
    repository: "sago-cream/mini-sago",
    channelId: "thread",
    requestMessageId: "first-message",
    request: "Implement this",
    messages: [],
    developerTask: { id: "task" },
  },
};
const message = (id: string, content: string): DiscordMessage => ({
  id,
  channel_id: "thread",
  content,
  timestamp: new Date().toISOString(),
  author: { id: "owner" },
});
async function until(check: () => boolean) {
  for (let i = 0; i < 100; i++) {
    if (check()) return;
    await Bun.sleep(2);
  }
  throw new Error("Timed out");
}

test("recovers a task on its owning worker and retains a blocked result and retryable delivery", async () => {
  const store = new DeveloperTaskStore(":memory:");
  store.save(record);
  const jobs: OracleAnswerJob[] = [];
  const affinities: unknown[] = [];
  let resolve!: (value: MacAgentJobResult) => void;
  const workflow: WorkflowLease = {
    workerId: "oracle",
    availableRepositories: [record.repository],
    route: () => ({ status: "accepted" }),
    getCodexUsage: async () => null,
    release: () => {},
    stop: () => true,
    steer: async () => false,
    dispatch: (job) => {
      jobs.push(job as OracleAnswerJob);
      return {
        status: "accepted",
        result: new Promise((r) => {
          resolve = r;
        }),
        cancel: () => true,
      };
    },
  };
  let deliveryFails = true;
  const posted: unknown[] = [];
  const discord: DiscordRequest = async (_path, options) => {
    if (deliveryFails) throw new Error("Discord unavailable");
    posted.push(options?.body);
    return { id: "status" } as never;
  };
  const registry = new DeveloperTaskRegistry(store, presentation, {
    acquireWorkflow: (_caps, affinity) => {
      affinities.push(affinity);
      return { status: "accepted", workflow };
    },
  });
  try {
    registry.recover(discord, "owner");
    expect(store.list()[0]?.state).toBe("blocked_environment");
    expect(jobs).toHaveLength(0);
    await registry.handle(
      message("followup", "Continue and make a PR"),
      "bot",
      access,
    );
    expect(affinities).toEqual([
      { repository: record.repository, workerId: "oracle" },
    ]);
    expect(jobs[0]?.developerTask?.resumeSessionId).toBe("session");
    await registry.handle(
      message("followup", "Continue and make a PR"),
      "bot",
      access,
    );
    expect(jobs).toHaveLength(1);
    resolve({
      ok: true,
      content: "I need repository access.",
      taskOutcome: {
        state: "blocked_access",
        workspace: "/task/repo",
        branch: "minisago/task",
        head: "a".repeat(40),
      },
    });
    await until(() => store.list()[0]?.state === "blocked_access");
    expect(store.outbox()).toHaveLength(1);
    deliveryFails = false;
    await registry.flush();
    expect(store.outbox()).toHaveLength(0);
    expect(posted).toContainEqual(
      expect.objectContaining({
        content: "I need repository access.",
        enforce_nonce: true,
      }),
    );
  } finally {
    registry.close();
    store.close();
  }
});

test("never substitutes an online worker for an unavailable workspace owner", async () => {
  const store = new DeveloperTaskStore(":memory:");
  store.save({ ...record, state: "turn_complete" });
  const affinities: unknown[] = [];
  const registry = new DeveloperTaskRegistry(store, presentation, {
    acquireWorkflow: (_caps, affinity) => {
      affinities.push(affinity);
      return { status: "offline" };
    },
  });
  try {
    registry.recover(async () => ({ id: "status" }) as never, "owner");
    await registry.handle(message("retry", "continue"), "bot", access);
    await Bun.sleep(10);
    expect(affinities).toEqual([
      { repository: record.repository, workerId: "oracle" },
    ]);
    expect(store.list()[0]?.state).toBe("queued");
    expect(store.pending(record.id)).toHaveLength(1);
  } finally {
    registry.close();
    store.close();
  }
});

test("deduplicates matching check webhooks and reconciles without a model turn", async () => {
  const store = new DeveloperTaskStore(":memory:");
  const head = "a".repeat(40);
  store.save({
    ...record,
    state: "awaiting_checks",
    outcome: {
      state: "awaiting_checks",
      head,
      branch: "minisago/task",
      workspace: "/task/repo",
      pullRequestUrl: "https://github.com/sago-cream/mini-sago/pull/10",
      checks: "pending",
    },
  });
  const jobs: OracleAnswerJob[] = [];
  const registry = new DeveloperTaskRegistry(store, presentation, {
    acquireWorkflow: () => ({
      status: "accepted",
      workflow: {
        workerId: "oracle",
        availableRepositories: [record.repository],
        route: () => ({ status: "accepted" }),
        getCodexUsage: async () => null,
        stop: () => false,
        steer: async () => false,
        release: () => {},
        dispatch: (job) => {
          jobs.push(job as OracleAnswerJob);
          return {
            status: "accepted",
            cancel: () => true,
            result: Promise.resolve({
              ok: true,
              content: "Checks passed",
              taskOutcome: {
                state: "ready_for_review",
                head,
                branch: "minisago/task",
                workspace: "/task/repo",
                pullRequestUrl:
                  "https://github.com/sago-cream/mini-sago/pull/10",
                checks: "passed",
              },
            }),
          };
        },
      },
    }),
  });
  try {
    registry.recover(async () => ({ id: "status" }) as never, "owner");
    const payload = {
      action: "completed",
      repository: { full_name: record.repository },
      check_suite: { head_sha: head },
    };
    registry.githubEvent(
      "check_suite",
      { ...payload, check_suite: { head_sha: "b".repeat(40) } },
      "stale",
    );
    expect(jobs).toHaveLength(0);
    registry.githubEvent("check_suite", payload, "delivery");
    await until(() => store.list()[0]?.state === "ready_for_review");
    registry.githubEvent("check_suite", payload, "delivery");
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.developerTask?.reconcileOnly).toBe(true);
    expect(jobs[0]?.developerTask?.ownerDirections).toEqual([]);
    await Bun.sleep(5);
  } finally {
    registry.close();
    store.close();
  }
});
