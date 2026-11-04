import { createHash } from "node:crypto";
import { z } from "zod";
import type { OracleAnswerJob } from "../../contracts/worker-contract";
import type { ChatbotAccessConfig } from "./access";
import {
  DeveloperThreadStore,
  type SavedDeveloperThread,
} from "./developer-thread-store";
import {
  configuredT3Client,
  t3Projects,
  t3ThreadRead,
  type T3Connection,
  type T3Attachment,
  type T3Project,
} from "./t3-client";
import { ChatbotMediaRegistry } from "./media-assets";
import {
  toChatbotMessage,
  type DiscordMessage,
  type DiscordRequest,
} from "./chatbot-context";

export function developerThreadName(title?: string) {
  return title?.replace(/\s+/gu, " ").trim().slice(0, 100) || "Coding task";
}

export async function createDeveloperThread(
  message: DiscordMessage,
  title: string | undefined,
  discord: DiscordRequest,
) {
  if (!message.guild_id) return message.channel_id;
  const channel = await discord<{ type: number }>(
    `/channels/${message.channel_id}`,
  );
  if ([10, 11, 12].includes(channel.type)) return message.channel_id;
  const thread = await discord<{ id: string }>(
    `/channels/${message.channel_id}/messages/${message.id}/threads`,
    {
      method: "POST",
      body: { name: developerThreadName(title), auto_archive_duration: 4320 },
    },
  );
  return thread.id;
}

const launched = z.object({
  threadId: z.string(),
  projectId: z.string(),
  link: z.string().optional(),
});
const preparedUpload = z.object({
  attachmentId: z.string(),
  relativeUrl: z.string(),
});
const terminal = new Set([
  "completed",
  "failed",
  "cancelled",
  "interrupted",
  "rolled_back",
]);
const visibleTypes = new Set([
  "assistant_message",
  "proposed_plan",
  "error",
  "user_input_request",
  "approval_request",
]);
const messageBody = (content: string) => ({
  content,
  allowed_mentions: { parse: [] },
});

/** Discord delivery state only. T3 owns sessions, execution, and workspaces. */
export class DeveloperTaskRegistry {
  private queues = new Map<string, Promise<unknown>>();
  private timer?: ReturnType<typeof setTimeout>;
  private wakeRelay?: () => void;
  private nextPoll = new Map<string, number>();
  private client?: T3Connection;
  private repositories: string[] = [];
  private repositoriesCheckedAt = 0;
  private projects?: { checkedAt: number; values: T3Project[] };
  private projectLookup?: Promise<T3Project[]>;

  constructor(
    client?: T3Connection,
    readonly store = new DeveloperThreadStore(":memory:"),
    private fetcher: typeof fetch = fetch,
    private relayTimers = { schedule: setTimeout, cancel: clearTimeout },
  ) {
    this.client = client;
  }
  private connection() {
    this.client ??= configuredT3Client();
    if (!this.client)
      throw new Error(
        "Discord coding needs a T3 environment. Configure MINISAGO_T3_URL and run bun run t3:login on the bot host.",
      );
    return this.client;
  }
  async availableRepositories() {
    if (!this.client && !process.env.MINISAGO_T3_URL?.trim()) return [];
    if (Date.now() - this.repositoriesCheckedAt < 60_000)
      return this.repositories;
    try {
      this.repositories = [
        ...new Set(
          (await this.availableProjects()).map((project) => project.repository),
        ),
      ];
    } catch {
      /* A coding-environment outage must leave ordinary chat available. */
    }
    this.repositoriesCheckedAt = Date.now();
    return this.repositories;
  }
  private availableProjects() {
    if (this.projects && Date.now() - this.projects.checkedAt < 60_000)
      return Promise.resolve(this.projects.values);
    return (this.projectLookup ??= t3Projects(this.connection())
      .then((values) => {
        this.projects = { checkedAt: Date.now(), values };
        return values;
      })
      .finally(() => {
        this.projectLookup = undefined;
      }));
  }
  has(threadId: string) {
    return Boolean(this.store.get(threadId));
  }
  saved(threadId: string) {
    return this.store.get(threadId);
  }
  currentRequester(threadId: string) {
    return this.saved(threadId)?.requesterUserId;
  }
  recovering(threadId: string) {
    return this.queues.has(threadId);
  }
  async recover<T>(threadId: string, operation: () => Promise<T>): Promise<T> {
    const previous = this.queues.get(threadId) ?? Promise.resolve();
    const pending = previous.catch(() => {}).then(operation);
    this.queues.set(threadId, pending);
    try {
      return await pending;
    } finally {
      if (this.queues.get(threadId) === pending) this.queues.delete(threadId);
    }
  }
  private boundClient(task: SavedDeveloperThread) {
    const client = this.connection();
    if (!task.t3 || task.t3.url !== client.url)
      throw new Error(
        "This task belongs to another coding environment. Its session and files are preserved; restore its T3 connection to continue.",
      );
    return client;
  }

