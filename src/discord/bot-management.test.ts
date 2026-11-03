import {
  ASK_COMMAND,
  createDiscordCommandManagement,
} from "./application-commands";
import type { DiscordRequest } from "./api/request";

import { afterEach, expect, test } from "bun:test";
import {
  BotManagement,
  registerBotManagement,
  updateCustomStatus,
} from "./bot-management";
import type { BotStatus } from "./bot-status";

const managers: BotManagement[] = [];
afterEach(() => {
  for (const manager of managers.splice(0)) manager.dispose();
  registerBotManagement(null);
});
function fixture() {
  const sent: unknown[] = [],
    saved: BotStatus[] = [];
  let connected = true,
    time = 0;
  const store = {
    load: () => ({ text: "mini.sagocream.com", presence: "online" as const }),
    save: async (status: BotStatus) => {
      saved.push({ ...status });
    },
  };
  const socket = {
    send: (data: string) => {
      sent.push(JSON.parse(data));
    },
  };
  const manager = new BotManagement(
    () => (connected ? socket : null),
    store,
    () => time,
  );
  managers.push(manager);
  return {
    manager,
    socket,
    store,
    sent,
    saved,
    disconnect: () => {
      connected = false;
    },
    connect: () => {
      connected = true;
    },
    advance: (ms: number) => {
      time += ms;
    },
  };
}

test("status is persisted before opcode 3 is sent and reused after reconnect", async () => {
  const { manager, store, sent, saved } = fixture();
  let release: (() => void) | undefined;
  const save = store.save;
  store.save = async (status) => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
    await save(status);
  };
  const update = manager.updateCustomStatus({
    text: "  Working  ",
    presence: "idle",
  });
  while (!release) await Promise.resolve();
  expect(sent).toEqual([]);
  release();
  expect(await update).toEqual({
    status: "updated",
    text: "Working",
    presence: "idle",
  });
  expect(saved).toEqual([{ text: "Working", presence: "idle" }]);
  expect(sent).toEqual([
    {
      op: 3,
      d: {
        since: null,
        activities: [{ name: "Custom Status", type: 4, state: "Working" }],
        status: "idle",
        afk: false,
      },
    },
  ]);
  manager.reapplyPresence();
  expect(sent[1]).toEqual(sent[0]);
});

test("clearing custom status preserves online presence when omitted", async () => {
  const { manager, sent, saved } = fixture();
  await manager.updateCustomStatus({ text: "busy", presence: "dnd" });
  expect(await manager.updateCustomStatus({ text: "  " })).toEqual({
    status: "updated",
    text: "",
    presence: "dnd",
  });
  expect(sent[1]).toMatchObject({
    op: 3,
    d: { activities: [], status: "dnd" },
  });
  expect(saved[1]).toEqual({ text: "", presence: "dnd" });
});

test("unavailable Gateway reports saved pending delivery and applies it when ready", async () => {
  const { manager, sent, saved, disconnect, connect } = fixture();
  disconnect();
  expect(await manager.updateCustomStatus({ text: "new" })).toEqual({
    status: "saved",
    text: "new",
    presence: "online",
  });
  expect(saved).toHaveLength(1);
  expect(sent).toEqual([]);
  connect();
  manager.reapplyPresence();
  expect(sent[0]).toMatchObject({
    op: 3,
    d: { activities: [{ state: "new" }] },
  });
  expect(await updateCustomStatus({ text: "new" })).toEqual({
    status: "gateway_unavailable",
  });
});

test("write failure keeps prior state, sends nothing, and does not poison later requests", async () => {
  const { manager, store, sent, saved } = fixture();
  const save = store.save;
  store.save = async () => {
    throw new Error("disk unavailable");
  };
  await expect(
    manager.updateCustomStatus({ text: "failed", presence: "invisible" }),
  ).rejects.toThrow("disk unavailable");
  expect(manager.getPresence().activities[0]?.state).toBe("mini.sagocream.com");
  expect(manager.getPresence().status).toBe("online");
  expect(sent).toEqual([]);
  expect(saved).toEqual([]);
  store.save = save;
  expect((await manager.updateCustomStatus({ text: "recovered" })).status).toBe(
    "updated",
  );
});

