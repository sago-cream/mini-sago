import { expect, spyOn, test } from "bun:test";

import { createDiscordRequest } from "./request";

test("serializes JSON and retries Discord rate limits", async () => {
  const originalFetch = globalThis.fetch;
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  globalThis.fetch = (async (input, init) => {
    requests.push({ url: String(input), init });
    return requests.length === 1
      ? new Response(JSON.stringify({ retry_after: 0 }), { status: 429 })
      : Response.json({ id: "message-1" });
  }) as typeof fetch;

  try {
    const request = createDiscordRequest("secret");
    const result = await request<{ id: string }>("/channels/1/messages", {
      method: "POST",
      body: { content: "hello" },
    });

    expect(result).toEqual({ id: "message-1" });
    expect(requests).toHaveLength(2);
    expect(requests[0]).toEqual({
      url: "https://discord.com/api/v10/channels/1/messages",
      init: {
        signal: expect.any(AbortSignal),
        method: "POST",
        headers: {
          Authorization: "Bot secret",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ content: "hello" }),
      },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("aborts a stalled Discord call without retrying the mutation", async () => {
  const controller = new AbortController();
  const timeout = spyOn(AbortSignal, "timeout").mockReturnValue(
    controller.signal,
  );
  const originalFetch = globalThis.fetch;
  let requests = 0;
  globalThis.fetch = (async (_input, init) => {
    requests++;
    return new Promise<Response>((_resolve, reject) => {
      init!.signal!.addEventListener(
        "abort",
        () => reject(init!.signal!.reason),
        { once: true },
      );
    });
  }) as typeof fetch;
  try {
    const result = createDiscordRequest("secret")("/channels/1/messages", {
      method: "POST",
      body: { content: "hello" },
    });
    controller.abort(new DOMException("Deadline exceeded", "TimeoutError"));
    await expect(result).rejects.toThrow("Deadline exceeded");
    expect(timeout).toHaveBeenCalledWith(30_000);
    expect(requests).toBe(1);
  } finally {
    timeout.mockRestore();
    globalThis.fetch = originalFetch;
  }
});

test("the same deadline covers all rate-limit retries", async () => {
  const controller = new AbortController();
  const timeout = spyOn(AbortSignal, "timeout").mockReturnValue(
    controller.signal,
  );
  const originalFetch = globalThis.fetch;
  const signals: Array<AbortSignal | null | undefined> = [];
  globalThis.fetch = (async (_input, init) => {
    signals.push(init?.signal);
    if (signals.length === 2) controller.abort();
    return Response.json(
      { retry_after: signals.length === 1 ? 0 : 60 },
      { status: 429 },
    );
  }) as typeof fetch;
  try {
    await expect(
      createDiscordRequest("secret")("/channels/1/messages"),
    ).rejects.toThrow();
    expect(signals).toEqual([controller.signal, controller.signal]);
    expect(timeout).toHaveBeenCalledTimes(1);
  } finally {
    timeout.mockRestore();
    globalThis.fetch = originalFetch;
  }
});
