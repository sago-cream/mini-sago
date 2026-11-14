import { createMessageReactionReader } from "./message-reactions";
import { endDeveloperThreadTarget } from "./developer-thread-control";
import { readGuildEmojiMedia } from "./emoji-media";
import { DeveloperThreadStore } from "./developer-thread-store";
import { DeveloperTaskRegistry } from "./t3-coding";
export {
  DeveloperTaskRegistry,
  developerThreadName,
  createDeveloperThread,
} from "./t3-coding";
import { createDiscordCommandManagement } from "../discord/application-commands";
import { updateCustomStatus } from "../discord/bot-management";
import {
  createFeatureAccess,
  withFeatureAccess,
} from "../discord/feature-access";
import { featureCapability } from "../discord/features";
import { createCcxpSyncClient } from "./ccxp/ccxp-sync";
import { WebhookLoopTracker } from "./webhook-loop";
import { createCcxpMeetingsClient } from "./ccxp/ccxp-meetings";
import { timing, type TimingSink } from "../observability/timing";
import {
  withCalendarConfirmation,
  updateCalendarDraftDiscussion,
} from "./calendar/calendar-confirmation";
import { searchThreads } from "./threads-search";
import { readLink } from "./link-reader";
import { randomUUID } from "node:crypto";

import { createGoogleDriveClient } from "./drive/google-drive";
import { resolveDriveRequester } from "./drive/drive-discord-access";
import { createGoogleCalendarClient } from "./calendar/google-calendar";
import { createGoogleMailClient } from "./mail/google-mail";
import type { ChatbotAccessConfig } from "./access";
import {
  macAgentBridge,
  type MacAgentJobResult,
  type WorkflowLease,
} from "./bridge";
import { CHATBOT_CONTEXT_LIMITS } from "./context-limits";
import { ChatbotMediaRegistry } from "./media-assets";
import {
  registerChatbotMcpSession,
  type ChatbotGuildEmojiRenameInput,
  type ChatbotGuildExpressionInput,
  type ChatbotMcpSessionSnapshot,
  type ChatbotMcpSessionHandlers,
} from "./mcp";
import {
  createTripPlannerClient,
  type TripPlanEditInput,
} from "./trip-planner";
import { getGuildMemoryStore, type GuildMemoryStore } from "./guild-memory";
import type {
  ChatbotCapability,
  ChatbotFailureKind,
  ChatbotAddressingMode,
  ChatbotExecutionRoute,
  ChatbotOutgoingFile,
  ChatbotJob,
  ExecutionRouteJob,
  ChatbotMemberResult,
  ChatbotMessage,
  ChatbotTraceContext,
  AnswerJob,
  OracleAnswerJob,
  PreservedDeveloperTask,
} from "../../contracts/worker-contract";
import { parseChatbotAnswerDecision } from "../../contracts/answer-contract";

import {
  DiscordReactionBroker,
  type DiscordReactionCapabilities,
} from "../discord/api/reactions";
import { createDiscordRequest } from "../discord/api/request";
import {
  addGuildEmojiFromMedia,
  addGuildStickerFromMedia,
  copyGuildEmoji,
  expressionRequestForMember,
  listGuildEmojis,
  listSharedEmojiGuilds,
  renameGuildEmoji,
  type ExpressionFetch,
} from "../discord/api/emojis";
import { getChatbotReminderScheduler } from "../discord/jobs/reminders";
import { sendChannelMessage } from "../discord/api/channel-messages";
import { createMemberMentionHandler } from "./member-mentions";
import {
  joinMemberVoiceChannel,
  leaveVoiceChannel,
} from "../discord/api/voice";
import {
  getNearbyHumanMessages,
  getRecentHumanMessages,
  createGuildMemberResolver,
  lookupGuildMembers,
  searchGuildMessages,
  toChatbotMessage,
  type DiscordMessage,
  type DiscordRequest,
  type DiscordSearchQuery,
} from "./chatbot-context";
import {
  executionRouteOrChat,
  missingDeveloperRepositoryResponse,
  parseExecutionRoute,
  parsePreviousTraceLookup,
} from "./chatbot-routing";
import {
  ChannelQuietTracker,
  isChannelQuietRequest,
  isChannelWakeRequest,
} from "../discord/channel-quiet";
import {
  type FeatureAvailabilityMutation,
  type FeatureAvailabilityStore,
} from "../discord/feature-availability";
import {
  formatManagedServices,
  getServiceSubscriptionStore,
  type ManagedServiceId,
} from "../discord/service-subscriptions";

export {
  canMemberSearchChannel,
  getNearbyHumanMessages,
  getRecentHumanMessages,
  isConversationContextMessage,
  isHumanContextMessage,
  lookupGuildMembers,
  searchGuildMessages,
  toChatbotMessage,
} from "./chatbot-context";
export type { DiscordRequest, DiscordSearchQuery } from "./chatbot-context";
export {
  executionRouteOrChat,
  missingDeveloperRepositoryResponse,
  parseExecutionRoute,
  parsePreviousTraceLookup,
} from "./chatbot-routing";
export { parseChatbotAnswerDecision } from "../../contracts/answer-contract";

const DISCORD_MESSAGE_LIMIT = 2_000;
const TYPING_REFRESH_MS = 8_000;
const ACTIVE_CONVERSATION_TTL_MS = 90_000;
const serviceSubscriptionStore = getServiceSubscriptionStore();
const webhookLoops = new WebhookLoopTracker();

export function chatbotFailureReply(kind: ChatbotFailureKind) {
  if (kind === "unavailable") {
    return "我現在暫時忙不過來 稍後再試一次";
  }
  if (kind === "timeout") {
    return "我沒等到操作結果 先確認一下再重試";
  }
  return "我這次沒完成 稍後再試一次";
}

