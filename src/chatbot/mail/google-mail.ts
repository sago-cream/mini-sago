import { featureDefinition } from "../../discord/features";
import { createFeatureAccess } from "../../discord/feature-access";
import { z } from "zod";
import { googleMailJson, isReadOnlyMailGrant } from "./mail-auth";
import { mailSettings } from "./mail-settings";
import { MailStore } from "./mail-store";
import {
  getFeatureAvailabilityStore,
  type FeatureAvailabilityStore,
  type FeatureContext,
} from "../../discord/feature-availability";

const account = z.email().transform((email) => email.toLowerCase());
const messageId = z.string().regex(/^[a-fA-F0-9]{8,64}$/u);
export const mailSchemas = {
  list_mail_accounts: z.object({}).strict(),
  search_mail: z
    .object({
      account: z.union([account, z.literal("all")]),
      query: z.string().trim().min(1).max(500),
      limit: z.number().int().min(1).max(20).default(10),
      pageToken: z.string().min(1).max(2048).optional(),
    })
    .strict(),
  read_mail: z
    .object({
      account,
      messageId,
      offset: z.number().int().min(0).max(100_000).default(0),
      limit: z.number().int().min(1).max(16_000).default(12_000),
    })
    .strict(),
};
export type MailToolName = keyof typeof mailSchemas;
export const mailContextDescription =
  featureDefinition("mail").capability?.description ??
  featureDefinition("mail").description;
export const mailDescriptions: Record<MailToolName, string> = {
  list_mail_accounts:
    "List configured mailboxes and whether their owners have connected them. Credentials are never returned. " +
    mailContextDescription,
  search_mail:
    "Search a selected mailbox or all connected approved mailboxes using Gmail search syntax. For inbox-only search include in:inbox. Results contain bounded headers and snippets; read_mail retrieves the message text. With account=all, each mailbox has a separate result and nextPageToken; paginate a mailbox by its exact account, never with all. " +
    mailContextDescription,
  read_mail:
    "Read bounded message text from one approved mailbox by account and messageId returned by search_mail. Follow nextOffset for more text; truncated indicates the 100,000-character source cap. HTML fallback returns plain text, never active HTML; attachments are listed by name but cannot be downloaded. Cite account, subject and date. " +
    mailContextDescription,
};
type Part = {
  mimeType?: string;
  filename?: string;
  headers?: { name: string; value: string }[];
  body?: { data?: string; attachmentId?: string; size?: number };
  parts?: Part[];
};
type Message = {
  id: string;
  threadId?: string;
  snippet?: string;
  internalDate?: string;
  payload?: Part;
};
const header = (message: Message, name: string) =>
  message.payload?.headers
    ?.find((h) => h.name.toLowerCase() === name)
    ?.value.slice(0, 1000) ?? "";
