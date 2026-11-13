import { afterEach, expect, test } from "bun:test";
import { readLink } from "./link-reader";

const originalFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = originalFetch;
});

function item(id: number, text: string, account = "hololive_dreams") {
  return `<item><link>https://x.com/${account}/status/${id}</link>
    <pubDate>Fri, 13 Nov 2026 09:00:04 GMT</pubDate>
    <description><![CDATA[<p>${text}</p>]]></description>
    <enclosure url="https://pbs.twimg.com/media/${id}.jpg?name=orig&amp;format=jpg" />
    </item>`;
}

function feed(items: string) {
  return `<?xml version="1.0"?><rss><channel>${items}</channel></rss>`;
}

test("X profile reads include older announcements and skill replies with original media links", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (
    input: Parameters<typeof fetch>[0],
    options?: Parameters<typeof fetch>[1],
  ) => {
    requests.push(String(input));
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.headers).not.toHaveProperty("Authorization");
    return new Response(
      feed(
        Array.from({ length: 15 }, (_, index) =>
          item(index + 100, "Newer post"),
        ).join("") +
          item(42, "Roboco card announcement &amp; details") +
          item(43, "Roboco skill information"),
      ),
    );
  }) as unknown as typeof fetch;
  const result = await readLink({ url: "https://x.com/hololive_dreams" });
  expect(requests).toEqual([
    "https://fxtwitter.com/hololive_dreams/feed.xml?count=20",
  ]);
  expect(result).toMatchObject({ status: "complete", truncated: false });
  expect(result.content).toContain("Roboco card announcement & details");
  expect(result.content).toContain("https://x.com/hololive_dreams/status/43");
  expect(result.content).toContain("Roboco skill information");
  expect(result.content).toContain(
    "https://pbs.twimg.com/media/43.jpg?name=orig&format=jpg",
  );
  expect(result.scope).toContain("not a complete timeline");
  expect(result.scope).toContain("Missing entries do not prove absence");
  expect(result).toHaveProperty("retrievedVia", requests[0]);
});

test.each([
  "https://twitter.com/hololive_dreams/",
  "https://fxtwitter.com/hololive_dreams/media",
  "https://x.com/hololive_dreams/with_replies",
])(
  "normalizes profile variants and labels the shared recent window: %s",
  async (url) => {
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
      expect(String(input)).toBe(
        "https://fxtwitter.com/hololive_dreams/feed.xml?count=20",
      );
      return new Response(feed(item(42, "Announcement")));
    }) as unknown as typeof fetch;
    const result = await readLink({ url });
    expect(result.status).toBe("complete");
    expect(result.scope).toContain("same recent-post window");
  },
);

test("filters reposts, invalid links and unrelated sources without following them", async () => {
  const requests: string[] = [];
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    requests.push(String(input));
    return new Response(
      feed(
        item(1, "Unrelated", "another_account") +
          item(2, "Wrong host").replace(
            "https://x.com",
            "https://evil.example.com",
          ) +
          item(3, "Invalid source").replace("https://x.com/", "") +
          item(4, "Matched case", "HOLOLIVE_DREAMS"),
      ),
    );
  }) as unknown as typeof fetch;
  const result = await readLink({ url: "https://x.com/hololive_dreams" });
  expect(result.content).toContain("Matched case");
  expect(result.content).not.toMatch(/Unrelated|Wrong host|Invalid source/u);
  expect(requests).toHaveLength(1);
});

test("bounds feed bytes, post count and returned characters", async () => {
  globalThis.fetch = (async () =>
    new Response(
      feed(
        Array.from({ length: 21 }, (_, index) => item(index + 1, "Post")).join(
          "",
        ),
      ),
    )) as unknown as typeof fetch;
  const result = await readLink({ url: "https://x.com/hololive_dreams" });
  expect(result.content).toContain("/status/20\n");
  expect(result.content).not.toContain("/status/21\n");
  globalThis.fetch = (async () =>
    new Response(feed(item(1, "x".repeat(12_001))))) as unknown as typeof fetch;
  const truncated = await readLink({ url: "https://x.com/hololive_dreams" });
  expect(truncated.content).toHaveLength(12_000);
  expect(truncated.truncated).toBe(true);
  let cancelled = false;
  globalThis.fetch = (async () =>
    new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array(256_001));
        },
        cancel() {
          cancelled = true;
        },
      }),
    )) as unknown as typeof fetch;
  expect(
    (await readLink({ url: "https://x.com/hololive_dreams" })).status,
  ).toBe("unavailable");
  expect(cancelled).toBe(true);
});

test("feed failures and empty results stay unavailable, never proof of absence", async () => {
  for (const response of [
    new Response("blocked", { status: 403 }),
    new Response("Log in to continue"),
    new Response(feed("")),
    new Response(feed(item(1, "Repost", "another_account"))),
    new Response(null, { status: 204 }),
  ]) {
    globalThis.fetch = (async () => response) as unknown as typeof fetch;
    expect(
      (await readLink({ url: "https://x.com/hololive_dreams" })).status,
    ).toBe("unavailable");
  }
  globalThis.fetch = (async () => {
    throw new Error("private network details");
  }) as unknown as typeof fetch;
  const result = await readLink({ url: "https://x.com/hololive_dreams" });
  expect(result).toMatchObject({
    status: "unavailable",
    error: "Public page reader unavailable.",
  });
});

test.each([
  "https://x.com/search?q=news",
  "https://x.com/home",
  "https://x.com/hololive_dreams/status/42",
])("keeps non-profile URLs on the ordinary reader: %s", async (url) => {
  globalThis.fetch = (async (input: Parameters<typeof fetch>[0]) => {
    expect(String(input)).toBe(`https://reader.test/${url}`);
    return new Response("Markdown Content:\nPage text");
  }) as unknown as typeof fetch;
  expect((await readLink({ url }, "https://reader.test/")).status).toBe(
    "complete",
  );
});
