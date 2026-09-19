# Configuration

The checked-in environment examples are the mechanical source of truth:

- `.env.example` for local development and the Mac helper;
- `.env.production.example` for the hosted Discord service; and
- `.env.worker.example` for the headless Oracle worker.

Image and installer defaults live in `Dockerfile.worker` and
`scripts/worker.mjs`. This reference explains each setting; setup procedures
live in [Discord setup](discord-setup.md) and [Workers](workers.md).

## Hosted service

| Name                                   | Required  | Purpose                                                 |
| -------------------------------------- | --------- | ------------------------------------------------------- |
| `DISCORD_APPLICATION_ID`               | Yes       | Discord application ID                                  |
| `DISCORD_BOT_TOKEN`                    | Yes       | Discord REST and Gateway authentication                 |
| `DISCORD_GUILD_ID`                     | No        | Guild for configured-guild features; defaults to WM31   |
| `DISCORD_GATEWAY_DISABLED`             | No        | Use `true` for HTTP-only instances                      |
| `MINISAGO_CHATBOT_OWNER_USER_ID`       | Yes       | Sole owner of privileged routing and mutations          |
| `MINISAGO_CHATBOT_GUILD_IDS`           | No        | Comma-separated guilds whose members may use chat       |
| `MINISAGO_CHATBOT_CHANNEL_IDS`         | No        | Comma-separated channel exceptions                      |
| `MINISAGO_CHATBOT_ROLE_IDS`            | No        | Comma-separated roles that may mention the chatbot      |
| `MINISAGO_AMBIENT_REACTIONS_ENABLED`   | No        | Enable occasional ambient reactions                     |
| `MINISAGO_AMBIENT_ATTENTION_CHANCE`    | No        | Chance from 0 to 1 that a burst schedules evaluation    |
| `MINISAGO_AMBIENT_MAX_CHECKS_PER_HOUR` | No        | Hourly ambient model-call ceiling; defaults to 4        |
| `MINISAGO_REMINDER_STATE_FILE`         | No        | Persistent reminder state                               |
| `MINISAGO_GUILD_MEMORY_DIRECTORY`      | No        | Per-server Markdown memory and local Git history        |
| `MINISAGO_FEATURE_AVAILABILITY_FILE`   | No        | Persistent guild and channel feature policy             |
| `MINISAGO_SERVICE_SUBSCRIPTIONS_FILE`  | No        | Persistent background-service destinations              |
| `MINISAGO_TRIP_WORKSPACE_URL`          | No        | Kyushu workspace API; defaults to the shared planner    |
| `MINISAGO_TRIP_WORKSPACE_TOKEN`        | No        | Dedicated token enabling guild-bound itinerary edits    |
| `MINISAGO_MAC_BRIDGE_SECRET`           | Chatbot   | Authenticate the fixed Mac worker profile               |
| `MINISAGO_WORKER_BRIDGE_SECRET`        | Chatbot   | Authenticate the fixed Oracle worker profile            |
| `GITHUB_WEBHOOK_SECRET`                | PR bridge | Verify GitHub's `X-Hub-Signature-256`                   |
| `GITHUB_PR_THREAD_CHANNEL_ID`          | No        | Discord destination for PR review threads               |
| `GITHUB_PR_THREAD_STATE_FILE`          | No        | Persistent PR-to-thread mapping                         |
| `TOEFL_VOCAB_CHANNEL_ID`               | No        | Vocabulary destination; blank disables posting          |
| `TOEFL_VOCAB_TIME`                     | No        | Local `HH:MM` posting time                              |
| `TOEFL_VOCAB_TIMEZONE`                 | No        | IANA timezone for vocabulary posting                    |
| `TOEFL_VOCAB_STATE_FILE`               | No        | Persistent daily-send state                             |
| `GAMER_FORUM_*`                        | No        | Forum source, destination, schedule, reader, and state  |
| `THREADS_SEARCH_READER_BASE_URL`       | No        | Reader URL for on-demand Threads MCP searches           |
| `X_POST_*`                             | No        | X feed source, destination, polling interval, and state |

See `.env.production.example` for production state paths and the complete
scheduled-monitor variable names.

The X monitor keeps the configurable primary pipe and also reposts
`@thsottiaux` to Discord channel `1515569479541854218` and
`@hololive_dreams` to channel `1290252977621176361`. Each additional pipe
stores an isolated checkpoint beside `X_POST_STATE_FILE` and validates its
destination guild independently. The `@hololive_dreams` pipe only forwards
posts authored by that official account and ignores posts it retweets.

