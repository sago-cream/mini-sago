import { afterEach, expect, spyOn, test } from "bun:test";
import { fetchReaderPage, publicPageReaderBaseUrl } from "./public-page-reader";
import { searchThreads } from "./threads-search";

const originalLinkReader = process.env.LINK_READER_BASE_URL;
const originalThreadsReader = process.env.THREADS_SEARCH_READER_BASE_URL;
afterEach(() => {
  if (originalLinkReader === undefined) delete process.env.LINK_READER_BASE_URL;
  else process.env.LINK_READER_BASE_URL = originalLinkReader;
  if (originalThreadsReader === undefined)
    delete process.env.THREADS_SEARCH_READER_BASE_URL;
  else process.env.THREADS_SEARCH_READER_BASE_URL = originalThreadsReader;
});

test("shares reader configuration with legacy fallback", () => {
  delete process.env.LINK_READER_BASE_URL;
  delete process.env.THREADS_SEARCH_READER_BASE_URL;
  expect(publicPageReaderBaseUrl()).toBe("https://r.jina.ai/");
  process.env.THREADS_SEARCH_READER_BASE_URL = "https://legacy.example.com/";
  expect(publicPageReaderBaseUrl()).toBe("https://legacy.example.com/");
  process.env.LINK_READER_BASE_URL = "https://reader.example.com/";
  expect(publicPageReaderBaseUrl()).toBe("https://reader.example.com/");
});

test("uses one bounded reader transport and cancels streaming overflows", async () => {
  let cancelled = false;
  const mock = spyOn(globalThis, "fetch").mockImplementation((async (
    _input,
    options,
  ) => {
    expect(options?.redirect).toBe("error");
    expect(options?.signal).toBeInstanceOf(AbortSignal);
    expect(options?.headers).toMatchObject({ "X-Respond-With": "markdown" });
    return new Response(
      new ReadableStream({
        pull(controller) {
          controller.enqueue(new Uint8Array(128_001));
        },
        cancel() {
          cancelled = true;
        },
      }),
    );
  }) as typeof fetch);
  try {
    await expect(
      fetchReaderPage("https://example.com/article"),
    ).rejects.toThrow("too large");
    expect(cancelled).toBe(true);
    const result = await searchThreads();
    expect(result.errors).toHaveLength(3);
    expect(result.posts).toEqual([]);
    expect(
      result.errors.every(({ error }) => error.includes("too large")),
    ).toBe(true);
  } finally {
    mock.mockRestore();
  }
});
