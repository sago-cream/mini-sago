# MiniSago

<img src="assets/minisago.png" alt="MiniSago icon" width="160">

A Discord bot for... everything?
Codex-powered chat with server context, emote creation and cross-server migration, manage issue or publish PR based on discussion context, maintain PR review thread life cycle, set reminders, process images, access files from my Mac, you name it.

## Features

Availability depends on configured workers, integrations, and server/channel access.

- Reacts to community messages with emotes in configured servers and nudges a designated member about frequent quick replies.
- Answers member and configured role mentions, replies, and owner DMs using attachments, public web search, and accessible Discord history. `/ask` returns an answer visible only to its requester.
- Remembers and updates server-specific vocabulary and facts taught in chat.
- Resolves and pings named server members on request. The owner can also request messages to a chosen channel.
- Pauses replies and automatic activity in a channel or thread when asked.
- Joins Discord voice channels for spoken conversations. **WIP and far from usable:** recognition, response latency, and turn-taking still need work.
- Adds emojis and stickers from attachments, copies emojis between servers, and renames emojis for the owner.
- Processes images, extracts video frames, converts audio/video/GIF files, and runs bounded Python calculations on Linux workers.
- Publishes daily TOEFL vocabulary, AniGamer forum voucher code updates, and configured X account posts to subscribed channels.
- Improves Instagram, Twitter/X, and Threads embeds with `kkinstagram.com`, `fxtwitter.com`, and `fixthreads.seria.moe` links.
- Creates, lists, edits, and cancels one-time or recurring reminders, with a ping when they are due.
- Watches GitHub activity and maintains PR review threads for configured repositories.
- Finds files in allowlisted folders on the owner's Mac and sends requested files in chat.
- Searches Threads on request for 清大, NTHU, 學生會 plus optional extra keywords.
- Searches approved [NTHUSA shared drives](docs/configuration.md#nthusa-shared-drive) and reads documents subject to Discord role and file permission checks.
- Checks office availability, looks up invitees, and creates, edits, or cancels [Calendar events and invitations](docs/configuration.md#discord-calendar-and-contact-directory) after requester confirmation in registered servers.
- Reads the shared Kyushu itinerary and, when configured, edits its schedule on request.
- Queries NTHU Campus Assistant for campus search, buses, courses, announcements, dining, libraries, newsletters, and electricity information when available.
- Retrieves relevant CCXP meeting records during discussions in owner-registered servers. The independent Oracle collector supports owner-requested refreshes and DMs the owner when login needs attention.
- Runs owner-requested coding tasks in dedicated Discord threads with progress reports, steering, stop, and continuation, then publishes draft PRs and performs merges or configured MiniSago deployments only when authorized.
- Reports MiniSago deployment outcomes in Discord and DMs Sago Media access requests to the owner.
- Reports the answering worker's Codex usage, remaining capacity, and reset times.
- Lets the owner change [feature access, role filters, and background-posting subscriptions](docs/configuration.md#persistent-state) without deploying.

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
