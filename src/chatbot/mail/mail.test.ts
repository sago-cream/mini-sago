import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import {
  mailSettings,
  GMAIL_READ_SCOPE,
  MAIL_SCOPES,
  MAIL_CALLBACK_PATH,
} from "./mail-settings";
import { FeatureAvailabilityStore } from "../../discord/feature-availability";
import { MailStore } from "./mail-store";
import { createMailAuthHandler, handleMailRequest } from "./mail-auth";
import { createGoogleMailClient, mailMessageText } from "./google-mail";

const roots: string[] = [];
afterEach(() => {
  for (const root of roots.splice(0))
    rmSync(root, { recursive: true, force: true });
});
const mailbox = "nthusc@gapp.nthu.edu.tw",
  second = "other@example.com";
function fixture() {
  const root = mkdtempSync(join(tmpdir(), "minisago-mail-"));
  roots.push(root);
  const env = {
    MINISAGO_MAIL_ORIGIN: "https://bot.example.com",
    MINISAGO_MAIL_CLIENT_ID: "mail-client",
    MINISAGO_MAIL_CLIENT_SECRET: "client-secret",
    MINISAGO_MAIL_ACCOUNTS: `${mailbox},${second}`,
    MINISAGO_MAIL_STORE_PATH: join(root, "mail", "access.sqlite"),
    MINISAGO_MAIL_ENCRYPTION_KEY: Buffer.alloc(32, 17).toString("base64"),
  };
  const settings = mailSettings(env)!;
  const store = new MailStore(settings);
  const invite = store.invite(mailbox);
  return { env, settings, store, invite };
}
const json = (value: unknown) => Response.json(value);
function google(
  identity = mailbox,
  scope = MAIL_SCOPES.join(" "),
  withRefresh = true,
) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const request = (async (url, init) => {
    calls.push({ url: String(url), init });
    if (String(url) === "https://oauth2.googleapis.com/token")
      return json({
        access_token: "google-access",
        ...(withRefresh ? { refresh_token: "secret-refresh" } : {}),
        scope,
      });
    if (String(url) === "https://openidconnect.googleapis.com/v1/userinfo")
      return json({ email: identity, email_verified: true });
    if (String(url).endsWith("/profile"))
      return json({ emailAddress: identity });
    throw new Error("Unexpected Google call");
  }) as typeof fetch;
  return { request, calls };
}
async function start(
  f: ReturnType<typeof fixture>,
  requestGoogle = google().request,
) {
  const handler = createMailAuthHandler(f.settings, requestGoogle);
  const response = await handler(
    new Request(`${f.settings.origin}/mail/oauth/start`, {
      method: "POST",
      headers: { Origin: f.settings.origin },
      body: new URLSearchParams({ invite: f.invite.token }),
    }),
  );
  const location = new URL(response.headers.get("location")!);
  const cookie = response.headers.get("set-cookie")!.split(";")[0]!;
  return { handler, response, location, cookie };
}
function callback(
  f: ReturnType<typeof fixture>,
  state: string,
  cookie: string,
  code = "valid-code",
) {
  return new Request(
    `${f.settings.origin}${MAIL_CALLBACK_PATH}?${new URLSearchParams({ state, code })}`,
    { headers: { Cookie: cookie } },
  );
}
function connect(
  f: ReturnType<typeof fixture>,
  email = mailbox,
  refreshToken = "secret-refresh",
) {
  const invite = email === mailbox ? f.invite : f.store.invite(email);
  const flow = f.store.startFlow(f.store.getInvite(invite.token)!);
  const taken = f.store.takeFlow(flow.state, flow.browser)!;
  f.store.connect(taken, {
    refreshToken,
    scope: MAIL_SCOPES.join(" "),
    connectedAt: Date.now(),
  });
}

test("mail configuration is optional and rejects invalid origins, missing secrets and malformed encryption keys", () => {
  expect(mailSettings({})).toBeUndefined();
  const f = fixture();
  for (const change of [
    { MINISAGO_MAIL_ORIGIN: "http://bot.example.com" },
    { MINISAGO_MAIL_ORIGIN: "https://bot.example.com/path" },
    { MINISAGO_MAIL_ENCRYPTION_KEY: "bad" },
    { MINISAGO_MAIL_CLIENT_SECRET: "" },
    { MINISAGO_MAIL_ACCOUNTS: "invalid" },
  ])
    expect(() => mailSettings({ ...f.env, ...change })).toThrow(
      "Invalid discord-mail",
    );
  f.store.close();
});

