import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type {
  ChatbotMessage,
  ChatbotOutgoingFile,
  DeveloperTaskOutcome,
  OracleAnswerJob,
} from "../../contracts/worker-contract";

export type DeveloperTaskState =
  | DeveloperTaskOutcome["state"]
  | "queued"
  | "running"
  | "stopping"
  | "stopped"
  | "failed";
export type StoredDeveloperTask = {
  id: string;
  threadId: string;
  requesterUserId: string;
  repository: string;
  request: string;
  job: Omit<OracleAnswerJob, "mcpAccessToken">;
  state: DeveloperTaskState;
  summary: string;
  sessionId?: string;
  workerId?: string;
  outcome?: DeveloperTaskOutcome;
  requiresAddressing?: boolean;
  statusMessageId?: string;
};

type InboxRow = {
  messageId: string;
  request: string;
  requestMessage?: ChatbotMessage;
};
export type DeveloperOutboxRow = {
  id: number;
  threadId: string;
  content: string;
  nonce: string;
  files?: ChatbotOutgoingFile[];
};

export class DeveloperTaskStore {
  private db: Database;
  constructor(path: string) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.db = new Database(path, { create: true });
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS dev_tasks (
        id TEXT PRIMARY KEY, thread_id TEXT UNIQUE NOT NULL, record TEXT NOT NULL,
        generation INTEGER NOT NULL DEFAULT 0, lease_owner TEXT, lease_until INTEGER NOT NULL DEFAULT 0
      );
      CREATE TABLE IF NOT EXISTS dev_events (id INTEGER PRIMARY KEY AUTOINCREMENT, task_id TEXT NOT NULL, state TEXT NOT NULL, summary TEXT NOT NULL, created_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS dev_inbox (
        message_id TEXT PRIMARY KEY, task_id TEXT NOT NULL, request TEXT NOT NULL,
        state TEXT NOT NULL DEFAULT 'pending', sequence INTEGER NOT NULL, request_message_json TEXT
      );
      CREATE TABLE IF NOT EXISTS dev_outbox (
        id INTEGER PRIMARY KEY AUTOINCREMENT, thread_id TEXT NOT NULL, content TEXT NOT NULL,
        nonce TEXT NOT NULL UNIQUE, files_json TEXT, delivered INTEGER NOT NULL DEFAULT 0
      );`);
  }
  list(): StoredDeveloperTask[] {
    return (
      this.db.query("SELECT record FROM dev_tasks ORDER BY rowid").all() as {
        record: string;
      }[]
    ).map((row) => JSON.parse(row.record));
  }
  save(task: StoredDeveloperTask) {
    // Never persist an MCP bearer token, Discord transport, or runner closure.
    const { mcpAccessToken: _, ...job } = task.job as OracleAnswerJob;
    const previous = this.db
      .query("SELECT record FROM dev_tasks WHERE id=?")
      .get(task.id) as { record: string } | null;
    if (!previous || JSON.parse(previous.record).state !== task.state)
      this.db
        .query(
          "INSERT INTO dev_events(task_id, state, summary, created_at) VALUES (?, ?, ?, ?)",
        )
        .run(task.id, task.state, task.summary, Date.now());
    this.db
      .query(
        `INSERT INTO dev_tasks(id, thread_id, record) VALUES (?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET record=excluded.record`,
      )
      .run(task.id, task.threadId, JSON.stringify({ ...task, job }));
  }
  complete(
    task: StoredDeveloperTask,
    messages: {
      content: string;
      nonce: string;
      files?: ChatbotOutgoingFile[];
    }[],
  ) {
    this.db.transaction(() => {
      this.save(task);
      for (const message of messages)
        this.post(task.threadId, message.content, message.nonce, message.files);
    })();
  }
  enqueue(
    taskId: string,
    messageId: string,
    request: string,
    requestMessage?: ChatbotMessage,
  ): boolean {
    if (
      this.db
        .query("SELECT message_id FROM dev_inbox WHERE message_id=?")
        .get(messageId)
    )
      return false;
    if (this.pending(taskId).length >= 20)
      throw new Error(
        "This coding task already has 20 queued directions. Pause it before adding more.",
      );
    return (
      this.db
        .query(
          "INSERT OR IGNORE INTO dev_inbox(message_id, task_id, request, sequence, request_message_json) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          messageId,
          taskId,
          request,
          Date.now(),
          requestMessage ? JSON.stringify(requestMessage) : null,
        ).changes > 0
    );
  }
  pending(taskId: string): InboxRow[] {
    return (
      this.db
        .query(
          "SELECT message_id AS messageId, request, request_message_json FROM dev_inbox WHERE task_id=? AND state='pending' ORDER BY sequence, rowid",
        )
        .all(taskId) as (InboxRow & { request_message_json: string | null })[]
    ).map(({ request_message_json, ...row }) => ({
      ...row,
      ...(request_message_json
        ? { requestMessage: JSON.parse(request_message_json) }
        : {}),
    }));
  }
  acknowledge(messageId: string) {
    this.db
      .query("UPDATE dev_inbox SET state='applied' WHERE message_id=?")
      .run(messageId);
  }
  cancelPending(taskId: string) {
    this.db
      .query(
        "UPDATE dev_inbox SET state='cancelled' WHERE task_id=? AND state='pending'",
      )
      .run(taskId);
  }
  directions(taskId: string): string[] {
    return (
      this.db
        .query(
          "SELECT request FROM dev_inbox WHERE task_id=? AND state!='cancelled' AND message_id NOT LIKE 'github:%' ORDER BY sequence, rowid",
        )
        .all(taskId) as { request: string }[]
    ).map((row) => row.request);
  }
  claim(taskId: string, owner: string, now = Date.now()): number | undefined {
    // A new controller cannot overlap a still-live runner from an old process.
    const row = this.db
      .query(
        `UPDATE dev_tasks SET generation=generation+1, lease_owner=?, lease_until=?
      WHERE id=? AND lease_until<=? RETURNING generation`,
      )
      .get(owner, now + 16 * 60_000, taskId, now) as {
      generation: number;
    } | null;
    return row?.generation;
  }
  owns(taskId: string, owner: string, generation: number) {
    return Boolean(
      this.db
        .query(
          "SELECT id FROM dev_tasks WHERE id=? AND lease_owner=? AND generation=? AND lease_until>?",
        )
        .get(taskId, owner, generation, Date.now()),
    );
  }
  release(taskId: string, owner: string, generation: number) {
    this.db
      .query(
        "UPDATE dev_tasks SET lease_owner=NULL, lease_until=0 WHERE id=? AND lease_owner=? AND generation=?",
      )
      .run(taskId, owner, generation);
  }
  post(
    threadId: string,
    content: string,
    nonce: string,
    files?: ChatbotOutgoingFile[],
  ) {
    this.db
      .query(
        "INSERT OR IGNORE INTO dev_outbox(thread_id, content, nonce, files_json) VALUES (?, ?, ?, ?)",
      )
      .run(
        threadId,
        content,
        nonce,
        files?.length ? JSON.stringify(files) : null,
      );
  }
  outbox(): DeveloperOutboxRow[] {
    return (
      this.db
        .query(
          "SELECT id, thread_id AS threadId, content, nonce, files_json FROM dev_outbox WHERE delivered=0 ORDER BY id LIMIT 100",
        )
        .all() as (DeveloperOutboxRow & { files_json: string | null })[]
    ).map(({ files_json, ...row }) => ({
      ...row,
      ...(files_json ? { files: JSON.parse(files_json) } : {}),
    }));
  }
  delivered(id: number) {
    this.db
      .query("UPDATE dev_outbox SET delivered=1, files_json=NULL WHERE id=?")
      .run(id);
  }
  close() {
    this.db.close();
  }
}
