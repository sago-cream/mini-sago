import {
  BotStatusStore,
  normalizeBotStatus,
  type BotStatus,
  type BotStatusPersistence,
} from "./bot-status";
export { BOT_PRESENCE_STATUSES } from "./bot-status";
export type BotStatusInput = { text: string; presence?: BotStatus["presence"] };
export type BotStatusResult =
  | ({ status: "updated" | "saved" } & BotStatus)
  | { status: "gateway_unavailable" }
  | { status: "rate_limited"; retryAfterMs: number };
interface ManagementSocket {
  send(data: string): void;
}

// The host supplies the storage and ready Gateway socket, never MCP arguments.
export class BotManagement {
  private current: BotStatus;
  private mutationQueue: Promise<unknown> = Promise.resolve();
  private presenceUpdates: number[] = [];
  private reapplyTimer: ReturnType<typeof setTimeout> | undefined;
  private stopped = false;

  constructor(
    private readonly getSocket: () => ManagementSocket | null,
    private readonly store: BotStatusPersistence = new BotStatusStore(),
    private readonly now: () => number = Date.now,
  ) {
    this.current = normalizeBotStatus(store.load());
  }

  getPresence() {
    return {
      since: null,
      activities: this.current.text
        ? [{ name: "Custom Status", type: 4, state: this.current.text }]
        : [],
      status: this.current.presence,
      afk: false,
    };
  }

  updateCustomStatus(input: BotStatusInput): Promise<BotStatusResult> {
    // Serialize persistence and delivery, including omitted presence defaults.
    const mutation = this.mutationQueue.then(
      async (): Promise<BotStatusResult> => {
        if (this.stopped) return { status: "gateway_unavailable" };
        const next = normalizeBotStatus({
          text: input.text,
          presence: input.presence ?? this.current.presence,
        });
        const retryAfterMs = this.retryAfter(this.now());
        if (retryAfterMs) return { status: "rate_limited", retryAfterMs };
        await this.store.save(next);
        this.current = next;
        const delivered = this.reapplyPresence();
        return { status: delivered ? "updated" : "saved", ...next };
      },
    );
    this.mutationQueue = mutation.catch(() => undefined);
    return mutation;
  }

  private retryAfter(time: number) {
    this.presenceUpdates = this.presenceUpdates.filter(
      (at) => time - at < 20_000,
    );
    return this.presenceUpdates.length >= 5
      ? 20_000 - (time - this.presenceUpdates[0]!)
      : 0;
  }

  reapplyPresence(): boolean {
    this.clearReapplyTimer();
    if (this.stopped) return false;
    const socket = this.getSocket();
    if (!socket) return false;
    const time = this.now();
    const retryAfterMs = this.retryAfter(time);
    if (retryAfterMs) {
      this.reapplyTimer = setTimeout(
        () => this.reapplyPresence(),
        retryAfterMs,
      );
      return false;
    }
    try {
      socket.send(JSON.stringify({ op: 3, d: this.getPresence() }));
      this.presenceUpdates.push(time);
      return true;
    } catch {
      // The durable status will be applied on a later ready connection.
      console.warn("Could not apply saved Discord bot presence.");
      return false;
    }
  }

  private clearReapplyTimer() {
    if (this.reapplyTimer) clearTimeout(this.reapplyTimer);
    this.reapplyTimer = undefined;
  }
  dispose() {
    this.stopped = true;
    this.clearReapplyTimer();
  }
}

let activeManagement: BotManagement | null = null;
export function registerBotManagement(management: BotManagement | null) {
  activeManagement = management;
}
export async function updateCustomStatus(
  input: BotStatusInput,
): Promise<BotStatusResult> {
  return (
    activeManagement?.updateCustomStatus(input) ?? {
      status: "gateway_unavailable",
    }
  );
}
