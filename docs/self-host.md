# Self-host MiniSago

This guide gets a private instance from a fresh checkout to its first Discord
reply. Follow the steps in order, then add optional integrations.
For Traditional Chinese, use the [website guide](https://mini.sagocream.com/self-host/).

## 1. Prepare the services

MiniSago runs as separate services:

| Component                 | What it does                                                      | What you need                                                             |
| ------------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Bot core                  | Connects to Discord, checks access, and stores bot state          | A Discord application, Bun, and a host                                    |
| Chat worker               | Runs chat and request-scoped tools; connects outbound to the core | Codex authentication, persistent storage, and access to the core's bridge |
| T3 environment (optional) | Runs owner coding sessions                                        | A separately configured T3 project and provider                           |

For the Linux worker path below, prepare Docker Engine with the Compose plugin.
For a Mac worker, use the [Mac helper setup](workers.md#mac-helper) instead.
Use HTTPS for the bot's public origin and preserve WebSocket upgrades. The
worker needs outbound HTTPS and WSS; it does not need a public inbound port.
See [Architecture](architecture.md) for the service boundaries.

## 2. Create the Discord application

1. Create an application and bot in the Discord Developer Portal.
2. Enable **Bot → Privileged Gateway Intents → Message Content**.
3. Set **Installation → Install Link** to **Discord Provided Link**.
4. Record the application ID, bot token, your user ID, and your test server ID.

Keep the bot token in your private environment file. The remaining installation
and permissions details are in [Discord setup](discord-setup.md).

## 3. Configure and start the bot core

```bash
git clone https://github.com/sago-cream/mini-sago.git
cd mini-sago
bun install --frozen-lockfile
bun install --cwd worker --frozen-lockfile
cp .env.example .env.local
chmod 600 .env.local
openssl rand -hex 32
```

Save the generated secret privately and edit `.env.local` before starting:

| Setting                          | Value for your instance                              |
| -------------------------------- | ---------------------------------------------------- |
| `DISCORD_APPLICATION_ID`         | Your Discord application ID                          |
| `DISCORD_BOT_TOKEN`              | Your bot token                                       |
| `DISCORD_GUILD_ID`               | Your test server ID; also scopes `/ask` registration |
| `MINISAGO_CHATBOT_OWNER_USER_ID` | Your Discord user ID                                 |
| `MINISAGO_CHATBOT_GUILD_IDS`     | Server IDs allowed to use chat, separated by commas  |
| `MINISAGO_WORKER_BRIDGE_SECRET`  | The generated secret for the Linux worker            |

Review the full example before starting. Replace sample IDs, domains, and
service destinations with your own settings. In particular, review scheduled
monitors and optional calendar, mail, and campus integrations; copying the
example does not configure those services for your instance. See
[Configuration](configuration.md) and [feature registration](feature-registration.md).

```bash
bun run sync:install
bun run dev
```

Install the bot in your test server using its Discord-provided link with the
`bot` scope. Confirm the bot role can view the test channel, send messages,
and read history; [Discord setup](discord-setup.md#permissions) lists the full
permission set.

The core listens on port `3000` by default. Put it behind your HTTPS reverse
proxy and forward `/api/mac-agent/ws` with WebSocket upgrade headers. For
example, if your origin is `https://bot.example.com`, the worker bridge URL is
`wss://bot.example.com/api/mac-agent/ws`.

**Run one Gateway-enabled core per bot token.** If another deployment already
uses the token, set `DISCORD_GATEWAY_DISABLED=true` on a temporary HTTP-only
instance. It will not receive Discord messages through the Gateway.

## 4. Connect a chat worker

From the same checkout, prepare the Linux worker environment:

```bash
cp .env.worker.example .env.worker
chmod 600 .env.worker
```

Set these values in `.env.worker`:

| Setting                          | Value                                                        |
| -------------------------------- | ------------------------------------------------------------ |
| `MINISAGO_BRIDGE_URL`            | Your core's `wss://…/api/mac-agent/ws` URL                   |
| `MINISAGO_MAC_BRIDGE_SECRET`     | The same value as the core's `MINISAGO_WORKER_BRIDGE_SECRET` |
| `MINISAGO_CHATBOT_OWNER_USER_ID` | The same owner ID as the core                                |
| `OPENAI_API_KEY` (optional)      | A private project API key to use the OpenAI API for chat     |

The Linux worker uses `MINISAGO_MAC_BRIDGE_SECRET` despite the variable's name.
Keep credentials and Codex state in the worker's persistent volumes.

```bash
docker compose --project-directory . -f deploy/compose.worker.yaml build
docker compose --project-directory . -f deploy/compose.worker.yaml run --rm \
  worker codex login --device-auth
docker compose --project-directory . -f deploy/compose.worker.yaml up -d
docker compose --project-directory . -f deploy/compose.worker.yaml logs -f worker
```

Without `OPENAI_API_KEY`, chat uses the worker's ChatGPT-authenticated Codex
runtime. With a key, chat uses the regular OpenAI Responses API; retain the
Codex sign-in for image generation. See [API chat setup](workers.md#openai-api-chat).

The headless worker also attempts Skillbook synchronization by default.
Follow [worker setup](workers.md#oracle-worker) for its dedicated GitHub login,
authentication, persistent volumes, and sandbox details. Skillbook sync does
not block the worker's chat connection.

## 5. Verify the first reply

1. Check `curl https://bot.example.com/api/health`, replacing the origin.
   Expect `ok: true`, the required configuration flags, and at least one
   available worker. `mac: offline` is normal if no Mac helper is connected.
2. Mention the bot in an allowed test channel and ask a short question.
3. Try `/ask` in the server selected by `DISCORD_GUILD_ID`; its answer is private
   to the requester.

If the bot does not answer:

| Symptom                                | Check                                                                                                                                           |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| Gateway closes with `4014`             | Enable the Message Content intent                                                                                                               |
| No available worker                    | Match the bridge secrets and owner IDs; check WSS, Codex login, capacity, and worker logs                                                       |
| Bot is connected but ignores a channel | Check chat access IDs, feature registration, and Discord channel permissions                                                                    |
| `/ask` is missing                      | Check application/guild IDs and rerun `bun run sync:install`; see [command diagnostics](bot-management.md#slash-command-diagnostics-and-repair) |

See [worker recovery](operations.md#worker-unavailable) for further diagnosis.

## 6. Keep the instance running

`bun run dev` is a development process. For continuous operation, use a service
manager or the published core image, configure the production environment, and
persist `/app/state`. Keep the worker's Codex authentication and storage
persistent too. [Operations](operations.md#container-images) describes the
images, HTTPS routes, logs, and release process. The Sago Cloud deployment
section is specific to the maintainer's infrastructure.

Back up your bot state and credentials before replacing services. Adapt the
[backup and restore runbook](operations.md#durable-state-backup-and-restore)
to your own storage and recovery account. Review [Security](security.md) and
publish privacy/contact information for your own instance.

## Optional integrations and reference

| Goal                                                     | Guide                                                                                                                  |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| Enable features for selected servers, channels, or roles | [Feature registration and access](feature-registration.md)                                                             |
| Add owner coding sessions                                | [T3 coding setup](t3-coding.md)                                                                                        |
| Retrieve files from an unlocked Mac                      | [Mac helper](workers.md#mac-helper)                                                                                    |
| Add voice replies                                        | [Discord voice setup](discord-setup.md#permissions) and [voice diagnostics](operations.md#voice-diagnostics-dashboard) |
| Connect read-only Gmail                                  | [Mail setup](mail.md)                                                                                                  |
| Retrieve CCXP meeting records                            | [CCXP setup and password rotation](ccxp-meetings.md)                                                                   |
| Inspect commands, status, or bot permissions             | [Bot management](bot-management.md)                                                                                    |

If you enable voice, credit **VOICEVOX:猫使ビィ** and link the
[voice credits](../README.md#voice-credits) from your bot's Discord profile.

For code contributions, use the checks in the [README](../README.md#self-host-mini-sago).
The [website README](../site/README.md) covers the static site separately; the
website can build without bot credentials or a worker.
