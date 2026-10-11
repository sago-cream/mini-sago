import { createHash } from "node:crypto";
import { z } from "zod";
import {
  GMAIL_READ_SCOPE,
  MAIL_CALLBACK_PATH,
  MAIL_SCOPES,
  mailSettings,
  type MailSettings,
} from "./mail-settings";
import { MailStore } from "./mail-store";
import {
  mailHeaders,
  mailInvitationPage,
  mailPage,
  mailPublicPage,
} from "./mail-pages";

const cookieName = "__Host-discord_mail";
const cookie = (value: string, age = 900) =>
  `${cookieName}=${value}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${age}`;
const tokenSchema = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  scope: z.string().min(1),
});
const allowedScopes = new Set([
  ...MAIL_SCOPES,
  "https://www.googleapis.com/auth/userinfo.email",
]);
export function isReadOnlyMailGrant(scope: string) {
  const granted = scope.split(/\s+/u).filter(Boolean);
  return (
    granted.includes(GMAIL_READ_SCOPE) &&
    granted.every((item) => allowedScopes.has(item))
  );
}
async function boundedBytes(
  body: ReadableStream<Uint8Array> | null,
  maxBytes: number,
) {
  const reader = body?.getReader();
  if (!reader) throw new Error("Google mail response is empty.");
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    if (size > maxBytes) {
      await reader.cancel();
      throw new Error("Google mail response is too large.");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}
export async function googleMailJson(
  request: typeof fetch,
  url: string,
  init: RequestInit,
  maxBytes = 1024 * 1024,
) {
  const response = await request(url, {
    ...init,
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) {
    await response.body?.cancel();
    throw new Error("Google mail request failed.");
  }
  return JSON.parse(
    (await boundedBytes(response.body, maxBytes)).toString(),
  ) as unknown;
}

export function createMailAuthHandler(
  settings: MailSettings | undefined,
  requestGoogle: typeof fetch = fetch,
) {
  return async (request: Request): Promise<Response> => {
    const url = new URL(request.url);
    if (!settings)
      return mailPage(
        "Connection unavailable",
        "<h1>Mail connection is not configured</h1><p>Ask the operator to finish discord-mail setup before connecting your mailbox.</p>",
        503,
      );
    const redirect = (location: string, setCookie?: string) =>
      new Response(null, {
        status: 303,
        headers: {
          ...mailHeaders,
          Location: location,
          ...(setCookie ? { "Set-Cookie": setCookie } : {}),
        },
      });
    const browser =
      request.headers
        .get("cookie")
        ?.split(";")
        .map((part) => part.trim())
        .find((part) => part.startsWith(`${cookieName}=`))
        ?.slice(cookieName.length + 1) ?? "";
    let store: MailStore | undefined;
    try {
      store = new MailStore(settings);
      if (url.pathname === "/mail/connected" && request.method === "GET") {
        if (!store.connectedBrowser(browser))
          return mailPage(
            "Connection status",
            "<h1>Check with the operator</h1><p>This browser has no recent connection confirmation. The operator can check whether your mailbox is connected.</p>",
            400,
          );
        return mailPage(
          "Connected",
          '<h1>Your mailbox is connected</h1><p>Read-only access has been saved. You can close this page and tell the operator you’ve finished.</p><p>You can revoke access at any time in <a href="https://myaccount.google.com/connections">Google Account connections</a>.</p>',
        );
      }
      if (
        url.pathname === "/mail/connect" &&
        (request.method === "GET" || request.method === "HEAD")
      ) {
        const token = url.searchParams.get("invite") ?? "";
        const invite = store.getInvite(token);
        if (!invite)
          return mailPage(
            "Invitation unavailable",
            "<h1>This invitation is unavailable</h1><p>It may have expired, already been used, or been replaced. Ask the operator for a new invitation.</p>",
            410,
          );
        const response = mailInvitationPage(
          invite.email,
          token,
          invite.expires,
        );
        return request.method === "HEAD"
          ? new Response(null, { headers: response.headers })
          : response;
      }
      if (url.pathname === "/mail/oauth/start" && request.method === "POST") {
        if (
          request.headers.get("origin") !== settings.origin ||
          request.headers.get("sec-fetch-site") === "cross-site"
        )
          return mailPage(
            "Invalid request",
            "<h1>Open your invitation directly</h1><p>Start the connection from the invitation page.</p>",
            403,
          );
        // Invitation forms are tiny. Bound input before parsing untrusted bytes.
        let text: string;
        try {
          text = (await boundedBytes(request.body, 256)).toString();
        } catch {
          return new Response(null, { status: 413, headers: mailHeaders });
        }
        const invite = store.getInvite(
          new URLSearchParams(text).get("invite") ?? "",
        );
        if (!invite)
          return mailPage(
            "Invitation unavailable",
            "<h1>This invitation is unavailable</h1><p>Ask the operator for a new invitation.</p>",
            410,
          );
        const flow = store.startFlow(invite);
        const google = new URL("https://accounts.google.com/o/oauth2/v2/auth");
        google.search = new URLSearchParams({
          client_id: settings.clientId,
          redirect_uri: `${settings.origin}${MAIL_CALLBACK_PATH}`,
          response_type: "code",
          scope: MAIL_SCOPES.join(" "),
          access_type: "offline",
          prompt: "consent select_account",
          include_granted_scopes: "false",
          login_hint: invite.email,
          state: flow.state,
          code_challenge: createHash("sha256")
            .update(flow.verifier)
            .digest("base64url"),
          code_challenge_method: "S256",
        }).toString();
        return redirect(google.toString(), cookie(flow.browser));
      }
      if (url.pathname === MAIL_CALLBACK_PATH && request.method === "GET") {
        const state = url.searchParams.get("state") ?? "";
        const flow = store.takeFlow(state, browser);
        const fail = (content: string, status = 400) => {
          const response = mailPage("Connection incomplete", content, status);
          response.headers.set("Set-Cookie", cookie("", 0));
          return response;
        };
        if (!flow)
          return fail(
            "<h1>This connection attempt has expired</h1><p>Reopen your invitation in the same browser and try again.</p>",
          );
        if (url.searchParams.has("error"))
          return fail(
            "<h1>Access was not granted</h1><p>You can reopen the invitation to try again. If Google says the app is blocked by your administrator, ask the university’s Workspace administrator to allow discord-mail.</p>",
          );
        const code = url.searchParams.get("code");
        if (!code || code.length > 4096)
          return fail(
            "<h1>Google did not return an authorization code</h1><p>Reopen your invitation and try again.</p>",
          );
        const token = tokenSchema.parse(
          await googleMailJson(
            requestGoogle,
            "https://oauth2.googleapis.com/token",
            {
              method: "POST",
              body: new URLSearchParams({
                client_id: settings.clientId,
                client_secret: settings.clientSecret,
                code,
                code_verifier: flow.verifier,
                redirect_uri: `${settings.origin}${MAIL_CALLBACK_PATH}`,
                grant_type: "authorization_code",
              }),
            },
            16_384,
          ),
        );
        if (!isReadOnlyMailGrant(token.scope))
          return fail(
            "<h1>Read-only permission is required</h1><p>The returned permissions do not match this connection. Reopen your invitation and approve read-only Gmail access.</p>",
          );
        const headers = { Authorization: `Bearer ${token.access_token}` };
        const identity = z
          .object({ email: z.email(), email_verified: z.literal(true) })
          .parse(
            await googleMailJson(
              requestGoogle,
              "https://openidconnect.googleapis.com/v1/userinfo",
              { headers },
              16_384,
            ),
          );
        const profile = z
          .object({ emailAddress: z.email() })
          .parse(
            await googleMailJson(
              requestGoogle,
              "https://gmail.googleapis.com/gmail/v1/users/me/profile",
              { headers },
              16_384,
            ),
          );
        if (
          identity.email.toLowerCase() !== flow.email ||
          profile.emailAddress.toLowerCase() !== flow.email
        )
          return fail(
            "<h1>Choose the account on your invitation</h1><p>The Google account you selected does not match the invited mailbox. Reopen your invitation and choose the invited account.</p>",
          );
        store.connect(flow, {
          refreshToken: token.refresh_token,
          scope: token.scope,
          connectedAt: Date.now(),
        });
        return redirect("/mail/connected", cookie(browser, 300));
      }
      return new Response(null, {
        status: request.method === "GET" ? 404 : 405,
        headers: mailHeaders,
      });
    } catch {
      // Never render Google responses, authorization codes, or credential values.
      const response = mailPage(
        "Connection incomplete",
        "<h1>The connection could not be completed</h1><p>No new mailbox connection was saved. Reopen your invitation to try again, or contact the operator.</p>",
        502,
      );
      response.headers.set("Set-Cookie", cookie("", 0));
      return response;
    } finally {
      store?.close();
    }
  };
}

let handler: ReturnType<typeof createMailAuthHandler> | undefined;
export function handleMailRequest(
  request: Request,
): Promise<Response> | Response | undefined {
  const path = new URL(request.url).pathname;
  if (path !== "/mail" && !path.startsWith("/mail/")) return undefined;
  const page = mailPublicPage(path);
  if (page) {
    if (request.method !== "GET" && request.method !== "HEAD")
      return new Response(null, {
        status: 405,
        headers: { ...mailHeaders, Allow: "GET, HEAD" },
      });
    return request.method === "HEAD"
      ? new Response(null, { headers: page.headers })
      : page;
  }
  try {
    handler ??= createMailAuthHandler(mailSettings(process.env));
    return handler(request);
  } catch {
    return mailPage(
      "Connection unavailable",
      "<h1>Mail connection is not configured</h1><p>Ask the operator to check discord-mail setup.</p>",
      503,
    );
  }
}
