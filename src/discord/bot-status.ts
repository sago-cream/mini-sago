import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdir, open, rename, rm } from "node:fs/promises";
import { dirname } from "node:path";

export const BOT_PRESENCE_STATUSES = [
  "online",
  "idle",
  "dnd",
  "invisible",
] as const;
export type BotPresenceStatus = (typeof BOT_PRESENCE_STATUSES)[number];
export type BotStatus = { text: string; presence: BotPresenceStatus };
export interface BotStatusPersistence {
  load(): BotStatus;
  save(status: BotStatus): Promise<void>;
}
export function normalizeBotStatus(status: BotStatus): BotStatus {
  if (typeof status.text !== "string" || status.text.length > 128)
    throw new Error("Custom status must be at most 128 characters.");
  if (!BOT_PRESENCE_STATUSES.includes(status.presence))
    throw new Error("Invalid presence status.");
  return { text: status.text.trim(), presence: status.presence };
}
export function botStatusFile(environment: NodeJS.ProcessEnv = process.env) {
  return (
    environment.MINISAGO_BOT_STATUS_FILE?.trim() ||
    (environment.NODE_ENV === "production"
      ? "/app/state/bot-status.json"
      : ".data/bot-status.json")
  );
}

export class BotStatusStore implements BotStatusPersistence {
  constructor(
    private readonly filePath = botStatusFile(),
    private readonly initialText = process.env.DISCORD_CUSTOM_STATUS ??
      "mini.sagocream.com",
  ) {}

  load(): BotStatus {
    let raw: string;
    try {
      raw = readFileSync(this.filePath, "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT")
        return normalizeBotStatus({
          text: this.initialText,
          presence: "online",
        });
      throw error;
    }
    const parsed: unknown = JSON.parse(raw);
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("text" in parsed) ||
      typeof parsed.text !== "string" ||
      !("presence" in parsed) ||
      typeof parsed.presence !== "string"
    )
      throw new Error("Invalid persisted bot status.");
    return normalizeBotStatus({
      text: parsed.text,
      presence: parsed.presence as BotPresenceStatus,
    });
  }

  async save(status: BotStatus) {
    const snapshot = { version: 1, ...normalizeBotStatus(status) };
    const directory = dirname(this.filePath);
    await mkdir(directory, { recursive: true });
    const temporaryPath = `${this.filePath}.${randomUUID()}.tmp`;
    try {
      const file = await open(temporaryPath, "wx", 0o600);
      try {
        await file.writeFile(`${JSON.stringify(snapshot)}\n`, "utf8");
        await file.sync();
      } finally {
        await file.close();
      }
      await rename(temporaryPath, this.filePath);
      const parent = await open(directory, "r");
      try {
        await parent.sync();
      } finally {
        await parent.close();
      }
    } finally {
      await rm(temporaryPath, { force: true });
    }
  }
}
