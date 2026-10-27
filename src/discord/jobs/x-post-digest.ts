import { randomUUID } from "node:crypto";

import { macAgentBridge } from "../../chatbot/bridge";
import type { ServiceDestination } from "../service-subscriptions";
import type { XPost } from "./x-post-monitor";

export type XPostDigestSchedule = { time: string; timezone: string };
export type PendingXPost = { post: XPost; dateKey: string };
export type XPostDigest = {
  dateKey: string;
  postIds: string[];
  messages: string[];
  delivered: Record<string, number>;
};

function localParts(now: Date, timezone: string) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    })
      .formatToParts(now)
      .map(({ type, value }) => [type, value]),
  );
  return {
    dateKey: `${parts.year}-${parts.month}-${parts.day}`,
    time: `${parts.hour}:${parts.minute}`,
  };
}

function shiftDate(dateKey: string, days: number) {
  const date = new Date(`${dateKey}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function getXPostDigestSchedule(
  env: NodeJS.ProcessEnv,
): XPostDigestSchedule {
  const time = env.X_POST_DIGEST_TIME?.trim() || "21:00";
  const timezone = env.X_POST_DIGEST_TIMEZONE?.trim() || "Asia/Taipei";
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)) {
    throw new Error("X_POST_DIGEST_TIME must use HH:MM format.");
  }
  localParts(new Date(), timezone); // Validate the IANA timezone at startup.
  return { time, timezone };
}

export function xPostDigestDueDate(now: Date, schedule: XPostDigestSchedule) {
  const local = localParts(now, schedule.timezone);
  return local.time >= schedule.time
    ? local.dateKey
    : shiftDate(local.dateKey, -1);
}

export function queueXPost(
  post: XPost,
  now: Date,
  schedule: XPostDigestSchedule,
): PendingXPost {
  const timestamp = post.publishedAt ? Date.parse(post.publishedAt) : NaN;
  // Future or missing source timestamps use observation time.
  const observed =
    Number.isFinite(timestamp) && timestamp <= now.getTime()
      ? new Date(timestamp)
      : now;
  const local = localParts(observed, schedule.timezone);
  return {
    post,
    dateKey:
      local.time < schedule.time ? local.dateKey : shiftDate(local.dateKey, 1),
  };
}

export async function summarizeXPosts(
  posts: XPost[],
  destination: ServiceDestination,
) {
  const requesterUserId = process.env.MINISAGO_CHATBOT_OWNER_USER_ID?.trim();
  if (!requesterUserId)
    throw new Error("X digest needs MINISAGO_CHATBOT_OWNER_USER_ID.");
  const id = randomUUID();
  const dispatch = macAgentBridge.dispatch(
    {
      id,
      purpose: "x_post_digest",
      requesterUserId,
      channelId: destination.channelId,
      requestMessageId: id,
      request: JSON.stringify(
        posts.map(({ id, text }) => ({ id, text: text.slice(0, 4_000) })),
      ),
      messages: [],
    },
    ["chat"],
  );
  if (dispatch.status !== "accepted")
    throw new Error(`X digest worker is ${dispatch.status}.`);
  const result = await dispatch.result;
  if (!result.ok) throw new Error(`X digest worker failed: ${result.error}`);
  return result.content;
}

export function buildXPostDigest(
  posts: XPost[],
  dateKey: string,
  handle: string,
  result: string,
): XPostDigest {
  const parsed = JSON.parse(result) as {
    summaries?: Array<{ id: string; summary: string }>;
  };
  if (
    !Array.isArray(parsed.summaries) ||
    parsed.summaries.length !== posts.length
  ) {
    throw new Error("X digest did not summarize every post.");
  }
  const summaries = new Map<string, string>();
  for (const item of parsed.summaries) {
    if (
      !item ||
      typeof item.id !== "string" ||
      typeof item.summary !== "string" ||
      !item.summary.trim() ||
      item.summary.length > 500 ||
      summaries.has(item.id) ||
      !/[\u3400-\u9fff]/u.test(item.summary)
    ) {
      throw new Error("X digest contains an invalid Chinese summary.");
    }
    // Links are built from trusted feed identities below, never from model output.
    const summary = item.summary
      .replace(/https?:\/\/\S+/giu, "")
      .replace(/[@<>]/gu, "")
      .replace(/([\\`*_~\[\]])/gu, "\\$1")
      .trim();
    if (!summary) throw new Error("X digest contains an empty summary.");
    summaries.set(item.id, summary);
  }
  const header = `**@${handle} 每日推文中文摘要｜${dateKey}**`;
  const messages: string[] = [];
  let content = header;
  for (const post of posts) {
    const summary = summaries.get(post.id);
    if (!summary) throw new Error(`X digest omitted post ${post.id}.`);
    // Preserve the actual author for retweets.
    const author = new URL(post.url).pathname.split("/").filter(Boolean)[0];
    if (
      !author ||
      !/^[A-Za-z0-9_]{1,15}$/.test(author) ||
      !/^\d+$/.test(post.id)
    ) {
      throw new Error("X digest contains an invalid source identity.");
    }
    const entry = `\n\n• ${summary}\n<https://fxtwitter.com/${author}/status/${post.id}>`;
    if ((content + entry).length > 1_900) {
      messages.push(content);
      content = header;
    }
    content += entry;
  }
  messages.push(content);
  return {
    dateKey,
    postIds: posts.map(({ id }) => id),
    messages,
    delivered: {},
  };
}
