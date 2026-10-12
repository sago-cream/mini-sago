import { afterEach, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFeatureAccess, withFeatureAccess } from "./feature-access";
import {
  defaultFeatureAvailability,
  FeatureAvailabilityStore,
} from "./feature-availability";
import {
  featureCapability,
  featureDefinition,
  featureForTool,
  INITIAL_DRIVE_GUILD_ID,
  REGISTERED_FEATURE_IDS,
} from "./features";
import { mailSchemas } from "../chatbot/mail/google-mail";
import { calendarSchemas } from "../chatbot/calendar/google-calendar";
import { driveSchemas } from "../chatbot/drive/google-drive";
import { ccxpSchemas } from "../chatbot/ccxp/ccxp-meetings";
import { ccxpSyncSchemas } from "../chatbot/ccxp/ccxp-sync";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "minisago-feature-access-"));
  roots.push(root);
  const file = join(root, "features.json");
  return { file, store: new FeatureAvailabilityStore(file, {}) };
}
const guildId = "1394943277836402779",
  role = "1394944058534920213",
  blocked = "1394944058534920214";

test("legacy state preserves every saved policy and adds only the existing Drive coverage", async () => {
  const { file } = await fixture();
  const old = defaultFeatureAvailability({});
  old.features.mail.rules = [
    { scope: "guild", targetId: guildId, enabled: true, allowRoleIds: [role] },
  ];
  old.features.calendar.rules = [];
  const { drive, ...features } = old.features;
  await writeFile(file, JSON.stringify({ version: 1, features }));
  const store = new FeatureAvailabilityStore(file, {});
  const { drive: migrated, ...saved } = store.list().features;
  expect(saved).toEqual(features);
  expect(migrated).toEqual(drive);
  expect(store.isEnabled("drive", { guildId: INITIAL_DRIVE_GUILD_ID })).toBe(
    true,
  );
  expect(store.isEnabled("drive", { guildId })).toBe(false);
  await store.configure({
    feature: "drive",
    scope: "guild",
    targetId: INITIAL_DRIVE_GUILD_ID,
    action: "disable",
  });
  expect(
    new FeatureAvailabilityStore(file, {}).isEnabled("drive", {
      guildId: INITIAL_DRIVE_GUILD_ID,
    }),
  ).toBe(false);
  await expect(
    store.configure({
      feature: "drive",
      scope: "channel",
      targetId: guildId,
      action: "enable",
    }),
  ).rejects.toThrow("guild scope");
});

test("registry tool mappings cover integration schemas and reject undeclared tools", () => {
  for (const [feature, schemas] of [
    ["mail", mailSchemas],
    ["calendar", calendarSchemas],
    ["drive", driveSchemas],
    ["ccxp_meetings", ccxpSchemas],
    ["ccxp_sync", ccxpSyncSchemas],
  ] as const) {
    expect(featureCapability(feature).tools?.slice().sort()).toEqual(
      Object.keys(schemas).sort(),
    );
    for (const tool of Object.keys(schemas))
      expect(featureForTool(tool)).toBe(feature);
  }
  expect(() => featureForTool("read_unregistered_data")).toThrow(
    "must declare a feature access mode",
  );
  for (const feature of REGISTERED_FEATURE_IDS) {
    expect(
      featureDefinition(feature).registration?.scopes.length,
    ).toBeGreaterThan(0);
  }
});

test("owner-only and owner-DM exceptions never bypass a registered guild or mail voice restriction", async () => {
  const { store } = await fixture();
  for (const feature of [
    "feature_availability",
    "managed_services",
    "channel_messaging",
    "repository_work",
    "self_development",
    "mac_file_delivery",
  ] as const) {
    expect(
      createFeatureAccess(
        feature,
        { requesterId: "member", ownerId: "owner" },
        store,
      ).available(),
    ).toBe(false);
    expect(
      await createFeatureAccess(
        feature,
        { requesterId: "owner", ownerId: "owner" },
        store,
      ).allowed(),
    ).toBe(true);
    expect(
      createFeatureAccess(
        feature,
        { requesterId: "", ownerId: "" },
        store,
      ).available(),
    ).toBe(false);
  }
  const owner = { requesterId: "owner", ownerId: "owner" };
  expect(createFeatureAccess("mail", owner, store).available()).toBe(true);
  expect(
    createFeatureAccess("mail", { ...owner, guildId }, store).available(),
  ).toBe(false);
  expect(
    createFeatureAccess(
      "mail",
      { ...owner, streamReply: true },
      store,
    ).available(),
  ).toBe(false);
  expect(createFeatureAccess("calendar", owner, store).available()).toBe(false);
  expect(
    createFeatureAccess("ccxp_sync", { ...owner, guildId }, store).available(),
  ).toBe(true);
  expect(
    createFeatureAccess(
      "ccxp_sync",
      { ...owner, requesterId: "member", guildId },
      store,
    ).available(),
  ).toBe(false);
});

test("expression tools are available to members through the request access mode", async () => {
  const { store } = await fixture();
  const access = createFeatureAccess(
    "custom_expressions",
    { requesterId: "member", ownerId: "owner", guildId },
    store,
  );
  expect(access.available()).toBe(true);
  expect(await access.allowed()).toBe(true);
  expect(featureForTool("rename_guild_emoji")).toBe("custom_expressions");
});

test("guard refreshes membership, applies channel precedence, and fails closed on lookup failure", async () => {
  const { store } = await fixture();
  await store.configure({
    feature: "mail",
    scope: "guild",
    targetId: guildId,
    action: "enable",
    allowRoleIds: [role],
    denyRoleIds: [blocked],
  });
  let roles: readonly string[] = [role];
  const context = {
    guildId,
    roleIds: [role],
    resolveRoleIds: async () => roles,
  };
  const access = createFeatureAccess("mail", context, store);
  expect(await access.allowed()).toBe(true);
  roles = [role, blocked];
  expect(await access.allowed()).toBe(false);
  roles = [role];
  const channelId = "1517766866964316201";
  await store.configure({
    feature: "mail",
    scope: "channel",
    targetId: channelId,
    action: "disable",
  });
  expect(
    await createFeatureAccess(
      "mail",
      { ...context, channelId },
      store,
    ).allowed(),
  ).toBe(false);
  const failed = createFeatureAccess(
    "mail",
    {
      ...context,
      resolveRoleIds: async () => {
        throw Error("membership unavailable");
      },
    },
    store,
  );
  expect(await failed.allowed()).toBe(false);
  // A previously missing allowed role can be acquired during the existing session.
  expect(
    await createFeatureAccess(
      "mail",
      { ...context, roleIds: [] },
      store,
    ).allowed(),
  ).toBe(true);
});

test("revocation suppresses in-flight reads and prevents subsequent operations", async () => {
  const { store } = await fixture();
  await store.configure({
    feature: "mail",
    scope: "guild",
    targetId: guildId,
    action: "enable",
  });
  const access = createFeatureAccess("mail", { guildId }, store);
  let calls = 0;
  const result = await withFeatureAccess(access, async () => {
    calls++;
    await store.configure({
      feature: "mail",
      scope: "guild",
      targetId: guildId,
      action: "disable",
    });
    return { status: "complete", text: "private content" };
  });
  expect(result).toEqual({ status: "forbidden" });
  expect(
    await withFeatureAccess(access, async () => {
      calls++;
      return { status: "complete" };
    }),
  ).toEqual({ status: "forbidden" });
  expect(calls).toBe(1);
});