  async start({
    message,
    job,
    title,
    discordRequest: discord,
  }: {
    message: DiscordMessage;
    job: OracleAnswerJob;
    title?: string;
    discordRequest: DiscordRequest;
  }) {
    const client = this.connection();
    const candidates = (await this.availableProjects()).filter(
      (project) =>
        project.repository.toLowerCase() === job.repository.toLowerCase(),
    );
    if (candidates.length !== 1)
      throw new Error(
        `Register one active T3 project for ${job.repository} before starting Discord coding.`,
      );
    const threadId = await createDeveloperThread(message, title, discord);
    await this.recover(threadId, async () => {
      const existing = this.saved(threadId);
      if (existing?.t3)
        throw new Error(
          "This Discord thread already has a T3 session. Reply in it to continue.",
        );
      const session = launched.parse(
        await client.call("t3_thread_launch", {
          projectId: candidates[0]!.id,
          title: developerThreadName(title),
          workspaceStrategy: {
            type: "worktree",
            baseRef: "HEAD",
            startFromOrigin: true,
          },
          clientRequestId: `discord-thread:${threadId}`,
          // Create idle first so the association is durable before any agent work begins.
        }),
      );
      const task: SavedDeveloperThread = {
        id: session.threadId,
        threadId,
        guildId: message.guild_id ?? "",
        requesterUserId: job.requesterUserId,
        repository: job.repository,
        request: "",
        title: developerThreadName(title),
        requiresAddressing: false,
        expiresAt: Number.MAX_SAFE_INTEGER,
        t3: {
          url: client.url,
          threadId: session.threadId,
          projectId: session.projectId,
          link: this.webLink(session.link),
          seenMessageIds: [],
        },
      };
      this.store.save(task);
      const recent = job.messages
        .filter((entry) => entry.id !== message.id)
        .map((entry) => `${entry.author}: ${entry.content}`)
        .join("\n")
        .slice(-8_000);
      const source = `https://discord.com/channels/${message.guild_id ?? "@me"}/${threadId}`;
      const initial = `${job.request}\n\nDiscord conversation: ${source}${recent ? `\n\nRecent Discord context (reference):\n${recent}` : ""}`;
      await this.send(task, message, initial, discord);
      await this.sync(task, discord);
    }).finally(() => this.wakeRelay?.());
  }