const summary = (email: string, message: Message) => ({
  account: email,
  messageId: message.id,
  threadId: message.threadId,
  subject: header(message, "subject"),
  from: header(message, "from"),
  to: header(message, "to"),
  date: header(message, "date"),
  snippet: message.snippet?.slice(0, 500) ?? "",
});
export function mailMessageText(payload?: Part) {
  const plain: string[] = [],
    html: string[] = [],
    attachments: { filename: string; mimeType?: string; size?: number }[] = [];
  let parts = 0;
  function walk(part?: Part) {
    if (!part || ++parts > 100) return;
    if (part.filename) {
      attachments.push({
        filename: part.filename.slice(0, 500),
        mimeType: part.mimeType,
        size: part.body?.size,
      });
      return;
    }
    if (
      part.body?.data &&
      (part.mimeType === "text/plain" || part.mimeType === "text/html")
    ) {
      const type =
        part.headers?.find((h) => h.name.toLowerCase() === "content-type")
          ?.value ?? "";
      const charset =
        type.match(/charset\s*=\s*["']?([^\s;"']+)/iu)?.[1] ?? "utf-8";
      const bytes = Buffer.from(part.body.data, "base64url");
      let text: string;
      try {
        text = new TextDecoder(charset).decode(bytes);
      } catch {
        text = bytes.toString("utf8");
      }
      (part.mimeType === "text/plain" ? plain : html).push(text);
    }
    for (const child of part.parts ?? []) walk(child);
  }
  walk(payload);
  const text = plain.length
    ? plain.join("\n\n")
    : html
        .join("\n\n")
        .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, "")
        .replace(/<\s*(br|\/p|\/div|\/tr)\b[^>]*>/giu, "\n")
        .replace(/<[^>]*>/gu, "")
        .replace(
          /&(?:nbsp|amp|lt|gt|quot|apos);/gu,
          (entity) =>
            ({
              "&nbsp;": " ",
              "&amp;": "&",
              "&lt;": "<",
              "&gt;": ">",
              "&quot;": '"',
              "&apos;": "'",
            })[entity]!,
        );
  return {
    text: text.slice(0, 100_000),
    truncated: text.length > 100_000 || parts > 100,
    attachments: attachments.slice(0, 30),
    format: plain.length ? "plain" : "html_as_text",
  };
}

export function createGoogleMailClient(
  env: Record<string, string | undefined>,
  context: FeatureContext & {
    requesterId: string;
    ownerId: string;
    streamReply?: boolean;
    resolveRoleIds?: () => Promise<readonly string[]>;
  },
  requestGoogle: typeof fetch = fetch,
  availability: Pick<
    FeatureAvailabilityStore,
    "isEnabled"
  > = getFeatureAvailabilityStore(),
) {
  const access = createFeatureAccess("mail", context, availability);
  if (!access.available()) return undefined;
  const allowed = access.allowed;
  try {
    if (!mailSettings(env)) return undefined;
  } catch {
    return undefined;
  }
  return {
    async call(
      name: MailToolName,
      raw: unknown,
    ): Promise<Record<string, unknown>> {
      if (!(await allowed())) return { status: "forbidden" };
      const input = mailSchemas[name].parse(raw);
      let store: MailStore | undefined;
      try {
        const settings = mailSettings(env);
        if (!settings) return { status: "unavailable" };
        store = new MailStore(settings);
        if (name === "list_mail_accounts")
          return {
            status: "complete",
            accounts: store.accounts().map(({ email, connectedAt }) => ({
              account: email,
              connected: connectedAt !== null,
              connectedAt,
            })),
          };
        const params = input as
          | z.infer<typeof mailSchemas.search_mail>
          | z.infer<typeof mailSchemas.read_mail>;
        const accounts =
          params.account === "all"
            ? settings.accounts.filter((email) => store!.credential(email))
            : [params.account];
        if (accounts.some((email) => !settings.accounts.includes(email)))
          return { status: "forbidden" };
        if (!accounts.length) return { status: "not_connected" };
        if (
          params.account === "all" &&
          "pageToken" in params &&
          params.pageToken
        )
          return {
            status: "invalid_request",
            error: "Paginate one mailbox by its exact account.",
          };
        const results: Record<string, unknown>[] = [];
        for (const email of accounts) {
          const credential = store.credential(email);
          if (!credential) {
            results.push({ account: email, status: "not_connected" });
            continue;
          }
          if (!isReadOnlyMailGrant(credential.scope)) {
            results.push({ account: email, status: "reconnect_required" });
            continue;
          }
          try {
            const token = z
              .object({
                access_token: z.string().min(1),
                scope: z.string().optional(),
              })
              .parse(
                await googleMailJson(
                  requestGoogle,
                  "https://oauth2.googleapis.com/token",
                  {
                    method: "POST",
                    body: new URLSearchParams({
                      client_id: settings.clientId,
                      client_secret: settings.clientSecret,
                      refresh_token: credential.refreshToken,
                      grant_type: "refresh_token",
                    }),
                  },
                  16_384,
                ),
              );
            if (token.scope && !isReadOnlyMailGrant(token.scope))
              throw new Error("Unexpected Google mail grant.");
            const headers = { Authorization: `Bearer ${token.access_token}` };
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
            if (profile.emailAddress.toLowerCase() !== email)
              throw new Error("Google mail identity mismatch.");
            const stillConnected = async () =>
              (await allowed()) &&
              mailSettings(env)?.accounts.includes(email) &&
              store!.credential(email)?.refreshToken ===
                credential.refreshToken;
            if (!(await stillConnected()))
              throw new Error("Mailbox access was removed.");
            if (name === "search_mail") {
              const search = params as z.infer<typeof mailSchemas.search_mail>;
              const url = new URL(
                "https://gmail.googleapis.com/gmail/v1/users/me/messages",
              );
              url.search = new URLSearchParams({
                q: search.query,
                maxResults: String(Math.ceil(search.limit / accounts.length)),
                ...(search.pageToken ? { pageToken: search.pageToken } : {}),
              }).toString();
              const list = z
                .object({
                  messages: z
                    .array(z.object({ id: messageId }))
                    .max(20)
                    .optional(),
                  nextPageToken: z.string().max(2048).optional(),
                })
                .parse(
                  await googleMailJson(
                    requestGoogle,
                    url.toString(),
                    { headers },
                    65_536,
                  ),
                );
              const messages: ReturnType<typeof summary>[] = [];
              for (const item of list.messages ?? []) {
                const metadata = new URL(
                  `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.id}`,
                );
                metadata.searchParams.set("format", "metadata");
                for (const name of ["Subject", "From", "To", "Date"])
                  metadata.searchParams.append("metadataHeaders", name);
                const message = (await googleMailJson(
                  requestGoogle,
                  metadata.toString(),
                  { headers },
                  65_536,
                )) as Message;
                if (message.id !== item.id)
                  throw new Error("Google mail message mismatch.");
                messages.push(summary(email, message));
              }
              if (!(await stillConnected()))
                throw new Error("Mailbox access was removed.");
              results.push({
                account: email,
                status: "complete",
                messages,
                nextPageToken: list.nextPageToken,
              });
            } else {
              const read = params as z.infer<typeof mailSchemas.read_mail>;
              const message = (await googleMailJson(
                requestGoogle,
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${read.messageId}?format=full`,
                { headers },
              )) as Message;
              if (message.id !== read.messageId)
                throw new Error("Google mail message mismatch.");
              const body = mailMessageText(message.payload);
              const end = Math.min(read.offset + read.limit, body.text.length);
              if (!(await stillConnected()))
                throw new Error("Mailbox access was removed.");
              results.push({
                ...summary(email, message),
                status: "complete",
                text: body.text.slice(read.offset, end),
                format: body.format,
                attachments: body.attachments,
                totalCharacters: body.text.length,
                nextOffset: end < body.text.length ? end : undefined,
                truncated: body.truncated,
                untrustedContent: true,
              });
            }
          } catch {
            results.push({
              account: email,
              status: "unavailable",
              error:
                "Google mail access failed; check the grant or reconnect this mailbox.",
            });
          }
        }
        if (!(await allowed())) return { status: "forbidden" };
        return {
          status: results.every((result) => result.status === "complete")
            ? "complete"
            : "partial",
          results,
          untrustedContent: true,
        };
      } catch {
        return { status: "unavailable" };
      } finally {
        store?.close();
      }
    },
  };
}
export type GoogleMailClient = NonNullable<
  ReturnType<typeof createGoogleMailClient>
>;
