# mini sago

<img src="site/public/images/minisago3.png" alt="mini sago icon" width="160">

An AI-powered Discord bot for conversation, channel summaries, emoji management,
and development through T3 coding sessions.

Check out the full feature list on our [site](https://mini.sagocream.com/).

Mention MiniSago or reply to her message to continue a conversation. Automatic
90-second follow-ups are off in every guild by default; the owner can opt a guild
in through [`automatic_followups` registration](docs/feature-registration.md).

Owner coding requests open a persistent T3 session in a registered project.
Reply in the Discord thread or open its T3 link to continue the same work, with
the project's normal model, skills, tools, and permission mode. Assistant updates
appear in Discord, including work continued in T3. `stop`, `status`, and
`end dev thread` control the connection without deleting the T3 workspace.
See [T3 coding setup](docs/t3-coding.md).

Ask Sago to generate an image or edit an attachment, avatar, or existing emoji.
She sends the result back as a Discord attachment and can add an edited copy as
an emoji or sticker when requested. Image generation uses the Linux worker's
ChatGPT sign-in; no separate API key is needed. See
[image generation and emoji edits](docs/workers.md#image-generation-and-emoji-edits).

When shared public links are relevant to an answer, Sago reads the pages before
making claims about their contents and cites the sources. Websites and original
or fixed-preview Threads, X/Twitter, and Instagram links use one reader. Failed
or truncated reads are reported; previews do not establish full articles or
unseen videos. Protected sources use their authorized tools. Broader Threads
searches (`海巡脆`) still require an explicit request. See
[link reading configuration](docs/configuration.md#shared-links-and-threads-search).

X subscriptions check for new posts every five minutes and repost them individually.
Daily Traditional Chinese digests are opt-in per service; only Holodori
(`@hololive_dreams`) is opted in by default, with original links every evening
at 21:00 Asia/Taipei. Pending posts and delivery progress survive restarts;
unavailable workers or failed
destinations retry on later polls. Operators can opt in other services or
disable digests. See [X digest configuration](docs/configuration.md#x-post-digests).

The owner can ask Sago to inspect Discord slash-command registration and command
permissions, or explicitly resync `/ask` to one guild without replacing other
commands. Chat feature enablement and Discord command registration are separate.
See [slash-command diagnostics](docs/bot-management.md#slash-command-diagnostics-and-repair).

## Self-host mini sago

You need a Discord application, a host for the bot, a Codex chat worker, and
[Bun](https://bun.sh/). Owner coding also needs a separate T3 environment.

Start with [Discord setup](docs/discord-setup.md) and
[worker setup](docs/workers.md). Use these guides for the rest of your setup:

- [T3 coding setup](docs/t3-coding.md)
- [Architecture](docs/architecture.md)
- [Configuration](docs/configuration.md)
- [Security](docs/security.md)
- [Feature registration and access](docs/feature-registration.md)
- [Read-only Gmail setup](docs/mail.md)
- [Operations](docs/operations.md)
- [Bot management](docs/bot-management.md)
- [CCXP meeting retrieval and password rotation](docs/ccxp-meetings.md)
- [Durable-state backup and restore](docs/operations.md#durable-state-backup-and-restore)

For local bot development, install both dependency sets and configure
`.env.local` using the Discord and worker guides:

```bash
bun install --frozen-lockfile
bun install --cwd worker --frozen-lockfile
cp .env.example .env.local
bun run dev
```

Run only one Gateway connection per bot token. Set
`DISCORD_GATEWAY_DISABLED=true` for a local HTTP-only instance when production
uses the same token. `bun run dev` starts the bot; run the worker separately
following [worker setup](docs/workers.md).

Before submitting code, run `bun run build`, `bun run --cwd worker build`,
`bun run format:check`, and the tests relevant to your change. See the
[website README](site/README.md) for its independent setup and checks.

## Voice credits

Her voice chat uses **VOICEVOX:猫使ビィ**.
See the [VOICEVOX terms](https://voicevox.hiroshiba.jp/term/) and
[猫使 voice library terms](https://nekotukarb.wixsite.com/nekonohako/利用規約).

When hosting the bot, link this credits section from its Discord profile so
listeners can find the attribution.
