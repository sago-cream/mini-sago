import { decodeEntities } from "./jobs/job-utils";

export type XPost = {
  id: string;
  text: string;
  url: string;
  publishedAt?: string;
  imageUrl?: string;
};

function readElement(xml: string, name: string) {
  const match = new RegExp(
    `<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`,
    "i",
  ).exec(xml);

  if (!match) {
    return undefined;
  }

  const value = match[1].replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, "$1");
  return decodeEntities(value.trim());
}

function htmlToText(value: string) {
  return decodeEntities(
    value
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n\n")
      .replace(/<blockquote[\s\S]*?<\/blockquote>/gi, "")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function extractPostId(url: string) {
  return /\/status\/(\d+)/.exec(url)?.[1];
}

function extractEnclosureUrl(itemXml: string) {
  const tag = /<enclosure\b[^>]*>/i.exec(itemXml)?.[0];
  const url = tag ? /\burl=(?:"([^"]+)"|'([^']+)')/i.exec(tag) : undefined;
  return url ? decodeEntities(url[1] ?? url[2]) : undefined;
}

export function parseXPosts(feedXml: string) {
  const posts: XPost[] = [];

  for (const match of feedXml.matchAll(/<item\b[^>]*>([\s\S]*?)<\/item>/gi)) {
    const itemXml = match[1];
    const url = readElement(itemXml, "link");
    const id = url ? extractPostId(url) : undefined;

    if (!url || !id) {
      continue;
    }

    const description = readElement(itemXml, "description");
    const title = readElement(itemXml, "title") ?? "";

    posts.push({
      id,
      text: description ? htmlToText(description) : title,
      url,
      publishedAt: readElement(itemXml, "pubDate"),
      imageUrl: extractEnclosureUrl(itemXml),
    });
  }

  return posts;
}

export function isXPostAuthoredBy(post: XPost, handle: string) {
  try {
    const postHandle = new URL(post.url).pathname.split("/").filter(Boolean)[0];
    return postHandle?.toLowerCase() === handle.toLowerCase();
  } catch {
    return false;
  }
}
