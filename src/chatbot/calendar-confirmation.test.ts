import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  handleCalendarConfirmation,
  expireCalendarDrafts,
  updateCalendarDraftDiscussion,
  withCalendarConfirmation,
} from "./calendar-confirmation";
import {
  CALENDAR_GUILD_ID,
  createGoogleCalendarClient,
  type GoogleCalendarClient,
} from "./google-calendar";
import type { DiscordRequest } from "../discord/api/request";

import { calendarSettings } from "./calendar-settings";
const config = calendarSettings({
  DISCORD_CALENDAR_ID: "events_test@group.calendar.google.com",
})!;
const original = process.env.MINISAGO_CALENDAR_DRAFTS_FILE;
const dirs: string[] = [];
afterEach(() => {
  if (original === undefined) delete process.env.MINISAGO_CALENDAR_DRAFTS_FILE;
  else process.env.MINISAGO_CALENDAR_DRAFTS_FILE = original;
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
function fixture() {
  const dir = mkdtempSync(join(tmpdir(), "calendar-confirmation-"));
  dirs.push(dir);
  const path = join(dir, "drafts.json");
  process.env.MINISAGO_CALENDAR_DRAFTS_FILE = path;
  const mutations: unknown[] = [];
  const messages: { path: string; body: any }[] = [];
  const client: GoogleCalendarClient = {
    config,
    call: async (name, input) => {
      if (name === "get_calendar_event")
        return {
          status: "complete",
          event: {
            id: "event1",
            etag: "version1",
            summary: "Before",
            start: { date: "2026-09-21" },
            end: { date: "2026-09-22" },
            attendees: [{ email: "existing@example.com" }],
          },
        };
      mutations.push({ name, input });
      return {
        status: "complete",
        event: {
          id: "event1",
          htmlLink: "https://calendar.google.com/event?eid=test",
        },
      };
    },
  };
  const discord = (async (path, options) => {
    messages.push({ path, body: options?.body });
    return { id: "preview1" };
  }) as DiscordRequest;
  const context = {
    guildId: CALENDAR_GUILD_ID,
    channelId: "channel1",
    requesterId: "requester1",
    messageId: "origin1",
  };
  const wrapped = withCalendarConfirmation(client, context, discord);
  const button = (
    action = "confirm",
    user = "requester1",
    guild = CALENDAR_GUILD_ID,
  ) => ({
    type: 3,
    id: "click1",
    application_id: "app1",
    token: "interaction-token",
    guild_id: guild,
    channel_id: "channel1",
    member: { user: { id: user } },
    data: {
      custom_id: `calendar:${action}:${JSON.parse(readFileSync(path, "utf8"))[0].id}`,
    },
  });
  return {
    client,
    discord,
    context,
    wrapped,
    button,
    mutations,
    messages,
    path,
  };
}
const booking = {
  title: "Meeting",
  operationKey: "meeting",
  attendees: ["guest@example.com"],
  schedule: {
    kind: "timed",
    start: "2026-09-21T15:00:00+08:00",
    end: "2026-09-21T16:00:00+08:00",
  },
};

test("only the requester can confirm the immutable preview; repeated clicks do not repeat mutations", async () => {
  const f = fixture();
  expect((await f.wrapped.call("create_calendar_event", booking)).status).toBe(
    "awaiting_confirmation",
  );
  expect(f.mutations).toHaveLength(0);
  expect(JSON.stringify(f.messages[0].body)).toContain("guest@example.com");
  expect(JSON.stringify(f.messages[0].body)).toContain("2026-09-21 15:00");
  await f.wrapped.call("create_calendar_event", booking);
  expect(f.messages).toHaveLength(1);
  await handleCalendarConfirmation(
    f.button("confirm", "someone-else"),
    f.discord,
    {},
    () => f.client,
  );
  await handleCalendarConfirmation(
    f.button("confirm", "requester1", "another-guild"),
    f.discord,
    {},
    () => f.client,
  );
  expect(f.mutations).toHaveLength(0);
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => f.client);
  expect(f.mutations).toEqual([
    { name: "create_calendar_event", input: booking },
  ]);
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => f.client);
  expect(f.mutations).toHaveLength(1);
  expect(JSON.stringify(f.messages.at(-2)?.body.components)).not.toContain(
    "calendar:confirm:",
  );
});

