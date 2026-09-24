import type { CcxpCoverage } from "./ccxp-meetings";
import { Database } from "bun:sqlite";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type CcxpSyncRequest = {
  id: string;
  requestedAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  state: "queued" | "running" | "completed" | "auth_required" | "failed";
};
export type CcxpCollectorStatus = {
  state: "healthy" | "auth_required" | "unavailable";
  updatedAt: string;
  episode: string;
  reason?: string;
  coverage?: CcxpCoverage;
  running?: boolean;
  nextRunAt?: string | null;
};

// This small control database is separate from the read-only meeting index and
// the collector's private browser state. SQLite serializes concurrent requests.
export class CcxpSyncQueue {
  private db: Database;
  constructor(path: string) {
    mkdirSync(dirname(path), { recursive: true, mode: 0o750 });
    this.db = new Database(path, { create: true });
    chmodSync(path, 0o600);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS requests (
        id TEXT PRIMARY KEY, requestedAt TEXT NOT NULL,
        startedAt TEXT, finishedAt TEXT, state TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS request_keys (id TEXT PRIMARY KEY, requestId TEXT NOT NULL)`);
  }
  latest() {
    return this.db
      .query<
        CcxpSyncRequest,
        []
      >("SELECT * FROM requests ORDER BY rowid DESC LIMIT 1")
      .get();
  }
  active() {
    return this.db
      .query<
        CcxpSyncRequest,
        []
      >("SELECT * FROM requests WHERE state IN ('queued','running') ORDER BY rowid LIMIT 1")
      .get();
  }
  enqueue(id: string, now = Date.now()) {
    return this.db
      .transaction(() => {
        const existing = this.db
          .query<
            CcxpSyncRequest,
            [string]
          >("SELECT r.* FROM requests r JOIN request_keys k ON k.requestId=r.id WHERE k.id=?")
          .get(id);
        if (existing) return { status: existing.state, request: existing };
        const active = this.active();
        if (active) {
          this.remember(id, active.id);
          return { status: active.state, request: active };
        }
        const latest = this.latest();
        const retryAt = latest ? Date.parse(latest.requestedAt) + 5 * 60000 : 0;
        if (retryAt > now)
          return {
            status: "cooldown",
            retryAt: new Date(retryAt).toISOString(),
            request: latest,
          };
        this.db
          .query(
            "INSERT INTO requests (id, requestedAt, state) VALUES (?, ?, 'queued')",
          )
          .run(id, new Date(now).toISOString());
        this.db.exec(
          "DELETE FROM requests WHERE rowid NOT IN (SELECT rowid FROM requests ORDER BY rowid DESC LIMIT 100)",
        );
        this.remember(id, id);
        return { status: "queued", request: this.latest()! };
      })
      .immediate();
  }
  private remember(id: string, requestId: string) {
    this.db.query("INSERT INTO request_keys VALUES (?, ?)").run(id, requestId);
    this.db.exec(
      "DELETE FROM request_keys WHERE requestId NOT IN (SELECT id FROM requests) OR rowid NOT IN (SELECT rowid FROM request_keys ORDER BY rowid DESC LIMIT 1000)",
    );
  }
  start(id: string, now = Date.now()) {
    this.db
      .query(
        "UPDATE requests SET state='running', startedAt=? WHERE id=? AND state IN ('queued','running')",
      )
      .run(new Date(now).toISOString(), id);
  }
  finish(
    id: string,
    state: "completed" | "auth_required" | "failed",
    now = Date.now(),
  ) {
    this.db
      .query(
        "UPDATE requests SET state=?, finishedAt=? WHERE id=? AND state IN ('queued','running')",
      )
      .run(state, new Date(now).toISOString(), id);
  }
  close() {
    this.db.close();
  }
}