test("authorization survives host restart, binds state/browser, stores encrypted credentials and consumes invitation", async () => {
  const f = fixture(),
    g = google();
  const attempt = await start(f, g.request);
  expect(attempt.response.status).toBe(303);
  expect(attempt.location.origin).toBe("https://accounts.google.com");
  expect(attempt.location.searchParams.get("scope")).toBe(
    MAIL_SCOPES.join(" "),
  );
  expect(attempt.location.searchParams.get("login_hint")).toBe(mailbox);
  expect(attempt.location.searchParams.get("include_granted_scopes")).toBe(
    "false",
  );
  expect(attempt.response.headers.get("set-cookie")).toContain(
    "HttpOnly; Secure; SameSite=Lax",
  );
  const state = attempt.location.searchParams.get("state")!;
  expect(
    (await attempt.handler(callback(f, state, "__Host-discord_mail=wrong")))
      .status,
  ).toBe(400);
  expect(g.calls).toHaveLength(0);
  f.store.close();
  const handler = createMailAuthHandler(f.settings, g.request);
  const response = await handler(callback(f, state, attempt.cookie));
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe("/mail/connected");
  expect(
    (
      await handler(
        new Request(`${f.settings.origin}/mail/connected`, {
          headers: { Cookie: attempt.cookie },
        }),
      )
    ).status,
  ).toBe(200);
  expect(
    (await handler(new Request(`${f.settings.origin}/mail/connected`))).status,
  ).toBe(400);
  const exchange = g.calls[0]!.init!.body as URLSearchParams;
  expect(exchange.get("redirect_uri")).toBe(
    `${f.settings.origin}${MAIL_CALLBACK_PATH}`,
  );
  expect(
    createHash("sha256")
      .update(exchange.get("code_verifier")!)
      .digest("base64url"),
  ).toBe(attempt.location.searchParams.get("code_challenge")!);
  const stored = new MailStore(f.settings);
  expect(stored.credential(mailbox)?.refreshToken).toBe("secret-refresh");
  expect(stored.getInvite(f.invite.token)).toBeNull();
  stored.close();
  const database = readFileSync(f.settings.storePath).toString();
  expect(database).not.toContain("secret-refresh");
  expect(database).not.toContain(f.invite.token);
  expect(statSync(f.settings.storePath).mode & 0o777).toBe(0o600);
  expect((await handler(callback(f, state, attempt.cookie))).status).toBe(400);
  expect(g.calls).toHaveLength(3);
});

test("wrong account, missing refresh token, broader grants and declined grants never connect", async () => {
  for (const g of [
    google(second),
    google(
      mailbox,
      `${GMAIL_READ_SCOPE} https://www.googleapis.com/auth/gmail.modify`,
    ),
    google(mailbox, "openid email"),
    google(mailbox, MAIL_SCOPES.join(" "), false),
  ]) {
    const f = fixture();
    const a = await start(f, g.request);
    const response = await a.handler(
      callback(f, a.location.searchParams.get("state")!, a.cookie),
    );
    expect(response.status).toBeGreaterThanOrEqual(400);
    const text = await response.text();
    expect(text).not.toContain("secret-refresh");
    expect(text).not.toContain("google-access");
    expect(f.store.credential(mailbox)).toBeNull();
    expect(f.store.getInvite(f.invite.token)).not.toBeNull();
    f.store.close();
  }
  const f = fixture(),
    g = google(),
    a = await start(f, g.request);
  const response = await a.handler(
    new Request(
      `${f.settings.origin}${MAIL_CALLBACK_PATH}?state=${a.location.searchParams.get("state")}&error=access_denied`,
      { headers: { Cookie: a.cookie } },
    ),
  );
  expect(await response.text()).toContain("Access was not granted");
  expect(g.calls).toHaveLength(0);
  f.store.close();
});

test("expiry, replacement and disconnect invalidate invitation flows", () => {
  const f = fixture();
  const i = f.store.getInvite(f.invite.token)!;
  const flow = f.store.startFlow(i);
  expect(
    f.store.takeFlow(flow.state, flow.browser, Date.now() + 16 * 60_000),
  ).toBeNull();
  const flow2 = f.store.startFlow(i);
  const taken = f.store.takeFlow(flow2.state, flow2.browser)!;
  f.store.invite(mailbox);
  expect(() =>
    f.store.connect(taken, {
      refreshToken: "stale",
      scope: GMAIL_READ_SCOPE,
      connectedAt: Date.now(),
    }),
  ).toThrow("Invitation");
  const newInvite = f.store.invite(mailbox);
  const flow3 = f.store.startFlow(f.store.getInvite(newInvite.token)!);
  f.store.disconnect(mailbox);
  expect(f.store.takeFlow(flow3.state, flow3.browser)).toBeNull();
  expect(f.store.getInvite(newInvite.token)).toBeNull();
  expect(() => f.store.invite("unapproved@example.com")).toThrow("not in");
  expect(f.store.getInvite(f.invite.token, f.invite.expires)).toBeNull();
  f.store.close();
});

