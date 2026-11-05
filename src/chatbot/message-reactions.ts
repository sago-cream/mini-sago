import type { DiscordRequest } from "../discord/api/request";
import type { DiscordMessage } from "./chatbot-context";

export type MessageReactionInput = {
  messageId?: string;
  emoji?: string;
  reactionType?: "normal" | "burst";
  after?: string;
};
type ReactionUser = {
  id: string;
  username: string;
  global_name?: string | null;
  bot?: boolean;
};
type ReactionMember = { nick?: string | null };

export function createMessageReactionReader({
  guildId,
  channelId,
  defaultMessageId,
  discordRequest,
}: {
  guildId: string;
  channelId: string;
  defaultMessageId: string;
  discordRequest: DiscordRequest;
}) {
  const members = new Map<string, Promise<ReactionMember | undefined>>();
  const memberFor = (id: string) => {
    let pending = members.get(id);
    if (!pending) {
      pending = discordRequest<ReactionMember>(
        `/guilds/${guildId}/members/${id}`,
      ).catch(() => undefined);
      members.set(id, pending);
    }
    return pending;
  };

  return async ({
    messageId = defaultMessageId,
    emoji,
    reactionType = "normal",
    after,
  }: MessageReactionInput) => {
    if (
      !/^\d{17,20}$/u.test(messageId) ||
      (after && !/^\d{17,20}$/u.test(after))
    ) {
      throw new Error("Use a Discord message ID and user cursor.");
    }
    if (after && !emoji) throw new Error("A user cursor requires an emoji.");
    const message = await discordRequest<DiscordMessage>(
      `/channels/${channelId}/messages/${messageId}`,
    );
    const reactions = (message.reactions ?? []).flatMap((reaction) => {
      if (!reaction.emoji.name) return [];
      const value = reaction.emoji.id
        ? `${reaction.emoji.name}:${reaction.emoji.id}`
        : reaction.emoji.name;
      return [
        {
          emoji: value,
          count: reaction.count,
          normalCount: reaction.count_details?.normal ?? reaction.count,
          burstCount: reaction.count_details?.burst ?? 0,
        },
      ];
    });
    const summary = {
      status: "complete" as const,
      channelId,
      messageId,
      jumpUrl: `https://discord.com/channels/${guildId}/${channelId}/${messageId}`,
      reactions,
    };
    if (!emoji) return summary;

    const custom = emoji.match(/^<a?:([^:]+):(\d+)>$/u);
    const value = custom ? `${custom[1]}:${custom[2]}` : emoji;
    const selected = reactions.find((reaction) => reaction.emoji === value);
    if (!selected)
      throw new Error("Choose an emoji from this message's reaction summary.");
    const query = new URLSearchParams({
      type: reactionType === "burst" ? "1" : "0",
      limit: "100",
      ...(after ? { after } : {}),
    });
    const users = await discordRequest<ReactionUser[]>(
      `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(value)}?${query}`,
    );
    const participants = [];
    // Bound concurrent member reads while sharing identities across emoji pages.
    for (let offset = 0; offset < users.length; offset += 5) {
      participants.push(
        ...(await Promise.all(
          users.slice(offset, offset + 5).map(async (user) => {
            const member = await memberFor(user.id);
            return {
              id: user.id,
              mention: `<@${user.id}>`,
              names: [
                ...new Set(
                  [member?.nick, user.global_name, user.username].filter(
                    (name): name is string => Boolean(name),
                  ),
                ),
              ],
              memberResolved: member !== undefined,
              ...(user.bot ? { bot: true } : {}),
            };
          }),
        )),
      );
    }
    return {
      ...summary,
      emoji: value,
      reactionType,
      participants,
      nextAfter: users.length === 100 ? users.at(-1)!.id : null,
    };
  };
}
export type MessageReactionResult = Awaited<
  ReturnType<ReturnType<typeof createMessageReactionReader>>
>;
