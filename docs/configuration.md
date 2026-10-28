# Configuration

For optional multi-mailbox Gmail read-only access, hosted owner consent, and
`MINISAGO_MAIL_*` host settings, see [discord-mail setup](mail.md). Mail tools are
available in the bot owner’s private DM and explicitly registered guilds or
channels, with optional role filters. Mail is disabled elsewhere by default.

The checked-in environment examples are the mechanical source of truth:

- `.env.example` for local development and the Mac helper;
- `.env.production.example` for the hosted Discord service; and
- `.env.worker.example` for the headless Oracle worker.

Image and installer defaults live in `deploy/Dockerfile.worker` and
`scripts/worker.mjs`. This reference explains each setting; setup procedures
live in [Discord setup](discord-setup.md) and [Workers](workers.md).

## Hosted service

| Name                                   | Required  | Purpose                                                              |
| -------------------------------------- | --------- | -------------------------------------------------------------------- |
| `DISCORD_APPLICATION_ID`               | Yes       | Discord application ID                                               |
| `DISCORD_CUSTOM_STATUS`                | No        | Initial text when no saved status exists                             |
| `MINISAGO_DEVELOPER_THREADS_PATH`      | No        | Persistent development-thread recovery metadata                      |
| `MINISAGO_BOT_STATUS_FILE`             | No        | Persistent bot status; `/app/state/bot-status.json`                  |
| `DISCORD_BOT_TOKEN`                    | Yes       | Discord REST and Gateway authentication                              |
| `DISCORD_GUILD_ID`                     | No        | Guild for configured-guild features; defaults to WM31                |
| `DISCORD_GATEWAY_DISABLED`             | No        | Use `true` for HTTP-only instances                                   |
| `MINISAGO_CHATBOT_OWNER_USER_ID`       | Yes       | Sole owner of privileged routing and mutations                       |
| `MINISAGO_CHATBOT_GUILD_IDS`           | No        | Comma-separated guilds whose members may use chat                    |
| `MINISAGO_CHATBOT_CHANNEL_IDS`         | No        | Comma-separated channel exceptions                                   |
| `MINISAGO_CHATBOT_ROLE_IDS`            | No        | Comma-separated roles that may mention the chatbot                   |
| `MINISAGO_AMBIENT_REACTIONS_ENABLED`   | No        | Enable occasional ambient reactions                                  |
| `MINISAGO_AMBIENT_ATTENTION_CHANCE`    | No        | Chance from 0 to 1 that a burst schedules evaluation                 |
| `MINISAGO_AMBIENT_MAX_CHECKS_PER_HOUR` | No        | Hourly ambient model-call ceiling; defaults to 4                     |
| `MINISAGO_REMINDER_STATE_FILE`         | No        | Persistent reminder state                                            |
| `MINISAGO_GUILD_MEMORY_DIRECTORY`      | No        | Per-server Markdown memory and local Git history                     |
| `MINISAGO_FEATURE_AVAILABILITY_FILE`   | No        | Persistent guild and channel feature policy                          |
| `MINISAGO_SERVICE_SUBSCRIPTIONS_FILE`  | No        | Persistent background-service destinations                           |
| `MINISAGO_TRIP_WORKSPACE_URL`          | No        | Kyushu workspace API; defaults to the shared planner                 |
| `MINISAGO_TRIP_WORKSPACE_TOKEN`        | No        | Dedicated token enabling guild-bound itinerary edits                 |
| `MINISAGO_MAC_BRIDGE_SECRET`           | Chatbot   | Authenticate the fixed Mac worker profile                            |
| `MINISAGO_WORKER_BRIDGE_SECRET`        | Chatbot   | Authenticate the fixed Oracle worker profile                         |
| `GITHUB_WEBHOOK_SECRET`                | PR bridge | Verify GitHub's `X-Hub-Signature-256`                                |
| `GITHUB_PR_THREAD_CHANNEL_ID`          | No        | Discord destination for PR review threads                            |
| `GITHUB_PR_THREAD_STATE_FILE`          | No        | Persistent PR-to-thread mapping                                      |
| `TOEFL_VOCAB_CHANNEL_ID`               | No        | Vocabulary destination; blank disables posting                       |
| `TOEFL_VOCAB_TIME`                     | No        | Local `HH:MM` posting time                                           |
| `TOEFL_VOCAB_TIMEZONE`                 | No        | IANA timezone for vocabulary posting                                 |
| `TOEFL_VOCAB_STATE_FILE`               | No        | Persistent daily-send state                                          |
| `GAMER_FORUM_*`                        | No        | Forum source, destination, schedule, reader, and state               |
| `LINK_READER_BASE_URL`                 | No        | Public page and Threads search reader (default `https://r.jina.ai/`) |
| `THREADS_SEARCH_READER_BASE_URL`       | No        | Legacy fallback when `LINK_READER_BASE_URL` is unset                 |
| `X_POST_*`                             | No        | X feed source, destination, polling interval, and state              |

