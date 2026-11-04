# Security

MiniSago treats the hosted Discord service as the authority boundary and Codex
workers as constrained executors. Model output never grants its own
permissions.

## Capability boundary

| Capability                                 | Community                        | Owner                                      |
| ------------------------------------------ | -------------------------------- | ------------------------------------------ |
| Conversation and public web research       | Yes                              | Yes                                        |
| Permission-filtered Discord context        | Yes                              | Yes                                        |
| Host-bound reminders and voice actions     | Yes                              | Yes                                        |
| Expression management in shared servers    | Yes                              | Yes                                        |
| Image generation and image edits           | Authorized text requests         | Authorized text requests                   |
| Cross-channel messaging                    | No                               | Yes                                        |
| Repository checkout and developer commands | No                               | Yes                                        |
| GitHub mutation                            | No                               | Owner-routed tasks only                    |
| Mac file search and upload                 | No                               | Explicit Mac target only                   |
| Approved Gmail mailbox search and read     | Registered guild/channel + roles | Registered guild/channel + roles; owner DM |

The hosted service checks requester identity before dispatch. The worker checks
the declared capabilities again before Codex runs. Authorization never depends
on matching phrases in the request.

The shared feature registry declares request, owner-only, and registered access.
The host binds identity and checks access at tool execution; protected reads
refresh guild membership and recheck policy before releasing results. Google
resource permissions and mutation confirmations still apply. See
[feature registration](feature-registration.md).

CCXP meeting tools require an explicit owner-managed guild registration and a
configured read-only index mount. DMs and unregistered guilds have no access,
even for the bot owner. Registration uses the persistent `ccxp_meetings`
feature policy; revocation is checked again on every tool call. Owner-only manual
sync tools write request metadata to a separate shared control volume; they cannot
write the index, access credentials, or override the rejected-password pause. A separate collector holds the CCXP account,
browser profile, and session; these are never exposed to core or Codex. MCP
results contain bounded text and session-free category links. Password changes
remain manual, with deduplicated owner DMs when login requires attention. See
[CCXP meeting retrieval](ccxp-meetings.md) for retention and recovery.

Bot status updates, channel messaging, and feature access configuration are
owner-only, host-bound MCP tools. Status updates accept only text and presence;
they cannot change identity, credentials, or deployment settings. See
[bot management](bot-management.md).

## Discord boundaries

discord-mail keeps encrypted per-mailbox refresh tokens and the OAuth client
secret on core. Invitations bind approval to an allowlisted address, verified
Google identity and Gmail profile; browser-bound state and PKCE protect the
callback. Mail tools require explicit guild/channel registration and current Discord
membership with role filters, or the bot owner’s private text DM. Unregistered
guilds, other DMs, and voice have no mail tools. Every call rechecks policy,
configured accounts, and stored grants; in-flight revocation withholds results.
Role filters restrict requesters; everyone who can view the requesting channel
can see the reply. Email content is untrusted reference data, never instructions
or server memory. See
[mail setup and retention](mail.md).

Chatbot access uses an owner ID, allowed guilds, and optional channel
exceptions. Ambient reactions use the same community boundary. Guild searches
include only channels where the requester has View Channel and Read Message
History; if role data cannot be loaded, search falls back to the current
channel.

Member roles, join dates, presence, and reaction-member lists are not sent to
Codex. Host-bound tools cannot use model arguments to substitute another
requester, guild, member, or channel.

MiniSago captures voice-channel audio only after a member explicitly asks her
to join. A private Whisper service on the same host transcribes each bounded
utterance with the bundled model. The bot deletes temporary audio and sends only
the transcript to the configured Codex worker as a normal answer job. A private
VOICEVOX engine on the same host synthesizes spoken replies with the Nekotsuka
Bi voice. Raw voice audio never reaches Codex or an external speech API;
transcripts and answers follow the normal trace retention policy below.

Members may add emojis or stickers from request media, copy emojis, and rename
emojis when explicitly requested. For community users, the host verifies their
membership before exposing source or destination guilds; failed membership checks
exclude the guild. The owner retains access to all guilds shared with the bot.
The destination bot role must have Create Expressions to add and Manage
Expressions to rename. Members do not need their own expression permissions.

## Worker authentication and isolation

Oracle and Mac use independent random bridge secrets of at least 32 bytes. The
secret selects a fixed server-owned profile; workers cannot raise their own
capabilities or priority.

Every worker Codex run ignores normal user configuration, memories, plugins, and
user-configured MCP servers. Chat jobs cannot read installed skills, have
restricted filesystem access, and have no general network permission outside
Codex's own web search and MiniSago's MCP server. Image generation uses the
bounded media MCP described below.

Owner coding runs in a separate T3 environment under that account's normal
provider and project permissions. Its skills, tools, and instruction discovery
are configured in T3. The bot's separate OAuth grant is kept only on core.

Kyushu itinerary access is exposed only when the host-bound Discord guild is
`1282936453134815275`. Reads use the public planner endpoint; edits require a
dedicated service token kept by the hosted service. The model receives typed
read and edit tools, never the token or raw database access. Locked schedule
items remain immutable.

The Linux worker uses Codex's Bubblewrap sandbox inside the container.
Production allows only its required namespace and mount syscalls and loads the
dedicated AppArmor profile. The worker process remains unprivileged.

## Attachments and Mac files

