import { createDiscordRequest } from "../api/request";
import {
  deliverToServiceDestinations,
  getServiceSubscriptionStore,
  type ManagedServiceId,
  type ServiceDestination,
} from "../service-subscriptions";
import { decodeEntities, readJsonFile, writeJsonFile } from "./job-utils";
import {
  buildXPostDigest,
  getXPostDigestSchedule,
  queueXPost,
  summarizeXPosts,
  xPostDigestDueDate,
  type PendingXPost,
  type XPostDigest,
  type XPostDigestSchedule,
} from "./x-post-digest";

const DEFAULT_HANDLE = "thsottiaux";
const DEFAULT_STATE_FILE = ".data/x-post-state.json";
const DEFAULT_ADDITIONAL_PIPES = [
  {
    handle: "thsottiaux",
    service: "x_posts_thsottiaux",
    stateFileName: "x-post-thsottiaux-additional-state.json",
    onlyAuthoredPosts: false,
  },
  {
    handle: "hololive_dreams",
    service: "x_posts_hololive_dreams",
    stateFileName: "x-post-hololive-dreams-state.json",
    onlyAuthoredPosts: true,
  },
] as const satisfies ReadonlyArray<{
  handle: string;
  service: ManagedServiceId;
  stateFileName: string;
  onlyAuthoredPosts: boolean;
}>;
const DEFAULT_CHECK_INTERVAL_MS = 300_000;
const STATE_CHECKPOINT_INTERVAL_MS = 3_600_000;
const USER_AGENT = "MiniSago/0.1";

export type XPost = {
  id: string;
  text: string;
  url: string;
  publishedAt?: string;
  imageUrl?: string;
};

export type XPostMonitorConfig = {
  service: ManagedServiceId;
  botToken: string;
  handle: string;
  feedUrl: string;
  stateFile: string;
  checkIntervalMs: number;
  onlyAuthoredPosts: boolean;
  digestSchedule?: XPostDigestSchedule;
};

export type XPostState = {
  lastPostId?: string;
  lastPostUrl?: string;
  lastCheckedAt?: string;
  pendingPosts?: PendingXPost[];
  digest?: XPostDigest;
};

