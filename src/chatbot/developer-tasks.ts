import { createHash, randomUUID } from "node:crypto";
import type { ChatbotAccessConfig } from "./access";
import {
  toChatbotMessage,
  type DiscordMessage,
  type DiscordRequest,
} from "./chatbot-context";
import { macAgentBridge, type WorkflowLease } from "./bridge";
import type {
  ChatbotTaskProgress,
  OracleAnswerJob,
} from "../../contracts/worker-contract";
import {
  DeveloperTaskStore,
  type StoredDeveloperTask,
} from "./developer-task-store";

type Task = Omit<StoredDeveloperTask, "job"> & {
  job: OracleAnswerJob;
  workflow?: WorkflowLease;
  activeJobId?: string;
  generation?: number;
  discordRequest: DiscordRequest;
  messageQueue: Promise<void>;
  lastStatus?: string;
};

type Presentation = {
  formatOne: (content: string) => string;
  formatMany: (content: string) => string[];
  addressed: (
    message: DiscordMessage,
    botId: string,
    access: ChatbotAccessConfig,
  ) => unknown;
  extract: (
    message: DiscordMessage,
    botId: string,
    access: ChatbotAccessConfig,
  ) => string | null;
};

export class DeveloperTaskRegistry {
  private tasks = new Map<string, Task>();
  private owner = randomUUID();
  private delivering = false;
  private timer?: ReturnType<typeof setInterval>;
  constructor(
    private store: DeveloperTaskStore,
    private presentation: Presentation,
    private bridge: Pick<
      typeof macAgentBridge,
      "acquireWorkflow"
    > = macAgentBridge,
  ) {}

  recover(discordRequest: DiscordRequest, ownerUserId: string) {
    for (const record of this.store.list()) {
      if (
        this.tasks.has(record.threadId) ||
        record.requesterUserId !== ownerUserId
      )
        continue;
      const interrupted =
        record.state === "running" || record.state === "stopping";
      const task: Task = {
        ...record,
        job: { ...record.job, mcpAccessToken: "dev-task-context-only" },
        state: interrupted ? "blocked_environment" : record.state,
        summary: interrupted
          ? "The controller restarted during a turn. The workspace is retained. Reply to reconcile and continue; a previous runner lease must expire first."
          : record.summary,
        discordRequest,
        messageQueue: Promise.resolve(),
      };
      this.tasks.set(task.threadId, task);
      if (interrupted) {
        this.store.cancelPending(task.id);
        this.save(task);
      }
    }
    this.monitor();
    void this.flush();
  }

  has(threadId: string) {
    return this.tasks.has(threadId);
  }

  start(input: Omit<Task, "state" | "summary" | "messageQueue">) {
    const task: Task = {
      ...input,
      state: "queued",
      summary: "Queued for a coding worker.",
      messageQueue: Promise.resolve(),
    };
    this.tasks.set(task.threadId, task);
    this.save(task);
    this.store.enqueue(
      task.id,
      task.job.requestMessageId,
      task.request,
      task.job.requestMessage,
    );
    this.monitor();
    this.launch(task);
  }

  async handle(
    message: DiscordMessage,
    botId: string,
    access: ChatbotAccessConfig,
  ) {
    const task = this.tasks.get(message.channel_id);
    if (
      !task ||
      message.author?.id !== task.requesterUserId ||
      message.author?.id !== access.ownerUserId ||
      message.webhook_id
    )
      return false;
    const addressed = this.presentation.addressed(message, botId, access);
    if (task.requiresAddressing && !task.activeJobId && !addressed)
      return false;
    const request =
      (addressed && task.requiresAddressing
        ? (this.presentation.extract(message, botId, access) ?? "")
        : (message.content?.trim() ?? "")) ||
      (message.attachments?.length
        ? "Use the attached files for this task."
        : "");
    if (!request) return true;
    if (/^(?:status|進度|狀態)[?？\s]*$/iu.test(request)) {
      await this.updateStatus(task);
      return true;
    }
    if (/^(?:stop|pause|停止|暫停)[.!。！\s]*$/iu.test(request)) {
      this.store.cancelPending(task.id);
      if (task.activeJobId && task.workflow) {
        task.state = "stopping";
        task.summary = "Stopping; the workspace and session are retained.";
        task.workflow.stop(task.activeJobId);
      } else {
        task.state = "stopped";
        task.summary = "Paused. Reply here to continue the same task.";
      }
      this.save(task);
      await this.updateStatus(task);
      return true;
    }
    if (
      !this.store.enqueue(
        task.id,
        message.id,
        request,
        toChatbotMessage(message, botId),
      )
    )
      return true;
    if (task.activeJobId && task.workflow && !message.attachments?.length) {
      const jobId = task.activeJobId;
      if (await task.workflow.steer(jobId, request)) {
        this.store.acknowledge(message.id);
        task.summary = "Applying new direction to the active turn.";
        this.save(task);
      }
      // A finished turn can race with a rejected steer. The inbox survives both.
      if (!task.activeJobId) this.launch(task);
    } else if (task.state !== "stopping") {
      this.launch(task);
    }
    return true;
  }

