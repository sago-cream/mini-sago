# discord-mail

discord-mail lets Sago search and read multiple approved Gmail mailboxes. Each
mailbox owner grants their own read-only Google authorization. Tools are available
only to `MINISAGO_CHATBOT_OWNER_USER_ID` in their private text conversation with
Sago. Guild channels, other requesters, and voice sessions receive no mail tools.
The consent page explains that access is for the bot operator; mailbox consent
does not grant other Discord members access.

## Google Cloud setup

Use display name **discord-mail**, project ID **nthusa-discord-mail**, and
organization **nthusa.tw**, consistent with discord-drive and discord-calendar.
Project administrators control its OAuth client. Mailbox owners retain control
of their Google accounts and can revoke Sago's grant independently.

1. Create the project with an account that has Project Creator in nthusa.tw.
   Enable **Gmail API**. No service account or domain-wide delegation is needed.
2. Under **Google Auth Platform → Branding**, use app name **discord-mail**,
   homepage `https://bot.hsichen.dev/mail`, privacy policy
   `https://bot.hsichen.dev/mail/privacy`, and contact `admin@nthusa.tw`. Select
   an available verified support email.
3. Choose **External** audience: `gapp.nthu.edu.tw` accounts belong to the
   university's organization, rather than nthusa.tw. For testing, add
   `nthusc@gapp.nthu.edu.tw` as a test user. External apps in Testing have
   seven-day grants, including refresh tokens. For a long-running handoff, use
   Production subject to Google's verification requirements.
4. Under **Data Access**, register `openid`, `email`, and
   `https://www.googleapis.com/auth/gmail.readonly`. Do not request modify,
   compose, send, or full `mail.google.com` permissions. Read-only covers the
   entire mailbox; Sago adds `in:inbox` for inbox-specific searches.
5. Create a **Web application** OAuth client named **discord-mail** and register
   the exact redirect URI `https://bot.hsichen.dev/mail/oauth/callback`. The
   hosted flow needs a Web client rather than the Calendar Desktop client.
   Select **Use this client for an AI-powered agent**, since Sago uses MCP tools.
   No browser JavaScript origin is needed.
6. Store its client ID and secret on the core host. Deploy the `/mail` pages and
   callback before inviting the owner. Verify that the published policy describes
   the deployed data handling and intended operator access.

Gmail read-only is a restricted scope. Verification and assessment requirements
depend on the use case and applicable exceptions; association use should not be
assumed to qualify as personal use. University policy may require a Workspace
administrator to allow the client. Neither Production status nor test-user
registration overrides that restriction.

References: [Web server OAuth](https://developers.google.com/identity/protocols/oauth2/web-server),
[Gmail scopes](https://developers.google.com/workspace/gmail/api/auth/scopes),
[audience and token lifetime](https://support.google.com/cloud/answer/15549945),
[restricted scope verification](https://developers.google.com/identity/protocols/oauth2/production-readiness/restricted-scope-verification).

## Host configuration

Set these only in the core host's secret environment, never in worker jobs,
worker environment files, source control, or Discord:

| Variable                       | Value                                                                                                       |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| `MINISAGO_MAIL_ORIGIN`         | Public HTTPS origin, e.g. `https://bot.hsichen.dev`                                                         |
| `MINISAGO_MAIL_CLIENT_ID`      | Dedicated Web client ID; absence disables connections/tools                                                 |
| `MINISAGO_MAIL_CLIENT_SECRET`  | Its client secret                                                                                           |
| `MINISAGO_MAIL_ACCOUNTS`       | Comma-separated approved addresses, initially `nthusc@gapp.nthu.edu.tw`; up to 20                           |
| `MINISAGO_MAIL_ENCRYPTION_KEY` | Persistent 32-byte key, base64 encoded                                                                      |
| `MINISAGO_MAIL_STORE_PATH`     | Host-only SQLite file; local default `.data/mail/access.sqlite`; production `/app/state/mail/access.sqlite` |

Generate the key once with `openssl rand -base64 32` and keep it in the host's
secret manager. Preserve it across restarts and recovery; replacing it makes
stored grants unreadable. The store uses AES-256-GCM with credentials bound to
their account and OAuth client. Its directory is mode 700 and database mode 600.
Changing OAuth client IDs requires new grants.

On Sago Cloud, store secrets in `/srv/sago-cloud/secrets/bot-core.env` and the
database in the persistent core state volume. Never mount it in AI workers.
Back up the encrypted database with SQLite's backup API while running, or copy
it while core is stopped. Keep the encryption key and client secret in
Vaultwarden separately. This credential database is outside the ordinary
`minisago-state` JSON/Markdown allowlist: do not add decrypted tokens, pending
OAuth sessions, or mailbox content to Git backups.

## Invite the owner

Run on core with the same environment and persistent store as the running
service. In a local checkout, load the secret environment with Bun's
`--env-file` option. In the core container, use
`docker compose exec <core-service> bun scripts/mail-access.ts ...`.

```sh
bun scripts/mail-access.ts invite nthusc@gapp.nthu.edu.tw
```

This prints a private HTTPS invitation valid for 72 hours. An optional third
argument sets 1–168 hours. New invitations replace pending invitations for that
mailbox without disconnecting an existing grant. Send the printed link privately
to its owner. They only need to open it, select **Continue with Google**, sign in
as the shown address, and approve read-only access.

The callback validates browser-bound state, PKCE, exact read-only scopes, verified
Google identity, and Gmail mailbox identity before saving a refresh token.
Opening a link or link preview does not start OAuth. Successful approval consumes
the invitation; failed or cancelled attempts can restart until invitation expiry.
The 15-minute OAuth flow survives core restarts. Starting in another browser
requires reopening the invitation and starting a new flow.

Owner handoff text:

> Please open this private discord-mail invitation and choose Continue with
> Google. Sign in as nthusc@gapp.nthu.edu.tw and allow read-only Gmail access.
> This lets Sago search and summarize your mailbox for its operator in their
> private Discord conversation, with relevant text processed by OpenAI. It cannot
> send, delete, or change mail. You can revoke discord-mail in Google Account
> connections at any time. Tell us when the page says your mailbox is connected.

## Read and disconnect

Ask Sago in your private Discord conversation to list connected accounts, search
one mailbox, or search all approved connected mailboxes. Example: “Search
nthusc@gapp.nthu.edu.tw for unread inbox messages about next week's meeting.”
Tools are `list_mail_accounts`, `search_mail`, and `read_mail`. Results identify
the source account. Reads return bounded plain text and attachment names;
attachment downloads and mailbox mutations are absent.

```sh
bun scripts/mail-access.ts status
bun scripts/mail-access.ts disconnect nthusc@gapp.nthu.edu.tw
```

Status never prints credentials. Disconnect removes the local encrypted grant
and pending invitations/flows. The owner can additionally revoke **discord-mail**
in [Google Account connections](https://myaccount.google.com/connections).
Removing an address from `MINISAGO_MAIL_ACCOUNTS` disables its reads and approval;
also remove the stored grant when retiring the account.

Configure the HTTPS proxy to omit query strings and request bodies on
`/mail/connect`, `/mail/oauth/start`, and `/mail/oauth/callback`: they carry
invitations or authorization codes. Pages use no third-party assets, origin-only referrers,
no-store, and a restrictive CSP. Mail is fetched on demand without a local inbox
archive, but results may remain in worker traces for up to 14 days and in Discord.