export function supplementalCapabilities({
  isOwner,
  hasAttachments,
  hasReactions,
  availableRepositories,
  chatbotRepository,
  executionRoute,
}: {
  isOwner: boolean;
  hasAttachments: boolean;
  hasReactions: boolean;
  availableRepositories: string[];
  chatbotRepository?: string;
  executionRoute: ChatbotExecutionRoute;
}): ChatbotCapability[] {
  const capabilities: ChatbotCapability[] = [
    featureCapability("conversation", { availability: "available" }),
    featureCapability("nthu_campus", { availability: "available" }),
  ];

  if (hasReactions) {
    capabilities.push(
      featureCapability("message_reactions", { availability: "available" }),
    );
  }
  capabilities.push(
    featureCapability("attachment_understanding", {
      availability: hasAttachments ? "available" : "conditional",
      ...(!hasAttachments
        ? { condition: "The request must include or reply to an attachment." }
        : {}),
    }),
    featureCapability("media_processing", {
      availability: "conditional",
      condition:
        "A supported attachment and a compatible chat worker are required; outputs are temporary and bounded.",
    }),
    featureCapability("image_generation", {
      availability: "conditional",
      condition:
        "A compatible Linux worker with a ChatGPT-authenticated Codex CLI is required. Outputs are returned as Discord attachments and reusable media IDs.",
    }),
  );
  if (isOwner && availableRepositories.length > 0) {
    capabilities.push(
      featureCapability("repository_work", {
        availability: executionRoute === "oracle" ? "available" : "conditional",
        condition:
          executionRoute === "oracle"
            ? "This owner request runs in its linked T3 coding session."
            : "The owner must identify a registered T3 project. The T3 project controls the model, tools, and permissions.",
      }),
    );
  }
  if (isOwner && chatbotRepository) {
    capabilities.push(
      featureCapability("self_development", {
        availability: executionRoute === "oracle" ? "available" : "conditional",
        condition:
          executionRoute === "oracle"
            ? "This owner request runs in its linked T3 coding session."
            : "The owner must explicitly request a change to your behavior or implementation, or deployment of the configured chatbot repository.",
      }),
    );
  }
  if (isOwner) {
    capabilities.push(
      featureCapability("mac_file_delivery", {
        availability: executionRoute === "mac" ? "available" : "conditional",
        condition:
          executionRoute === "mac"
            ? "This request has already been routed to the connected Mac."
            : "The owner must explicitly request a file and a compatible Mac worker must be connected.",
      }),
    );
  }

  return capabilities;
}

type ActiveConversation = {
  requesterUserId: string;
  expiresAt: number;
  activeAfterSequence: number;
};

export class ChatbotConversationTracker {
  private conversations = new Map<string, ActiveConversation>();
  private receivedSequence = 0;

  constructor(
    private readonly ttlMs = ACTIVE_CONVERSATION_TTL_MS,
    private readonly now = () => Date.now(),
  ) {}

  recordMessage() {
    this.receivedSequence += 1;
    return this.receivedSequence;
  }

  activate(channelId: string, requesterUserId: string) {
    const now = this.now();
    for (const [activeChannelId, conversation] of this.conversations) {
      if (conversation.expiresAt <= now) {
        this.conversations.delete(activeChannelId);
      }
    }
    this.conversations.set(channelId, {
      requesterUserId,
      expiresAt: now + this.ttlMs,
      activeAfterSequence: this.receivedSequence,
    });
  }

  take(message: DiscordMessage, receivedSequence: number) {
    const conversation = this.conversations.get(message.channel_id);
    if (!conversation) return false;

    if (receivedSequence <= conversation.activeAfterSequence) {
      return false;
    }

    this.conversations.delete(message.channel_id);
    return (
      conversation.expiresAt > this.now() &&
      message.author?.id === conversation.requesterUserId &&
      !message.mentions?.length
    );
  }
}

export async function executeChatbotAnswerDecision({
  content,
  message,
  reactionBroker,
  reactionCapabilities,
  discordRequest,
}: {
  content: string;
  message: Pick<ChatbotMention, "id" | "channel_id">;
  reactionBroker?: Pick<DiscordReactionBroker, "addReaction">;
  reactionCapabilities?: DiscordReactionCapabilities;
  discordRequest: DiscordRequest;
}) {
  const decision = parseChatbotAnswerDecision(content);
  let reacted = false;
  if (decision.reactionEmoji && reactionBroker && reactionCapabilities) {
    try {
      reacted = await reactionBroker.addReaction({
        channelId: message.channel_id,
        messageId: message.id,
        emoji: decision.reactionEmoji,
        capabilities: reactionCapabilities,
        discordRequest,
      });
    } catch {
      console.warn("Discord mention reaction failed.");
    }
  }
  return { reply: decision.reply, reacted };
}

export type ChatbotMention = DiscordMessage;

export type ChatbotInvocation = {
  request: string;
  addressingMode: ChatbotAddressingMode;
  chatOnly?: boolean;
  recentContext?: boolean;
  silent?: boolean;
  dismiss?: () => Promise<void>;
  respond?: (
    content: string | string[] | null,
    files?: ChatbotOutgoingFile[],
  ) => Promise<void>;
};

export function extractMentionRequest(
  content: string,
  botUserId: string,
  botRoleIds: ReadonlySet<string> = new Set(),
) {
  const mentionPattern = new RegExp(`<@!?${botUserId}>`, "g");
  let addressed = false;
  let request = content.replace(mentionPattern, () => {
    addressed = true;
    return "";
  });

  request = request.replace(/<@&(\d{17,20})>/gu, (mention, roleId) => {
    if (!botRoleIds.has(roleId)) return mention;
    addressed = true;
    return "";
  });

  return addressed ? request.trim() : null;
}

export function extractChatbotRequest(
  message: ChatbotMention,
  botUserId: string,
  accessConfig: ChatbotAccessConfig,
) {
  const content = message.content ?? "";
  const mentionRequest = extractMentionRequest(
    content,
    botUserId,
    accessConfig.roleIds,
  );

  if (mentionRequest !== null) {
    return mentionRequest;
  }

  if (!message.guild_id && message.author?.id === accessConfig.ownerUserId) {
    return content.trim();
  }

  return message.referenced_message?.author?.id === botUserId &&
    message.mentions?.some((user) => user.id === botUserId)
    ? content.trim()
    : null;
}

export function chatbotAddressingMode(
  message: ChatbotMention,
  botUserId: string,
  accessConfig: ChatbotAccessConfig,
): ChatbotAddressingMode | null {
  if (
    message.referenced_message?.author?.id === botUserId &&
    message.mentions?.some((user) => user.id === botUserId)
  ) {
    return "reply";
  }
  if (
    extractMentionRequest(
      message.content ?? "",
      botUserId,
      accessConfig.roleIds,
    ) !== null
  ) {
    return "mention";
  }
  if (!message.guild_id && message.author?.id === accessConfig.ownerUserId) {
    return "dm";
  }
  return null;
}

