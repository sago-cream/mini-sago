export const BOT_PRESENCE_STATUSES = [
  "online",
  "idle",
  "dnd",
  "invisible",
] as const;
export type BotPresenceStatus = (typeof BOT_PRESENCE_STATUSES)[number];
export type BotStatusInput = { text: string; presence?: BotPresenceStatus };
export type BotStatusResult =
  | { status: "updated"; text: string; presence: BotPresenceStatus }
  | { status: "gateway_unavailable" }
  | { status: "rate_limited"; retryAfterMs: number };
interface ManagementSocket {
  send(data: string): void;
}

// The host provides only a ready Gateway socket; tools never accept sockets or URLs.
export class BotManagement {
  private text: string;
  private presence: BotPresenceStatus = "online";
  private presenceUpdates: number[] = [];
  private reapplyTimer: ReturnType<typeof setTimeout> | undefined;

  constructor(
    private readonly getSocket: () => ManagementSocket | null,
    initialText = process.env.DISCORD_CUSTOM_STATUS ?? "mini.sagocream.com",
    private readonly now: () => number = Date.now,
  ) {
    this.text = this.normalizeText(initialText);
  }

  private normalizeText(text: string) {
    if (text.length > 128)
      throw new Error("Custom status must be at most 128 characters.");
    return text.trim();
  }

  getPresence() {
    return {
      since: null,
      activities: this.text
        ? [{ name: "Custom Status", type: 4, state: this.text }]
        : [],
      status: this.presence,
      afk: false,
    };
  }

  updateCustomStatus(input: BotStatusInput): BotStatusResult {
    const text = this.normalizeText(input.text);
    const presence = input.presence ?? this.presence;
    if (!BOT_PRESENCE_STATUSES.includes(presence))
      throw new Error("Invalid presence status.");
    const socket = this.getSocket();
    if (!socket) return { status: "gateway_unavailable" };
    const time = this.now();
    const retryAfterMs = this.retryAfter(time);
    if (retryAfterMs) return { status: "rate_limited", retryAfterMs };
    const previous = { text: this.text, presence: this.presence };
    this.text = text;
    this.presence = presence;
    try {
      socket.send(JSON.stringify({ op: 3, d: this.getPresence() }));
    } catch (error) {
      this.text = previous.text;
      this.presence = previous.presence;
      throw error;
    }
    this.presenceUpdates.push(time);
    this.dispose();
    return { status: "updated", text, presence };
  }

  private retryAfter(time: number) {
    this.presenceUpdates = this.presenceUpdates.filter(
      (at) => time - at < 20_000,
    );
    return this.presenceUpdates.length >= 5
      ? 20_000 - (time - this.presenceUpdates[0]!)
      : 0;
  }

  reapplyPresence() {
    this.dispose();
    const socket = this.getSocket();
    if (!socket) return;
    const time = this.now();
    const retryAfterMs = this.retryAfter(time);
    if (retryAfterMs) {
      this.reapplyTimer = setTimeout(
        () => this.reapplyPresence(),
        retryAfterMs,
      );
      return;
    }
    try {
      socket.send(JSON.stringify({ op: 3, d: this.getPresence() }));
      this.presenceUpdates.push(time);
    } catch {
      // A later resumed connection will reapply the desired presence.
      console.warn("Could not reapply Discord bot presence.");
    }
  }

  dispose() {
    if (this.reapplyTimer) clearTimeout(this.reapplyTimer);
    this.reapplyTimer = undefined;
  }
}

let activeManagement: BotManagement | null = null;
export function registerBotManagement(management: BotManagement | null) {
  activeManagement = management;
}
export function updateCustomStatus(input: BotStatusInput): BotStatusResult {
  return (
    activeManagement?.updateCustomStatus(input) ?? {
      status: "gateway_unavailable",
    }
  );
}
