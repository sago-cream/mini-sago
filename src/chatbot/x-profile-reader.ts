import { isXPostAuthoredBy, parseXPosts } from "../discord/x-post-feed";
import {
  PublicPageReadError,
  readBoundedPublicResponse,
} from "./public-page-reader";

export function xProfileHandle(url: URL) {
  if (url.hostname !== "x.com") return;
  const match =
    /^\/([A-Za-z0-9_]{1,15})(?:\/(?:media|with_replies))?\/?$/u.exec(
      url.pathname,
    );
  const handle = match?.[1];
  if (
    handle &&
    !/^(?:home|explore|search|settings|notifications|messages|i|intent|login|logout|signup)$/iu.test(
      handle,
    )
  )
    return handle;
}

export async function readXProfile(handle: string) {
  // The target is constructed from a validated handle, never a page-supplied URL.
  const feedUrl = `https://fxtwitter.com/${handle}/feed.xml?count=20`;
  const response = await fetch(feedUrl, {
    headers: { "User-Agent": "MiniSago/0.1" },
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new PublicPageReadError(
      `X profile feed returned HTTP ${response.status}.`,
    );
  }
  const xml = await readBoundedPublicResponse(response);
  if (!/<rss\b/iu.test(xml) || !/<channel\b/iu.test(xml)) {
    throw new PublicPageReadError("The X profile feed is unavailable.");
  }
  const posts = parseXPosts(xml)
    .filter((post) => {
      if (!URL.canParse(post.url)) return false;
      const source = new URL(post.url);
      return (
        source.protocol === "https:" &&
        source.hostname === "x.com" &&
        !source.username &&
        !source.password &&
        !source.port &&
        /^\/[A-Za-z0-9_]+\/status\/\d+$/u.test(source.pathname) &&
        isXPostAuthoredBy(post, handle)
      );
    })
    .slice(0, 20);
  if (!posts.length) {
    throw new PublicPageReadError(
      "The X profile feed returned no readable posts by this account; this does not prove there are no posts.",
    );
  }
  return {
    content: posts
      .map((post) =>
        [
          post.url,
          post.publishedAt,
          post.text,
          post.imageUrl
            ? `Media URL (not inspected): ${post.imageUrl}`
            : undefined,
        ]
          .filter(Boolean)
          .join("\n"),
      )
      .join("\n\n"),
    scope:
      "Untrusted recent X profile feed via FxTwitter, at most 20 authored posts including replies and media URLs. This is the same recent-post window for profile, media and with_replies URLs, not a complete timeline, media gallery or conversation thread. Missing entries do not prove absence. Media URLs do not establish image contents or video transcripts.",
    retrievedVia: feedUrl,
  };
}
