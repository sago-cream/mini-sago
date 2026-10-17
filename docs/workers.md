# Workers

MiniSago uses fixed secret-backed worker profiles. Oracle provides preferred
`chat,dev`; the Mac helper provides fallback `chat,dev,mac`. Workers connect
outbound to the hosted bridge and expose no public port.

## Shared requirements

Every worker needs:

- a working Codex executable and isolated Codex home;
- a bridge URL and 32-byte-or-longer profile secret;
- the same `MINISAGO_CHATBOT_OWNER_USER_ID` as the hosted service;
- a dedicated authenticated GitHub CLI login; and
- outbound HTTPS and WSS.

At startup, each worker discovers and advertises every repository visible to its
GitHub login. A repository does not need to exist locally in advance. Oracle jobs
always receive a disposable checkout and prepared feature branch.

The headless Oracle worker also reads the GitHub skill links in
`sago-cream/skills` and installs them into its isolated Codex home before
connecting. It checks the Skillbook revision every 15 minutes. A new Skillbook
revision snapshots the current commit of every linked skill, and that set is
available to the next Discord development turn without restarting the worker.
The Mac helper leaves its skills alone so the Mac remains the authoring copy.
Set `MINISAGO_SKILLBOOK_REPOSITORY` explicitly to enable or change syncing on
another worker, and adjust
`MINISAGO_SKILLBOOK_SYNC_INTERVAL_MS` when a slower refresh is preferable.
Pushes to `sago-cream/skills` also trigger an immediate Oracle refresh through
the existing GitHub webhook. The periodic check remains as recovery when a
delivery arrives while Oracle is offline.

## Oracle worker

Use an OCI Ampere A1 Compute VM rather than Container Instances because Codex,
GitHub CLI, traces, repositories, and worktrees require persistent volumes.
Confirm current OCI pricing, capacity, and reclamation policy in official
sources.

On Ubuntu AArch64 with Docker Engine and the Compose plugin, run these commands
from the checkout root. `--project-directory .` keeps environment paths and
persistent volume names based on the checkout:

```bash
cp .env.worker.example .env.worker
chmod 600 .env.worker
docker compose --project-directory . -f deploy/compose.worker.yaml build
docker compose --project-directory . -f deploy/compose.worker.yaml run --rm \
  worker codex login --device-auth
docker compose --project-directory . -f deploy/compose.worker.yaml up -d
docker compose --project-directory . -f deploy/compose.worker.yaml logs -f worker
```

The Linux worker compose file also starts an internal sandbox broker. It alone
holds the Docker socket and launches short-lived, networkless containers with
read-only system paths and size-monitored scratch space for generic Python
computation. The worker itself never receives the Docker socket. Keep the sandbox
service private; it intentionally publishes no host port.

Put the same secret in the worker's `MINISAGO_MAC_BRIDGE_SECRET` and the hosted
service's `MINISAGO_WORKER_BRIDGE_SECRET`. Device authentication must write only
to the persistent Codex volume.

Authenticate the dedicated fine-grained GitHub login over standard input:

```bash
docker compose --project-directory . -f deploy/compose.worker.yaml run --rm \
  worker gh auth login --hostname github.com --git-protocol https --with-token
docker compose --project-directory . -f deploy/compose.worker.yaml up -d --force-recreate
docker compose --project-directory . -f deploy/compose.worker.yaml exec worker gh auth status
```

Restart the worker after changing the GitHub login or its repository access so
it refreshes the advertised repository list.

Never put the token in `.env.worker`, Discord, a Codex request, a shell
argument, or the repository. Do not expose Docker, Codex, SSH, or workspace
volumes publicly.

## Mac helper

Prerequisites are Bun, Xcode command-line tools including `swiftc`, an existing
`~/.codex/auth.json`, and the Mac profile secret configured on both the helper
and hosted service.

Authenticate the helper's isolated GitHub login, then install it:

```bash
GH_CONFIG_DIR="$HOME/Library/Application Support/MiniSago/github" gh auth login --hostname github.com --git-protocol https --with-token
bun run mac-agent:install
bun run mac-agent:status
```

