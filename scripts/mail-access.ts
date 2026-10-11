import { mailSettings } from "../src/chatbot/mail/mail-settings";
import { MailStore } from "../src/chatbot/mail/mail-store";

const [action, address, lifetime] = process.argv.slice(2);
if (
  !["invite", "status", "disconnect"].includes(action ?? "") ||
  (action !== "status" && !address)
) {
  console.error(
    "Usage: bun scripts/mail-access.ts invite EMAIL [HOURS]\n       bun scripts/mail-access.ts status\n       bun scripts/mail-access.ts disconnect EMAIL",
  );
  process.exit(1);
}
const settings = mailSettings(process.env);
if (!settings)
  throw new Error("Configure MINISAGO_MAIL_* on the Sago host first.");
const store = new MailStore(settings);
try {
  if (action === "invite") {
    const invite = store.invite(address!, lifetime ? Number(lifetime) : 72);
    const url = new URL("/mail/connect", settings.origin);
    url.searchParams.set("invite", invite.token);
    console.log(
      `Mailbox: ${invite.email}\nExpires: ${new Date(invite.expires).toISOString()}\nSend this private link to the mailbox owner:\n${url}`,
    );
  } else if (action === "status") {
    for (const item of store.accounts())
      console.log(
        `${item.email}: ${item.connectedAt ? `connected ${new Date(item.connectedAt).toISOString()}` : "not connected"}`,
      );
  } else {
    if (!settings.accounts.includes(address!.toLowerCase()))
      throw new Error("Mailbox is not configured.");
    store.disconnect(address!.toLowerCase());
    console.log(
      "Local connection and pending invitations removed. The mailbox owner can also revoke discord-mail in Google Account connections.",
    );
  }
} finally {
  store.close();
}