The `search_threads` MCP tool reads public Recent search pages through Jina
Reader only when the requester asks to search Threads. It searches `清大`,
`NTHU`, and `學生會` by default; `additionalKeywords` adds up to ten keywords
for the current request. Mentioning the bot with `海巡脆` searches the defaults;
`海巡脆 加上校慶` also searches `校慶`. Results include post text, authors, source links,
matched queries, and any per-query errors. It does not poll or repost.

## Workers

| Name                                      | Required | Purpose                                                 |
| ----------------------------------------- | -------- | ------------------------------------------------------- |
| `MINISAGO_BRIDGE_URL`                     | No       | Hosted WebSocket URL; plain `ws://` is local-only       |
| `MINISAGO_MCP_URL`                        | No       | MCP endpoint; derived from the bridge origin by default |
| `MINISAGO_MAC_BRIDGE_SECRET`              | Yes      | Profile secret matching the hosted service              |
| `MINISAGO_MAC_FILE_ROOTS`                 | No       | Colon-separated roots for owner Mac file requests       |
| `MINISAGO_CODEX_PATH`                     | No       | Codex executable                                        |
| `MINISAGO_CODEX_HOME`                     | No       | Isolated Codex state                                    |
| `MINISAGO_DEPLOY_SOCKET`                  | No       | Bounded host deployment socket exposed to Oracle        |
| `MINISAGO_DEPLOY_STATUS_FILE`             | Core     | Read-only detached deployment status                    |
| `MINISAGO_DEPLOY_NOTIFICATION_STATE_FILE` | Core     | Delivery checkpoint for deployment results              |
| `MINISAGO_SESSION_MONITOR_PATH`           | Mac      | Compiled macOS lock monitor                             |
| `MINISAGO_TRACE_DATABASE_PATH`            | No       | Local response-trace database                           |
| `MINISAGO_WORKSPACE_ROOT`                 | Dev      | Parent of disposable repository worktrees               |
| `MINISAGO_MAX_CONCURRENT_JOBS`            | No       | Capacity advertised to the bridge, from 1 to 16         |
| `MINISAGO_SANDBOX_URL`                    | Linux    | Internal request-local computation broker URL           |
| `MINISAGO_HEADLESS`                       | Linux    | Keep a worker connected without a session monitor       |
| `MINISAGO_WORKER_ID`                      | No       | Stable worker identity                                  |
| `MINISAGO_CHATBOT_REPOSITORY`             | No       | Repository that owns chatbot behavior                   |
| `MINISAGO_CHATBOT_OWNER_USER_ID`          | Yes      | Same owner ID as the hosted service                     |
| `MINISAGO_GITHUB_CONFIG_DIR`              | Dev      | Dedicated GitHub CLI state                              |
| `MINISAGO_GITHUB_WORKTREE_ROOT`           | No       | Disposable per-job checkout root                        |

Worker URLs must use TLS outside local or container-local hosts. Bridge secrets
must contain at least 32 bytes. The owner ID is validated as a Discord snowflake
on both sides.

The prompt harness has one production path rather than a runtime rollout flag.
Its authority layers and context budgets are versioned in code, covered by
tests, and rolled back through the corresponding atomic Git commit if needed.

Workers discover repositories from their dedicated GitHub CLI login at startup.
Set `MINISAGO_CHATBOT_REPOSITORY` when that login can access multiple repositories
so requests to change MiniSago itself do not rely on name inference.

## Persistent state

Production state must live under `/app/state` on the persistent
`sago_cloud_bot-core-state` volume. Configure:

- `GITHUB_PR_THREAD_STATE_FILE`
- `TOEFL_VOCAB_STATE_FILE`
- `GAMER_FORUM_STATE_FILE`
- `X_POST_STATE_FILE`
- `MINISAGO_REMINDER_STATE_FILE`
- `MINISAGO_GUILD_MEMORY_DIRECTORY`
- `MINISAGO_FEATURE_AVAILABILITY_FILE`
- `MINISAGO_SERVICE_SUBSCRIPTIONS_FILE`

Do not place these files on the container's ephemeral filesystem.

Server memory defaults to `.data/guild-memory` outside production. The
directory is an independent local-only Git repository with no configured
remote. Its files and Git history must never be committed to the application
repository. Each guild file is capped at 4,000 characters.

