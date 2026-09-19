import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  handleCalendarConfirmation,
  withCalendarConfirmation,
} from "./calendar-confirmation";
import {
  CALENDAR_GUILD_ID,
  type GoogleCalendarClient,
} from "./google-calendar";
import type { DiscordRequest } from "../discord/api/request";

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
    return {};
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
  expect(f.messages[0].body.content).toContain("guest@example.com");
  expect(f.messages[0].body.content).toContain("2026-09-21 15:00");
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
  expect(f.messages.at(-2)?.body.components).toEqual([]);
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
  expect(f.messages[0].body.content).toContain("existing@example.com");
  expect(f.messages[0].body.content).toContain("2026-09-21");
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