test("cancelled and expired drafts cannot create events", async () => {
  const f = fixture();
  await f.wrapped.call("create_calendar_event", booking);
  await handleCalendarConfirmation(
    f.button("cancel"),
    f.discord,
    {},
    () => f.client,
  );
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => f.client);
  expect(f.mutations).toHaveLength(0);
  const drafts = JSON.parse(readFileSync(f.path, "utf8"));
  drafts[0].expires = Date.now() - 1;
  delete drafts[0].result;
  writeFileSync(f.path, JSON.stringify(drafts));
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => f.client);
  expect(f.mutations).toHaveLength(0);
});

test("edit preview preserves omitted fields and attendees and rejects a stale preview etag", async () => {
  const f = fixture();
  const input = { eventId: "event1", etag: "version1", title: "After" };
  await f.wrapped.call("edit_calendar_event", input);
  expect(JSON.stringify(f.messages[0].body)).toContain("existing@example.com");
  expect(JSON.stringify(f.messages[0].body)).toContain("2026-09-21");
  expect(f.mutations).toHaveLength(0);
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => f.client);
  expect(f.mutations).toEqual([{ name: "edit_calendar_event", input }]);
  expect(
    (await f.wrapped.call("edit_calendar_event", { ...input, etag: "stale" }))
      .status,
  ).toBe("unavailable");
});

test("a failed Google request can be retried with the original operation key", async () => {
  const f = fixture();
  await f.wrapped.call("create_calendar_event", booking);
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => ({
    config,
    call: async () => ({ status: "unavailable" }),
  }));
  expect(JSON.parse(readFileSync(f.path, "utf8"))[0].result).toBeUndefined();
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => f.client);
  expect(f.mutations).toEqual([
    { name: "create_calendar_event", input: booking },
  ]);
});

test("concurrent confirmation clicks issue only one calendar write", async () => {
  const f = fixture();
  await f.wrapped.call("create_calendar_event", booking);
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  let writes = 0;
  const slowClient: GoogleCalendarClient = {
    config,
    call: async () => {
      writes++;
      await pending;
      return { status: "complete" };
    },
  };
  const first = handleCalendarConfirmation(
    f.button(),
    f.discord,
    {},
    () => slowClient,
  );
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => slowClient);
  finish();
  await first;
  expect(writes).toBe(1);
});

test("foreign contexts and oversized previews cannot publish actionable drafts", async () => {
  const f = fixture();
  const foreign = withCalendarConfirmation(
    f.client,
    { ...f.context, guildId: "other" },
    f.discord,
  );
  expect((await foreign.call("create_calendar_event", booking)).status).toBe(
    "unavailable",
  );
  expect(
    (
      await f.wrapped.call("create_calendar_event", {
        ...booking,
        description: "x".repeat(1800),
      })
    ).status,
  ).toBe("unavailable");
  expect(f.messages).toHaveLength(0);
  expect(f.mutations).toHaveLength(0);
});

test("deletion previews the exact event and notifies only after requester confirmation", async () => {
  const f = fixture();
  const input = { eventId: "event1", etag: "version1" };
  expect((await f.wrapped.call("delete_calendar_event", input)).status).toBe(
    "awaiting_confirmation",
  );
  expect(f.mutations).toHaveLength(0);
  expect(JSON.stringify(f.messages[0].body)).toContain("確認刪除");
  expect(JSON.stringify(f.messages[0].body)).toContain("discord-calendar");
  expect(JSON.stringify(f.messages[0].body)).toContain("existing@example.com");
  expect(f.messages[0].body.components[0].components[0].style).toBe(4);
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => f.client);
  expect(f.mutations).toEqual([{ name: "delete_calendar_event", input }]);
});

test("office preview distinguishes requesting the room from an accepted reservation", async () => {
  const f = fixture();
  await f.wrapped.call("create_calendar_event", {
    ...booking,
    useOffice: true,
  });
  expect(JSON.stringify(f.messages[0].body)).toContain(
    "discord-calendar · 會辦",
  );
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => ({
    ...f.client,
    call: async () => ({ status: "complete", officeReservation: "pending" }),
  }));
  expect(f.messages.at(-1)?.body.embeds[0].author.name).toContain("會辦待回覆");
});