test("the invitation page does not start OAuth on GET, rejects cross-origin starts and bounds body input", async () => {
  const f = fixture(),
    g = google(),
    handler = createMailAuthHandler(f.settings, g.request);
  const response = await handler(
    new Request(`${f.settings.origin}/mail/connect?invite=${f.invite.token}`),
  );
  expect(response.status).toBe(200);
  expect(await response.text()).toContain("Continue with Google");
  expect(response.headers.get("referrer-policy")).toBe("strict-origin");
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(g.calls).toHaveLength(0);
  for (const origin of ["https://evil.test", ""])
    expect(
      (
        await handler(
          new Request(`${f.settings.origin}/mail/oauth/start`, {
            method: "POST",
            headers: { Origin: origin },
            body: new URLSearchParams({ invite: f.invite.token }),
          }),
        )
      ).status,
    ).toBe(403);
  expect(
    (
      await handler(
        new Request(`${f.settings.origin}/mail/oauth/start`, {
          method: "POST",
          headers: { Origin: f.settings.origin },
          body: "a".repeat(1000),
        }),
      )
    ).status,
  ).toBe(413);
  expect(
    (
      await handler(
        new Request(`${f.settings.origin}/mail/connect?invite=invalid`),
      )
    ).status,
  ).toBe(410);
  expect(
    (
      await createMailAuthHandler(undefined)(
        new Request(`${f.settings.origin}/mail/connect`),
      )
    ).status,
  ).toBe(503);
  expect(
    handleMailRequest(
      new Request(`${f.settings.origin}/mail/privacy`),
    ) instanceof Response,
  ).toBe(true);
  expect(
    handleMailRequest(new Request(`${f.settings.origin}/unrelated`)),
  ).toBeUndefined();
  f.store.close();
});

test("mail tools require owner private text requests and recheck configured mailbox access", async () => {
  const f = fixture();
  connect(f);
  for (const context of [
    { requesterId: "other", ownerId: "owner" },
    { requesterId: "owner", ownerId: "owner", guildId: "guild" },
    { requesterId: "owner", ownerId: "owner", streamReply: true },
  ])
    expect(createGoogleMailClient(f.env, context)).toBeUndefined();
  const g = google();
  const context = { requesterId: "owner", ownerId: "owner" };
  const client = createGoogleMailClient(f.env, context, g.request)!;
  expect(await client.call("list_mail_accounts", {})).toMatchObject({
    accounts: [
      { account: mailbox, connected: true },
      { account: second, connected: false },
    ],
  });
  expect(
    JSON.stringify(await client.call("list_mail_accounts", {})),
  ).not.toContain("secret-refresh");
  expect(
    await client.call("read_mail", {
      account: "unapproved@example.com",
      messageId: "abcdef123456",
    }),
  ).toEqual({ status: "forbidden" });
  expect(g.calls).toHaveLength(0);
  f.env.MINISAGO_MAIL_ACCOUNTS = second;
  expect(
    await client.call("read_mail", {
      account: mailbox,
      messageId: "abcdef123456",
    }),
  ).toEqual({ status: "forbidden" });
  context.requesterId = "other";
  expect(await client.call("list_mail_accounts", {})).toEqual({
    status: "forbidden",
  });
  f.store.close();
});