  githubEvent(event: string, payload: unknown, deliveryId: string) {
    if (
      ![
        "check_suite",
        "check_run",
        "pull_request_review",
        "pull_request_review_comment",
        "pull_request",
      ].includes(event) ||
      !payload ||
      typeof payload !== "object" ||
      !deliveryId ||
      deliveryId.length > 128
    )
      return;
    const value = payload as {
      action?: string;
      repository?: { full_name?: string };
      pull_request?: { html_url?: string; head?: { sha?: string } };
      check_suite?: { head_sha?: string };
      check_run?: { head_sha?: string };
    };
    if (
      (event.startsWith("check_") && value.action !== "completed") ||
      (event === "pull_request" && value.action !== "closed") ||
      (event === "pull_request_review" && value.action !== "submitted") ||
      (event === "pull_request_review_comment" && value.action !== "created")
    )
      return;
    const head =
      value.pull_request?.head?.sha ??
      value.check_suite?.head_sha ??
      value.check_run?.head_sha;
    for (const task of this.tasks.values()) {
      if (
        !["awaiting_checks", "ready_for_review", "needs_input"].includes(
          task.state,
        ) ||
        task.activeJobId ||
        !task.outcome?.pullRequestUrl ||
        task.repository.toLowerCase() !==
          value.repository?.full_name?.toLowerCase() ||
        task.outcome.head !== head ||
        (value.pull_request?.html_url &&
          task.outcome.pullRequestUrl !== value.pull_request.html_url)
      )
        continue;
      // Signed webhook payloads select a task; they never supply instructions.
      // The owning worker reads GitHub again, without invoking the model.
      if (
        this.store.enqueue(
          task.id,
          `github:${deliveryId}:${task.id}`,
          "Refresh the current PR and check status.",
        )
      )
        this.launch(task);
    }
  }

  private record(task: Task): StoredDeveloperTask {
    const {
      id,
      threadId,
      requesterUserId,
      repository,
      request,
      job,
      state,
      summary,
      sessionId,
      workerId,
      outcome,
      requiresAddressing,
      statusMessageId,
    } = task;
    return {
      id,
      threadId,
      requesterUserId,
      repository,
      request,
      job,
      state,
      summary,
      sessionId,
      workerId,
      outcome,
      requiresAddressing,
      statusMessageId,
    };
  }

  private save(task: Task) {
    this.store.save(this.record(task));
  }

  private monitor() {
    if (this.timer) return;
    this.timer = setInterval(() => {
      for (const task of this.tasks.values())
        if (task.state === "queued" && !task.activeJobId) this.launch(task);
      for (const task of this.tasks.values()) void this.updateStatus(task);
      void this.flush();
    }, 5_000);
    this.timer.unref?.();
  }

  private launch(task: Task) {
    if (task.activeJobId || task.generation !== undefined) return;
    void this.run(task)
      .catch(async (error) => {
        if (
          task.generation !== undefined &&
          !this.store.owns(task.id, this.owner, task.generation)
        )
          return;
        task.state = "blocked_environment";
        task.summary = `Coding task blocked: ${error instanceof Error ? error.message.slice(0, 500) : "unexpected error"}`;
        this.save(task);
        await this.post(task, task.summary);
      })
      .finally(() => {
        this.release(task);
        if (
          task.state !== "running" &&
          task.state !== "queued" &&
          task.state !== "stopped" &&
          task.state !== "stopping" &&
          !task.state.startsWith("blocked") &&
          this.store.pending(task.id).length
        )
          this.launch(task);
      });
  }

