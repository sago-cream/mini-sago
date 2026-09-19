import { generateKeyPairSync, verify } from "node:crypto";
import { describe, expect, test } from "bun:test";
import {
  CALENDAR_GUILD_ID,
  CALENDAR_SERVICE_ACCOUNT,
  CALENDAR_ID,
  createGoogleCalendarClient,
} from "./google-calendar";

const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
const credentials = {
  type: "service_account",
  client_email: CALENDAR_SERVICE_ACCOUNT,
  private_key_id: "test-key",
  private_key: keys.privateKey
    .export({ type: "pkcs8", format: "pem" })
    .toString(),
};
const env = {
  MINISAGO_GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON: JSON.stringify(credentials),
};
const context = {
  guildId: CALENDAR_GUILD_ID,
  messageId: "discord-message-123",
};
const creation = {
  title: "Office meeting",
  operationKey: "meeting-1",
  schedule: {
    kind: "timed",
    start: "2026-09-21T14:00:00+08:00",
    end: "2026-09-21T15:00:00+08:00",
  },
};
const json = (data: unknown, status = 200) => Response.json(data, { status });
function fixture(
  handle: (url: URL, init: RequestInit) => Response | Promise<Response>,
) {
  const calls: { url: URL; init: RequestInit }[] = [];
  const request = (async (
    url: string | URL | Request,
    init: RequestInit = {},
  ) => {
    const parsed = new URL(String(url));
    calls.push({ url: parsed, init });
    if (parsed.hostname === "oauth2.googleapis.com")
      return json({ access_token: "access-never-output", expires_in: 3600 });
    expect(parsed.pathname).toStartWith(
      `/calendar/v3/calendars/${encodeURIComponent(CALENDAR_ID)}/events`,
    );
    return await handle(parsed, init);
  }) as unknown as typeof fetch;
  return {
    client: createGoogleCalendarClient(env, context, request)!,
    request,
    calls,
  };
}