test("configuration changes and legacy drafts cannot be confirmed against another calendar", async () => {
  const f = fixture();
  await f.wrapped.call("create_calendar_event", booking);
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => ({
    ...f.client,
    config: { ...config, calendarId: "changed@group.calendar.google.com" },
  }));
  expect(f.mutations).toHaveLength(0);
  const drafts = JSON.parse(readFileSync(f.path, "utf8"));
  delete drafts[0].calendarBinding;
  writeFileSync(f.path, JSON.stringify(drafts));
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => f.client);
  expect(f.mutations).toHaveLength(0);
});

test("raw calendar recipients cannot publish a preview and moving away explicitly cancels office use", async () => {
  const f = fixture();
  expect(
    (
      await f.wrapped.call("create_calendar_event", {
        ...booking,
        attendees: [config.officeCalendarId],
      })
    ).status,
  ).toBe("unavailable");
  expect(f.messages).toHaveLength(0);
  f.client.call = async () => ({
    status: "complete",
    event: {
      id: "event1",
      etag: "version1",
      summary: "Office meeting",
      start: { date: "2026-09-21" },
      end: { date: "2026-09-22" },
      attendees: [
        { email: config.officeCalendarId },
        { email: "guest@example.com" },
      ],
    },
  });
  expect(
    (
      await f.wrapped.call("edit_calendar_event", {
        eventId: "event1",
        etag: "version1",
        location: "Online",
        useOffice: false,
      })
    ).status,
  ).toBe("awaiting_confirmation");
  expect(JSON.stringify(f.messages[0].body)).toContain("邀請 → 不使用");
  expect(JSON.stringify(f.messages[0].body)).toContain("guest@example.com");
  expect(JSON.stringify(f.messages[0].body)).not.toContain(
    config.officeCalendarId,
  );
  expect(f.mutations).toHaveLength(0);
});

test("revoked access cannot post a new confirmation preview", async () => {
  const f = fixture();
  const wrapped = withCalendarConfirmation(
    f.client,
    f.context,
    f.discord,
    async () => false,
  );
  const result = await wrapped.call("create_calendar_event", {
    title: "Denied",
    operationKey: "denied",
    schedule: { kind: "all_day", start: "2026-10-18", end: "2026-10-19" },
  });
  expect(result.status).toBe("unavailable");
  expect(f.mutations).toHaveLength(0);
  expect(f.messages).toHaveLength(0);
});

test("losing the allowed role after a preview prevents confirmation from reaching Google", async () => {
  const f = fixture();
  const guildId = "1394943277836402779";
  const client = { ...f.client, config: { ...f.client.config, guildId } };
  const wrapped = withCalendarConfirmation(
    client,
    { ...f.context, guildId },
    f.discord,
    async () => true,
  );
  expect((await wrapped.call("create_calendar_event", booking)).status).toBe(
    "awaiting_confirmation",
  );
  let calls = 0;
  const request = (async () => {
    calls++;
    throw new Error("Google must not be contacted");
  }) as unknown as typeof fetch;
  const oauthEnv = {
    DISCORD_CALENDAR_ID: config.calendarId,
    DISCORD_CALENDAR_OAUTH_JSON: JSON.stringify({
      client_id: "test.apps.googleusercontent.com",
      client_secret: "test",
      refresh_token: "test",
    }),
  };
  await handleCalendarConfirmation(
    {
      ...f.button("confirm", "requester1", guildId),
      member: { user: { id: "requester1" }, roles: [] },
    },
    f.discord,
    oauthEnv,
    (env, context) => createGoogleCalendarClient(env, context, request),
  );
  expect(calls).toBe(0);
  expect(f.mutations).toHaveLength(0);
  expect(f.messages.at(-1)?.body.embeds[0].author.name).toContain(
    "日曆暫時無法使用",
  );
});