  private async run(task: Task) {
    const pending = this.store.pending(task.id)[0];
    if (!pending) return;
    const maxConcurrent = Math.max(
      1,
      Number(process.env.MINISAGO_DEV_CONCURRENCY) || 1,
    );
    if (
      [...this.tasks.values()].filter((t) => t.activeJobId).length >=
      maxConcurrent
    ) {
      task.workflow?.release();
      task.workflow = undefined;
      task.state = "queued";
      task.summary =
        "Queued behind another coding task; chat capacity remains available.";
      this.save(task);
      return;
    }
    const generation = this.store.claim(task.id, this.owner);
    if (generation === undefined) {
      task.state = "queued";
      task.summary =
        "Waiting for the previous runner lease to expire before continuing.";
      return;
    }
    task.generation = generation;
    if (!task.workflow) {
      const acquired = this.bridge.acquireWorkflow(["dev"], {
        repository: task.repository,
        workerId: task.workerId,
      });
      if (acquired.status !== "accepted") {
        task.state = "queued";
        task.summary = `Waiting for ${task.workerId ?? "a coding worker"}: ${acquired.status}. The workspace stays on its owning worker.`;
        this.save(task);
        return;
      }
      task.workflow = acquired.workflow;
    }
    task.workerId = task.workflow.workerId;
    const request =
      !task.sessionId && pending.request !== task.request
        ? `${task.request}\n\nAdditional direction: ${pending.request}`
        : pending.request;
    const job: OracleAnswerJob = {
      ...task.job,
      id: randomUUID(),
      channelId: task.threadId,
      requestMessageId: pending.messageId,
      requestMessage: pending.requestMessage ?? task.job.requestMessage,
      request,
      // Store owner directions independently of the model session, including grants
      // already given. They remain available if context is compacted or recovered.
      developerTask: {
        id: task.id,
        title: task.job.developerTask?.title,
        resumeSessionId: task.sessionId,
        reconcileOnly: pending.messageId.startsWith("github:"),
        ownerDirections: this.store.directions(task.id),
      },
    };
    task.state = "running";
    task.activeJobId = job.id;
    task.summary = task.sessionId
      ? "Continuing the preserved task."
      : "Preparing the task workspace.";
    this.save(task);
    void this.updateStatus(task);
    const dispatch = task.workflow.dispatch(job, (progress) => {
      if (this.store.owns(task.id, this.owner, generation))
        this.onProgress(task, progress);
    });
    if (dispatch.status !== "accepted") {
      task.state = "queued";
      task.summary =
        "The owning worker could not start this turn. Waiting to retry.";
      this.save(task);
      return;
    }
    // Mark accepted input before awaiting the runner. On restart, an in-flight turn
    // needs reconciliation; it is never blindly replayed after possible publication.
    this.store.acknowledge(pending.messageId);
    const result = await dispatch.result;
    if (!this.store.owns(task.id, this.owner, generation)) return;
    if (!result.ok) {
      task.state = result.stopped ? "stopped" : "blocked_environment";
      task.summary = result.stopped
        ? "Stopped. The workspace and Codex session are preserved."
        : result.error.slice(0, 1000);
      this.save(task);
      await this.post(task, task.summary);
    } else {
      task.outcome = result.taskOutcome;
      task.state = result.taskOutcome?.state ?? "turn_complete";
      if (task.state === "merged") task.requiresAddressing = true;
      task.summary =
        result.taskOutcome?.detail ??
        (task.state === "turn_complete"
          ? "Turn finished. Reply to continue the same task. No PR outcome was verified."
          : task.state === "ready_for_review"
            ? "PR and current head verified. Ready for review."
            : task.state === "awaiting_checks"
              ? "PR and current head verified. Checks are pending."
              : task.state === "needs_input"
                ? "A decision or follow-up is needed. See the result below."
                : task.state === "merged"
                  ? "GitHub confirms the task PR is merged."
                  : "The task is blocked. See the result below.");
      // Persist the final outcome and messages before attempting Discord delivery.
      this.store.complete(
        this.record(task),
        this.presentation
          .formatMany(
            result.content || (result.files?.length ? "Review artifact." : ""),
          )
          .map((content, index) => ({
            content,
            files: index === 0 ? result.files : undefined,
            nonce: this.nonce(`${task.id}:${job.id}:${content}`),
          })),
      );
      void this.flush();
    }
    void this.updateStatus(task);
  }