The installer consumes `.env.local`, creates an isolated Codex home linked to
the existing authentication file, and installs the per-user LaunchAgent
`dev.hsichen.minisago-mac-agent`.
It discovers the current or legacy app-bundled Codex executable and resolves
npm installations to their native binary so the helper can run with its
restricted PATH. Set `MINISAGO_CODEX_PATH` to select a particular installation.

The helper connects only while the user session is unlocked, disconnects
before sleep or lock, and reconnects afterward. Display sleep without a session
lock does not disconnect it. Missed requests are never replayed.

By default, owner file requests are limited to Desktop, Documents, Downloads,
Movies, Music, Pictures, and iCloud Drive. Override those roots with
`MINISAGO_MAC_FILE_ROOTS`.

## Authentication and capacity

ChatGPT device authentication can expire and remains subject to account plan
limits. It is not an uptime guarantee. A worker reports availability and
`MINISAGO_MAX_CONCURRENT_JOBS`; the hosted service prefers Oracle, falls back to
Mac when Oracle is full or unavailable, and routes explicit Mac work only to
Mac.

See [Security](security.md) for credential and sandbox boundaries and
[Operations](operations.md) for logs, recovery, deployment, and removal.

The Oracle image includes Python 3 with `venv` support for owner development
jobs. Chat jobs do not receive arbitrary Python or shell execution. Media work
uses the image's FFmpeg binaries only through MiniSago's request-local typed MCP
tools.

## Image generation and emoji edits

Linux chat and development requests expose `generate_image` through the media
MCP. It starts a separate, bounded Codex invocation using the worker's existing
`MINISAGO_CODEX_PATH` and `MINISAGO_CODEX_HOME` ChatGPT sign-in. Keep the CLI
current; the published worker image pins the latest stable CLI at build time.
No `OPENAI_API_KEY`, new credential, or feature registration is required beyond
ordinary chatbot access. Image generation consumes the signed-in account's
Codex usage limits. It is available for text requests, not live voice responses.

For example, ask Sago to generate a mascot, edit an attached picture, or
「把這個伺服器的 wave 表符改成紅色、戴耳機，傳圖片給我，也新增成 wave_headphones」.
`read_guild_emoji` resolves an exact emoji name, ID, or custom emoji value in the
current or another shared guild to a request-local `mediaId`. Membership is
checked again when the bytes are read. `generate_image` accepts a prompt and up
to five `mediaIds` from attachments, avatars, emoji reads, or prior media outputs.
Omit the references to generate a new image.

Set `purpose` to `emoji` for a 128×128 PNG below 256 KiB, or `sticker` for a
320×320 PNG below 512 KiB. Both request transparency by default;
`transparentBackground` can override it. Ordinary `image` output is a PNG up to
8 MB. Emoji and other animated inputs are edited as still images; the original
is preserved. The returned `mediaId` can be reused in `add_guild_expression` or
another edit. Adding an expression still requires an explicit request and the
bot's destination-server permissions.

The host attaches the latest completed generated image to the Discord answer,
including when it is also added as an emoji or sticker. Chat and development
threads both deliver it once, even if the model omits an attachment reference.
Subsequent requests can reply to that Discord attachment to edit it again.
Generation has a four-minute limit within the request's five-minute budget;
prefer one generation or edit per request. Failures report that no image was
produced instead of substituting a procedural drawing.

## Development runtime checks

Before creating a development thread, routing and chat use the same normalized
Discord reply and forwarded snapshot context, attachment preparation, and bounded
attachment text rendering. Screenshots reach the router as image inputs. The
text-only Jev classifier chooses only chat, Mac, or development; requests with
attachments use the Codex router, which also chooses the starting repository
from the advertised repositories. The current owner request authorizes work;
forwarded content and attachments remain untrusted task context.

Coding replies resume the saved Codex conversation in a fresh process. Checkout,
scratch and attachment paths remain under the task's workspace; task files are
not automatically deleted. The core saves each thread's task ID, owner, starting
repository, original request, Codex session ID, and post-merge addressing rule in
`MINISAGO_DEVELOPER_THREADS_PATH` (default `/app/state/developer-threads.sqlite`).
A reply restores the saved task before ordinary routing, including when it asks
for work in another repository. The owner can reply without a mention; registered
participants are checked against the current `developer_steering` policy. A saved
task does not rerun automatically at startup. `status` and `stop` do not start a
model turn. After a PR merge, an explicit mention or reply to the bot is still
required. Associations expire after three idle days; unfinished files remain for
explicit cleanup.

