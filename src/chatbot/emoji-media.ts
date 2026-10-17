import { listGuildEmojis, resolveEmoji } from "../discord/api/emojis";
import type { DiscordRequest } from "../discord/api/request";
import { ChatbotMediaRegistry } from "./media-assets";

export async function readGuildEmojiMedia({
  emoji,
  guild,
  registry,
  discordRequest,
}: {
  emoji: string;
  guild: string;
  registry: ChatbotMediaRegistry;
  discordRequest: DiscordRequest;
}) {
  const listed = await listGuildEmojis({ guild, discordRequest });
  const source = resolveEmoji(listed.emojis, emoji);
  if (source.available === false) throw new Error("This emoji is unavailable.");
  const media = registry.registerUrl({
    filename: `${source.name}.png`,
    contentType: "image/png",
    url: `https://cdn.discordapp.com/emojis/${source.id}.png?size=256`,
    authorize: async () => {
      const current = await listGuildEmojis({
        guild: listed.guild.id,
        discordRequest,
      });
      if (resolveEmoji(current.emojis, source.id).available === false)
        throw new Error("This emoji is unavailable.");
    },
  });
  return { ...media, animated: source.animated ?? false };
}