type DiscordChannel = {
  guild_id?: string;
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

function comparePostIds(a: string, b: string) {
  return BigInt(a) < BigInt(b) ? -1 : BigInt(a) > BigInt(b) ? 1 : 0;
}

export function shouldCheckpointXPostState(
  lastCheckedAt: string | undefined,
  now: Date,
) {
  if (!lastCheckedAt) {
    return true;
  }

  const lastCheckedTime = Date.parse(lastCheckedAt);

  return (
    !Number.isFinite(lastCheckedTime) ||
    now.getTime() - lastCheckedTime >= STATE_CHECKPOINT_INTERVAL_MS
  );
}

export function buildXPostMessage(post: XPost, handle = DEFAULT_HANDLE) {
  return {
    content: `https://fxtwitter.com/${handle}/status/${post.id}`,
    allowed_mentions: { parse: [] as [] },
  };
}

function parseCheckIntervalMs(value: string | undefined) {
  if (!value) {
    return DEFAULT_CHECK_INTERVAL_MS;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 10_000) {
    throw new Error(
      `X_POST_CHECK_INTERVAL_MS must be at least 10000: ${value}`,
    );
  }

  return parsed;
}

function stateFileBeside(stateFile: string, fileName: string) {
  const separatorIndex = Math.max(
    stateFile.lastIndexOf("/"),
    stateFile.lastIndexOf("\\"),
  );

  return separatorIndex >= 0
    ? `${stateFile.slice(0, separatorIndex + 1)}${fileName}`
    : fileName;
}

export function getXPostMonitorConfigs(
  env: NodeJS.ProcessEnv = process.env,
): XPostMonitorConfig[] {
  if (env.X_POST_MONITOR_DISABLED === "true") {
    return [];
  }

  const botToken = env.DISCORD_BOT_TOKEN?.trim();

  if (!botToken) {
    console.warn("X post monitor disabled: DISCORD_BOT_TOKEN is missing.");
    return [];
  }

  const handle = env.X_POST_HANDLE?.trim() || DEFAULT_HANDLE;
  if (!/^[A-Za-z0-9_]{1,15}$/.test(handle))
    throw new Error("X_POST_HANDLE must be a valid X handle.");
  const mode = env.X_POST_DELIVERY_MODE?.trim() || "daily_digest";
  if (mode !== "daily_digest" && mode !== "instant")
    throw new Error("X_POST_DELIVERY_MODE must be daily_digest or instant.");
  const digestSchedule = getXPostDigestSchedule(env);
  const digestServices =
    env.X_POST_DIGEST_SERVICES === undefined
      ? ["x_posts_primary", "x_posts_thsottiaux", "x_posts_hololive_dreams"]
      : env.X_POST_DIGEST_SERVICES.split(",")
          .map((value) => value.trim())
          .filter(Boolean);
  if (
    digestServices.some(
      (service) =>
        ![
          "x_posts_primary",
          "x_posts_thsottiaux",
          "x_posts_hololive_dreams",
        ].includes(service),
    )
  ) {
    throw new Error("X_POST_DIGEST_SERVICES contains an unknown X service.");
  }
  const stateFile = env.X_POST_STATE_FILE?.trim() || DEFAULT_STATE_FILE;
  const sharedConfig = {
    botToken,
    checkIntervalMs: parseCheckIntervalMs(env.X_POST_CHECK_INTERVAL_MS),
  };
  const primaryConfig: XPostMonitorConfig = {
    ...sharedConfig,
    service: "x_posts_primary",
    handle,
    feedUrl:
      env.X_POST_FEED_URL?.trim() ||
      `https://fxtwitter.com/${handle}/feed.xml?count=20`,
    stateFile,
    onlyAuthoredPosts: false,
  };

  const configs: XPostMonitorConfig[] = [
    primaryConfig,
    ...DEFAULT_ADDITIONAL_PIPES.map(
      ({
        handle,
        service,
        stateFileName,
        onlyAuthoredPosts,
      }): XPostMonitorConfig => ({
        ...sharedConfig,
        service,
        handle,
        feedUrl: `https://fxtwitter.com/${handle}/feed.xml?count=20`,
        stateFile: stateFileBeside(stateFile, stateFileName),
        onlyAuthoredPosts,
      }),
    ),
  ];
  return configs.map((config) => ({
    ...config,
    ...(mode === "daily_digest" && digestServices.includes(config.service)
      ? { digestSchedule }
      : {}),
  }));
}

async function fetchLatestXPosts(feedUrl: string) {
  const response = await fetch(feedUrl, {
    headers: { "User-Agent": USER_AGENT },
    signal: AbortSignal.timeout(30_000),
  });

  if (!response.ok) {
    throw new Error(
      `X feed returned ${response.status}: ${await response.text()}`,
    );
  }

  return parseXPosts(await response.text());
}

async function sendXPayload(
  config: XPostMonitorConfig,
  destination: ServiceDestination,
  content: string,
  suppressEmbeds = false,
) {
  const discordRequest = createDiscordRequest(config.botToken);
  const channel = await discordRequest<DiscordChannel>(
    `/channels/${destination.channelId}`,
  );

  if (channel?.guild_id !== destination.guildId) {
    throw new Error(
      `X post channel ${destination.channelId} belongs to guild ${channel?.guild_id ?? "unknown"}, not configured guild ${destination.guildId}.`,
    );
  }

  await discordRequest(`/channels/${destination.channelId}/messages`, {
    method: "POST",
    body: {
      content,
      allowed_mentions: { parse: [] },
      ...(suppressEmbeds ? { flags: 4 } : {}),
    },
  });
}

async function sendXPost(
  config: XPostMonitorConfig,
  destination: ServiceDestination,
  post: XPost,
) {
  await sendXPayload(
    config,
    destination,
    buildXPostMessage(post, config.handle).content,
  );
}

type DigestDependencies = {
  fetchPosts: (url: string) => Promise<XPost[]>;
  readState: () => Promise<XPostState>;
  saveState: (state: XPostState) => Promise<void>;
  summarize: (
    posts: XPost[],
    destination: ServiceDestination,
  ) => Promise<string>;
  send: (destination: ServiceDestination, content: string) => Promise<void>;
};

export async function runXPostDigestTick(
  config: XPostMonitorConfig,
  destinations: ServiceDestination[],
  now = new Date(),
  dependencies: Partial<DigestDependencies> = {},
) {
  if (!config.digestSchedule || !destinations.length) return;
  const deps: DigestDependencies = {
    fetchPosts: fetchLatestXPosts,
    readState: () => readJsonFile<XPostState>(config.stateFile, () => ({})),
    saveState: (state) => writeJsonFile(config.stateFile, state),
    summarize: summarizeXPosts,
    send: (destination, content) =>
      sendXPayload(config, destination, content, true),
    ...dependencies,
  };
  const state = await deps.readState();
  let posts: XPost[] | undefined;
  try {
    posts = await deps.fetchPosts(config.feedUrl);
  } catch (error) {
    console.warn(
      `Failed to collect @${config.handle} posts; attempting saved digest:`,
      error,
    );
  }
  if (posts?.length) {
    const sorted = posts.sort((a, b) => comparePostIds(a.id, b.id));
    const latest = sorted.at(-1)!;
    const pending = state.pendingPosts ?? [];
    const previousCount = pending.length;
    const previousId = state.lastPostId;
    if (state.lastPostId) {
      const knownIds = new Set(pending.map(({ post }) => post.id));
      for (const post of sorted) {
        if (
          comparePostIds(post.id, state.lastPostId) > 0 &&
          !knownIds.has(post.id) &&
          (!config.onlyAuthoredPosts || isXPostAuthoredBy(post, config.handle))
        ) {
          pending.push(queueXPost(post, now, config.digestSchedule));
          knownIds.add(post.id);
        }
      }
    }
    // Seed new installations without replaying historical feed items.
    if (!state.lastPostId || comparePostIds(latest.id, state.lastPostId) > 0) {
      state.lastPostId = latest.id;
      state.lastPostUrl = latest.url;
    }
    if (
      pending.length !== previousCount ||
      state.lastPostId !== previousId ||
      shouldCheckpointXPostState(state.lastCheckedAt, now)
    ) {
      state.pendingPosts = pending;
      state.lastCheckedAt = now.toISOString();
      await deps.saveState(state);
    }
  }
  if (!state.digest) {
    const dueDate = xPostDigestDueDate(now, config.digestSchedule);
    const eligible = (state.pendingPosts ?? [])
      .filter(({ dateKey }) => dateKey <= dueDate)
      .sort(
        (a, b) =>
          a.dateKey.localeCompare(b.dateKey) ||
          comparePostIds(a.post.id, b.post.id),
      );
    const dateKey = eligible[0]?.dateKey;
    if (!dateKey) return;
    // Bound each worker call; remaining posts drain on subsequent polling ticks.
    const batch = eligible
      .filter((entry) => entry.dateKey === dateKey)
      .slice(0, 10)
      .map(({ post }) => post);
    state.digest = buildXPostDigest(
      batch,
      dateKey,
      config.handle,
      await deps.summarize(batch, destinations[0]!),
    );
    await deps.saveState(state);
  }
  const digest = state.digest;
  const failures: unknown[] = [];
  for (const destination of destinations) {
    try {
      for (
        let index = digest.delivered[destination.channelId] ?? 0;
        index < digest.messages.length;
        index++
      ) {
        await deps.send(destination, digest.messages[index]!);
        digest.delivered[destination.channelId] = index + 1;
        await deps.saveState(state);
      }
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      "Some X digest destinations failed; saved for retry.",
    );
  const sentIds = new Set(digest.postIds);
  state.pendingPosts = (state.pendingPosts ?? []).filter(
    ({ post }) => !sentIds.has(post.id),
  );
  delete state.digest;
  await deps.saveState(state);
}

async function sendXPostAlertsIfNeeded(
  config: XPostMonitorConfig,
  now = new Date(),
  collect = true,
) {
  const destinations = getServiceSubscriptionStore().destinations(
    config.service,
  );
  if (destinations.length === 0) return;
  if (config.digestSchedule) {
    await runXPostDigestTick(
      config,
      destinations,
      now,
      collect ? {} : { fetchPosts: async () => [] },
    );
    return;
  }

  const feedPosts = await fetchLatestXPosts(config.feedUrl);
  const latestPost = feedPosts
    .sort((a, b) => comparePostIds(a.id, b.id))
    .at(-1);

  if (!latestPost) {
    throw new Error("X feed did not contain any posts.");
  }

  const state = await readJsonFile<XPostState>(config.stateFile, () => ({}));

  if (!state.lastPostId) {
    await writeJsonFile(config.stateFile, {
      ...state,
      lastPostId: latestPost.id,
      lastPostUrl: latestPost.url,
      lastCheckedAt: now.toISOString(),
    });
    console.log(
      `Initialized @${config.handle} X post monitor at ${latestPost.id}; future posts will be sent.`,
    );
    return;
  }

  const newPosts = feedPosts
    .filter(
      (post) =>
        !config.onlyAuthoredPosts || isXPostAuthoredBy(post, config.handle),
    )
    .filter((post) => comparePostIds(post.id, state.lastPostId ?? "0") > 0)
    .sort((a, b) => comparePostIds(a.id, b.id));

  for (const post of newPosts) {
    const delivery = await deliverToServiceDestinations(
      destinations,
      (destination) => sendXPost(config, destination, post),
    );
    if (delivery.failedChannelIds.length) {
      console.warn(
        `@${config.handle} X post ${post.id} failed for channels ${delivery.failedChannelIds.join(", ")}.`,
      );
    }
    await writeJsonFile(config.stateFile, {
      ...state,
      lastPostId: post.id,
      lastPostUrl: post.url,
      lastCheckedAt: now.toISOString(),
    });
    console.log(
      `Sent @${config.handle} X post ${post.id} to ${delivery.delivered} Discord channel(s).`,
    );
  }

  if (
    newPosts.length === 0 &&
    shouldCheckpointXPostState(state.lastCheckedAt, now)
  ) {
    await writeJsonFile(config.stateFile, {
      ...state,
      lastCheckedAt: now.toISOString(),
    });
  }
}

export function startXPostMonitor() {
  const configs = getXPostMonitorConfigs();

  if (configs.length === 0) {
    return null;
  }

  return configs.map((config) => {
    let running = false;
    let nextFeedCheckAt = 0;
    const tick = async () => {
      if (running) {
        return;
      }

      running = true;

      try {
        const now = new Date();
        const collect = now.getTime() >= nextFeedCheckAt;
        if (collect) nextFeedCheckAt = now.getTime() + config.checkIntervalMs;
        await sendXPostAlertsIfNeeded(config, now, collect);
      } catch (error) {
        console.error(`Failed to check @${config.handle} X posts:`, error);
      } finally {
        running = false;
      }
    };

    void tick();
    // Check digest deadlines once a minute without increasing RSS traffic.
    const timer = setInterval(
      () => void tick(),
      config.digestSchedule
        ? Math.min(60_000, config.checkIntervalMs)
        : config.checkIntervalMs,
    );
    console.log(
      `X post monitor enabled for @${config.handle} every ${config.checkIntervalMs}ms.`,
    );
    return timer;
  });
}
