import { Database } from "bun:sqlite";
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from "node:crypto";
import { chmodSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { MailSettings } from "./mail-settings";

export const opaqueToken = () => randomBytes(32).toString("base64url");
export const tokenHash = (value: string) =>
  createHash("sha256").update(value).digest("hex");
type Invite = { hash: string; email: string; expires: number };
type Flow = {
  hash: string;
  invite: string;
  browser: string;
  verifier: string;
  expires: number;
  email: string;
};
export type MailCredential = {
  refreshToken: string;
  scope: string;
  connectedAt: number;
};

// Tokens and invitations belong to the host. Neither this store nor its key is mounted in workers.
export class MailStore {
  private db: Database;
  constructor(private settings: MailSettings) {
    const directory = dirname(settings.storePath);
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    chmodSync(directory, 0o700);
    this.db = new Database(settings.storePath, { create: true, strict: true });
    chmodSync(settings.storePath, 0o600);
    this.db.exec(`PRAGMA busy_timeout=5000;
      CREATE TABLE IF NOT EXISTS invites (hash TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS flows (hash TEXT PRIMARY KEY, invite TEXT NOT NULL, browser TEXT NOT NULL, verifier TEXT NOT NULL, expires INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS credentials (email TEXT PRIMARY KEY, client TEXT NOT NULL, ciphertext TEXT NOT NULL);`);
    this.db.exec(
      "CREATE TABLE IF NOT EXISTS receipts (browser TEXT PRIMARY KEY, email TEXT NOT NULL, expires INTEGER NOT NULL)",
    );
  }
  close() {
    this.db.close();
  }
  prune(now = Date.now()) {
    this.db.query("DELETE FROM flows WHERE expires <= ?").run(now);
    this.db.query("DELETE FROM invites WHERE expires <= ?").run(now);
    this.db.query("DELETE FROM receipts WHERE expires <= ?").run(now);
  }
  invite(email: string, hours = 72, now = Date.now()) {
    email = email.toLowerCase();
    if (!this.settings.accounts.includes(email))
      throw new Error("Mailbox is not in MINISAGO_MAIL_ACCOUNTS.");
    if (!Number.isInteger(hours) || hours < 1 || hours > 168)
      throw new Error("Invitation lifetime must be 1–168 hours.");
    this.prune(now);
    const token = opaqueToken();
    const expires = now + hours * 3600_000;
    this.db.transaction(() => {
      this.db
        .query(
          "DELETE FROM flows WHERE invite IN (SELECT hash FROM invites WHERE email = ?)",
        )
        .run(email);
      this.db.query("DELETE FROM invites WHERE email = ?").run(email);
      this.db
        .query("INSERT INTO invites VALUES (?, ?, ?)")
        .run(tokenHash(token), email, expires);
    })();
    return { token, email, expires };
  }
  getInvite(token: string, now = Date.now()) {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(token)) return null;
    const row = this.db
      .query<
        Invite,
        [string, number]
      >("SELECT * FROM invites WHERE hash = ? AND expires > ?")
      .get(tokenHash(token), now);
    return row && this.settings.accounts.includes(row.email) ? row : null;
  }
  startFlow(invite: Invite, now = Date.now()) {
    this.prune(now);
    const state = opaqueToken(),
      browser = opaqueToken(),
      verifier = opaqueToken();
    this.db.transaction(() => {
      this.db.query("DELETE FROM flows WHERE invite = ?").run(invite.hash);
      this.db
        .query("INSERT INTO flows VALUES (?, ?, ?, ?, ?)")
        .run(
          tokenHash(state),
          invite.hash,
          tokenHash(browser),
          verifier,
          Math.min(invite.expires, now + 15 * 60_000),
        );
    })();
    return { state, browser, verifier };
  }
  takeFlow(state: string, browser: string, now = Date.now()): Flow | null {
    if (
      !/^[A-Za-z0-9_-]{43}$/u.test(state) ||
      !/^[A-Za-z0-9_-]{43}$/u.test(browser)
    )
      return null;
    return this.db.transaction(() => {
      const row = this.db
        .query<Flow, [string, string, number, number]>(
          `SELECT flows.*, invites.email FROM flows JOIN invites ON invites.hash = flows.invite
        WHERE flows.hash = ? AND flows.browser = ? AND flows.expires > ? AND invites.expires > ?`,
        )
        .get(tokenHash(state), tokenHash(browser), now, now);
      if (!row || !this.settings.accounts.includes(row.email)) return null;
      this.db.query("DELETE FROM flows WHERE hash = ?").run(row.hash);
      return row;
    })();
  }
  connect(flow: Flow, credential: MailCredential, now = Date.now()) {
    const ciphertext = this.encrypt(flow.email, credential);
    this.db.transaction(() => {
      const invite = this.db
        .query<
          Invite,
          [string, number]
        >("SELECT * FROM invites WHERE hash = ? AND expires > ?")
        .get(flow.invite, now);
      if (
        !invite ||
        invite.email !== flow.email ||
        !this.settings.accounts.includes(flow.email)
      )
        throw new Error("Invitation is no longer valid.");
      this.db
        .query("INSERT OR REPLACE INTO credentials VALUES (?, ?, ?)")
        .run(flow.email, this.settings.clientId, ciphertext);
      this.db.query("DELETE FROM flows WHERE invite = ?").run(flow.invite);
      this.db.query("DELETE FROM invites WHERE hash = ?").run(flow.invite);
      this.db
        .query("INSERT OR REPLACE INTO receipts VALUES (?, ?, ?)")
        .run(flow.browser, flow.email, now + 5 * 60_000);
    })();
  }
  credential(email: string): MailCredential | null {
    if (!this.settings.accounts.includes(email)) return null;
    const row = this.db
      .query<
        { ciphertext: string },
        [string, string]
      >("SELECT ciphertext FROM credentials WHERE email = ? AND client = ?")
      .get(email, this.settings.clientId);
    if (!row) return null;
    const [iv, tag, data] = row.ciphertext
      .split(".")
      .map((part) => Buffer.from(part, "base64"));
    const decipher = createDecipheriv(
      "aes-256-gcm",
      Buffer.from(this.settings.encryptionKey, "base64"),
      iv!,
    );
    decipher.setAAD(Buffer.from(`${this.settings.clientId}:${email}`));
    decipher.setAuthTag(tag!);
    return JSON.parse(
      Buffer.concat([decipher.update(data!), decipher.final()]).toString(),
    ) as MailCredential;
  }
  accounts() {
    return this.settings.accounts.map((email) => ({
      email,
      connectedAt: this.credential(email)?.connectedAt ?? null,
    }));
  }
  connectedBrowser(browser: string, now = Date.now()) {
    if (!/^[A-Za-z0-9_-]{43}$/u.test(browser)) return false;
    const row = this.db
      .query<
        { email: string },
        [string, number]
      >("SELECT email FROM receipts WHERE browser = ? AND expires > ?")
      .get(tokenHash(browser), now);
    return Boolean(row && this.credential(row.email));
  }
  disconnect(email: string) {
    this.db.transaction(() => {
      this.db.query("DELETE FROM credentials WHERE email = ?").run(email);
      this.db
        .query(
          "DELETE FROM flows WHERE invite IN (SELECT hash FROM invites WHERE email = ?)",
        )
        .run(email);
      this.db.query("DELETE FROM invites WHERE email = ?").run(email);
      this.db.query("DELETE FROM receipts WHERE email = ?").run(email);
    })();
  }
  private encrypt(email: string, value: MailCredential) {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      "aes-256-gcm",
      Buffer.from(this.settings.encryptionKey, "base64"),
      iv,
    );
    cipher.setAAD(Buffer.from(`${this.settings.clientId}:${email}`));
    const data = Buffer.concat([
      cipher.update(JSON.stringify(value)),
      cipher.final(),
    ]);
    return [iv, cipher.getAuthTag(), data]
      .map((part) => part.toString("base64"))
      .join(".");
  }
}
