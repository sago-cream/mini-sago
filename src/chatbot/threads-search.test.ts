import { describe, expect, test } from "bun:test";

import {
  buildThreadsReaderUrl,
  buildThreadsSearchUrl,
  parseThreadsSearchPosts,
  searchThreads,
  THREADS_SEARCH_READER_HEADERS,
} from "./threads-search";

const sampleSearch = `Title: Search • Threads

URL Source: https://www.threads.com/search?q=NTHU&serp_type=default&filter=recent

Markdown Content:
[![Image 1: alice's profile picture](https://example.test/alice.jpg)](https://www.threads.com/@alice)

[alice](https://www.threads.com/@alice)

[08/31/26](https://www.threads.com/@alice/post/Dexample1)

清大今天開學，NTHU 的大家早安。

Translate

2.2K

3

[![Image 2: bob's profile picture](https://example.test/bob.jpg)](https://www.threads.com/@bob)

[bob](https://www.threads.com/@bob)

[08/30/26](https://www.threads.com/@bob/post/Dexample2)

學生會活動資訊

![Image 3](https://example.test/post.jpg)

9
`;

describe("Threads search", () => {
  test("uses Jina Reader with the public recent-search URL", () => {
    expect(buildThreadsSearchUrl("清大")).toBe(
      "https://www.threads.com/search?q=%E6%B8%85%E5%A4%A7&serp_type=default&filter=recent",
    );
    expect(buildThreadsReaderUrl("NTHU")).toBe(
      "https://r.jina.ai/https://www.threads.com/search?q=NTHU&serp_type=default&filter=recent",
    );
    expect(THREADS_SEARCH_READER_HEADERS).toEqual({
      "User-Agent": "MiniSago/0.1",
      "X-Cache-Tolerance": "300",
      "X-Respond-With": "markdown",
    });
  });

  test("parses posts and removes reader presentation noise", () => {
    expect(parseThreadsSearchPosts(sampleSearch)).toEqual([
      {
        id: "Dexample1",
        username: "alice",
        postedAt: "08/31/26",
        text: "清大今天開學，NTHU 的大家早安。",
        url: "https://www.threads.com/@alice/post/Dexample1",
      },
      {
        id: "Dexample2",
        username: "bob",
        postedAt: "08/30/26",
        text: "學生會活動資訊",
        url: "https://www.threads.com/@bob/post/Dexample2",
      },
    ]);
  });

  test("adds keywords, deduplicates posts, and reports partial failures", async () => {
    const originalFetch = globalThis.fetch;
    const urls: string[] = [];
    globalThis.fetch = (async (url: string | URL | Request) => {
      urls.push(String(url));
      return String(url).includes("extra")
        ? new Response("failed", { status: 503 })
        : new Response(sampleSearch);
    }) as typeof fetch;
    try {
      const result = await searchThreads({
        additionalKeywords: ["extra", " NTHU "],
      });
      expect(result.queries).toEqual(["清大", "NTHU", "學生會", "extra"]);
      expect(urls).toHaveLength(4);
      expect(result.status).toBe("partial");
      expect(result.posts).toHaveLength(2);
      expect(result.posts[0]?.matchedQueries).toEqual([
        "清大",
        "NTHU",
        "學生會",
      ]);
      expect(result.errors[0]?.query).toBe("extra");
      expect((await searchThreads()).queries).toEqual([
        "清大",
        "NTHU",
        "學生會",
      ]);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
