# MiniSago

<img src="assets/minisago.png" alt="MiniSago icon" width="160">

A Discord bot for... everything?
Codex-powered chat with server context, emote creation and cross-server migration, manage issue or publish PR based on discussion context, maintain PR review thread life cycle, set reminders, process images, access files from my Mac, you name it.

## Features

Availability depends on configured workers, integrations, and server/channel access.

- **Chat:** Answers mentions, replies, owner DMs, and private `/ask` requests using attachments, web search, and accessible Discord history. Remembers server vocabulary and facts, pings named members on request, and supports quiet mode.
- **Discord tools:** Creates, lists, edits, and cancels one-time or recurring reminders. The owner can add emojis and stickers, copy emojis between servers, rename emojis, and request messages to chosen channels.
- **Voice and media:** Joins voice channels, processes images, extracts video frames, converts audio/video/GIF files, and runs bounded Python calculations on Linux workers. The owner can retrieve files from allowlisted Mac folders.
- **Integrations:** Searches [NTHUSA shared Drive](docs/configuration.md#nthusa-shared-drive) with role and file permission checks; checks office availability and manages [Calendar events and invitations](docs/configuration.md#discord-calendar-and-contact-directory) with requester confirmation and contact lookup. Reads and edits the configured Kyushu itinerary, queries NTHU Campus Assistant, searches Threads, and retrieves CCXP meeting records with owner-requested refreshes.
- **Feeds and notifications:** Posts TOEFL vocabulary, AniGamer voucher updates, and configured X feeds. Improves social embeds, relays GitHub activity, maintains PR review threads, reacts to community messages, and nudges a designated member about frequent quick replies. Reports deployment outcomes and notifies the owner about CCXP login issues and Sago Media access requests.
- **Coding tasks:** Runs owner-requested work in Discord threads with progress, steering, stop, and continuation. Publishes draft PRs and performs merges or configured MiniSago deployments only when authorized.
- **Controls and status:** Reports worker Codex usage, remaining capacity, and reset times. The owner can change [feature access, role filters, and posting subscriptions](docs/configuration.md#persistent-state) without deploying.

**Voice is WIP and far from usable:** recognition, response latency, and turn-taking still need work.

> [!TIP]
> Mention MiniSago under **Members/Apps**, or use a configured MiniSago role.
> When quoting her messages, disable reply ping to prevent triggering another reply.
> She searches only channels the requester can access, so feel free to continue to talk behind someone's back.

## Self-host MiniSago

MiniSago requires [Bun](https://bun.sh/), a Discord application, and a Codex
worker.

Start with [Discord setup](docs/discord-setup.md) and
[worker setup](docs/workers.md). See also:

- [Architecture](docs/architecture.md)
- [Configuration](docs/configuration.md)
- [Security](docs/security.md)
- [Operations](docs/operations.md)
- [CCXP meeting retrieval and password rotation](docs/ccxp-meetings.md)
- [Durable-state backup and restore](docs/operations.md#durable-state-backup-and-restore)

Dockerfiles and Compose configurations live in [`deploy/`](deploy/).

## Voice credits

MiniSago's voice chat uses **VOICEVOX:猫使ビィ**.
See the [VOICEVOX terms](https://voicevox.hiroshiba.jp/term/) and
[猫使 voice library terms](https://nekotukarb.wixsite.com/nekonohako/利用規約).

When hosting the bot, link this credits section from its Discord profile so
listeners can find the attribution.