  async handle(
    message: DiscordMessage,
    botUserId: string,
    access: ChatbotAccessConfig,
    discord?: DiscordRequest,
  ) {
    const saved = this.saved(message.channel_id);
    if (
      !saved ||
      saved.requesterUserId !== access.ownerUserId ||
      saved.guildId !== (message.guild_id ?? "") ||
      message.author?.id !== access.ownerUserId ||
      message.author.bot ||
      message.webhook_id
    )
      return false;
    if (!discord) throw new Error("Discord delivery is unavailable.");
    return this.recover(message.channel_id, async () => {
      const task = this.saved(message.channel_id);
      if (!task) return false;
      try {
        if (!task.t3) {
          await this.post(
            task,
            "This saved task uses the previous coding runtime. Its files are preserved. End this development thread, then start a new T3 task to continue coding.",
            discord,
          );
          return true;
        }
        const text = (message.content ?? "")
          .replace(new RegExp(`<@!?${botUserId}>`, "gu"), "")
          .trim();
        const client = this.boundClient(task);
        if (/^(?:status|進度|狀態)[?？\s]*$/iu.test(text))
          delete task.t3.statusText;
        if (/^(?:stop|pause|停止|暫停)[.!。！\s]*$/iu.test(text)) {
          await client.call("t3_thread_interrupt", {
            threadId: task.t3.threadId,
            stop: true,
            clientRequestId: `discord-stop:${message.id}`,
          });
          await this.post(
            task,
            "Stopped. Continue here or in T3 when you’re ready.",
            discord,
          );
        } else if (
          !/^(?:status|進度|狀態)[?？\s]*$/iu.test(text) &&
          (text || message.attachments?.length)
        ) {
          await this.send(
            task,
            message,
            text || "Use the attached files to continue.",
            discord,
          );
        }
        await this.sync(task, discord);
      } catch (error) {
        await this.post(task, this.failure(error), discord);
      }
      return true;
    }).finally(() => this.wakeRelay?.());
  }

  async end(
    threadId: string,
    guildId: string,
    ownerUserId: string,
    discord: DiscordRequest,
  ) {
    const task = this.saved(threadId);
    if (
      !task ||
      task.guildId !== guildId ||
      task.requesterUserId !== ownerUserId
    )
      return { status: "not_found" as const, threadId };
    // Stop before detaching; an unreachable environment must not leave a hidden running task.
    if (task.t3) {
      try {
        await this.boundClient(task).call("t3_thread_interrupt", {
          threadId: task.t3.threadId,
          stop: true,
        });
      } catch {
        await this.post(
          task,
          "T3 is unreachable. Stop the task in T3 before ending its Discord connection.",
          discord,
        );
        return { status: "unavailable" as const, threadId };
      }
    }
    this.store.remove(threadId);
    this.nextPoll.delete(threadId);
    this.wakeRelay?.();
    await this.post(
      task,
      "Development thread ended. This is a normal Discord conversation again. The T3 session and workspace are preserved.",
      discord,
    );
    return { status: "ended" as const, threadId };
  }