Custom status initially defaults to `mini.sagocream.com`. Once a status is saved,
it takes precedence over the environment default and survives restarts.
See [Bot management](bot-management.md) for persistence and recovery.

See `.env.production.example` for production state paths and the complete
scheduled-monitor variable names.

Operators can set a reminder's `channelId` to a Discord thread. For drawing
reminders, `skipIfImagePosted: { threadId, userId }` checks that user's images
since midnight in the reminder's timezone. The image thread may be the
destination or a sibling thread under the same parent channel. A matching image
skips that day's reminder; its schedule continues. These fields live in
`MINISAGO_REMINDER_STATE_FILE`; chat edits preserve the condition.
Image-conditioned reminders send the user mention followed by the stored copy.

`MINISAGO_CCXP_INDEX_PATH` enables read-only CCXP meeting retrieval in guilds
registered under the owner-managed `ccxp_meetings` feature. Initial registrations
are `1394943277836402779` and `1000249491494019092`. The separate Oracle collector and owner password
rotation notices, the nightly schedule, and owner-only manual sync via
`MINISAGO_CCXP_SYNC_QUEUE_PATH` are documented in [CCXP meeting retrieval](ccxp-meetings.md).

## X post digests

The X monitor keeps the configurable primary pipe and also subscribes
`@thsottiaux` to Discord channel `1515569479541854218` and
`@hololive_dreams` to channel `1290252977621176361`. Each additional pipe
stores an isolated checkpoint beside `X_POST_STATE_FILE` and validates its
destination guild independently. The `@hololive_dreams` pipe only collects
posts authored by that official account and ignores posts it retweets.

By default, all three services collect posts every five minutes and send a
Traditional Chinese digest at **21:00 Asia/Taipei**. Each digest covers posts
published since the previous local 21:00 cutoff up to the current cutoff. Posts
published at or after the cutoff belong to the next day's digest. Missing,
invalid, or future publication dates use collection time. Late-discovered posts
from older windows are delivered on subsequent polls with their window's date.
An empty window sends nothing. Initial startup seeds the latest feed ID without
replaying historical posts; existing checkpoints continue collecting newer posts.
The scheduler checks digest deadlines once a minute; model processing and
Discord delivery add their usual latency, while RSS polling stays at five minutes.

- `X_POST_DELIVERY_MODE`: `daily_digest` (default) or `instant` for all services.
- `X_POST_DIGEST_TIME`: daily local `HH:MM`, default `21:00`.
- `X_POST_DIGEST_TIMEZONE`: IANA timezone, default `Asia/Taipei`.
- `X_POST_DIGEST_SERVICES`: comma-separated service IDs, default
  `x_posts_primary,x_posts_thsottiaux,x_posts_hololive_dreams`. Omitted services
  retain instant delivery; an explicitly blank value makes all services instant.

