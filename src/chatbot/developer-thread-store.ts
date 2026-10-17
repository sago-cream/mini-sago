import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { PreservedDeveloperTask } from "../../contracts/worker-contract";

export const DEVELOPER_TASK_TTL_MS = 3 * 24 * 60 * 60_000;
export type SavedDeveloperThread = PreservedDeveloperTask & {
  threadId: string;
  guildId: string;
  requiresAddressing: boolean;
  expiresAt: number;
};

export function developerThreadStorePath(environment = process.env) {
  return (
    environment.MINISAGO_DEVELOPER_THREADS_PATH?.trim() ||
    (environment.NODE_ENV === "production"
      ? "/app/state/developer-threads.sqlite"
      : ".data/developer-threads.sqlite")
  );
}

/** Durable task identity only: never persist request tokens, leases, or MCP sessions. */
export class DeveloperThreadStore {
  private readonly database: Database;

  constructor(path = developerThreadStorePath()) {
    if (path !== ":memory:")
      mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
    this.database = new Database(path, { create: true, strict: true });
    if (path !== ":memory:") chmodSync(path, 0o600);
    this.database.exec(`PRAGMA busy_timeout=5000;
      PRAGMA secure_delete=ON;
      CREATE TABLE IF NOT EXISTS developer_threads (
        thread_id TEXT PRIMARY KEY,
        expires_at INTEGER NOT NULL,
        task_json TEXT NOT NULL
      );`);
    this.prune();
  }

  get(threadId: string, now = Date.now()): SavedDeveloperThread | undefined {
    const row = this.database
      .query<
        { task_json: string },
        [string, number]
      >("SELECT task_json FROM developer_threads WHERE thread_id = ? AND expires_at > ?")
      .get(threadId, now);
    return row
      ? (JSON.parse(row.task_json) as SavedDeveloperThread)
      : undefined;
  }

  save(task: SavedDeveloperThread) {
    this.prune();
    this.database
      .query(
        "INSERT OR REPLACE INTO developer_threads (thread_id, expires_at, task_json) VALUES (?, ?, ?)",
      )
      .run(task.threadId, task.expiresAt, JSON.stringify(task));
  }

  remove(threadId: string) {
    this.database
      .query("DELETE FROM developer_threads WHERE thread_id = ?")
      .run(threadId);
  }

  private prune() {
    this.database
      .query("DELETE FROM developer_threads WHERE expires_at <= ?")
      .run(Date.now());
  }

  close() {
    this.database.close();
  }
}