  private async send(
    task: SavedDeveloperThread,
    message: DiscordMessage,
    text: string,
    discord: DiscordRequest,
  ) {
    const client = this.boundClient(task);
    const state = task.t3!;
    if (state.seenMessageIds.includes(message.id)) return;
    const normalized = toChatbotMessage(message, "");
    const references = normalized.referencedMessage;
    const attachments = [
      ...normalized.attachments,
      ...(references?.attachments ?? []),
    ];
    if (
      attachments.length > 8 ||
      attachments.reduce((sum, file) => sum + file.size, 0) > 40 * 1024 * 1024
    )
      throw new Error(
        "T3 accepts up to eight attachments and 40 MB total per message.",
      );
    if (state.pendingQuestion && !attachments.length) {
      const pending = z.object({ requestIds: z.array(z.string()) }).parse(
        await client.call("t3_pending_request", {
          action: "list",
          threadId: state.threadId,
        }),
      );
      const question = state.pendingQuestion;
      delete state.pendingQuestion;
      if (pending.requestIds.includes(question.requestId)) {
        state.seenMessageIds = [
          ...state.seenMessageIds.slice(-255),
          message.id,
        ];
        this.store.save(task);
        try {
          await client.call("t3_pending_request", {
            action: "respond",
            threadId: state.threadId,
            requestId: question.requestId,
            answers: { [question.questionId]: text },
          });
        } catch {
          throw new Error(
            "T3 answer delivery could not be confirmed. Check the question in T3 before resending.",
          );
        }
        return;
      }
      this.store.save(task);
    }
    const media = new ChatbotMediaRegistry(this.fetcher, discord);
    media.registerMessages([normalized]);
    const uploaded: T3Attachment[] = [];
    try {
      for (const attachment of attachments) {
        const file = await media.read(attachment.id);
        const type = /^image\/(?:png|jpeg|webp|gif)$/iu.test(
          file.contentType ?? "",
        )
          ? "image"
          : "file";
        const metadata = {
          name: file.filename,
          mimeType: file.contentType || "application/octet-stream",
          sizeBytes: file.bytes.byteLength,
          type,
        } as const;
        const upload = preparedUpload.parse(
          await client.call("t3_attachment_prepare_upload", {
            upload: metadata,
          }),
        );
        uploaded.push({ id: upload.attachmentId, ...metadata });
        const url = new URL(upload.relativeUrl, client.url);
        if (url.origin !== new URL(client.url).origin)
          throw new Error("T3 returned an upload on another origin.");
        const result = await this.fetcher(url, {
          method: "POST",
          body: file.bytes,
          redirect: "error",
          signal: AbortSignal.timeout(30_000),
        });
        if (!result.ok) throw new Error("T3 attachment upload failed.");
      }
    } catch (error) {
      await Promise.allSettled(
        uploaded.map((file) =>
          client.call("t3_attachment_discard", { attachmentId: file.id }),
        ),
      );
      throw error;
    }
    const forwarded = (message.message_snapshots ?? [])
      .map((snapshot) => snapshot.message.content?.trim())
      .filter(Boolean);
    const context = [
      ...(references?.content
        ? [`Referenced Discord message (context):\n${references.content}`]
        : []),
      ...forwarded.map(
        (content) => `Forwarded Discord message (context):\n${content}`,
      ),
    ]
      .map((content) => `\n\n${content}`)
      .join("");
    // Record before dispatch. An ambiguous network failure must not replay a mutation.
    state.seenMessageIds = [...state.seenMessageIds.slice(-255), message.id];
    this.store.save(task);
    try {
      if (uploaded.length)
        await client.call("t3_thread_send_attachments", {
          threadId: state.threadId,
          message: text + context,
          attachments: uploaded,
        });
      else
        await client.call("t3_thread_send", {
          threadId: state.threadId,
          message: text + context,
          mode: "auto",
          clientRequestId: `discord-message:${message.id}`,
        });
    } catch {
      throw new Error(
        "T3 message delivery could not be confirmed. Check the T3 session before resending; Sago will not replay it automatically.",
      );
    }
    this.nextPoll.delete(task.threadId);
  }

