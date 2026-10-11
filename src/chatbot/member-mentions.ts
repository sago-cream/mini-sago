import { lookupGuildMembers, type DiscordRequest } from "./chatbot-context";
import { CHATBOT_CONTEXT_LIMITS } from "./context-limits";

export type MemberMentionInput = { queries: string[]; content?: string };
export type MemberMentionResult =
  | { status: "needs_clarification"; unresolvedQueries: string[] }
  | {
      status: "complete" | "partial";
      messageIds: string[];
      memberIds: string[];
      unresolvedQueries: string[];
      unconfirmedMemberIds?: string[];
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
      uniqueQueries.some(
        (query) =>
          !query ||
          query.length > CHATBOT_CONTEXT_LIMITS.maximumMemberQueryCharacters,
      ) ||
      (content?.length ?? 0) > 1_400
    ) {
      throw new Error(
        "Provide member queries and at most 1400 content characters.",
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
    delivery = (async (): Promise<MemberMentionResult> => {
      const messageIds: string[] = [];
      const confirmedIds: string[] = [];
      let offset = 0;
      while (offset < memberIds.length) {
        const batch: string[] = [];
        let text = messageIds.length === 0 ? (content?.trim() ?? "") : "";
        while (offset + batch.length < memberIds.length && batch.length < 100) {
          const id = memberIds[offset + batch.length]!;
          const nextText = `${text}${text ? "\n" : ""}<@${id}>`;
          if (nextText.length > 2_000) break;
          batch.push(id);
          text = nextText;
        }
        try {
          const message = await discordRequest<{ id: string }>(
            `/channels/${channelId}/messages`,
            {
              method: "POST",
              body: {
                content: text,
                message_reference: {
                  message_id: requestMessageId,
                  fail_if_not_exists: false,
                },
                allowed_mentions: {
                  parse: [],
                  users: batch,
                  replied_user: false,
                },
              },
            },
          );
          messageIds.push(message.id);
          confirmedIds.push(...batch);
          offset += batch.length;
        } catch {
          return {
            status: "partial",
            messageIds,
            memberIds: confirmedIds,
            unresolvedQueries,
            unconfirmedMemberIds: memberIds.slice(offset),
          };
        }
      }
      return {
        status: "complete",
        messageIds,
        memberIds: confirmedIds,
        unresolvedQueries,
      };
    })();
    return delivery;
  };
}