test("search spans separate credentials and read returns paginated untrusted text without mutating mail", async () => {
  const f = fixture();
  connect(f);
  connect(f, second, "second-refresh");
  const calls: { url: string; method: string; token?: string }[] = [];
  const id = "abcdef123456";
  const request = (async (rawUrl, init) => {
    const url = new URL(String(rawUrl)),
      authorization = new Headers(init?.headers).get("authorization") ?? "";
    calls.push({
      url: String(rawUrl),
      method: init?.method ?? "GET",
      token: authorization,
    });
    if (url.hostname === "oauth2.googleapis.com") {
      const body = init!.body as URLSearchParams;
      return json({
        access_token:
          body.get("refresh_token") === "second-refresh"
            ? "second-access"
            : "first-access",
        scope: MAIL_SCOPES.join(" "),
      });
    }
    const email = authorization === "Bearer second-access" ? second : mailbox;
    if (url.pathname.endsWith("/profile")) return json({ emailAddress: email });
    if (url.pathname.endsWith("/messages")) {
      expect(url.searchParams.get("q")).toBe("in:inbox is:unread");
      return json({ messages: [{ id }], nextPageToken: "page-2" });
    }
    return json({
      id,
      snippet: "Test snippet",
      payload: {
        mimeType: "text/plain",
        headers: [
          { name: "Subject", value: "Meeting" },
          { name: "From", value: "sender@example.com" },
        ],
        body: { data: Buffer.from("abcdefghij").toString("base64url") },
      },
    });
  }) as typeof fetch;
  const client = createGoogleMailClient(
    f.env,
    { requesterId: "owner", ownerId: "owner" },
    request,
  )!;
  const search = await client.call("search_mail", {
    account: "all",
    query: "in:inbox is:unread",
  });
  expect(search).toMatchObject({
    status: "complete",
    results: [
      { account: mailbox, messages: [{ subject: "Meeting", messageId: id }] },
      { account: second },
    ],
  });
  expect(
    await client.call("read_mail", {
      account: mailbox,
      messageId: id,
      offset: 2,
      limit: 4,
    }),
  ).toMatchObject({
    status: "complete",
    results: [{ text: "cdef", nextOffset: 6, untrustedContent: true }],
  });
  expect(
    calls.every(
      (call) =>
        call.method === "GET" ||
        call.url === "https://oauth2.googleapis.com/token",
    ),
  ).toBe(true);
  const before = calls.length;
  f.store.disconnect(mailbox);
  expect(
    await client.call("read_mail", { account: mailbox, messageId: id }),
  ).toMatchObject({ results: [{ status: "not_connected" }] });
  expect(calls).toHaveLength(before);
  f.store.close();
});

test("disconnect during an in-flight read prevents returning mailbox content", async () => {
  const f = fixture();
  connect(f);
  const g = google();
  const request = (async (url, init) => {
    if (String(url).includes("/messages/")) {
      f.store.disconnect(mailbox);
      return json({
        id: "abcdef123456",
        snippet: "Private snippet",
        payload: {
          mimeType: "text/plain",
          body: { data: Buffer.from("Private body").toString("base64url") },
        },
      });
    }
    return g.request(url, init);
  }) as typeof fetch;
  const client = createGoogleMailClient(
    f.env,
    { requesterId: "owner", ownerId: "owner" },
    request,
  )!;
  const result = await client.call("read_mail", {
    account: mailbox,
    messageId: "abcdef123456",
  });
  expect(result).toMatchObject({ results: [{ status: "unavailable" }] });
  expect(JSON.stringify(result)).not.toContain("Private");
  f.store.close();
});

test("a wrong Gmail identity never exposes message content", async () => {
  const f = fixture();
  connect(f);
  const g = google(second);
  const client = createGoogleMailClient(
    f.env,
    { requesterId: "owner", ownerId: "owner" },
    g.request,
  )!;
  expect(
    await client.call("read_mail", {
      account: mailbox,
      messageId: "abcdef123456",
    }),
  ).toMatchObject({ status: "partial", results: [{ status: "unavailable" }] });
  expect(g.calls).toHaveLength(2);
  f.store.close();
});

test("message extraction prefers plain text, lists attachments and strips active HTML", () => {
  const data = (text: string) => Buffer.from(text).toString("base64url");
  expect(
    mailMessageText({
      parts: [
        { mimeType: "text/plain", body: { data: data("plain") } },
        { mimeType: "text/html", body: { data: data("<p>html</p>") } },
        {
          mimeType: "text/plain",
          filename: "private.txt",
          body: { data: data("attachment body"), size: 15 },
        },
      ],
    }),
  ).toMatchObject({
    text: "plain",
    attachments: [{ filename: "private.txt" }],
  });
  expect(
    mailMessageText({
      mimeType: "text/html",
      body: {
        data: data(
          "<style>secret</style><script>alert(1)</script><p>Hello &amp; world</p>",
        ),
      },
    }).text.trim(),
  ).toBe("Hello & world");
  expect(
    mailMessageText({
      mimeType: "text/plain",
      body: { data: data("x".repeat(100001)) },
    }),
  ).toMatchObject({ truncated: true });
});