Summaries use the existing authenticated chat worker and
`MINISAGO_CHATBOT_OWNER_USER_ID`; no separate model API key is required. The
dedicated `x_post_digest` job has no Discord tools, media tools, or web search.
Host and chat workers must be updated together to worker protocol version 37.
Feed text is untrusted data. The worker returns a bounded Chinese summary per
post; the host validates IDs and lengths, builds source links from the actual
author (including retweets), splits messages below Discord's limit, and disables
mentions and link previews. Each model call handles up to ten posts with up to
4,000 text characters each; long posts are summarized from that excerpt. Larger
windows drain in successive polling ticks, oldest first.

Pending posts, generated messages, and each destination's confirmed message
progress are saved in the existing X state files. Worker failures leave posts
queued; destination failures reuse generated messages and skip confirmed sends.
Saved digests can send even while the source feed is unavailable. Posts outside
the feed's latest twenty items can still be missed during extended outages.
An ambiguous Discord timeout or a crash between sending and checkpointing can
repeat the affected message. Instant mode pauses any queued digest; restoring
digest mode resumes it. Back up all X state files with the other durable state.
Chat tools continue to manage service destinations; schedule and mode are
operator environment settings and require restarting the hosted service.

## Shared links and Threads search

The `read_link` MCP tool reads relevant shared public HTTP/HTTPS webpages and social
posts before the agent makes claims about their contents. It replaces the
Threads-only `read_threads_post` tool and `threads_read` capability with the
`link_read` capability. The agent reads up to three relevant URLs per answer
from the request, reply target, or nearby context; it does not fetch unrelated
links or follow URLs discovered inside pages. Protected sources continue to use
registered, authorized tools. Public reader requests must not include private
links, credentials, or signed access parameters.

Original and fixed-preview Threads, X/Twitter, and Instagram URLs normalize to
their source hosts. Tracking parameters are removed from recognized post URLs;
ordinary website query parameters are preserved. The tool rejects IP literals,
local/reserved hostnames, non-HTTP(S) URLs, credentials, nonstandard ports, and
recognized token/signature query parameters before contacting the reader.

Page reads and Threads searches share `LINK_READER_BASE_URL`, defaulting to
`https://r.jina.ai/`. Existing `THREADS_SEARCH_READER_BASE_URL` settings remain a
fallback when the new setting is unset. Fetches time out after 30 seconds,
reject reader HTTP redirects, and cancel responses exceeding 256 KB. Page reads
return at most 12,000 characters with an explicit truncation flag. This is a
public reader service, not an authenticated browser for private content.

Failed, login-gated, verification-blocked, empty, or oversized reads return an
explicit unavailable result. The agent cites sources, reports limitations, and
uses only available excerpts. Page text is untrusted and may include comments,
recommendations, or preview text. A preview does not establish the full article,
unseen images, or a video transcript. If the reader tool is unavailable, the
agent can attempt live browsing under the same rules.

Discord history and accessible-message searches retain webhook previews,
including social-link reposts, labelled with `(webhook)` and without verified
member aliases. This supplies read-only context; webhook content does not grant
member identity or owner authorization. Reply-trigger and loop guards remain
in effect. Searching by an original member's author ID cannot recover a repost
whose author is now a webhook; use the link or message text instead.

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

Prompt policy and context budgets are versioned with the application. Roll them
back by deploying the corresponding commit.