describe("Google Calendar host client", () => {
  test("only binds the configured guild, requires all secrets, and never calls Google otherwise", () => {
    const { request, calls } = fixture(() => json({}));
    expect(
      createGoogleCalendarClient(env, { messageId: "dm" }, request),
    ).toBeUndefined();
    expect(
      createGoogleCalendarClient(
        env,
        { guildId: "other", messageId: "1" },
        request,
      ),
    ).toBeUndefined();
    expect(
      createGoogleCalendarClient(
        { ...env, MINISAGO_GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON: "" },
        context,
        request,
      ),
    ).toBeUndefined();
    expect(calls).toHaveLength(0);
  });
  test("rejects foreign calendars, invalid dates, reversed times and excessive ranges before making requests", async () => {
    const { client, calls } = fixture(() => json({}));
    for (const input of [
      { ...creation, calendarId: "another" },
      {
        ...creation,
        schedule: { kind: "all_day", start: "2026-02-30", end: "2026-03-02" },
      },
      {
        ...creation,
        schedule: { ...creation.schedule, end: creation.schedule.start },
      },
      {
        ...creation,
        schedule: { ...creation.schedule, start: "2026-09-21T14:00:00" },
      },
    ])
      expect((await client.call("create_calendar_event", input)).status).toBe(
        "unavailable",
      );
    expect(
      (
        await client.call("list_calendar_events", {
          start: "2026-01-01T00:00:00Z",
          end: "2028-01-01T00:00:00Z",
        })
      ).status,
    ).toBe("unavailable");
    expect(calls).toHaveLength(0);
  });
  test("paginates bounded lists and excludes attendee data", async () => {
    const { client, calls } = fixture((url) => {
      expect(url.searchParams.get("pageToken")).toBe("next");
      expect(url.searchParams.get("singleEvents")).toBe("true");
      return json({
        items: [
          { id: "event1", attendees: [{ email: "private@example.com" }] },
          { id: "event2", attendees: [{ email: "private2@example.com" }] },
        ],
        nextPageToken: "more",
      });
    });
    const result = await client.call("list_calendar_events", {
      start: "2026-09-01T00:00:00+08:00",
      end: "2026-10-01T00:00:00+08:00",
      pageToken: "next",
    });
    expect(result).toEqual({
      status: "complete",
      events: [{ id: "event1" }, { id: "event2" }],
      nextPageToken: "more",
    });
    await client.call("get_calendar_event", { eventId: "../../other" });
    expect(calls).toHaveLength(2);
  });
  test("creation survives a lost response and host restart without duplicating the booking", async () => {
    let stored: any;
    let inserts = 0;
    const { client, request } = fixture((_url, init) => {
      if (init.method === "POST") {
        const event = JSON.parse(String(init.body));
        if (stored) {
          expect(event.id).toBe(stored.id);
          return json({}, 409);
        }
        stored = { ...event, etag: '"v1"' };
        inserts++;
        throw new Error("lost network response containing secret-never-output");
      }
      return json(stored);
    });
    const first = await client.call("create_calendar_event", creation);
    expect(first.status).toBe("unavailable");
    expect(JSON.stringify(first)).not.toContain("secret-never-output");
    const restarted = createGoogleCalendarClient(env, context, request)!;
    expect(
      await restarted.call("create_calendar_event", creation),
    ).toMatchObject({
      status: "complete",
      reused: true,
      event: { summary: "Office meeting", start: { timeZone: "Asia/Taipei" } },
    });
    expect(inserts).toBe(1);
    expect(
      (
        await restarted.call("create_calendar_event", {
          ...creation,
          title: "Different meeting",
        })
      ).status,
    ).toBe("unavailable");
  });
  test("edits only supplied fields, carries If-Match, and refuses stale etags and series", async () => {
    let current = {
      id: "event1",
      etag: '"v2"',
      recurrence: undefined as string[] | undefined,
    };
    let patches = 0;
    const { client } = fixture((url, init) => {
      if (init.method === "PATCH") {
        patches++;
        expect(init.headers).toMatchObject({ "If-Match": '"v2"' });
        expect(JSON.parse(String(init.body))).toEqual({
          summary: "Updated",
          description: "",
        });
        expect(url.searchParams.get("sendUpdates")).toBe("all");
        return json({}, 412);
      }
      return json(current);
    });
    expect(
      (
        await client.call("edit_calendar_event", {
          eventId: "event1",
          etag: '"v1"',
          title: "Updated",
        })
      ).error,
    ).toContain("changed");
    expect(patches).toBe(0);
    expect(
      (
        await client.call("edit_calendar_event", {
          eventId: "event1",
          etag: '"v2"',
          title: "Updated",
          description: "",
        })
      ).error,
    ).toContain("changed");
    expect(patches).toBe(1);
    current = { ...current, recurrence: ["RRULE:FREQ=WEEKLY"] };
    expect(
      (
        await client.call("edit_calendar_event", {
          eventId: "event1",
          etag: '"v2"',
          title: "Updated",
        })
      ).error,
    ).toContain("series");
    expect(patches).toBe(1);
  });
  test("supports all-day bookings and shares a token across concurrent reads", async () => {
    const { client, calls } = fixture((_url, init) =>
      json(init.body ? JSON.parse(String(init.body)) : { id: "event1" }),
    );
    const results = await Promise.all([
      client.call("create_calendar_event", {
        ...creation,
        schedule: { kind: "all_day", start: "2026-09-21", end: "2026-09-22" },
      }),
      client.call("get_calendar_event", { eventId: "event1" }),
    ]);
    expect(results[0]).toMatchObject({
      status: "complete",
      event: { start: { date: "2026-09-21" }, end: { date: "2026-09-22" } },
    });
    expect(
      calls.filter(({ url }) => url.hostname === "oauth2.googleapis.com"),
    ).toHaveLength(1);
  });
  test("does not expose authorization error bodies", async () => {
    const request = (async () =>
      json(
        { error: env.MINISAGO_GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON },
        400,
      )) as unknown as typeof fetch;
    const client = createGoogleCalendarClient(env, context, request)!;
    const result = await client.call("get_calendar_event", {
      eventId: "event1",
    });
    expect(result.status).toBe("unavailable");
    expect(JSON.stringify(result)).not.toContain(
      env.MINISAGO_GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON,
    );
  });
});

test("signs a narrow service-account JWT without impersonation or caller-selected token endpoints", async () => {
  const { client, calls } = fixture(() => json({ id: "event1" }));
  await client.call("get_calendar_event", { eventId: "event1" });
  const params = calls[0].init.body as URLSearchParams;
  expect(params.get("grant_type")).toBe(
    "urn:ietf:params:oauth:grant-type:jwt-bearer",
  );
  expect(params.has("refresh_token")).toBe(false);
  const [header, payload, signature] = params.get("assertion")!.split(".");
  expect(JSON.parse(Buffer.from(header!, "base64url").toString())).toEqual({
    alg: "RS256",
    typ: "JWT",
    kid: "test-key",
  });
  const claims = JSON.parse(Buffer.from(payload!, "base64url").toString());
  expect(claims).toMatchObject({
    iss: CALENDAR_SERVICE_ACCOUNT,
    scope: "https://www.googleapis.com/auth/calendar.events",
    aud: "https://oauth2.googleapis.com/token",
  });
  expect(claims.sub).toBeUndefined();
  expect(claims.exp - claims.iat).toBe(3600);
  expect(Math.abs(claims.iat - Math.floor(Date.now() / 1000))).toBeLessThan(5);
  expect(
    verify(
      "RSA-SHA256",
      Buffer.from(`${header}.${payload}`),
      keys.publicKey,
      Buffer.from(signature!, "base64url"),
    ),
  ).toBe(true);
});

