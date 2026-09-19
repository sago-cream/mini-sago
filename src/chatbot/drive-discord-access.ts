import { z } from "zod";
import type { DiscordRequest } from "../discord/api/request";
import type { DriveRequester } from "./google-drive-permissions";

const snowflake = z.string().regex(/^\d{17,20}$/u);
const memberSchema = z.object({
  user: z.object({ id: snowflake }),
  roles: z.array(snowflake),
});

export async function resolveDriveRequester(
  input: { guildId: string; requesterId: string },
  request: DiscordRequest,
): Promise<DriveRequester> {
  const member = memberSchema.parse(
    await request(`/guilds/${input.guildId}/members/${input.requesterId}`),
  );
  if (member.user.id !== input.requesterId) {
    throw new Error("Discord member identity mismatch.");
  }
  return { roleIds: member.roles };
}