Chat answers and owner routing prepare supported images, short audio/video
files, PDFs, and text files, with these limits:

- at most 10 attachments;
- at most 20 MB per attachment and 40 MB total; and
- at most 100,000 extracted characters per file and 200,000 total.

Downloads accept only Discord HTTPS CDN hosts and stop on cancellation. Worker
downloads are deleted after the response. Attachment URLs are stripped from
observable tool results and sanitized in traces. After a CDN 403, 404, or 410,
the host may fetch a registered
attachment's original message through the bot API and retry once with the refreshed
URL for that same attachment. It rejects missing attachments and non-CDN URLs.

Coding attachments follow a separate path: the host uploads original Discord
files through T3's native attachment API. Each message accepts up to eight files,
20 MB each and 40 MB combined, including referenced attachments. The bot never
passes its chat MCP token to T3. T3 owns the uploaded files and workspace
retention; see [coding sessions](t3-coding.md#use).

Generated media is request-local and may be returned only by an opaque artifact
identifier from the job's dedicated output folder. The worker rejects path
escapes, symlinks, unsupported media extensions, files above 8 MB, and more than
one output before sending bytes to the hosted service. Generated files are
deleted with the downloaded attachments after the response.

The Linux media MCP accepts only opaque media IDs registered to the active
bearer token. The host registry admits Discord CDN inputs and bounded generated
bytes; it never resolves caller-supplied paths or URLs. This lets attachments,
member avatars, and generated outputs compose without broadening network or
filesystem authority. Typed transformations replace shell commands and raw
FFmpeg arguments. Inspection omits source metadata and tags; transformations
strip output metadata. Inputs are limited to 20 MB, 10 minutes, 8,192 pixels per
dimension, and 40 megapixels. Commands use fixed local protocols, two threads,
and a 45-second deadline. Presets further limit generated clips to 15 seconds
for GIF, 30 seconds for MP4, and 120 seconds for MP3.

`generate_image` sends the requested prompt and selected image references to
Codex's built-in image generator using the worker's existing ChatGPT login.
Its separate Codex process ignores user config and project instructions, has
shell execution, image-file browsing, web search, hooks, memories, and delegation
disabled, and receives no Discord/MCP bearer token, GitHub token, or API key.
The model can read only its prepared reference folder and minimal runtime files;
there is no general command-network access. The generator is limited to four
minutes, five references totaling 40 MB, and one PNG of at most 8 MB. The host
reads only that invocation's generated-image directory and removes its temporary
copy after publication. Normal chat uses the typed MCP instead of exposing a
second direct native generation path.

`read_guild_emoji` registers an exact emoji's Discord CDN PNG without exposing
its URL. Community reads recheck shared-guild membership before downloading;
animated sources become a still reference. The latest completed generated image
is attached once to the Discord response from the request's output folder.
Editing never deletes or replaces the original emoji. Adding the edited copy
uses the existing expression permissions and explicit-request rule.

Mac file requests are owner-only and read-only. Search is limited to configured
roots, and the host revalidates the exact path before uploading at most one
regular file of 8 MB or less. Symlinks and paths outside the roots are rejected.

Coding artifacts remain available in T3. The Discord relay sends assistant text
and plans; it does not read local files from the T3 workspace or upload them as
Discord evidence attachments.

## Owner coding and GitHub

Only the configured owner may control linked T3 coding sessions, including
continuations. Bot/webhook messages and other guild participants are excluded.
Community chat keeps its existing host-bound access controls and restricted
execution. The bot never forwards its Discord token or short-lived chat MCP
credentials into the coding environment.

T3 owns the agent's shell, network, installed tools, project instructions, and
credentials. Coding can use full access when allowed by the configured grant
and project. Worktrees separate edits and do not restrict the agent's filesystem
access. Keep the T3 service account separate from bot secrets and unrelated
production credentials. GitHub rulesets independently protect branches.

The host stores only T3 associations and delivery state in its coding-thread
store. On restart it reads existing T3 output without restarting work. A changed
environment does not silently replace a saved session. Ambiguous message sends
are never replayed automatically. See [T3 setup and recovery](t3-coding.md).

The bounded MiniSago deployment socket remains available for environments that
can reach it. It accepts the immutable MiniSago commit and a fixed originating
Discord channel through the deployment adapter; it exposes no general shell or
Docker socket. Configure the adapter on the T3 environment when needed.

## Retention and privacy

Metadata-only worker logs exclude prompts, Discord messages, answers, links,
and attachment contents. Debug traces may contain message context, sanitized
attachment metadata, bounded MCP tool names and arguments, model output,
errors, and timings. They never contain MCP tokens, signed URL parameters,
tool-result message bodies, or downloaded attachment bodies.

Traces are owner-readable, expire after 14 days, and are pruned oldest-first
above 250 MB. `resolve_context` can expose bounded operational metadata from the
same channel when `includePreviousTrace` is requested. It never returns private
chain-of-thought.

The hosted website's `/privacy/` page describes data handling and provides the
support address for correction and deletion requests. Operators should verify
the requester and relevant data scope before handling a request. Removing a guild
memory entry stops using it but does not erase its local Git history; complete
deletion requests must also cover retained memory history, traces, and any
relevant development workspaces. Discord and other providers' copies follow
their own deletion processes. Self-hosted operators must supply their own contact
and privacy policy rather than adopting the hosted service's contact details.
