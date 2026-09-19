const DEFAULT_QUERIES = ["清大", "NTHU", "學生會"];
const DEFAULT_READER_BASE_URL = "https://r.jina.ai/";

export const THREADS_SEARCH_READER_HEADERS = {
  "User-Agent": "MiniSago/0.1",
  "X-Cache-Tolerance": "300",
  "X-Respond-With": "markdown",
} as const;

export type ThreadsSearchPost = {
  id: string;
  username: string;
  postedAt: string;
  text: string;
  url: string;
};

export function buildThreadsSearchUrl(query: string) {
  const url = new URL("https://www.threads.com/search");
  url.searchParams.set("q", query);
  url.searchParams.set("serp_type", "default");
  url.searchParams.set("filter", "recent");
  return url.toString();
}

export function buildThreadsReaderUrl(
  query: string,
  readerBaseUrl = DEFAULT_READER_BASE_URL,
) {
  return `${readerBaseUrl.replace(/\/*$/, "/")}${buildThreadsSearchUrl(query)}`;
}

function cleanPostText(value: string) {
  return value
    .split("\n")
    .map((line) => line.trim())
    .filter(
      (line) =>
        line &&
        !line.startsWith("![Image") &&
        !line.startsWith("[![Image") &&
        line !== "Translate" &&
        line !== "Sorry, we're having trouble playing this video." &&
        !/^\[Learn more\]\(/u.test(line) &&
        !/^\d[\d,.]*[KMB]?$/iu.test(line),
    )
    .join("\n")
    .trim();
}

export function parseThreadsSearchPosts(markdown: string) {
  const linkPattern =
    /\[([^\]\n]+)\]\((https:\/\/(?:www\.)?threads\.com\/@([^/)\s]+)\/post\/([^)?\s]+)(?:\?[^)]*)?)\)/giu;
  const matches = [...markdown.matchAll(linkPattern)];
  const posts: ThreadsSearchPost[] = [];
  const seen = new Set<string>();

  for (const [index, match] of matches.entries()) {
    const url = match[2];
    if (!url || seen.has(url)) continue;

    const nextMatchIndex = matches[index + 1]?.index ?? markdown.length;
    const bodyStart = (match.index ?? 0) + match[0].length;
    let body = markdown.slice(bodyStart, nextMatchIndex);
    const nextProfile = body.search(/\n\[!\[Image[^\n]*profile picture/iu);
    if (nextProfile >= 0) body = body.slice(0, nextProfile);

    seen.add(url);
    posts.push({
      id: match[4]!,
      username: match[3]!,
      postedAt: match[1]!,
      text: cleanPostText(body),
      url,
    });
  }

  return posts;
}

async function fetchThreadsSearchPosts(query: string, readerBaseUrl: string) {
  const response = await fetch(buildThreadsReaderUrl(query, readerBaseUrl), {
    headers: THREADS_SEARCH_READER_HEADERS,
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`Threads reader returned ${response.status}.`);
  }

  const markdown = await response.text();
  const posts = parseThreadsSearchPosts(markdown);
  if (posts.length === 0) {
    const reason = markdown.includes("requiring CAPTCHA")
      ? "Threads required a CAPTCHA"
      : "the search returned no readable posts";
    throw new Error(reason);
  }
  return posts;
}

export async function searchThreads(
  input: { additionalKeywords?: string[] } = {},
  readerBaseUrl = process.env.THREADS_SEARCH_READER_BASE_URL?.trim() ||
    DEFAULT_READER_BASE_URL,
) {
  const queries = [
    ...new Set(
      [...DEFAULT_QUERIES, ...(input.additionalKeywords ?? [])]
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  ];
  const outcomes = await Promise.allSettled(
    queries.map((query) => fetchThreadsSearchPosts(query, readerBaseUrl)),
  );
  const posts = new Map<
    string,
    ThreadsSearchPost & { matchedQueries: string[] }
  >();
  const errors: { query: string; error: string }[] = [];
  outcomes.forEach((outcome, index) => {
    const query = queries[index]!;
    if (outcome.status === "rejected") {
      errors.push({
        query,
        error:
          outcome.reason instanceof Error
            ? outcome.reason.message
            : "Threads search failed.",
      });
      return;
    }
    for (const post of outcome.value) {
      const existing = posts.get(post.url);
      if (existing) existing.matchedQueries.push(query);
      else
        posts.set(post.url, {
          ...post,
          text: post.text.slice(0, 4000),
          matchedQueries: [query],
        });
    }
  });
  return {
    status:
      errors.length === queries.length
        ? "unavailable"
        : errors.length
          ? "partial"
          : "complete",
    queries,
    posts: [...posts.values()].slice(0, 50),
    errors,
  };
}
