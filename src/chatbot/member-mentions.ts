import { lookupGuildMembers, type DiscordRequest } from "./chatbot-context";
import { CHATBOT_CONTEXT_LIMITS } from "./context-limits";

export type MemberMentionInput = { queries: string[]; content?: string };
export type MemberMentionResult =
  | { status: "needs_clarification"; unresolvedQueries: string[] }
  | {
      status: "complete";
      messageId: string;
      memberIds: string[];
      unresolvedQueries: string[];
    };

export function createMemberMentionHandler({
  guildId,
  channelId,
  requestMessageId,
  discordRequest,
}: {
  guildId: string;
  channelId: string;
  requestMessageId: string;
  discordRequest: DiscordRequest;
}) {
  // A repeated call must not notify the same people again, including after a
  // network failure where Discord may already have accepted the message.
  let delivery: Promise<MemberMentionResult> | undefined;

  return async ({
    queries,
    content,
  }: MemberMentionInput): Promise<MemberMentionResult> => {
    if (delivery) return delivery;
    const uniqueQueries = [...new Set(queries.map((query) => query.trim()))];
    if (
      !uniqueQueries.length ||
      uniqueQueries.length > CHATBOT_CONTEXT_LIMITS.maximumMemberLookups ||
      uniqueQueries.some(
        (query) =>
          !query ||
          query.length > CHATBOT_CONTEXT_LIMITS.maximumMemberQueryCharacters,
      ) ||
      (content?.length ?? 0) > 1_400
    ) {
      throw new Error(
        "Provide 1–20 member queries and at most 1400 content characters.",
      );
    }

    const members = await lookupGuildMembers({
      guildId,
      queries: uniqueQueries,
      discordRequest,
    });
    const resolvedQueries = new Set(members.map((member) => member.query));
    const unresolvedQueries = uniqueQueries.filter(
      (query) => !resolvedQueries.has(query),
    );
    if (!members.length) {
      return { status: "needs_clarification", unresolvedQueries };
    }
    if (delivery) return delivery;
    const memberIds = [...new Set(members.map((member) => member.id))];
    const mentions = memberIds.map((id) => `<@${id}>`).join(" ");
    delivery = discordRequest<{ id: string }>(
      `/channels/${channelId}/messages`,
      {
        method: "POST",
        body: {
          content: [content?.trim(), mentions].filter(Boolean).join("\n"),
          message_reference: {
            message_id: requestMessageId,
            fail_if_not_exists: false,
          },
          allowed_mentions: {
            parse: [],
            users: memberIds,
            replied_user: false,
          },
        },
      },
    ).then((message) => ({
      status: "complete",
      messageId: message.id,
      memberIds,
      unresolvedQueries,
    }));
    return delivery;
  };
}
