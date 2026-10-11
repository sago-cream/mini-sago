import { z } from "zod";

export const GMAIL_READ_SCOPE =
  "https://www.googleapis.com/auth/gmail.readonly";
export const MAIL_SCOPES = ["openid", "email", GMAIL_READ_SCOPE];
export const MAIL_CALLBACK_PATH = "/mail/oauth/callback";
const settingsSchema = z.object({
  origin: z.url().refine((value) => {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash
    );
  }, "Use an HTTPS origin without a path."),
  clientId: z.string().trim().min(1),
  clientSecret: z.string().trim().min(1),
  accounts: z
    .array(z.email().transform((email) => email.toLowerCase()))
    .min(1)
    .max(20),
  storePath: z.string().min(1),
  encryptionKey: z.string().regex(/^[A-Za-z0-9+/]{43}=$/u),
});

export function mailSettings(env: Record<string, string | undefined>) {
  if (!env.MINISAGO_MAIL_CLIENT_ID) return undefined;
  const parsed = settingsSchema.safeParse({
    origin: env.MINISAGO_MAIL_ORIGIN,
    clientId: env.MINISAGO_MAIL_CLIENT_ID,
    clientSecret: env.MINISAGO_MAIL_CLIENT_SECRET,
    accounts: (env.MINISAGO_MAIL_ACCOUNTS ?? "")
      .split(",")
      .map((email) => email.trim())
      .filter(Boolean),
    storePath: env.MINISAGO_MAIL_STORE_PATH || ".data/mail/access.sqlite",
    encryptionKey: env.MINISAGO_MAIL_ENCRYPTION_KEY,
  });
  if (!parsed.success)
    throw new Error(
      "Invalid discord-mail configuration. Check MINISAGO_MAIL_* settings.",
    );
  return { ...parsed.data, origin: new URL(parsed.data.origin).origin };
}
export type MailSettings = NonNullable<ReturnType<typeof mailSettings>>;