Production recovery uses a separate private `minisago-state` repository. Its
backup job reads memory and history without adding a remote to the live memory
repository. See [backup and restore](operations.md#durable-state-backup-and-restore).

Feature availability defaults to `/app/state/feature-availability.json` in
production and `.data/feature-availability.json` elsewhere. On the first
change, MiniSago writes a complete policy initialized from the existing chatbot
environment lists and built-in behavior. After that, the file is the source of
truth. An owner can ask MiniSago to list, enable, disable, or restore inherited
availability for a feature in an exact server or channel. Channel rules
override server rules, and server rules override the feature default. The
scoped features are chatbot access, ambient reactions, and the trip
planner. Always-on capabilities do not appear in this policy.

Background-service subscriptions default to
`.data/service-subscriptions.json`. The initial destination list comes from the
existing Gamer Forum, X repost, and TOEFL settings. After the owner changes a
subscription, the file becomes the source of truth. MiniSago can list the
services and their clickable Discord channel mentions, then subscribe or
unsubscribe an exact channel without a deployment. Running jobs read the list
on every scheduled check, so changes apply without restarting the service.

## Current deployment-specific defaults

The repository still contains these Hsi-specific defaults:

- configured-guild fallback `1282936453134815275`; and
- PR review repository and reviewer mapping for `sago-cream/health-check-system`.

Feature coverage and scheduled feed destinations no longer need source changes.
Feed sources, schedules, and checkpoint settings remain deployment
configuration. The PR review mapping remains deployment-specific code.

## NTHUSA calendar

MiniSago exposes `list_calendar_events`, `get_calendar_event`,
`create_calendar_event`, and `edit_calendar_event` to all chatbot users in guild
`1514899496797212683`. Tools are absent from other guilds and DMs. The host binds
Google requests to 學生會辦空間登記
(`c_14bf5641071c6089c46061dda50e795027b7bd66885861a4f6d0a72a68cd3703@group.calendar.google.com`)
and uses `Asia/Taipei`. Existing chatbot access policy still applies.

The booking identity is `nthusa@gapp.nthu.edu.tw`, authorized through the
`discord-calendar` Desktop OAuth client in project `nthusa-discord-calendar`.
It needs event-edit permission on the shared calendar. The host verifies its
Google email before using a token and requests `openid`, `email`, and
`https://www.googleapis.com/auth/calendar.events`. It does not impersonate an
administrator or use domain-wide delegation.

Set `MINISAGO_GOOGLE_CALENDAR_OAUTH_JSON` in
`/srv/sago-cloud/secrets/bot-core.env` to one-line JSON containing `client_id`,
`client_secret`, and `refresh_token`. Keep the full recovery JSON in Vaultwarden
(`safe.nthusa.tw`), entry **discord-calendar**, and verify that the saved copy can
be restored. Recreate the host container after updating credentials. Never put
credentials in the worker environment, source code, logs, or Discord messages.
Malformed OAuth credentials fail closed; the host does not silently switch
identities.

For initial authorization or recovery, set the OAuth audience to External and
publishing status to Production before authorizing the account. External Testing
mode expires calendar authorizations after seven days. The app information and
privacy URLs are `https://bot.hsichen.dev/calendar` and
`https://bot.hsichen.dev/calendar/privacy`. Download the Desktop client JSON from
Google Cloud and run on a trusted local computer:

```sh
bun scripts/calendar-authorize.mjs /path/to/client.json /path/to/calendar-oauth.json
```

Open the printed Google authorization URL and select `nthusa@gapp.nthu.edu.tw`.
The script uses a temporary loopback listener, state, and PKCE, checks the account
and granted scope, and writes a private recovery file without printing tokens.
Back it up in Vaultwarden before installing it on the host. A returned
`refresh_token_expires_in` needs investigation before production deployment.
Production removes the Testing-specific seven-day expiry; account policies and
revocation can still require reauthorization.

When OAuth is absent, `MINISAGO_GOOGLE_CALENDAR_SERVICE_ACCOUNT_JSON` supports
bookings without adding guests using
`discord-calendar@nthusa-discord-calendar.iam.gserviceaccount.com`. This mode
uses a fixed service-account identity with no project IAM roles or delegation.
After a verified OAuth migration, remove that environment value and revoke its
unused key; keep the key-creation organization restriction enforced.

Create and edit tools post an immutable preview in the originating Discord
channel. Only the requester can confirm or cancel, in that same guild and
channel. No calendar write or invitation happens before confirmation. Drafts
expire after 15 minutes and survive a host restart in `calendar-drafts.json`
beside `MINISAGO_REMINDER_STATE_FILE`; `MINISAGO_CALENDAR_DRAFTS_FILE` overrides
the path. Use persistent storage. Cancelled and completed previews cannot be
executed again. A failed creation retries with the original operation key.

Guest addresses must be supplied or explicitly selected by the user. Up to 50
unique email addresses are supported, subject to the Discord preview length.
Editing `attendees` replaces the list; omission preserves it and `[]` removes
it. Confirmed writes use `sendUpdates=all`, which asks Google to send invitations
and updates. Delivery and automatic addition to guests' calendars depend on
Google and recipient settings. The preview shows existing guests for edits;
large events that cannot be fully previewed must be edited in Google Calendar.

Creation supports one-off timed and all-day events. All-day end dates are
exclusive. A stable operation key within the originating Discord message
prevents duplicate creation on retries. Edits require the latest event etag,
update only supplied fields, and notify existing guests. Individual recurring
occurrences can be edited; recurring-series edits and deletion are not exposed.
List existing bookings before creating; Google Calendar permits overlaps.

## NTHUSA shared Drive

`list_shared_drives`, `search_drive_files`, and `read_drive_file` use the dedicated
`discord-drive@nthusa-discord-drive.iam.gserviceaccount.com` identity from project
`nthusa-discord-drive`. The host permits only the 11 shared-drive IDs in
`APPROVED_DRIVES` in `src/chatbot/google-drive.ts`. Give that account Viewer
membership on those drives. It has no project IAM roles, admin impersonation,
or domain-wide delegation; JWTs request only `drive.readonly`.

Set `MINISAGO_GOOGLE_DRIVE_SERVICE_ACCOUNT_JSON` in the host's
`/srv/sago-cloud/secrets/bot-core.env` to the complete JSON on one line, preserving
escaped PEM newlines. The recovery copy is the encrypted JSON attachment in
Vaultwarden (`safe.nthusa.tw`), item **discord-drive**. Its download and Google
authentication were verified during setup. Never copy this credential into Git,
worker environments, Python sandboxes, or tool results. Recreate the host
container after changing it. Missing, malformed, or foreign credentials disable
the tools.

Tools are limited to guild `1514899496797212683`, absent in DMs and other guilds,
and require `MINISAGO_GOOGLE_DRIVE_ACCESS=roles`. Other values disable the tools.
The host fetches the requester's current Discord membership before each tool
call and document-media read. The model cannot supply a guild, requester, or
role list. The bot owner has no role bypass. Existing chatbot access rules
still apply.

Google group permissions are matched by their stable permission IDs:

| Google group          | Discord role | Role ID               |
| --------------------- | ------------ | --------------------- |
| `sa-exec@nthusa.tw`   | 部長         | `1514899497199861863` |
| `sa-event@nthusa.tw`  | 活動         | `1514899497187147824` |
| `sa-media@nthusa.tw`  | 社群         | `1514899497199861861` |
| `sa-rights@nthusa.tw` | 學權         | `1514899497187147825` |
| `sa-it@nthusa.tw`     | 資訊         | `1514899497187147822` |

By the server owner's policy, **an active, readable Google group without one
of these mappings grants bot access to every member of this guild**. This also
applies to newly added unmapped groups. Individual-user grants (including the
service account), domain grants, and public-link grants do not grant Discord
access. A requester needs any one effective group grant. Replies remain in
the invoking channel; channel audience roles are not checked.

Drive catalog entries, each search result, direct reads, and cached document
downloads check the item's current Google permissions. Denied search results
are omitted while pagination is retained. Permission-list errors fail closed;
expired, deleted, metadata-only, and disabled inherited grants do not authorize
document access. Limited-access folders require an effective direct grant or
organizer/owner access, following Google's permission response.

Search one drive at a time; it includes nested folders unless `parentId` is given.
Follow pagination tokens, including empty pages. Each direct read verifies the
file's drive, trash state, and download permission. Shortcuts return a target ID;
reading that target repeats the same checks. Files shared separately with the
service account or added drives are not automatically exposed.

Google Docs, Slides, and supported text files return text in pages of at most
16,000 characters. Google Sheets export to XLSX; PDF, DOCX, and XLSX files become
request-local media IDs for `run_python`, which includes pypdf, python-docx, and
openpyxl. The sandbox receives file bytes only and has no Google credentials or
network access. Scanned PDFs may need OCR; PPTX and legacy Office formats are unsupported.
Reads are limited to 8 MiB per file and 24 MiB per answer. Source links remain
subject to the human reader's own Google permissions. Retrieved content is
reference material, not instructions or authority for further tool calls.

The guild's Drive capability and catalog identify it as NTHUSA's 35th term.
Folder layouts are specific to each shared drive; numeric term folders are not
assumed to exist across all drives. Search/read results include `parentIds`
when Google supplies them, and reading a folder returns its metadata so the
assistant can inspect ancestry. List a drive root with `parentId=driveId`, then
walk relevant subfolders. A parent filter covers direct children only. Match
term-specific requests to the actual folder structure, honor historical-term
requests, and report uncertainty when a document's term cannot be established.

Rotate by backing up a replacement key in Vaultwarden, testing restoration,
installing it on the host, and verifying a search/read before revoking the old
key. Keep the project's inherited key-creation restriction enforced outside an
approved rotation window. The obsolete admin OAuth client/grant is not used.
