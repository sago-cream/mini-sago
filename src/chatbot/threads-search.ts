import {
  buildReaderUrl,
  fetchReaderPage,
  publicPageReaderBaseUrl,
} from "./public-page-reader";

const DEFAULT_QUERIES = ["清大", "NTHU", "學生會"];
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
  readerBaseUrl = publicPageReaderBaseUrl(),
) {
  return buildReaderUrl(buildThreadsSearchUrl(query), readerBaseUrl);
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
  const markdown = await fetchReaderPage(
    buildThreadsSearchUrl(query),
    readerBaseUrl,
  );
  const posts = parseThreadsSearchPosts(markdown);
  if (posts.length === 0) {
    throw new Error("The search returned no readable posts.");
  }
  return posts;
}

export async function searchThreads(
  input: { additionalKeywords?: string[] } = {},
  readerBaseUrl = publicPageReaderBaseUrl(),
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