test("one calendar message progresses through saving to a concise receipt", async () => {
  const f = fixture();
  const result = await f.wrapped.call("create_calendar_event", booking);
  expect(result.replyDelivered).toBe(true);
  expect(f.messages[0].body.content).toBe("");
  expect(f.messages[0].body.embeds[0]).toMatchObject({
    author: { name: "待你確認" },
    title: "Meeting",
  });
  expect(JSON.stringify(f.messages[0].body)).not.toContain("確認後");
  expect(JSON.stringify(f.messages[0].body)).not.toContain("預約成功");
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => f.client);
  const saving = f.messages[1].body;
  expect(saving.type).toBe(7);
  expect(saving.data.embeds[0].author.name).toBe("建立中…");
  expect(saving.data.components[0].components[0].disabled).toBe(true);
  expect(f.messages.at(-1)?.body.embeds[0].author.name).toBe("已建立");
  expect(f.messages.at(-1)?.body.embeds[0].description).toContain(
    "guest@example.com",
  );
  expect(
    f.messages.filter((m) => m.path === "/channels/channel1/messages"),
  ).toHaveLength(1);
});

test("expiry edits the original message and refresh requires a new confirmation ID", async () => {
  const f = fixture();
  await f.wrapped.call("create_calendar_event", booking);
  const stored = JSON.parse(readFileSync(f.path, "utf8"));
  stored[0].expires = Date.now() - 1;
  writeFileSync(f.path, JSON.stringify(stored));
  await expireCalendarDrafts(f.discord);
  expect(f.messages.at(-1)?.path).toBe("/channels/channel1/messages/preview1");
  expect(f.messages.at(-1)?.body.content).toBe("「Meeting」草稿已過期。");
  expect(f.messages.at(-1)?.body.components[0].components[0].label).toBe(
    "重新預覽",
  );
  await handleCalendarConfirmation(
    f.button("refresh"),
    f.discord,
    {},
    () => f.client,
  );
  const fresh = JSON.parse(readFileSync(f.path, "utf8")).find(
    (d: any) => !d.result,
  );
  expect(fresh.id).not.toBe(stored[0].id);
  expect(fresh.responseMessageId).toBe("preview1");
  expect(f.messages.at(-1)?.body.embeds[0].author.name).toBe("待你確認");
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => f.client);
  expect(f.mutations).toHaveLength(0);
  await handleCalendarConfirmation(
    { ...f.button(), data: { custom_id: `calendar:confirm:${fresh.id}` } },
    f.discord,
    {},
    () => f.client,
  );
  expect(f.mutations).toHaveLength(1);
});

test("stale events refresh their etag and diff without applying the old approval", async () => {
  const f = fixture();
  await f.wrapped.call("edit_calendar_event", {
    eventId: "event1",
    etag: "version1",
    title: "After",
  });
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => ({
    config,
    call: async () => ({ status: "unavailable", failureKind: "stale" }),
  }));
  expect(f.messages.at(-1)?.body.embeds[0].author.name).toBe("活動已變更");
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => f.client);
  expect(f.mutations).toHaveLength(0);
  const oldCall = f.client.call;
  f.client.call = async (name, input) =>
    name === "get_calendar_event"
      ? {
          status: "complete",
          event: {
            id: "event1",
            etag: "version2",
            summary: "Someone changed it",
            start: { date: "2026-09-21" },
            end: { date: "2026-09-22" },
          },
        }
      : oldCall(name, input);
  await handleCalendarConfirmation(
    f.button("refresh"),
    f.discord,
    {},
    () => f.client,
  );
  const fresh = JSON.parse(readFileSync(f.path, "utf8")).find(
    (d: any) => !d.result,
  );
  expect(fresh.input.etag).toBe("version2");
  expect(f.messages.at(-1)?.body.embeds[0].description).toContain(
    "Someone changed it → After",
  );
  expect(f.mutations).toHaveLength(0);
});

