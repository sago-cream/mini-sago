import { expect, test } from "bun:test";
import { readGuildEmojiMedia } from "./emoji-media";
import { ChatbotMediaRegistry } from "./media-assets";
import { expressionRequestForMember } from "../discord/api/emojis";
import type { DiscordRequest } from "../discord/api/request";

test("emoji edit references resolve exact shared-guild assets and recheck membership on reads", async () => {
  let member = true;
  const downloads: string[] = [];
  const request = expressionRequestForMember(
    (async (path) => {
      if (path === "/users/@me/guilds")
        return [{ id: "guild", name: "Shared", permissions: "0" }];
      if (path.endsWith("/members/member"))
        return { user: { id: member ? "member" : "someone-else" } };
      return [
        {
          id: "123456789012345678",
          name: "wave",
          animated: true,
          available: true,
        },
      ];
    }) as DiscordRequest,
    "member",
  );
  const registry = new ChatbotMediaRegistry(async (url) => {
    downloads.push(String(url));
    return new Response("image bytes");
  });
  const media = await readGuildEmojiMedia({
    emoji: "<a:wave:123456789012345678>",
    guild: "Shared",
    registry,
    discordRequest: request,
  });
  expect(media).toMatchObject({
    filename: "wave.png",
    contentType: "image/png",
    animated: true,
  });
  expect(JSON.stringify(media)).not.toContain("discordapp.com");
  expect((await registry.read(media.mediaId)).bytes).toEqual(
    new TextEncoder().encode("image bytes"),
  );
  expect(downloads).toEqual([
    "https://cdn.discordapp.com/emojis/123456789012345678.png?size=256",
  ]);
  member = false;
  await expect(registry.read(media.mediaId)).rejects.toThrow("not in a guild");
  expect(downloads).toHaveLength(1);
  await expect(
    readGuildEmojiMedia({
      emoji: "wave",
      guild: "Private",
      registry,
      discordRequest: request,
    }),
  ).rejects.toThrow("not in a guild");
});