test("failed sends preserve durable intent and return saved instead of updated", async () => {
  const { manager, socket, saved } = fixture();
  socket.send = () => {
    throw new Error("closed");
  };
  expect(
    await manager.updateCustomStatus({ text: "pending", presence: "idle" }),
  ).toEqual({ status: "saved", text: "pending", presence: "idle" });
  expect(saved).toEqual([{ text: "pending", presence: "idle" }]);
  expect(manager.getPresence().status).toBe("idle");
});

test("concurrent requests are serialized and omitted presence uses the latest saved value", async () => {
  const { manager, saved } = fixture();
  const results = await Promise.all([
    manager.updateCustomStatus({ text: "first", presence: "dnd" }),
    manager.updateCustomStatus({ text: "second" }),
  ]);
  expect(results.map((result) => result.status)).toEqual([
    "updated",
    "updated",
  ]);
  expect(saved).toEqual([
    { text: "first", presence: "dnd" },
    { text: "second", presence: "dnd" },
  ]);
});

test("presence sends share a rolling budget including reconnect replay", async () => {
  const { manager, sent, saved, advance } = fixture();
  manager.reapplyPresence();
  for (let i = 0; i < 4; i++)
    await manager.updateCustomStatus({ text: String(i) });
  expect(await manager.updateCustomStatus({ text: "blocked" })).toEqual({
    status: "rate_limited",
    retryAfterMs: 20_000,
  });
  manager.reapplyPresence();
  expect(sent).toHaveLength(5);
  expect(saved).toHaveLength(4);
  advance(20_000);
  expect((await manager.updateCustomStatus({ text: "allowed" })).status).toBe(
    "updated",
  );
  expect(sent).toHaveLength(6);
});

test("shutdown suppresses late delivery after a pending write", async () => {
  const { manager, store, sent } = fixture();
  let release: (() => void) | undefined;
  store.save = async () => {
    await new Promise<void>((resolve) => {
      release = resolve;
    });
  };
  const update = manager.updateCustomStatus({ text: "saved for restart" });
  while (!release) await Promise.resolve();
  manager.dispose();
  release();
  expect((await update).status).toBe("saved");
  expect(sent).toEqual([]);
  expect((await manager.updateCustomStatus({ text: "too late" })).status).toBe(
    "gateway_unavailable",
  );
});

test("status validation fails before any disk or Gateway changes", async () => {
  const { manager, saved, sent } = fixture();
  await expect(
    manager.updateCustomStatus({ text: "x".repeat(129) }),
  ).rejects.toThrow("128");
  await expect(
    manager.updateCustomStatus({ text: "ok", presence: "invalid" as never }),
  ).rejects.toThrow("Invalid presence");
  expect(saved).toEqual([]);
  expect(sent).toEqual([]);
});

const applicationId = "123456789012345678";
const guildId = "223456789012345678";
const commandId = "323456789012345678";
const path = `/applications/${applicationId}/guilds/${guildId}/commands`;

function commandFixture({
  existing = true,
  failPermissions = false,
  failGlobal = false,
  failVerification = false,
  wrongApplication = false,
  inaccessibleGuild = false,
} = {}) {
  const calls: Array<{ path: string; options: Parameters<DiscordRequest>[1] }> =
    [];
  let written = false;
  const command = {
    ...ASK_COMMAND,
    id: commandId,
    default_member_permissions: "0",
  };
  const request: DiscordRequest = async <T>(
    route: string,
    options?: Parameters<DiscordRequest>[1],
  ) => {
    calls.push({ path: route, options });
    if (route === "/applications/@me")
      return {
        id: wrongApplication ? "423456789012345678" : applicationId,
        install_params: { scopes: ["bot"], permissions: "1024" },
        interactions_endpoint_url: null,
        verify_key: "must-not-leak",
      } as T;
    if (route === `/guilds/${guildId}`) {
      if (inaccessibleGuild) throw new Error("403 private response");
      return {
        id: guildId,
        name: "Test guild",
        private_field: "must-not-leak",
      } as T;
    }
    if (route === `/applications/${applicationId}/commands`) {
      if (failGlobal) throw new Error("503 private response");
      return [
        { ...command, id: "global", contexts: [0], integration_types: [0] },
      ] as T;
    }
    if (route === `${path}/permissions`) {
      if (failPermissions) throw new Error("403 secret response body");
      return [
        {
          id: applicationId,
          permissions: [{ id: guildId, type: 1, permission: false }],
        },
      ] as T;
    }
    if (options?.method) {
      written = true;
      return command as T;
    }
    if (route === path) {
      if (written && failVerification)
        throw new Error("503 secret response body");
      return [
        ...(existing || written ? [command] : []),
        { id: "other", name: "other", type: 1 },
      ] as T;
    }
    throw new Error(`Unexpected route ${route}`);
  };
  return {
    calls,
    management: createDiscordCommandManagement({
      discordRequest: request,
      applicationId,
      currentGuildId: guildId,
    }),
    request,
  };
}