The Linux media MCP's `generate_image` tool uses the same Codex executable and
ChatGPT sign-in configured by `MINISAGO_CODEX_PATH` and `MINISAGO_CODEX_HOME`.
Image generation needs no separate API key or registration setting. The worker
passes these trusted paths to its MCP adapter; tool callers supply only a prompt,
request-local media IDs, and image options. See
[image generation and emoji edits](workers.md#image-generation-and-emoji-edits)
for formats, delivery, and limits.

Workers discover repositories from their dedicated GitHub CLI login at startup.
Set `MINISAGO_CHATBOT_REPOSITORY` when that login can access multiple repositories
so requests to change MiniSago itself do not rely on name inference. This selects
the starting checkout, not the set of repositories a development thread can use.
Each development turn supplies `MINISAGO_REPOSITORIES_DIR` for persistent additional
checkouts and `MINISAGO_GIT_BRANCH` for their feature branch. These values are
generated per task; operators do not configure them.

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

MiniSago creates missing memory files on Gateway connection, server join, and
server conversations. Existing facts and revisions are preserved; new files
start empty and learn through the server-bound memory tool. Chatbot access stays
controlled by feature registrations.

To reconcile all current servers manually, run `bun run memory:backfill` in the
core service environment with `DISCORD_BOT_TOKEN` and the persistent
`MINISAGO_GUILD_MEMORY_DIRECTORY` configured. The command paginates the bot's
server list, preserves existing files, and reports any failed server IDs with
a nonzero exit status.

Production recovery uses a separate private `minisago-state` repository. Its
backup job reads memory and history without adding a remote to the live memory
repository. See [backup and restore](operations.md#durable-state-backup-and-restore).

Feature policy defaults to `/app/state/feature-availability.json` in production
and `.data/feature-availability.json` elsewhere. The first change saves a policy
initialized from environment settings and built-in defaults; saved policy then
takes precedence. Owners can list, enable, disable, or restore inherited coverage
for an exact guild or channel. Channel rules override guild rules, then feature
defaults. Calendar, CCXP, Drive, and developer steering require explicit guild
registrations. The owner listing also describes request and owner-only access
modes; those modes cannot be made public through registration. See
[role filters](#feature-registrations-and-role-filters) below.

`developer_thread_control` is owner-only and needs no additional configuration.
The owner can end a current or specified development thread in the same server
with `end dev thread` or `end_developer_thread`; this removes its saved association
from `MINISAGO_DEVELOPER_THREADS_PATH` and returns it to normal chat rules. See
[development workers](workers.md) for commands and pause behavior.

Background subscriptions default to `.data/service-subscriptions.json`,
initialized from Gamer Forum, X, and TOEFL destinations. Once changed, the saved
list takes precedence. Owners can list destinations and subscribe or unsubscribe
an exact channel through chat. Jobs read the list on every check; no deployment
or restart is needed.

## Current deployment-specific defaults

The repository still contains these Hsi-specific defaults:

- configured-guild fallback `1282936453134815275`; and
- PR review repository and reviewer mapping for `sago-cream/health-check-system`.

Feature coverage and scheduled feed destinations no longer need source changes.
Feed sources, schedules, and checkpoint settings remain deployment
configuration. The PR review mapping remains deployment-specific code.

## Discord calendar and contact directory

The Calendar integration is shared by the MiniSago trial and the future NTHUSA
fork. Its Google calendar and OAuth client are named **discord-calendar**.
Deployments use the same code with host configuration; no bot display name is
stored in events or confirmation previews.

### Feature registrations and role filters

The owner can configure feature coverage with `configure_feature_availability`.
Each guild or channel registration accepts optional `allowRoleIds` and
`denyRoleIds`. Both default to no filter. A nonempty allowlist requires at least
one matching role; a matching denylist role always denies access. Unknown member
roles fail closed when either filter is present. Discord's everyone role can be
specified using the guild ID. Each enable replaces the filters; omit them or
send empty arrays to remove filtering. Disable denies the whole scope; inherit
removes that scope's rule. Filters are accepted only with enable.

Channel rules take precedence over guild rules, including a filtered channel
rule that denies a member. Automatic follow-ups, Calendar, CCXP, Drive, and
developer steering require guild registrations and a disabled global default. Other features support both scopes.
Mail supports both guild and channel registration with a disabled global default.
Register `mail` through `configure_feature_availability`; role filters control
who may request mail, while responses are visible to everyone who can view the
requesting conversation. Existing rules retain their coverage without role filters.

`automatic_followups` starts disabled in every guild, including when upgrading
an existing policy file. It has no environment-variable opt-in or owner bypass.
Enable it for a guild with `configure_feature_availability`; optional role
filters limit who can trigger the 90-second continuation. Disabled guilds require
a mention, a reply that notifies the bot, or `/ask` for another chat answer.
Coding-thread steering has its own independent registration.

The shared [feature registry and access guard](feature-registration.md) generate
supported registration scopes, initial policies, and agent capability metadata.
Drive is registered under `drive`: older state gains its previous guild
`1514899496797212683` once, then saved policy controls coverage. Registration does
not replace Google file ACLs or mapped Discord role checks. Protected tool calls
refresh membership, and revoked registrations cannot release in-flight read
results or previously issued Drive document media.

Calendar is now a registered feature. Legacy state gains the original configured
Calendar guild and the owner-approved registration for guild
`1394943277836402779`, restricted to role `1394944058534920213`, once. A saved
Calendar policy, including a revocation, stays authoritative. Calendar access
checks apply to reads, draft preparation, and confirmation; tool calls refresh
Discord membership before using Google. DMs have no Calendar tools. Registered
guilds share the configured event and office calendars.

### Calendar destinations

Set these host-only values before deployment:

| Setting                           | Purpose / default                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `DISCORD_CALENDAR_ID`             | Required secondary calendar ID for event creation, edits and deletion. No fallback.                            |
| `DISCORD_CALENDAR_NAME`           | Preview label, default `discord-calendar`.                                                                     |
| `DISCORD_OFFICE_CALENDAR_ID`      | Read-only office calendar and optional invitation recipient; defaults to 學生會辦空間登記.                     |
| `DISCORD_CALENDAR_GUILD_ID`       | Initial Calendar guild registration, default `1514899496797212683`; persistent feature policy controls access. |
| `DISCORD_CALENDAR_ACCOUNT`        | Verified OAuth user, default `nthusa@gapp.nthu.edu.tw`.                                                        |
| `DISCORD_CALENDAR_OAUTH_JSON`     | Host-only compact OAuth JSON; legacy `MINISAGO_GOOGLE_CALENDAR_OAUTH_JSON` remains supported.                  |
| `DISCORD_CALENDAR_DRAFTS_FILE`    | Persistent confirmation storage; legacy `MINISAGO_CALENDAR_DRAFTS_FILE` also works.                            |
| `DISCORD_CONTACTS_SPREADSHEET_ID` | Exact directory spreadsheet; defaults to the NTHUSA contact directory.                                         |
| `DISCORD_CONTACTS_SHEET_ID`       | Exact CSV tab ID, default `817689538`.                                                                         |

The event and office calendar IDs must differ. Missing or invalid destination
settings disable Calendar tools. Only the dedicated event calendar accepts
writes; the office API path rejects every method other than GET.

`list_calendar_events` and `get_calendar_event` select `calendar=events` or
`calendar=office`. The model cannot supply arbitrary calendar IDs. Use office
for questions like 「下禮拜有人要用會辦嗎？」.

`create_calendar_event`, `edit_calendar_event`, and `delete_calendar_event`
post an immutable preview in the originating Discord channel. Only its
requester can confirm or cancel in the same guild and channel. Creation, edits,
deletion, invitations and cancellation notices wait for confirmation. Drafts
expire after 15 minutes and survive restarts. They bind to the destination,
guild and booking identity; changing deployment settings invalidates pending
previews. Old previews must be recreated after migration.

Office use is explicit: `useOffice=true` checks the office calendar for conflicts
and adds its email as an attendee to the event in discord-calendar. Omitted or
false on creation means no office read or invitation, regardless of the location
text. On edits, omission preserves the office invitation and false removes it;
when moving an event to another location, confirm that change and remove its
office invitation. People in `attendees` are separate from the office recipient.
Replacing the people list preserves office use unless `useOffice` changes.
Calendar IDs are not accepted in the people list.

Office invitations use Google Calendar's **Auto-accept invitations that do not
conflict** setting. A pre-write conflict check cannot eliminate races, so the
returned `officeReservation` is authoritative: `pending` is not a confirmed
booking; `declined` requires a different time/location; only `accepted` means
booked. Creating the event itself can succeed while the office remains pending.
Read it again to check the response. Updates and cancellation propagate from the
organizer event; the tools never modify the office copy directly.

All times use Asia/Taipei. Creation supports one-off timed/all-day events;
all-day end dates are exclusive. Edits and deletion require the current etag
and use If-Match. Whole recurring-series changes are refused; select one
occurrence. Creation retries use a stable operation key and neutral event
metadata; deletion retries handle an already cancelled/missing event. Guests
receive Google notifications through `sendUpdates=all`, subject to their settings.
Up to 50 guests including the office are supported, subject to preview length.

### Credentials and recovery

The booking identity uses the discord-calendar Desktop OAuth client in project
`nthusa-discord-calendar`. The host verifies the Google email on token refresh.
Scopes are `openid`, `email`, and `calendar.events`; no administrator impersonation
or domain-wide delegation is used. Keep OAuth audience External and publishing
status Production before authorization; Google policies or revocation can still
require reconnecting.

Store compact JSON containing `client_id`, `client_secret`, and `refresh_token`
in `/srv/sago-cloud/secrets/bot-core.env` (mode 600). Keep and verify the full
recovery attachment in Vaultwarden (`safe.nthusa.tw`), entry **discord-calendar**.
Never put credentials in source, worker/sandbox environments, logs or Discord.
The existing legacy OAuth variable continues to work during the trial. Malformed
OAuth fails closed rather than switching identities.

To authorize or recover using the downloaded Desktop client on a trusted host:

```sh
bun scripts/calendar-authorize.mjs /path/to/client.json /path/to/calendar-oauth.json
```

The script uses a loopback listener, state and PKCE and writes a private file
without printing tokens. It defaults to the account/project above;
`DISCORD_CALENDAR_ACCOUNT` and `DISCORD_CALENDAR_PROJECT_ID` can override them.
Back up and verify the new credentials before host installation. Recreate
bot-core after changing its environment. Public app/privacy pages are `/calendar`
and `/calendar/privacy` on the deployment's hostname.

### Contact lookup and fork handoff

`lookup_calendar_contacts` uses the existing read-only discord-drive service
account and the Google Sheets API enabled in `nthusa-discord-drive`. No new
user OAuth scopes are required. The directory must remain in an approved drive;
Google file ACLs and fresh Discord role membership are checked before reading
and again before returning matches. The 學權部 exclusion remains enforced.

The supplied spreadsheet's CSV tab uses A:H for names, nickname, organization,
labels and email; Notes and Phone columns I:K are never fetched by this lookup.
Only matching names, aliases, organization and email are returned, capped at ten.
The tool reports ambiguity/truncation instead of selecting a person. It never
invites anyone itself. Ask for selection when names collide, then include the
chosen addresses in the Calendar preview. Changed headers or oversized tabs
fail closed and need an administrator to review configuration.

For the NTHUSA fork, port the Calendar/settings/confirmation/contact modules,
the Drive lookup integration, MCP registration/capability descriptions, privacy
pages and tests together. Restore host secrets from Vaultwarden and set the same
neutral destination values. Preserve persistent drafts or let the 15-minute
window expire. Keep one bot deployment responsible for new confirmed mutations
during cutover; events are shared Google data and are not recreated or copied.
Test contact matching, non-office creation, office acceptance/conflicts, moving
away from the office and confirmed deletion before switching traffic. The
MiniSago trial does not imply the fork has already been deployed.

## NTHUSA shared Drive

`list_shared_drives`, `search_drive_files`, and `read_drive_file` use the dedicated
`discord-drive@nthusa-discord-drive.iam.gserviceaccount.com` identity from project
`nthusa-discord-drive`. The host permits only the 10 shared-drive IDs in
`APPROVED_DRIVES` in `src/chatbot/drive/google-drive.ts`. Give that account Viewer
membership on those drives. It has no project IAM roles, admin impersonation,
or domain-wide delegation; JWTs request only `drive.readonly`.

`行政中心 | 學權部` (`0AD_M3A4IQVILUk9PVA`) is excluded for every Discord role
because it contains sensitive documents. Do not grant the service account
membership on that drive. Its files cannot be searched, read by direct ID, or
downloaded through cached media. The 學權 role mapping below still applies to
group grants on the remaining approved drives.

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
