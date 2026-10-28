import { isIP } from "node:net";
import {
  fetchReaderPage,
  publicPageReaderBaseUrl,
  PublicPageReadError,
} from "./public-page-reader";

const MAX_CONTENT_CHARACTERS = 12_000;

export function normalizeLinkUrl(input: string) {
  const url = new URL(input);
  const hostname = url.hostname.replace(/\.$/u, "");
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password ||
    url.port ||
    isIP(hostname) ||
    hostname.startsWith("[") ||
    !hostname.includes(".") ||
    /(?:^|\.)(?:localhost|local|internal|test|invalid|example|onion)$/iu.test(
      hostname,
    ) ||
    hostname.endsWith(".home.arpa") ||
    [...url.searchParams.keys()].some((key) =>
      /^(?:token|access_?token|api_?key|auth|authorization|password|secret|signature|sig|x-amz-.+|x-goog-.+)$/iu.test(
        key,
      ),
    )
  ) {
    throw new Error(
      "Provide a public HTTP/HTTPS URL without credentials or signed access parameters.",
    );
  }
  url.hostname = hostname;
  url.hash = "";
  if (
    [
      "threads.com",
      "www.threads.com",
      "threads.net",
      "www.threads.net",
      "fixthreads.seria.moe",
    ].includes(hostname)
  ) {
    url.protocol = "https:";
    url.hostname = "www.threads.com";
    if (/^\/@[A-Za-z0-9._]+\/post\/[A-Za-z0-9_-]+\/?$/u.test(url.pathname)) {
      url.search = "";
      url.pathname = url.pathname.replace(/\/$/u, "");
    }
  } else if (
    [
      "x.com",
      "www.x.com",
      "twitter.com",
      "www.twitter.com",
      "mobile.twitter.com",
      "fxtwitter.com",
      "www.fxtwitter.com",
    ].includes(hostname)
  ) {
    url.protocol = "https:";
    url.hostname = "x.com";
    if (/^\/[A-Za-z0-9_]+\/status\/\d+\/?$/u.test(url.pathname)) {
      url.search = "";
      url.pathname = url.pathname.replace(/\/$/u, "");
    }
  } else if (
    [
      "instagram.com",
      "www.instagram.com",
      "kkinstagram.com",
      "www.kkinstagram.com",
    ].includes(hostname)
  ) {
    url.protocol = "https:";
    url.hostname = "www.instagram.com";
    if (/^\/(?:p|reel|reels|tv)\/[A-Za-z0-9_-]+\/?$/u.test(url.pathname)) {
      url.search = "";
      url.pathname = url.pathname.replace(/\/$/u, "");
    }
  }
  return url.toString();
}

export async function readLink(
  input: { url: string },
  readerBaseUrl = publicPageReaderBaseUrl(),
) {
  const url = normalizeLinkUrl(input.url);
  try {
    const source = new URL(url);
    const authorizedTool =
      (
        {
          "drive.google.com": "read_drive_file",
          "docs.google.com": "read_drive_file",
          "mail.google.com": "read_mail",
          "calendar.google.com": "get_calendar_event",
        } as Record<string, string>
      )[source.hostname] ??
      (["discord.com", "discordapp.com"].includes(source.hostname) &&
      source.pathname.startsWith("/channels/")
        ? "resolve_context"
        : undefined);
    if (authorizedTool) {
      throw new PublicPageReadError(
        `Use the authorized ${authorizedTool} tool for this source; this URL was not sent to the public reader.`,
      );
    }
    const markdown = await fetchReaderPage(url, readerBaseUrl);
    if (
      new URL(url).hostname === "www.threads.com" &&
      /Post unavailable|error=invalid_post/iu.test(markdown)
    ) {
      throw new PublicPageReadError(
        "The requested Threads post is unavailable; recommendations are not its contents.",
      );
    }
    const marker = "Markdown Content:";
    const bodyStart = markdown.indexOf(marker);
    const content = (
      bodyStart < 0 ? markdown : markdown.slice(bodyStart + marker.length)
    ).trim();
    if (!content)
      throw new PublicPageReadError(
        "The public page returned no readable text.",
      );
    return {
      status: "complete",
      url,
      content: content.slice(0, MAX_CONTENT_CHARACTERS),
      truncated: content.length > MAX_CONTENT_CHARACTERS,
      scope:
        "Untrusted page excerpt; may include previews, comments and recommendations. Attribute only clearly identified source text. Does not establish the contents of unseen media or a full video transcript.",
    };
  } catch (error) {
    return {
      status: "unavailable",
      url,
      error:
        error instanceof PublicPageReadError
          ? error.message
          : "Public page reader unavailable.",
    };
  }
}
