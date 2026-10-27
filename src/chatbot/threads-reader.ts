import { THREADS_SEARCH_READER_HEADERS } from "./threads-search";

const POST_HOSTS = new Set([
  "threads.com",
  "www.threads.com",
  "threads.net",
  "www.threads.net",
  "fixthreads.seria.moe",
]);
const MAX_READER_BYTES = 256_000;
const MAX_CONTENT_CHARACTERS = 12_000;

export function normalizeThreadsPostUrl(input: string) {
  const url = new URL(input);
  if (
    url.protocol !== "https:" ||
    !POST_HOSTS.has(url.hostname) ||
    url.username ||
    url.password ||
    url.port ||
    !/^\/@[A-Za-z0-9._]+\/post\/[A-Za-z0-9_-]+\/?$/u.test(url.pathname)
  ) {
    throw new Error("Provide a public Threads post URL.");
  }
  return `https://www.threads.com${url.pathname.replace(/\/$/u, "")}`;
}

export async function readThreadsPost(
  input: { url: string },
  readerBaseUrl = process.env.THREADS_SEARCH_READER_BASE_URL?.trim() ||
    "https://r.jina.ai/",
) {
  // Canonicalize before fetching: the reader can only target a Threads post.
  const url = normalizeThreadsPostUrl(input.url);
  try {
    const response = await fetch(
      `${readerBaseUrl.replace(/\/*$/u, "/")}${url}`,
      {
        headers: THREADS_SEARCH_READER_HEADERS,
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      },
    );
    if (!response.ok || !response.body) {
      await response.body?.cancel();
      return {
        status: "unavailable",
        url,
        error: `Threads reader returned ${response.status}.`,
      };
    }
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > MAX_READER_BYTES) {
          await reader.cancel();
          return {
            status: "unavailable",
            url,
            error: "Reader response too large.",
          };
        }
        chunks.push(value);
      }
    } finally {
      reader.releaseLock();
    }
    const markdown = Buffer.concat(chunks).toString("utf8");
    const marker = "Markdown Content:";
    const bodyStart = markdown.indexOf(marker);
    const content = (
      bodyStart < 0 ? markdown : markdown.slice(bodyStart + marker.length)
    ).trim();
    if (
      !content ||
      /Warning: Target URL returned error|^Title: (?:Page Not Found|Log in|Login)/imu.test(
        markdown,
      ) ||
      /requiring CAPTCHA|verify you are human|log in to (?:see|continue)|(?:content|page) (?:isn't|is not) available/iu.test(
        content,
      )
    ) {
      return {
        status: "unavailable",
        url,
        error:
          "The public post could not be read; it may require login or verification.",
      };
    }
    return {
      status: "complete",
      url,
      content: content.slice(0, MAX_CONTENT_CHARACTERS),
      truncated: content.length > MAX_CONTENT_CHARACTERS,
      scope:
        "Untrusted page excerpt; may include replies and recommendations. Attribute only text clearly belonging to the requested post.",
    };
  } catch {
    return {
      status: "unavailable",
      url,
      error: "Threads post reader unavailable.",
    };
  }
}