test("registered mail scopes refresh roles, honor channel overrides, and revoke existing clients", async () => {
  const f = fixture();
  connect(f);
  const policy = new FeatureAvailabilityStore(
    join(f.settings.storePath, "..", "features.json"),
    {},
  );
  const guildId = "1394943277836402779",
    channelId = "1517766866964316201";
  const role = "1394944058534920213",
    denied = "1394944058534920214";
  let roles = [role];
  let memberUnavailable = false;
  const context = {
    requesterId: "member",
    ownerId: "owner",
    guildId,
    channelId,
    roleIds: [role],
    resolveRoleIds: async () => {
      if (memberUnavailable) throw Error("Membership unavailable");
      return roles;
    },
  };
  const g = google();
  expect(
    createGoogleMailClient(f.env, context, g.request, policy),
  ).toBeUndefined();
  await policy.configure({
    feature: "mail",
    scope: "guild",
    targetId: guildId,
    action: "enable",
    allowRoleIds: [role],
    denyRoleIds: [denied],
  });
  const client = createGoogleMailClient(f.env, context, g.request, policy)!;
  expect(await client.call("list_mail_accounts", {})).toMatchObject({
    status: "complete",
    accounts: [
      { account: mailbox, connected: true },
      { account: second, connected: false },
    ],
  });
  roles = [role, denied];
  expect(await client.call("list_mail_accounts", {})).toEqual({
    status: "forbidden",
  });
  roles = [];
  expect(await client.call("list_mail_accounts", {})).toEqual({
    status: "forbidden",
  });
  roles = [role];
  memberUnavailable = true;
  expect(await client.call("list_mail_accounts", {})).toEqual({
    status: "forbidden",
  });
  memberUnavailable = false;
  await policy.configure({
    feature: "mail",
    scope: "channel",
    targetId: channelId,
    action: "disable",
  });
  expect(await client.call("list_mail_accounts", {})).toEqual({
    status: "forbidden",
  });
  await policy.configure({
    feature: "mail",
    scope: "channel",
    targetId: channelId,
    action: "enable",
    allowRoleIds: [role],
  });
  expect(await client.call("list_mail_accounts", {})).toMatchObject({
    status: "complete",
  });
  expect(
    createGoogleMailClient(
      f.env,
      { ...context, streamReply: true },
      g.request,
      policy,
    ),
  ).toBeUndefined();
  expect(
    createGoogleMailClient(
      f.env,
      { ...context, guildId: undefined },
      g.request,
      policy,
    ),
  ).toBeUndefined();
  expect(
    createGoogleMailClient(
      f.env,
      { ...context, requesterId: "owner", guildId: undefined },
      g.request,
      policy,
    ),
  ).toBeDefined();
  await policy.configure({
    feature: "mail",
    scope: "channel",
    targetId: channelId,
    action: "inherit",
  });
  await policy.configure({
    feature: "mail",
    scope: "guild",
    targetId: guildId,
    action: "disable",
  });
  expect(await client.call("list_mail_accounts", {})).toEqual({
    status: "forbidden",
  });
  expect(g.calls).toHaveLength(0);
  f.store.close();
});

test("mail registration revoked during a Google read withholds message contents", async () => {
  const f = fixture();
  connect(f);
  const policy = new FeatureAvailabilityStore(
    join(f.settings.storePath, "..", "features.json"),
    {},
  );
  const guildId = "1394943277836402779";
  await policy.configure({
    feature: "mail",
    scope: "guild",
    targetId: guildId,
    action: "enable",
  });
  const request = (async (url, init) => {
    if (String(url).includes("/messages/")) {
      await policy.configure({
        feature: "mail",
        scope: "guild",
        targetId: guildId,
        action: "disable",
      });
      return json({
        id: "abcdef123456",
        payload: {
          mimeType: "text/plain",
          body: { data: Buffer.from("private message").toString("base64url") },
        },
      });
    }
    return google().request(url, init);
  }) as typeof fetch;
  const client = createGoogleMailClient(
    f.env,
    {
      requesterId: "member",
      ownerId: "owner",
      guildId,
      roleIds: [],
      resolveRoleIds: async () => [],
    },
    request,
    policy,
  )!;
  const result = await client.call("read_mail", {
    account: mailbox,
    messageId: "abcdef123456",
  });
  expect(result).toEqual({ status: "forbidden" });
  expect(JSON.stringify(result)).not.toContain("private message");
  f.store.close();
});