  async sync(task: SavedDeveloperThread, discord: DiscordRequest) {
    const client = this.boundClient(task);
    const state = task.t3!;
    for (let page = 0; page < 10; page++) {
      const read = t3ThreadRead.parse(
        await client.call("t3_thread_read", {
          threadId: state.threadId,
          view: "activity",
          ...(state.cursor === undefined
            ? {}
            : { afterPosition: state.cursor }),
          limit: 50,
          runLimit: 1,
          maxCharsPerItem: 50_000,
        }),
      );
      if (read.thread.projectId !== state.projectId)
        throw new Error("T3 session project changed unexpectedly.");
      state.link = this.webLink(read.thread.link) ?? state.link;
      const heading = `${read.thread.status} · ${read.thread.model} · ${read.thread.runtimeMode}`;
      const status = `**${heading}**\n${state.link ? `[Open in T3](${state.link})` : "T3 session"}${read.thread.branch ? ` · ${read.thread.branch}` : ""}\nReply here to continue. \`stop\`, \`status\`, or \`end dev thread\`.${read.thread.pendingRequestCount ? "\nT3 needs your input. Open the session to answer questions or approve actions." : ""}`;
      if (status !== state.statusText) {
        const response = await this.deliver(
          task,
          state.statusMessageId,
          status,
          "status",
          discord,
        );
        state.statusMessageId = response.id;
        state.statusText = status;
        this.store.save(task);
      }
      let blocked = false;
      for (const item of read.items) {
        const visible =
          item.sourceThreadId === state.threadId &&
          item.visibility === "local" &&
          visibleTypes.has(item.type);
        if (visible && item.text?.trim()) {
          let content = item.text;
          let offset = item.nextTextOffset;
          while (item.textTruncated && offset != null) {
            const extra = t3ThreadRead.parse(
              await client.call("t3_thread_read", {
                threadId: state.threadId,
                itemId: item.itemId,
                textOffset: offset,
                maxCharsPerItem: 50_000,
                limit: 1,
              }),
            );
            const continuation = extra.items[0];
            if (
              !continuation ||
              (continuation.nextTextOffset != null &&
                continuation.nextTextOffset <= offset)
            )
              throw new Error("T3 returned an invalid text page.");
            content += continuation.text ?? "";
            offset = continuation.nextTextOffset;
          }
          if (
            item.type === "user_input_request" &&
            !terminal.has(item.status)
          ) {
            const pending = z.object({ requestIds: z.array(z.string()) }).parse(
              await client.call("t3_pending_request", {
                action: "list",
                threadId: state.threadId,
              }),
            );
            if (pending.requestIds.length === 1) {
              const question = z
                .object({
                  requestId: z.string(),
                  questions: z.array(
                    z.object({
                      id: z.string(),
                      question: z.string(),
                      options: z.array(z.object({ label: z.string() })),
                    }),
                  ),
                })
                .parse(
                  await client.call("t3_pending_request", {
                    action: "read",
                    threadId: state.threadId,
                    requestId: pending.requestIds[0],
                  }),
                );
              content = question.questions
                .map((q) =>
                  [
                    q.question,
                    ...q.options.map((option) => `• ${option.label}`),
                  ].join("\n"),
                )
                .join("\n\n");
              if (question.questions.length === 1) {
                state.pendingQuestion = {
                  requestId: question.requestId,
                  questionId: question.questions[0]!.id,
                };
                content += "\n\nReply here with your answer, or respond in T3.";
              } else content += `\n\n[Respond in T3](${state.link})`;
            }
          } else if (item.type === "approval_request") {
            content += `\n\n${state.link ? `[Respond in T3](${state.link})` : "Respond in T3."}`;
          }
          if (item.type === "user_input_request" && terminal.has(item.status))
            delete state.pendingQuestion;
          await this.relay(task, item.itemId, content, discord);
        }
        if (visible && !terminal.has(item.status)) {
          blocked = true;
          break;
        }
        state.cursor = item.position;
        delete state.relay;
        this.store.save(task);
      }
      this.nextPoll.set(
        task.threadId,
        Date.now() +
          (terminal.has(read.thread.status) || read.thread.status === "idle"
            ? 15_000
            : 3_000),
      );
      if (blocked || !read.hasMore || !read.items.length) break;
    }
  }