test("inspects both registration scopes and app-wide permission overrides without writes or secrets", async () => {
  const { management, calls } = commandFixture();
  const result = await management.inspect({});
  expect(result).toMatchObject({
    status: "complete",
    guild: { id: guildId, name: "Test guild" },
    globalCommands: {
      status: "complete",
      value: [expect.objectContaining({ contexts: [0] })],
    },
    guildCommands: {
      status: "complete",
      value: expect.arrayContaining([
        expect.objectContaining({
          id: commandId,
          defaultMemberPermissions: "0",
        }),
      ]),
    },
    permissions: {
      status: "complete",
      value: [
        {
          id: applicationId,
          permissions: [{ id: guildId, type: 1, permission: false }],
        },
      ],
    },
    interactionDelivery: "gateway",
  });
  expect(calls.every((call) => !call.options?.method)).toBe(true);
  expect(JSON.stringify(result)).not.toContain("must-not-leak");
});

test("unavailable checks remain unknown while successful registration reads are retained", async () => {
  const { management } = commandFixture({
    failPermissions: true,
    failGlobal: true,
  });
  const result = await management.inspect({});
  expect(result).toMatchObject({
    status: "partial",
    globalCommands: { status: "unavailable", httpStatus: 503 },
    guildCommands: { status: "complete" },
    permissions: { status: "unavailable", httpStatus: 403 },
  });
  expect(result.permissions).not.toHaveProperty("value");
  expect(JSON.stringify(result)).not.toContain("secret response");
});

test.each([true, false])(
  "sync patches existing=%s and preserves every other command and scope",
  async (existing) => {
    const { management, calls } = commandFixture({ existing });
    const result = await management.sync({ guildId });
    expect(result).toMatchObject({
      status: "synced",
      verification: {
        status: "complete",
        value: { id: commandId, defaultMemberPermissions: "0" },
      },
    });
    const writes = calls.filter((call) => call.options?.method);
    expect(writes).toEqual([
      {
        path: existing ? `${path}/${commandId}` : path,
        options: {
          method: existing ? "PATCH" : "POST",
          body: existing
            ? {
                name: ASK_COMMAND.name,
                description: ASK_COMMAND.description,
                options: ASK_COMMAND.options,
              }
            : ASK_COMMAND,
        },
      },
    ]);
    expect(writes[0]!.options!.body).not.toHaveProperty(
      "default_member_permissions",
    );
    expect(calls.at(-1)?.path).toBe(path);
  },
);

test("accepted writes with failed read-back are reported without claiming verified registration", async () => {
  const { management } = commandFixture({ failVerification: true });
  expect(await management.sync({})).toMatchObject({
    status: "updated_unverified",
    command: { id: commandId },
    verification: { status: "unavailable", httpStatus: 503 },
  });
});

test.each([{ wrongApplication: true }, { inaccessibleGuild: true }])(
  "identity and target access checks fail closed: %j",
  async (options) => {
    const { management, calls } = commandFixture(options);
    await expect(management.sync({})).rejects.toThrow();
    expect(calls.some((call) => call.options?.method)).toBe(false);
    expect(calls.some((call) => call.path === path)).toBe(false);
  },
);

test("DMs require an explicit guild, IDs are validated before requests, and there is no configured-guild fallback", async () => {
  const { request, calls } = commandFixture();
  const management = createDiscordCommandManagement({
    discordRequest: request,
    applicationId,
  });
  await expect(management.inspect({})).rejects.toThrow(
    "exact Discord guild ID",
  );
  await expect(management.sync({ guildId: "../commands" })).rejects.toThrow();
  expect(calls).toHaveLength(0);
  expect(await management.inspect({ guildId })).toMatchObject({
    status: "complete",
  });
});

test("missing application configuration fails before Discord access", async () => {
  const { request, calls } = commandFixture();
  const management = createDiscordCommandManagement({
    discordRequest: request,
    currentGuildId: guildId,
  });
  await expect(management.sync({})).rejects.toThrow("DISCORD_APPLICATION_ID");
  expect(calls).toHaveLength(0);
});
