import { expect, test } from "bun:test";
import type { DiscordRequest } from "../discord/api/request";
import { resolveDriveRequester } from "./drive-discord-access";

const guildId = "1514899496797212683";
const requesterId = "111111111111111111";
const role = "1514899497199861863";

test("resolves fresh membership for the host-bound guild and requester", async () => {
  let roles = [role];
  const request = (async (path: string) => {
    expect(path).toBe(`/guilds/${guildId}/members/${requesterId}`);
    return { user: { id: requesterId }, roles };
  }) as DiscordRequest;
  expect(
    await resolveDriveRequester({ guildId, requesterId }, request),
  ).toEqual({ roleIds: [role] });
  roles = [];
  expect(
    await resolveDriveRequester({ guildId, requesterId }, request),
  ).toEqual({ roleIds: [] });
});

test("missing membership, invalid roles and a mismatched identity fail closed", async () => {
  for (const value of [
    undefined,
    { user: { id: requesterId } },
    { user: { id: requesterId }, roles: ["forged"] },
    { user: { id: "222222222222222222" }, roles: [role] },
  ]) {
    await expect(
      resolveDriveRequester(
        { guildId, requesterId },
        (async () => value) as DiscordRequest,
      ),
    ).rejects.toThrow();
  }
  await expect(
    resolveDriveRequester({ guildId, requesterId }, (async () => {
      throw new Error("Member left");
    }) as DiscordRequest),
  ).rejects.toThrow("Member left");
});