export function isChatbotAuthorized(
  userId: string,
  accessConfig: ChatbotAccessConfig,
  guildId?: string,
  channelId?: string,
  featureAvailability?: FeatureAvailabilityStore,
  roleIds?: readonly string[],
) {
  return (
    userId === accessConfig.ownerUserId ||
    (featureAvailability
      ? createFeatureAccess(
          "chatbot",
          {
            guildId,
            channelId,
            roleIds,
            requesterId: userId,
            ownerId: accessConfig.ownerUserId,
          },
          featureAvailability,
        ).available()
      : (guildId !== undefined && accessConfig.guildIds.has(guildId)) ||
        (channelId !== undefined && accessConfig.channelIds.has(channelId)))
  );
}

function normalizeDiscordAnswer(content: string) {
  const normalized = content.trim();

  if (!normalized) {
    return "我剛剛腦袋一片空白 再問我一次";
  }

  return normalized;
}

function limitDiscordMessage(content: string) {
  return content.length <= DISCORD_MESSAGE_LIMIT
    ? content
    : `${content.slice(0, DISCORD_MESSAGE_LIMIT - 1).trimEnd()}…`;
}

export function formatDiscordAnswer(content: string) {
  return limitDiscordMessage(normalizeDiscordAnswer(content));
}

function splitDiscordAnswer(content: string) {
  const parts: string[] = [];
  let part: string[] = [];
  let fence: { marker: string; length: number } | undefined;

  const flush = () => {
    const value = part.join("\n").trim();
    if (value) {
      parts.push(value);
    }
    part = [];
  };

  for (const line of content.split(/\r?\n/u)) {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/u);

    if (fence) {
      part.push(line);
      const closingFence = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/u)?.[1];
      if (
        closingFence?.startsWith(fence.marker) &&
        closingFence.length >= fence.length
      ) {
        fence = undefined;
      }
      continue;
    }

    if (fenceMatch?.[1]) {
      fence = {
        marker: fenceMatch[1][0]!,
        length: fenceMatch[1].length,
      };
      part.push(line);
      continue;
    }

    if (line.trim()) {
      part.push(line);
    } else {
      flush();
    }
  }

  flush();
  return parts;
}

export function formatDiscordAnswers(content: string) {
  return splitDiscordAnswer(normalizeDiscordAnswer(content))
    .map((part) => limitDiscordMessage(part.trim()))
    .filter(Boolean);
}

function replyBody(message: DiscordMessage, content: string | null) {
  return {
    ...(content ? { content } : {}),
    message_reference: {
      message_id: message.id,
      fail_if_not_exists: false,
    },
    allowed_mentions: {
      parse: [],
      replied_user: true,
    },
  };
}

function channelMessageBody(content: string | null) {
  return {
    ...(content ? { content } : {}),
    allowed_mentions: {
      parse: [],
    },
  };
}

function messageUpload(body: unknown, files: ChatbotOutgoingFile[]) {
  if (!files.length) return undefined;
  const form = new FormData();
  form.append("payload_json", JSON.stringify(body));
  for (const [index, file] of files.entries()) {
    form.append(
      `files[${index}]`,
      new Blob([Buffer.from(file.data, "base64")], { type: file.contentType }),
      file.filename,
    );
  }
  return form;
}

export async function postChatbotResponse(
  message: DiscordMessage,
  content: string | string[] | null,
  discordRequest: DiscordRequest,
  files: ChatbotOutgoingFile[] = [],
  latestMessageId?: () => string | undefined,
) {
  const contents = Array.isArray(content) ? content : [content];
  let canPostDirectly = false;

  if (latestMessageId) {
    canPostDirectly = latestMessageId() === message.id;
  } else
    try {
      const latestMessages = await discordRequest<DiscordMessage[]>(
        `/channels/${message.channel_id}/messages?limit=1`,
      );
      canPostDirectly = latestMessages[0]?.id === message.id;
    } catch {
      // A reply keeps the relationship clear when the latest message is unknown.
    }

  for (const [index, content] of contents.entries()) {
    const body =
      canPostDirectly || index > 0
        ? channelMessageBody(content)
        : replyBody(message, content);
    const uploadFiles = index === 0 ? files : [];
    const formData = messageUpload(body, uploadFiles);
    await discordRequest(`/channels/${message.channel_id}/messages`, {
      method: "POST",
      ...(formData ? { formData } : { body }),
    });
  }
}

type TaskMcpSession = Pick<
  ReturnType<typeof registerChatbotMcpSession>,
  "extend" | "revoke" | "snapshot"
>;

export class ChatbotRequestResources {
  private session?: TaskMcpSession;
  private released = false;

  constructor(readonly workflow: WorkflowLease) {}

  attachSession(session: TaskMcpSession) {
    this.session = session;
  }

  release() {
    if (this.released) return;
    this.released = true;
    const snapshot = this.session?.snapshot();
    this.session?.revoke();
    this.workflow.release();
    return snapshot;
  }
}

const developerTasks = new DeveloperTaskRegistry(
  undefined,
  new DeveloperThreadStore(),
);

export function startDeveloperThreadRelay(
  discord: DiscordRequest,
  ownerUserId: string,
) {
  developerTasks.startRelay(discord, ownerUserId);
}

async function withTyping<T>(
  channelId: string,
  discordRequest: DiscordRequest,
  task: () => Promise<T>,
  nonBlocking = false,
) {
  const initialTyping = discordRequest(`/channels/${channelId}/typing`, {
    method: "POST",
  }).catch(() => undefined);
  if (!nonBlocking) await initialTyping;
  const timer = setInterval(() => {
    void discordRequest(`/channels/${channelId}/typing`, {
      method: "POST",
    }).catch(() => undefined);
  }, TYPING_REFRESH_MS);

  try {
    return await task();
  } finally {
    clearInterval(timer);
  }
}

export async function addGuildExpressionForRequest({
  input,
  guildId,
  mediaRegistry,
  discordRequest,
  fetchEmoji,
}: {
  input: ChatbotGuildExpressionInput;
  guildId: string;
  mediaRegistry: ChatbotMediaRegistry;
  discordRequest: DiscordRequest;
  fetchEmoji?: ExpressionFetch;
}) {
  const destinationGuild = input.destinationGuild ?? guildId;

  if (input.emoji || input.sourceGuild) {
    if (input.kind === "sticker") {
      throw new Error(
        "Existing sticker copying is not supported; attach the sticker file instead.",
      );
    }
    if (!input.emoji || !input.sourceGuild) {
      throw new Error(
        "Provide both sourceGuild and emoji when copying an existing emoji.",
      );
    }
    return copyGuildEmoji({
      emoji: input.emoji,
      sourceGuild: input.sourceGuild,
      destinationGuild,
      name: input.name,
      discordRequest,
      fetchEmoji,
    });
  }

  if (!input.mediaId) {
    throw new Error(
      "Provide mediaId from an attachment, member avatar, or media tool output.",
    );
  }
  const media = await mediaRegistry.read(input.mediaId, fetchEmoji);
  if (input.kind === "sticker") {
    if (!input.tags) {
      throw new Error(
        "Provide a related Unicode emoji or search tag for the sticker.",
      );
    }
    return addGuildStickerFromMedia({
      destinationGuild,
      media,
      name: input.name,
      description: input.description,
      tags: input.tags,
      discordRequest,
    });
  }
  return addGuildEmojiFromMedia({
    destinationGuild,
    media,
    name: input.name,
    discordRequest,
  });
}