test("uncertain writes can only be read back, including after a host restart", async () => {
  const f = fixture();
  await f.wrapped.call("create_calendar_event", booking);
  let writes = 0;
  const client: GoogleCalendarClient = {
    config,
    call: async (name) => {
      if (name !== "get_calendar_event") {
        writes++;
        return { status: "unavailable", failureKind: "uncertain" };
      }
      return {
        status: "complete",
        event: {
          id: "event1",
          summary: "Meeting",
          start: { dateTime: booking.schedule.start },
          end: { dateTime: booking.schedule.end },
          attendees: [{ email: "guest@example.com" }],
        },
        officeReservation: "not_requested",
      };
    },
  };
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => client);
  expect(f.messages.at(-1)?.body.embeds[0].author.name).toBe("結果未確認");
  expect(f.messages.at(-1)?.body.components[0].components[0].label).toBe(
    "查詢結果",
  );
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => client);
  await handleCalendarConfirmation(
    f.button("cancel"),
    f.discord,
    {},
    () => client,
  );
  expect(writes).toBe(1);
  const stored = JSON.parse(readFileSync(f.path, "utf8"));
  stored[0].state = "saving";
  writeFileSync(f.path, JSON.stringify(stored));
  await expireCalendarDrafts(f.discord);
  expect(f.messages.at(-1)?.body.embeds[0].author.name).toBe("結果未確認");
  await handleCalendarConfirmation(
    f.button("verify"),
    f.discord,
    {},
    () => client,
  );
  expect(writes).toBe(1);
  expect(f.messages.at(-1)?.body.embeds[0].author.name).toBe("已建立");
});

test("room status refresh updates the receipt without another calendar write", async () => {
  const f = fixture();
  await f.wrapped.call("create_calendar_event", {
    ...booking,
    useOffice: true,
  });
  let writes = 0;
  const client: GoogleCalendarClient = {
    config,
    call: async (name) => {
      if (name === "get_calendar_event")
        return {
          status: "complete",
          event: {
            id: "event1",
            summary: "Meeting",
            start: { dateTime: booking.schedule.start },
            end: { dateTime: booking.schedule.end },
            attendees: [
              { email: config.officeCalendarId },
              { email: "guest@example.com" },
            ],
          },
          officeReservation: "accepted",
        };
      writes++;
      return {
        status: "complete",
        event: { id: "event1" },
        officeReservation: "pending",
      };
    },
  };
  await handleCalendarConfirmation(f.button(), f.discord, {}, () => client);
  expect(f.messages.at(-1)?.body.embeds[0].author.name).toContain("會辦待回覆");
  await handleCalendarConfirmation(
    f.button("office"),
    f.discord,
    {},
    () => client,
  );
  expect(f.messages.at(-1)?.body.embeds[0].author.name).toContain("會辦已接受");
  expect(JSON.stringify(f.messages.at(-1)?.body.components)).not.toContain(
    "calendar:office:",
  );
  expect(writes).toBe(1);
  expect(
    f.messages.filter((m) => m.path === "/channels/channel1/messages"),
  ).toHaveLength(1);
});

test("other answers join the calendar message and survive completion", async () => {
  const f = fixture();
  const preview = await f.wrapped.call("create_calendar_event", booking);
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const confirming = handleCalendarConfirmation(
    f.button(),
    f.discord,
    {},
    () => ({
      config,
      call: async () => {
        await pending;
        return { status: "complete" };
      },
    }),
  );
  expect(
    await updateCalendarDraftDiscussion(
      String(preview.calendarDraftId),
      "辦公室在二樓。",
      f.discord,
    ),
  ).toBe(true);
  finish();
  await confirming;
  expect(f.messages.at(-1)?.body.content).toBe("辦公室在二樓。");
  expect(f.messages.at(-1)?.body.embeds[0].author.name).toBe("已建立");
  expect(JSON.stringify(f.messages.at(-1)?.body.components)).not.toContain(
    "calendar:confirm:",
  );
  expect(
    f.messages.filter((m) => m.path === "/channels/channel1/messages"),
  ).toHaveLength(1);
});

test("long event titles and additional answers stay within Discord message limits", async () => {
  const f = fixture();
  const preview = await f.wrapped.call("create_calendar_event", {
    ...booking,
    title: "x".repeat(300),
  });
  const payload = f.messages[0].body;
  expect(payload.embeds[0].title.length).toBeLessThanOrEqual(256);
  expect(payload.embeds[0].description).toContain("x".repeat(300));
  await updateCalendarDraftDiscussion(
    String(preview.calendarDraftId),
    "y".repeat(1900),
    f.discord,
  );
  await handleCalendarConfirmation(
    f.button("cancel"),
    f.discord,
    {},
    () => f.client,
  );
  const cancelled = f.messages.at(-1)?.body.data;
  expect(cancelled.content.length).toBeLessThanOrEqual(2000);
  expect(cancelled.embeds[0].description).toContain("已取消");
  expect(cancelled.components).toEqual([]);
});