  private release(task: Task) {
    task.workflow?.release();
    task.workflow = undefined;
    delete task.activeJobId;
    if (task.generation !== undefined)
      this.store.release(task.id, this.owner, task.generation);
    delete task.generation;
  }

  private onProgress(task: Task, progress: ChatbotTaskProgress) {
    if (progress.sessionId) task.sessionId = progress.sessionId;
    if (progress.completion === "pull_request_merged")
      task.requiresAddressing = true;
    if (progress.kind !== "trace") task.summary = progress.summary;
    this.save(task);
    if (progress.kind === "trace") {
      task.messageQueue = task.messageQueue
        .then(async () => {
          await task.discordRequest(`/channels/${task.threadId}/messages`, {
            method: "POST",
            signal: AbortSignal.timeout(15_000),
            body: {
              content: this.presentation.formatOne(progress.summary),
              allowed_mentions: { parse: [] },
            },
          });
        })
        .catch(() => undefined);
    }
  }

  private status(task: Task) {
    const outcome = task.outcome;
    return this.presentation.formatOne(
      `**${task.state.replaceAll("_", " ")} · ${task.repository}**\n${task.summary}${outcome?.pullRequestUrl ? `\n${outcome.pullRequestUrl}` : ""}${outcome?.head ? `\nHead: ${outcome.head.slice(0, 12)} · Checks: ${outcome.checks ?? "unverified"}` : ""}\n\nReply here to continue or steer. Say \`stop\` to pause or \`status\` for an update.`,
    );
  }

  private async updateStatus(task: Task) {
    // Serialized with progress to prevent two first status cards during rapid turns.
    task.messageQueue = task.messageQueue
      .then(async () => {
        const status = this.status(task);
        if (task.lastStatus === status) return;
        const body = {
          content: status,
          allowed_mentions: { parse: [] },
          nonce: this.nonce(`${task.id}:status`),
          enforce_nonce: true,
        };
        if (task.statusMessageId) {
          await task.discordRequest(
            `/channels/${task.threadId}/messages/${task.statusMessageId}`,
            { method: "PATCH", body, signal: AbortSignal.timeout(15_000) },
          );
        } else {
          const message = await task.discordRequest<{ id: string }>(
            `/channels/${task.threadId}/messages`,
            { method: "POST", body, signal: AbortSignal.timeout(15_000) },
          );
          task.statusMessageId = message.id;
          this.save(task);
        }
        task.lastStatus = status;
      })
      .catch((error) =>
        console.warn(
          "Coding task status delivery failed:",
          String(error).slice(0, 200),
        ),
      );
    await task.messageQueue;
  }

  private nonce(value: string) {
    return createHash("sha256").update(value).digest("hex").slice(0, 24);
  }

  private async post(task: Task, content: string) {
    this.store.post(
      task.threadId,
      content,
      this.nonce(`${task.id}:${task.activeJobId ?? randomUUID()}:${content}`),
    );
    void this.flush();
  }

  async flush() {
    if (this.delivering) return;
    this.delivering = true;
    try {
      const unavailable = new Set<string>();
      for (const message of this.store.outbox()) {
        if (unavailable.has(message.threadId)) continue;
        const task = this.tasks.get(message.threadId);
        if (!task) continue;
        try {
          const body = {
            content: message.content,
            nonce: message.nonce,
            enforce_nonce: true,
            allowed_mentions: { parse: [] },
          };
          let formData: FormData | undefined;
          if (message.files?.length) {
            formData = new FormData();
            formData.append("payload_json", JSON.stringify(body));
            for (const [index, file] of message.files.entries())
              formData.append(
                `files[${index}]`,
                new Blob([Buffer.from(file.data, "base64")], {
                  type: file.contentType,
                }),
                file.filename,
              );
          }
          await task.discordRequest(`/channels/${message.threadId}/messages`, {
            method: "POST",
            signal: AbortSignal.timeout(15_000),
            ...(formData ? { formData } : { body }),
          });
          this.store.delivered(message.id);
        } catch {
          unavailable.add(message.threadId);
        }
      }
    } finally {
      this.delivering = false;
    }
  }

  close() {
    if (this.timer) clearInterval(this.timer);
  }
}
