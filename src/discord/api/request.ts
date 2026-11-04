import { timing, type TimingSink } from "../../observability/timing";
import { setTimeout as delay } from "node:timers/promises";
const DISCORD_API_BASE_URL = "https://discord.com/api/v10";
const REQUEST_TIMEOUT_MS = 30_000;

export type DiscordRequest = <T>(
  path: string,
  options?: {
    method?: string;
    body?: unknown;
    formData?: FormData;
    authenticated?: boolean;
  },
) => Promise<T>;

export function createDiscordRequest(
  botToken: string,
  onTiming?: TimingSink,
): DiscordRequest {
  const clock = timing(onTiming);
  async function discordRequest<T>(
    path: string,
    options: Parameters<DiscordRequest>[1] = {},
    retries = 3,
    signal = AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  ): Promise<T> {
    const headers: Record<string, string> = {};
    if (options.authenticated !== false) {
      headers.Authorization = `Bot ${botToken}`;
    }
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    const response = await clock.span("http.response_headers", () =>
      fetch(`${DISCORD_API_BASE_URL}${path}`, {
        signal,
        method: options.method ?? "GET",
        headers,
        body:
          options.formData ??
          (options.body === undefined
            ? undefined
            : JSON.stringify(options.body)),
      }),
    );
    clock.mark(`http.status.${response.status}`);

    if (response.status === 429 && retries > 0) {
      const payload = (await clock.span("http.decode_body", () =>
        response.json(),
      )) as { retry_after?: number };
      await clock.span("http.rate_limit_wait", () =>
        delay(Math.ceil((payload.retry_after ?? 1) * 1_000), undefined, {
          signal,
        }),
      );
      return discordRequest<T>(path, options, retries - 1, signal);
    }
    if (!response.ok) {
      throw new Error(`${response.status} ${await response.text()}`);
    }
    if (response.status === 204) {
      return undefined as T;
    }
    return (await clock.span("http.decode_body", () => response.json())) as T;
  }

  return discordRequest;
}