export type ChatbotExecutionOptions = {
  onTiming?: TimingSink;
  nonBlockingTyping?: boolean;
  lazyPreviousTrace?: boolean;
  /** A gateway cache callback. Unknown state conservatively uses an explicit reply. */
  latestMessageId?: () => string | undefined;
  routeRequest?: (job: ExecutionRouteJob) => Promise<string | undefined>;
};

export async function handleChatbotMention(
  input: Parameters<typeof handleChatbotMentionRequest>[0],
) {
  return handleChatbotMentionRequest(input);
}

async function handleChatbotMentionRequest({
  message,
  botUserId,
  discordRequest,
  accessConfig,
  reactionBroker,
  conversationTracker,
  quietTracker,
  webhookLoopTracker = webhookLoops,
  receivedSequence,
  invocation,
  featureAvailability,
  guildMemoryStore = getGuildMemoryStore(),
  executionOptions = {},
  developerTaskRegistry = developerTasks,
}: {
  message: ChatbotMention;
  botUserId: string;
  discordRequest: DiscordRequest;
  accessConfig: ChatbotAccessConfig;
  reactionBroker?: DiscordReactionBroker;
  conversationTracker?: ChatbotConversationTracker;
  quietTracker?: ChannelQuietTracker;
  webhookLoopTracker?: WebhookLoopTracker;
  receivedSequence?: number;
  invocation?: ChatbotInvocation;
  featureAvailability?: FeatureAvailabilityStore;
  guildMemoryStore?: Pick<GuildMemoryStore, "ensure" | "mutate">;
  executionOptions?: ChatbotExecutionOptions;
  developerTaskRegistry?: DeveloperTaskRegistry;
}) {
  const clock = timing(executionOptions.onTiming);
  clock.mark("handler.received");
  const requesterUserId = message.author?.id;
  const respond = (
    content: string | string[] | null,
    files: ChatbotOutgoingFile[] = [],
  ) =>
    invocation?.respond
      ? invocation.respond(content, files)
      : postChatbotResponse(
          message,
          content,
          discordRequest,
          files,
          executionOptions.latestMessageId,
        );

  if (!requesterUserId || requesterUserId === botUserId) {
    return false;
  }

  webhookLoopTracker.observe(message, botUserId);

  if (
    !invocation &&
    requesterUserId === accessConfig.ownerUserId &&
    !message.author?.bot &&
    !message.webhook_id
  ) {
    const target = endDeveloperThreadTarget(
      extractChatbotRequest(message, botUserId, accessConfig) ??
        message.content ??
        "",
      message.channel_id,
    );
    if (target) {
      const end = () =>
        developerTaskRegistry.end(
          target,
          message.guild_id ?? "",
          accessConfig.ownerUserId,
          discordRequest,
        );
      const result = await developerTaskRegistry.recover(target, end);
      if (result.status === "not_found")
        await respond(
          "No active or saved development task was found for that thread in this server.",
        );
      return true;
    }
  }

  if (!invocation && developerTaskRegistry.has(message.channel_id)) {
    return developerTaskRegistry.handle(
      message,
      botUserId,
      accessConfig,
      discordRequest,
    );
  }

  const automaticFollowups = createFeatureAccess(
    "automatic_followups",
    {
      guildId: message.guild_id,
      channelId: message.channel_id,
      roleIds: message.member?.roles,
      requesterId: requesterUserId,
      ownerId: accessConfig.ownerUserId,
    },
    featureAvailability,
  );
  let addressingMode =
    invocation?.addressingMode ??
    chatbotAddressingMode(message, botUserId, accessConfig);
  let request =
    invocation?.request ??
    extractChatbotRequest(message, botUserId, accessConfig);
  if (
    request === null &&
    receivedSequence !== undefined &&
    conversationTracker?.take(message, receivedSequence) &&
    automaticFollowups.available()
  ) {
    request = message.content?.trim() ?? "";
    addressingMode = "continuation";
  }
  if (request === null) {
    return false;
  }

  if (
    !isChatbotAuthorized(
      requesterUserId,
      accessConfig,
      message.guild_id,
      message.channel_id,
      featureAvailability,
      message.member?.roles,
    )
  ) {
    if (!message.guild_id) {
      return false;
    }

    if (!webhookLoopTracker.allowResponse(message)) return true;

    const content = `在這個伺服器裡我暫時只聽 <@${accessConfig.ownerUserId}> 的 抱歉啦`;
    await respond(content);
    return true;
  }

  if (quietTracker?.isPaused(message.channel_id)) {
    if (
      addressingMode !== "continuation" &&
      isChannelWakeRequest(request || message.content || "")
    ) {
      quietTracker.wake(message.channel_id);
    } else {
      return true;
    }
  }

  if (!webhookLoopTracker.allowResponse(message)) return true;

  const acquired = macAgentBridge.acquireWorkflow(["chat"]);

  if (acquired.status === "offline") {
    const content = "我現在沒接上工作機 晚點再叫我一次 💤";
    await respond(content);
    return true;
  }

  if (acquired.status === "busy") {
    const content = "我正在幫別人做事 等我一下下";
    await respond(content);
    return true;
  }

  const { workflow } = acquired;
  let result: MacAgentJobResult;
  let developerTaskStarted = false;
  const resources = new ChatbotRequestResources(workflow);
  let savedMemoryAction: "add" | "replace" | "remove" | undefined;
  let mcpSession: ReturnType<typeof registerChatbotMcpSession> | undefined;
  let mcpSnapshot: ChatbotMcpSessionSnapshot = {
    searchUnavailable: false,
  };
  let reactionCapabilities: DiscordReactionCapabilities | undefined;
  try {
    const execute = async () => {
      const codingRepositoriesPromise =
        requesterUserId === accessConfig.ownerUserId &&
        !invocation?.chatOnly &&
        !isChannelQuietRequest(request)
          ? developerTaskRegistry.availableRepositories()
          : Promise.resolve([]);
      const historyDone = clock.start("host.nearby_history");
      const requestMessage = toChatbotMessage(message, botUserId);
      let messages = invocation?.recentContext
        ? await getRecentHumanMessages({
            channelId: message.channel_id,
            requestMessageId: message.id,
            botUserId,
            discordRequest,
            messageLimit: CHATBOT_CONTEXT_LIMITS.nearbyMessages,
          })
        : message.guild_id
          ? await getNearbyHumanMessages({
              channelId: message.channel_id,
              requestMessageId: message.id,
              botUserId,
              discordRequest,
            })
          : await getRecentHumanMessages({
              channelId: message.channel_id,
              requestMessageId: message.id,
              botUserId,
              discordRequest,
            });
      historyDone();
      const mediaRegistry = new ChatbotMediaRegistry(undefined, discordRequest);
      mediaRegistry.registerMessages([requestMessage, ...messages]);
      const expressionRequest =
        requesterUserId === accessConfig.ownerUserId
          ? discordRequest
          : expressionRequestForMember(discordRequest, requesterUserId);
      let contextChannelId = message.channel_id;
      let contextRequestMessageId = message.id;
      let serverMemory: ChatbotJob["serverMemory"];
      if (message.guild_id) {
        try {
          const snapshot = await clock.span("host.guild_memory", () =>
            guildMemoryStore.ensure(message.guild_id!),
          );
          if (snapshot.entries.length) {
            serverMemory = {
              revision: snapshot.revision,
              entries: snapshot.entries.map(({ id, content }) => ({
                id,
                content,
              })),
            };
          }
        } catch {
          console.warn("Discord server memory unavailable.");
        }
      }
      let executionRoute: ChatbotExecutionRoute = "chat";
      let selectedRepository: string | undefined;
      let developerThreadTitle: string | undefined;
      let codingRepositories: string[] = [];
      const chatbotRepository = process.env.MINISAGO_CHATBOT_REPOSITORY?.trim();
      type PreviousTrace = {
        status: "complete" | "not_found" | "unavailable";
        trace?: ChatbotTraceContext;
        developerTask?: PreservedDeveloperTask;
      };
      let previousTracePromise: Promise<PreviousTrace> | undefined;
      const getPreviousTrace = () =>
        (previousTracePromise ??= clock.span(
          "host.previous_trace",
          async () => {
            const dispatch = workflow.dispatch({
              id: randomUUID(),
              requesterUserId,
              purpose: "trace_lookup",
              channelId: message.channel_id,
              requestMessageId: message.id,
              request,
              requestMessage,
              messages: [],
            });
            if (dispatch.status !== "accepted")
              return { status: "unavailable" as const };
            const result = await dispatch.result;
            return result.ok
              ? parsePreviousTraceLookup(result.content)
              : { status: "unavailable" as const };
          },
        ));

      if (message.guild_id && reactionBroker) {
        try {
          reactionCapabilities = await clock.span(
            "host.reaction_discovery",
            () =>
              reactionBroker.discover({
                guildId: message.guild_id!,
                channelId: message.channel_id,
                botUserId,
                discordRequest,
              }),
          );
        } catch {
          console.warn("Discord reaction capabilities unavailable.");
        }
      }

      const resolveMember = message.guild_id
        ? createGuildMemberResolver({
            guildId: message.guild_id,
            channelId: message.channel_id,
            requestMessageId: message.id,
            discordRequest,
          })
        : undefined;
      const recentMessages = async (historyCount: number) => {
        const resolved = await (historyCount === 0
          ? Promise.resolve([])
          : historyCount <= CHATBOT_CONTEXT_LIMITS.nearbyMessages
            ? Promise.resolve(messages.slice(-historyCount))
            : getRecentHumanMessages({
                channelId: contextChannelId,
                requestMessageId: contextRequestMessageId,
                botUserId,
                discordRequest,
                messageLimit: historyCount,
              }));
        mediaRegistry.registerMessages(resolved);
        return resolved;
      };
      const searchMessages = message.guild_id
        ? async (queries: DiscordSearchQuery[]) => {
            const resolved = await searchGuildMessages({
              guildId: message.guild_id!,
              requesterUserId,
              requesterRoleIds: message.member?.roles,
              currentChannelId: contextChannelId,
              requestMessageId: contextRequestMessageId,
              queries,
              resolveMember,
              discordRequest,
            });
            mediaRegistry.registerMessages(resolved);
            return resolved;
          }
        : undefined;
      const lookupMembers = message.guild_id
        ? async (queries: string[]) => {
            const resolved = await lookupGuildMembers({
              guildId: message.guild_id!,
              queries,
              resolveMember,
              discordRequest,
            });
            return resolved.map(({ avatarUrl, ...result }) => {
              const avatarUrl128 = new URL(avatarUrl);
              avatarUrl128.pathname = avatarUrl128.pathname.replace(
                /\.[^.]+$/u,
                ".png",
              );
              avatarUrl128.searchParams.set("size", "128");
              return {
                ...result,
                avatar: mediaRegistry.registerUrl({
                  filename: `${result.names[0] ?? "member"}-avatar.png`,
                  contentType: "image/png",
                  url: avatarUrl128.toString(),
                }),
              };
            });
          }
        : undefined;
      const reminderScheduler = getChatbotReminderScheduler();
      const featureContext = {
        guildId: message.guild_id,
        channelId: message.channel_id,
        roleIds: message.member?.roles,
        messageId: message.id,
        requesterId: requesterUserId,
        ownerId: accessConfig.ownerUserId,
        resolveRoleIds: async () =>
          (
            await resolveDriveRequester(
              { guildId: message.guild_id!, requesterId: requesterUserId },
              discordRequest,
            )
          ).roleIds,
      };
      const tripAccess = createFeatureAccess(
        "trip_planner",
        featureContext,
        featureAvailability,
      );
      const tripPlanner = tripAccess.available()
        ? createTripPlannerClient(process.env, `minisago-${message.id}`)
        : undefined;
      const calendar = createGoogleCalendarClient(
        process.env,
        featureContext,
        fetch,
        featureAvailability,
      );
      const drive = createGoogleDriveClient(
        process.env,
        {
          ...featureContext,
          resolveRequester: () =>
            resolveDriveRequester(
              {
                guildId: message.guild_id!,
                requesterId: requesterUserId,
              },
              discordRequest,
            ),
        },
        mediaRegistry,
        fetch,
        featureAvailability,
      );
      const ccxpMeetings = createCcxpMeetingsClient(
        process.env,
        featureContext,
        featureAvailability,
      );
      const ccxpSync = createCcxpSyncClient(
        process.env,
        {
          ...featureContext,
        },
        featureAvailability,
      );
      const mail = createGoogleMailClient(
        process.env,
        {
          ...featureContext,
          requesterId: requesterUserId,
          ownerId: accessConfig.ownerUserId,
        },
        fetch,
        featureAvailability,
      );
      const requestMcpHandlers: ChatbotMcpSessionHandlers = {
        ...(message.guild_id
          ? {
              readMessageReactions: createMessageReactionReader({
                guildId: message.guild_id,
                channelId: message.channel_id,
                defaultMessageId: message.referenced_message?.id ?? message.id,
                discordRequest,
              }),
              mentionMembers: createMemberMentionHandler({
                guildId: message.guild_id,
                channelId: message.channel_id,
                requestMessageId: message.id,
                discordRequest,
                resolveMember,
              }),
            }
          : {}),
        ...(ccxpSync ? { ccxpSync } : {}),
        ...(ccxpMeetings ? { ccxpMeetings } : {}),
        searchThreads,
        readLink,
        mediaRegistry,
        ...(calendar
          ? {
              calendar: withCalendarConfirmation(
                calendar,
                {
                  guildId: message.guild_id,
                  channelId: message.channel_id,
                  messageId: message.id,
                  requesterId: requesterUserId,
                },
                discordRequest,
                createFeatureAccess(
                  "calendar",
                  featureContext,
                  featureAvailability,
                ).allowed,
              ),
            }
          : {}),
        ...(drive ? { drive } : {}),
        ...(mail ? { mail } : {}),
        getCodexUsage: () => workflow.getCodexUsage(),
        ...(quietTracker
          ? {
              pauseChannelActivity: (durationMinutes?: number) =>
                quietTracker.pause(message.channel_id, durationMinutes),
            }
          : {}),
        ...(tripPlanner
          ? {
              readTripPlan: (input) =>
                withFeatureAccess(tripAccess, () => tripPlanner.read(input)),
              ...(tripPlanner.edit
                ? {
                    editTripPlan: (input: TripPlanEditInput) =>
                      withFeatureAccess(
                        tripAccess,
                        () => tripPlanner.edit!(input),
                        false,
                      ),
                  }
                : {}),
            }
          : {}),
        resolveContext: async ({
          historyCount,
          includePreviousTrace,
          memberQueries,
          queries,
        }) => {
          const historyPromise = recentMessages(historyCount)
            .then((resolvedMessages) => ({
              status: "complete" as const,
              messages: resolvedMessages,
            }))
            .catch(() => ({
              status: "unavailable" as const,
              messages: [] as ChatbotMessage[],
            }));
          const searchPromise =
            queries.length > 0
              ? searchMessages
                ? searchMessages(queries)
                    .then((results) => ({
                      status: "complete" as const,
                      results,
                    }))
                    .catch(() => ({
                      status: "unavailable" as const,
                      results: [] as ChatbotMessage[],
                    }))
                : Promise.resolve({
                    status: "unavailable" as const,
                    results: [] as ChatbotMessage[],
                  })
              : Promise.resolve({
                  status: "not_requested" as const,
                  results: [] as ChatbotMessage[],
                });
          const membersPromise =
            memberQueries.length > 0
              ? lookupMembers
                ? lookupMembers(memberQueries)
                    .then((results) => ({
                      status: "complete" as const,
                      results,
                    }))
                    .catch(() => ({
                      status: "unavailable" as const,
                      results: [] as ChatbotMemberResult[],
                    }))
                : Promise.resolve({
                    status: "unavailable" as const,
                    results: [] as ChatbotMemberResult[],
                  })
              : Promise.resolve({
                  status: "not_requested" as const,
                  results: [] as ChatbotMemberResult[],
                });

          const [history, search, members, previousTrace] = await Promise.all([
            historyPromise,
            searchPromise,
            membersPromise,
            includePreviousTrace
              ? getPreviousTrace()
              : Promise.resolve({ status: "not_requested" as const }),
          ]);
          return {
            history,
            search,
            members,
            previousTrace,
          };
        },
        ...(message.guild_id
          ? {
              listSharedGuilds: async () =>
                (await listSharedEmojiGuilds(expressionRequest)).map(
                  (guild) => ({
                    ...guild,
                    current: guild.id === message.guild_id,
                  }),
                ),
              listGuildEmojis: (guild: string) =>
                listGuildEmojis({ guild, discordRequest: expressionRequest }),
              readGuildEmoji: (input: { emoji: string; guild?: string }) =>
                readGuildEmojiMedia({
                  emoji: input.emoji,
                  guild: input.guild ?? message.guild_id!,
                  registry: mediaRegistry,
                  discordRequest: expressionRequest,
                }),
              addGuildExpression: (input: ChatbotGuildExpressionInput) =>
                addGuildExpressionForRequest({
                  input,
                  guildId: message.guild_id!,
                  mediaRegistry,
                  discordRequest: expressionRequest,
                }),
              renameGuildEmoji: (input: ChatbotGuildEmojiRenameInput) =>
                renameGuildEmoji({
                  guild: input.guild ?? message.guild_id!,
                  emoji: input.emoji,
                  name: input.name,
                  discordRequest: expressionRequest,
                }),
            }
          : {}),
        ...(requesterUserId === accessConfig.ownerUserId && featureAvailability
          ? {
              listFeatureAvailability: () => featureAvailability.list(),
              configureFeatureAvailability: async (
                input: FeatureAvailabilityMutation,
              ) => {
                const target = await discordRequest<{ guild_id?: string }>(
                  input.scope === "channel"
                    ? `/channels/${input.targetId}`
                    : `/guilds/${input.targetId}`,
                );
                const filters = [
                  ...(input.allowRoleIds ?? []),
                  ...(input.denyRoleIds ?? []),
                ];
                if (filters.length) {
                  const guildId =
                    input.scope === "guild" ? input.targetId : target.guild_id;
                  if (!guildId)
                    throw new Error("Role filters require a guild channel.");
                  const roles = await discordRequest<Array<{ id: string }>>(
                    `/guilds/${guildId}/roles`,
                  );
                  if (
                    filters.some((id) => !roles.some((role) => role.id === id))
                  ) {
                    throw new Error(
                      "Every role filter must belong to the target guild.",
                    );
                  }
                }
                return featureAvailability.configure(input);
              },
            }
          : {}),
        ...(requesterUserId === accessConfig.ownerUserId
          ? {
              listManagedServices: () =>
                formatManagedServices(serviceSubscriptionStore.list()),
              configureServiceSubscription: async (input: {
                service: ManagedServiceId;
                action: "subscribe" | "unsubscribe";
                channelId: string;
              }) => {
                if (input.action === "unsubscribe") {
                  await serviceSubscriptionStore.configure({
                    service: input.service,
                    action: "unsubscribe",
                    channelId: input.channelId,
                  });
                  return formatManagedServices(serviceSubscriptionStore.list());
                }
                const channel = await discordRequest<{ guild_id?: string }>(
                  `/channels/${input.channelId}`,
                );
                if (!channel.guild_id) {
                  throw new Error(
                    "Service destinations must be Discord server channels.",
                  );
                }
                await serviceSubscriptionStore.configure({
                  service: input.service,
                  action: "subscribe",
                  channelId: input.channelId,
                  guildId: channel.guild_id,
                });
                return formatManagedServices(serviceSubscriptionStore.list());
              },
            }
          : {}),
        ...(requesterUserId === accessConfig.ownerUserId
          ? {
              discordCommands: createDiscordCommandManagement({
                discordRequest,
                applicationId: process.env.DISCORD_APPLICATION_ID?.trim(),
                currentGuildId: message.guild_id,
              }),
              updateCustomStatus,
              ...(message.guild_id
                ? {
                    endDeveloperThread: (threadId?: string) => {
                      if (
                        (developerTaskRegistry.currentRequester(
                          contextChannelId,
                        ) ?? requesterUserId) !== accessConfig.ownerUserId
                      )
                        throw new Error(
                          "Only the owner can end development threads.",
                        );
                      return developerTaskRegistry.recover(
                        threadId ?? contextChannelId,
                        () =>
                          developerTaskRegistry.end(
                            threadId ?? contextChannelId,
                            message.guild_id!,
                            accessConfig.ownerUserId,
                            discordRequest,
                          ),
                      );
                    },
                  }
                : {}),
              sendChannelMessage: (input: {
                content: string;
                channelId?: string;
                server?: string;
                channel?: string;
              }) => sendChannelMessage({ ...input, discordRequest }),
            }
          : {}),
        ...(message.guild_id
          ? {
              manageServerMemory: async (
                input:
                  | { action: "add"; content: string }
                  | {
                      action: "replace";
                      entryId: string;
                      content: string;
                    }
                  | { action: "remove"; entryId: string },
              ) => {
                const result = await guildMemoryStore.mutate(
                  message.guild_id!,
                  input,
                  message.id,
                  requesterUserId,
                );
                savedMemoryAction = result.action;
                return {
                  revision: result.revision,
                  action: result.action,
                  entryId: result.entryId,
                };
              },
            }
          : {}),
        ...(reminderScheduler
          ? {
              createReminder: async (input) => {
                const reminder = await reminderScheduler.create({
                  ...input,
                  requesterUserId,
                  channelId: message.channel_id,
                });
                return {
                  id: reminder.id,
                  content: reminder.content,
                  nextRunAt: reminder.nextRunAt,
                  ...(reminder.cron ? { cron: reminder.cron } : {}),
                  ...(reminder.timezone ? { timezone: reminder.timezone } : {}),
                };
              },
              listReminders: async () =>
                (await reminderScheduler.list(message.channel_id)).map(
                  (reminder) => ({
                    id: reminder.id,
                    content: reminder.content,
                    nextRunAt: reminder.nextRunAt,
                    ...(reminder.cron ? { cron: reminder.cron } : {}),
                    ...(reminder.timezone
                      ? { timezone: reminder.timezone }
                      : {}),
                    ...(reminder.skipIfImagePosted
                      ? { skipIfImagePosted: reminder.skipIfImagePosted }
                      : {}),
                  }),
                ),
              editReminder: async (input) => {
                const reminder = await reminderScheduler.edit({
                  ...input,
                  channelId: message.channel_id,
                });
                if (!reminder) return undefined;
                return {
                  id: reminder.id,
                  content: reminder.content,
                  nextRunAt: reminder.nextRunAt,
                  ...(reminder.cron ? { cron: reminder.cron } : {}),
                  ...(reminder.timezone ? { timezone: reminder.timezone } : {}),
                  ...(reminder.skipIfImagePosted
                    ? { skipIfImagePosted: reminder.skipIfImagePosted }
                    : {}),
                };
              },
              cancelReminder: (reminderId: string) =>
                reminderScheduler.cancel(message.channel_id, reminderId),
            }
          : {}),
        ...(message.guild_id
          ? {
              joinVoiceChannel: () =>
                joinMemberVoiceChannel(message.guild_id!, requesterUserId),
              leaveVoiceChannel: () => leaveVoiceChannel(message.guild_id!),
            }
          : {}),
      };
      mcpSession = registerChatbotMcpSession(requestMcpHandlers, {
        featureAccess: (feature) =>
          createFeatureAccess(feature, featureContext, featureAvailability),
      });

      resources.attachSession(mcpSession);

      if (
        requesterUserId === accessConfig.ownerUserId &&
        !invocation?.chatOnly &&
        !isChannelQuietRequest(request)
      ) {
        codingRepositories = await codingRepositoriesPromise;
        const routeJob: ChatbotJob = {
          id: randomUUID(),
          requesterUserId,
          purpose: "execution_route",
          channelId: message.channel_id,
          requestMessageId: message.id,
          request,
          requestMessage,
          messages,
          capabilities: [
            ...mcpSession.capabilities,
            featureCapability("image_generation", {
              availability: "conditional",
              condition:
                "A compatible Linux worker with a ChatGPT-authenticated Codex CLI is required.",
            }),
          ],
          availableRepositories: codingRepositories,
          ...(chatbotRepository
            ? { chatbotRepository: chatbotRepository }
            : {}),
        };
        const routeDone = clock.start("host.routing");
        const fastRoute = executionOptions.routeRequest
          ? await clock.span("host.jev", () =>
              executionOptions.routeRequest!(routeJob),
            )
          : undefined;
        const routeDispatch =
          fastRoute === undefined ? workflow.dispatch(routeJob) : undefined;
        let route = parseExecutionRoute("", codingRepositories);
        if (fastRoute !== undefined)
          route = parseExecutionRoute(fastRoute, codingRepositories);
        if (routeDispatch?.status === "accepted") {
          const routeResult = await routeDispatch.result;
          route = parseExecutionRoute(
            routeResult.ok ? routeResult.content : "",
            codingRepositories,
          );
        }
        routeDone();
        executionRoute = executionRouteOrChat(route.route);
        selectedRepository = route.repository;
        developerThreadTitle = route.threadTitle;

        const missingRepository = missingDeveloperRepositoryResponse(
          route.route,
          selectedRepository,
          codingRepositories,
        );
        if (missingRepository) {
          return { ok: true as const, content: missingRepository };
        }
        const workerRoute =
          executionRoute === "oracle"
            ? { status: "accepted" as const }
            : workflow.route(
                [
                  "chat",
                  ...(executionRoute === "mac" ? (["mac"] as const) : []),
                ],
                selectedRepository,
              );
        if (workerRoute.status !== "accepted") {
          return {
            ok: false as const,
            error:
              workerRoute.status === "busy"
                ? "The compatible worker is busy."
                : "No compatible worker is online.",
            failureKind: "unavailable" as const,
          };
        }
      }

      // Routing may have selected a different worker with its own trace state.
      previousTracePromise = undefined;
      if (!executionOptions.lazyPreviousTrace) await getPreviousTrace();

      const requestCapabilities = supplementalCapabilities({
        isOwner: requesterUserId === accessConfig.ownerUserId,
        hasAttachments:
          requestMessage.attachments.length > 0 ||
          Boolean(requestMessage.referencedMessage?.attachments.length),
        hasReactions: Boolean(reactionCapabilities?.tools.length),
        availableRepositories: codingRepositories,
        chatbotRepository: codingRepositories.includes(chatbotRepository ?? "")
          ? chatbotRepository
          : undefined,
        executionRoute,
      });
      if (!invocation && automaticFollowups.available())
        requestCapabilities.push(
          featureCapability("automatic_followups", {
            availability: "available",
          }),
        );
      const answerBase = {
        id: randomUUID(),
        requesterUserId,
        purpose: "answer" as const,
        channelId: message.channel_id,
        requestMessageId: message.id,
        request,
        ...(addressingMode ? { addressingMode } : {}),
        requestMessage,
        messages,
        mcpAccessToken: mcpSession.token,
        capabilities: [...requestCapabilities, ...mcpSession.capabilities],
        ...(reactionCapabilities?.tools.length
          ? { availableTools: reactionCapabilities.tools }
          : {}),
        ...(serverMemory ? { serverMemory } : {}),
      };
      let job: AnswerJob;
      if (executionRoute === "oracle") {
        const repository = selectedRepository;
        if (!repository) {
          return {
            ok: false as const,
            error: "The router selected Oracle without a repository.",
            failureKind: "internal" as const,
          };
        }
        job = {
          ...answerBase,
          executionRoute,
          repository,
        };
      } else if (executionRoute === "mac") {
        job = { ...answerBase, executionRoute };
      } else {
        job = { ...answerBase, executionRoute };
      }

      if (job.executionRoute === "oracle") {
        await developerTaskRegistry.start({
          message,
          job,
          title: developerThreadTitle,
          discordRequest,
        });
        developerTaskStarted = true;
        return { ok: true as const, content: "" };
      }
      const answerDone = clock.start("host.answer_dispatch");
      const dispatch = workflow.dispatch(job);

      if (dispatch.status === "offline") {
        return {
          ok: false as const,
          error: "The worker disconnected.",
          failureKind: "unavailable" as const,
        };
      }

      if (dispatch.status === "busy") {
        return {
          ok: false as const,
          error: "The worker became busy.",
          failureKind: "unavailable" as const,
        };
      }

      const answerResult = await dispatch.result;
      answerDone();
      return answerResult;
    };
    result = invocation?.silent
      ? await execute()
      : await withTyping(
          message.channel_id,
          discordRequest,
          execute,
          executionOptions.nonBlockingTyping,
        );
  } catch (error) {
    console.error(`Chatbot request ${message.id} failed:`, error);
    result = {
      ok: false,
      error: "聊天機器人請求失敗",
      failureKind: "internal",
    };
  } finally {
    mcpSnapshot = resources.release() ?? mcpSnapshot;
  }
  if (developerTaskStarted) {
    clock.mark("handler.completed");
    return true;
  }
  if (quietTracker?.isPaused(message.channel_id)) return true;
  let reacted = false;
  let reply: string | null = null;
  const files = result.ok ? (result.files ?? []) : [];
  if (result.ok) {
    const decision = await clock.span("host.answer_validation", () =>
      executeChatbotAnswerDecision({
        content: result.content,
        message,
        reactionBroker,
        reactionCapabilities,
        discordRequest,
      }),
    );
    reply = decision.reply;
    reacted ||= decision.reacted;
  } else if (!mcpSnapshot.calendarDraftId) {
    reply = chatbotFailureReply(result.failureKind);
  }

  if (
    savedMemoryAction &&
    (!result.ok || (!reply && !reacted && files.length === 0))
  ) {
    reply = {
      add: "我已記住這個伺服器的資訊了",
      replace: "我已更新這個伺服器的記憶了",
      remove: "我已移除這筆伺服器記憶了",
    }[savedMemoryAction];
  }

  if (mcpSnapshot.searchUnavailable && reply) {
    reply = `我剛剛翻不到伺服器的舊訊息 這次回答可能不太完整\n\n${reply}`;
  }
  if (
    !reply &&
    !reacted &&
    files.length === 0 &&
    !mcpSnapshot.calendarDraftId
  ) {
    reply = "我剛剛卡住了 晚點再叫我一次";
  }
  if (
    mcpSnapshot.calendarDraftId &&
    !invocation &&
    automaticFollowups.available()
  )
    conversationTracker?.activate(message.channel_id, requesterUserId);
  if (reply || files.length > 0) {
    const content = reply ? formatDiscordAnswers(reply) : null;
    await clock.span("host.reply_delivery", async () => {
      if (
        mcpSnapshot.calendarDraftId &&
        reply &&
        files.length === 0 &&
        (await updateCalendarDraftDiscussion(
          mcpSnapshot.calendarDraftId,
          content?.join("\n\n") ?? "",
          discordRequest,
        ))
      )
        return;
      await respond(content, files);
    });
    clock.mark("handler.completed");
    if (!invocation && automaticFollowups.available()) {
      conversationTracker?.activate(message.channel_id, requesterUserId);
    }
  }

  if (mcpSnapshot.calendarDraftId && files.length === 0)
    await invocation?.dismiss?.();
  return true;
}