test("rejects malformed keys, foreign identities, and legacy admin credentials", () => {
  for (const configured of [
    "invalid JSON",
    "{}",
    JSON.stringify({ ...credentials, client_email: "admin@nthusa.tw" }),
    JSON.stringify({ ...credentials, private_key: "broken" }),
  ]) {
    expect(
      createGoogleCalendarClient(
        { MINISAGO_GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON: configured },
        context,
      ),
    ).toBeUndefined();
  }
  expect(
    createGoogleCalendarClient(
      {
        MINISAGO_GOOGLE_CALENDAR_CLIENT_ID: "old",
        MINISAGO_GOOGLE_CALENDAR_CLIENT_SECRET: "old",
        MINISAGO_GOOGLE_CALENDAR_REFRESH_TOKEN: "old",
      },
      context,
    ),
  ).toBeUndefined();
});

test("OAuth invitations use the selected user and preserve guest lists when omitted", async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let email = "nthusa@gapp.nthu.edu.tw";
  const request = (async (url: unknown, init: RequestInit = {}) => {
    calls.push({ url: String(url), init });
    if (String(url) === "https://oauth2.googleapis.com/token")
      return json({ access_token: "oauth-access", expires_in: 3600 });
    if (String(url) === "https://openidconnect.googleapis.com/v1/userinfo")
      return json({ email, email_verified: true });
    if (init.method === "POST" || init.method === "PATCH")
      return json({ id: "event1", ...JSON.parse(String(init.body)) });
    return json({
      id: "event1",
      etag: "v1",
      attendees: [
        { email: "existing@example.com", responseStatus: "accepted" },
      ],
    });
  }) as typeof fetch;
  const oauthEnv = {
    MINISAGO_GOOGLE_CALENDAR_OAUTH_JSON: JSON.stringify({
      client_id: "test.apps.googleusercontent.com",
      client_secret: "secret",
      refresh_token: "refresh",
    }),
  };
  const client = createGoogleCalendarClient(oauthEnv, context, request)!;
  expect(
    (
      await client.call("create_calendar_event", {
        ...creation,
        attendees: ["guest@example.com"],
      })
    ).status,
  ).toBe("complete");
  expect((calls[0].init.body as URLSearchParams).get("grant_type")).toBe(
    "refresh_token",
  );
  expect((calls[0].init.body as URLSearchParams).has("assertion")).toBe(false);
  const post = calls.find(
    (c) => c.init.method === "POST" && c.url.includes("calendar/v3"),
  )!;
  expect(JSON.parse(String(post.init.body)).attendees).toEqual([
    { email: "guest@example.com" },
  ]);
  expect(post.url).toContain("sendUpdates=all");
  const event: any = await client.call("get_calendar_event", {
    eventId: "event1",
  });
  expect(event.event.attendees).toEqual([
    { email: "existing@example.com", responseStatus: "accepted" },
  ]);
  await client.call("edit_calendar_event", {
    eventId: "event1",
    etag: "v1",
    title: "Updated",
  });
  expect(
    JSON.parse(String(calls.find((c) => c.init.method === "PATCH")!.init.body))
      .attendees,
  ).toBeUndefined();
  email = "admin@nthusa.tw";
  const wrong = createGoogleCalendarClient(oauthEnv, context, request)!;
  const before = calls.filter((c) => c.url.includes("calendar/v3")).length;
  expect((await wrong.call("create_calendar_event", creation)).status).toBe(
    "unavailable",
  );
  expect(calls.filter((c) => c.url.includes("calendar/v3"))).toHaveLength(
    before,
  );
});

test("rejects malformed OAuth without falling back and refuses service-account guest invitations", async () => {
  expect(
    createGoogleCalendarClient(
      { ...env, MINISAGO_GOOGLE_CALENDAR_OAUTH_JSON: "{}" },
      context,
    ),
  ).toBeUndefined();
  const { client, calls } = fixture(() => json({}));
  expect(
    (
      await client.call("create_calendar_event", {
        ...creation,
        attendees: ["guest@example.com"],
      })
    ).status,
  ).toBe("unavailable");
  expect(calls).toHaveLength(0);
  for (const attendees of [
    ["invalid"],
    ["a@example.com", "A@example.com"],
    Array.from({ length: 51 }, (_, i) => `${i}@example.com`),
  ])
    expect(
      (await client.call("create_calendar_event", { ...creation, attendees }))
        .status,
    ).toBe("unavailable");
});