The owner can say `end dev thread` (or `結束這個開發討論串`) in a coding
thread to return it to ordinary chat without a PR merge. To end another thread
in the same server, say `@MiniSago end dev thread <#THREAD_ID>` or provide its
Discord thread link. Natural-language owner requests can also use the
`end_developer_thread` host tool with an exact thread ID; omitting it selects the
current thread. Ending stops active coding, discards queued follow-ups, and
removes the durable thread association. It works for saved tasks while the worker
is offline and survives service restarts. The Discord thread and workspace files
remain. Future messages follow normal chatbot addressing and optional automatic
follow-up rules; a new explicit development request can start development again.
`stop` and `pause` only pause work and preserve coding-thread continuations.
Registered participants cannot end development threads.

Threads created before durable registration can still recover from worker traces
through an explicit development continuation. Once recovered, their association
is saved for later restarts. Preserve unfinished work before manually retiring its
workspace.

The owner can steer coding tasks everywhere. Other human participants can steer
an active turn or continue a saved task only in guilds registered under
`developer_steering`. Guild `1521168712579682567` is initially registered; owner
feature commands can enable, disable, or remove guild registrations. Each follow-up includes fresh nearby thread messages
and attachment references, and `resolve_context` reads live history from that
thread. Bot and webhook messages do not steer coding tasks. Participant direction
stays within the existing task; only the owner can authorize a PR merge or
deployment. After a PR merge, continuing the task requires addressing the bot.

Before starting a coding turn, the worker checks Git metadata writes, scratch
storage and repository access through the actual Codex sandbox. A failed check
or sandbox initialization error fails the job and remains visible in the thread
and worker trace. Finishing a turn does not certify PR or CI completion.

Development turns have no fixed job deadline. The routed repository is the starting
checkout; the owner can request work in another accessible repository in the same
thread. Workers expose `$MINISAGO_REPOSITORIES_DIR` for additional checkouts,
using `OWNER/REPO` subdirectories. Clone with `gh repo clone`, create the branch
named by `$MINISAGO_GIT_BRANCH`, and reuse the checkout on follow-ups. Read each
repository's applicable `AGENTS.md` and `AGENTS.override.md` before working in it.
GitHub access follows the dedicated login. Release and GitHub workflow commands
are available for the requested repositories; publishing releases and mutating
workflows require an explicit owner request and the GitHub login's corresponding
permissions.

Development shells support `gh image` uploads and GitHub attachment downloads.
The Oracle image includes pinned `gh-image` v1.4.0; Mac workers need v1.4.0 or
later as a `gh-image` binary on PATH or the installed `drogers0/gh-image` extension. The uploader uses
the dedicated GitHub login internally. Token extraction, explicit session-token
flags, and nested command passthrough are blocked. Upload images separately and
include the returned Markdown in PR or issue bodies with ordinary `gh` commands.

The owner can authorize merging and deployment together in the initial request;
that authorization carries into task continuations. Verify the PR has merged
before deploying. For the configured MiniSago repository, development turns use
`deploy_minisago` with the full merged commit SHA when `MINISAGO_DEPLOY_SOCKET`
is configured. The tool works from the prepared feature checkout. Acceptance
queues deployment; the host reports the final result in the Discord thread.

Coding tasks can include image evidence in their final answer using Markdown such
as `![After](</absolute/path/to/screenshot.png>)`. The host uploads local PNG, JPEG,
GIF, and WebP images as native Discord attachments and preserves their captions.
Paths must be inside the starting checkout, additional checkouts under
`$MINISAGO_REPOSITORIES_DIR`, or that turn's output folder. Up to
10 images can be sent with an 8 MB combined limit. Code examples and remote URLs
do not trigger uploads; missing or rejected images leave the answer intact with
an attachment failure note.

Run `bash scripts/test-dev-sandbox.sh` to check the pinned Linux runtime without
credentials or a model call. On AppArmor hosts, first load the existing
production profile with `sudo apparmor_parser -r scripts/test-fixtures/worker-security/minisago-worker.apparmor`.
The smoke test uses copies of production's AppArmor and seccomp profiles and
verifies readiness, continuation and denial of writes outside the task as UID 1000. It changes no production configuration.
