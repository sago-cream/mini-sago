# Workers

MiniSago's chat and Mac file workers connect outbound to the hosted bridge.
Owner coding runs in a separate [T3 environment](t3-coding.md).

## Shared requirements

Every worker needs:

- a working Codex executable and isolated Codex home;
- a bridge URL and 32-byte-or-longer profile secret;
- the same `MINISAGO_CHATBOT_OWNER_USER_ID` as the hosted service; and
- outbound HTTPS and WSS.

The optional worker Skillbook synchronizer also needs a dedicated authenticated
GitHub CLI login. It is enabled by default on headless workers and opt-in on Mac
helpers through `MINISAGO_SKILLBOOK_REPOSITORY`.
T3 coding uses its own installed skills and provider configuration. Worker
repository discovery is not required for chat or T3 project selection.

Skillbook synchronization runs in the background. Worker connection, Mac session
monitoring, and chat availability do not wait for GitHub. Health and availability
reports still include the current sync status and failures.

## Oracle worker

Use an OCI Ampere A1 Compute VM rather than Container Instances because Codex
authentication, traces, and optional GitHub/Skillbook state need persistent storage.
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

If Skillbook sync is enabled, authenticate its dedicated fine-grained GitHub
login over standard input:

```bash
docker compose --project-directory . -f deploy/compose.worker.yaml run --rm \
  worker gh auth login --hostname github.com --git-protocol https --with-token
docker compose --project-directory . -f deploy/compose.worker.yaml up -d --force-recreate
docker compose --project-directory . -f deploy/compose.worker.yaml exec worker gh auth status
```

The GitHub login is used by the optional worker Skillbook synchronizer. Coding
credentials belong to the T3 environment.

Never put the token in `.env.worker`, Discord, a Codex request, a shell
argument, or the repository. Do not expose Docker, Codex, SSH, or workspace
volumes publicly.

## Mac helper

Prerequisites are Bun, Xcode command-line tools including `swiftc`, an existing
`~/.codex/auth.json`, and the Mac profile secret configured on both the helper
and hosted service.

Install the helper:

```bash
bun run mac-agent:install
bun run mac-agent:status
```

The installer consumes `.env.local`, creates an isolated Codex home linked to
the existing authentication file, and installs the per-user LaunchAgent
`dev.hsichen.minisago-mac-agent`.
It discovers the current or legacy app-bundled Codex executable and resolves
npm installations to their native binary so the helper can run with its
restricted PATH. Set `MINISAGO_CODEX_PATH` to select a particular installation.

If you enable Skillbook sync on the Mac helper, authenticate its isolated GitHub
login first:

```bash
GH_CONFIG_DIR="$HOME/Library/Application Support/MiniSago/github" gh auth login --hostname github.com --git-protocol https --with-token
```

The helper connects only while the user session is unlocked, disconnects
before sleep or lock, and reconnects afterward. Display sleep without a session
lock does not disconnect it. Missed requests are never replayed.

By default, owner file requests are limited to Desktop, Documents, Downloads,
Movies, Music, Pictures, and iCloud Drive. Override those roots with
`MINISAGO_MAC_FILE_ROOTS`.

## OpenAI API chat

Set `OPENAI_API_KEY` in the worker's private environment file and recreate the
worker to use the regular OpenAI Responses API for chat, voice replies, owner
routing, social-action decisions, and X digests. Use a project key belonging to
the organization that receives your API credits. API usage is billed to that
organization; it does not consume the ChatGPT subscription's Codex allowance.
The key is never forwarded to Discord, MCP tools, Python, or Codex processes.
For the Mac fallback, set the same key in `.env.local` before running
`bun run mac-agent:install`; the installer copies it to the private `agent.env`.

The API backend keeps the same model profiles, prompts, conversation context,
attachment preparation, structured replies, voice streaming, and request-scoped
Discord and media tools. MCP calls still run locally through the authenticated,
permission-bound host. Web search uses the Responses API's web search tool.
Requests keep their existing deadlines, and API errors do not silently fall
back to subscription usage. Health reports `chatBackend: "openai-api"`.

Keep ChatGPT authentication for bounded Mac file work and the separate image
generator. Claiming Pro API credits can disable Codex API-key access for the
linked organization; this backend calls the regular Responses API directly.
It does not authenticate Codex with the key. Owner coding continues in T3 using
that environment's provider configuration.

To return chat to its Codex backend, remove `OPENAI_API_KEY` and recreate the
worker. Keep private environment files outside version control with mode 600.

## Authentication and capacity

ChatGPT device authentication can expire and remains subject to account plan
limits. It is not an uptime guarantee. A worker reports availability and
`MINISAGO_MAX_CONCURRENT_JOBS`; the hosted service prefers Oracle, falls back to
Mac when Oracle is full or unavailable, and routes explicit Mac work only to
Mac.

See [Security](security.md) for credential and sandbox boundaries and
[Operations](operations.md) for logs, recovery, deployment, and removal.

The Oracle image includes Python 3 with `venv` support for bounded media work.
Chat jobs do not receive arbitrary Python or shell execution. Media work
uses the image's FFmpeg binaries only through MiniSago's request-local typed MCP
tools.

## Image generation and emoji edits

Linux chat requests expose `generate_image` through the media
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
including when it is also added as an emoji or sticker. Chat threads deliver it once, even if the model omits an attachment reference.
Subsequent requests can reply to that Discord attachment to edit it again.
Generation has a four-minute limit within the request's five-minute budget;
prefer one generation or edit per request. Failures report that no image was
produced instead of substituting a procedural drawing.

## Coding sessions

See [Discord coding with T3](t3-coding.md) for setup, controls, attachments,
recovery, and deployment. Chat workers reject repository execution jobs; coding
sessions use the T3 project's normal configuration and workspace lifecycle.