  private async relay(
    task: SavedDeveloperThread,
    itemId: string,
    text: string,
    discord: DiscordRequest,
  ) {
    const state = task.t3!;
    if (state.relay?.itemId !== itemId)
      state.relay = { itemId, messageIds: [], text: "" };
    const relay = state.relay;
    if (relay.text === text) return;
    // Preserve all text, including long code blocks, instead of truncating at Discord's limit.
    const parts: string[] = [];
    for (let offset = 0; offset < text.length; ) {
      let end = Math.min(offset + 1900, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/u.test(text[end - 1]!)) end--;
      parts.push(text.slice(offset, end));
      offset = end;
    }
    for (const [index, content] of parts.entries()) {
      const id = relay.messageIds[index];
      const response = await this.deliver(
        task,
        id,
        content,
        `${itemId}:${index}`,
        discord,
      );
      relay.messageIds[index] = response.id;
      this.store.save(task);
    }
    while (relay.messageIds.length > parts.length) {
      await discord(
        `/channels/${task.threadId}/messages/${relay.messageIds.at(-1)}`,
        { method: "DELETE" },
      );
      relay.messageIds.pop();
      this.store.save(task);
    }
    relay.text = text;
    this.store.save(task);
  }
  private async deliver(
    task: SavedDeveloperThread,
    id: string | undefined,
    text: string,
    key: string,
    discord: DiscordRequest,
  ): Promise<{ id: string }> {
    if (id) {
      try {
        return await discord(`/channels/${task.threadId}/messages/${id}`, {
          method: "PATCH",
          body: messageBody(text),
        });
      } catch (error) {
        if (!(error instanceof Error) || !/^404\b/u.test(error.message))
          throw error;
      }
    }
    return discord(`/channels/${task.threadId}/messages`, {
      method: "POST",
      body: {
        ...messageBody(text),
        nonce: this.nonce(task, key),
        enforce_nonce: true,
      },
    });
  }

  private webLink(link: string | undefined) {
    if (!link || !this.client?.webUrl) return link;
    const parsed = new URL(link);
    const origin = new URL(this.client.webUrl);
    parsed.protocol = origin.protocol;
    parsed.host = origin.host;
    return parsed.toString();
  }

  private nonce(task: SavedDeveloperThread, key: string) {
    return createHash("sha256")
      .update(`${task.threadId}:${key}`)
      .digest("hex")
      .slice(0, 24);
  }
  private failure(error: unknown) {
    return error instanceof Error && !(error instanceof z.ZodError)
      ? error.message
      : "T3 returned an unsupported response. Check the T3 connection and server version.";
  }
  private post(
    task: SavedDeveloperThread,
    text: string,
    discord: DiscordRequest,
  ) {
    return discord(`/channels/${task.threadId}/messages`, {
      method: "POST",
      body: messageBody(text),
    });
  }

  startRelay(discord: DiscordRequest, ownerUserId: string) {
    if (this.wakeRelay) return;
    let polling = false;
    let woken = false;
    const schedule = (delay: number) => {
      if (this.wakeRelay !== wake) return;
      if (this.timer) this.relayTimers.cancel(this.timer);
      this.timer = this.relayTimers.schedule(() => void poll(), delay);
      this.timer.unref?.();
    };
    const wake = () => {
      if (polling) woken = true;
      else schedule(0);
    };
    const poll = async () => {
      this.timer = undefined;
      polling = true;
      let delay = 30_000;
      try {
        const tasks = this.store
          .list()
          .filter((task) => task.t3 && task.requesterUserId === ownerUserId);
        await Promise.allSettled(
          tasks
            .filter(
              (task) => (this.nextPoll.get(task.threadId) ?? 0) <= Date.now(),
            )
            .map((task) =>
              this.recover(task.threadId, async () => {
                const current = this.saved(task.threadId);
                if (current) await this.sync(current, discord);
              }).catch(() => {
                this.nextPoll.set(task.threadId, Date.now() + 30_000);
              }),
            ),
        );
        for (const task of tasks)
          delay = Math.min(
            delay,
            Math.max(0, (this.nextPoll.get(task.threadId) ?? 0) - Date.now()),
          );
      } catch {
        console.warn(
          "T3 relay storage is unavailable; retrying in 30 seconds.",
        );
      } finally {
        polling = false;
        schedule(woken ? 0 : delay);
        woken = false;
      }
    };
    this.wakeRelay = wake;
    void poll();
  }
  close() {
    this.wakeRelay = undefined;
    if (this.timer) this.relayTimers.cancel(this.timer);
    this.timer = undefined;
  }
}
