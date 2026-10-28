# mini sago

<img src="site/public/images/minisago3.png" alt="mini sago icon" width="160">

An AI-powered Discord bot for... everything? From chatting, channel summary, moving emotes between server, to development. She can totally change how you use Discord.

Check out the full feature list on our [site](https://mini.sagocream.com/).

Mention MiniSago or reply to her message to continue a conversation. Automatic
90-second follow-ups are off in every guild by default; the owner can opt a guild
in through [`automatic_followups` registration](docs/feature-registration.md).

Owner development requests use replied-to messages, forwarded content, and
screenshots to choose a starting repository. Development threads can work across
accessible GitHub repositories in one conversation, keeping each task’s checkouts and progress for follow-ups across
service restarts. The owner can say `end dev thread` to return a development
thread to ordinary chat without merging a PR. See
[development workers](docs/workers.md).

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

X subscriptions collect new posts every five minutes and send a Traditional
Chinese digest with original links every evening at 21:00 Asia/Taipei. Pending
posts and delivery progress survive restarts; unavailable workers or failed
destinations retry on later polls. Operators can select digest services or
restore instant reposts. See [X digest configuration](docs/configuration.md#x-post-digests).

## Self-host mini sago

You will need a Discord application, a VPS or some machine to throw her on , an agent worker (I used Codex here), and [Bun](https://bun.sh/).

Start with [Discord setup](docs/discord-setup.md) and
[worker setup](docs/workers.md). And according to your need, see also:

- [Architecture](docs/architecture.md)
- [Configuration](docs/configuration.md)
- [Security](docs/security.md)
- [Feature registration and access](docs/feature-registration.md)
- [Read-only Gmail setup](docs/mail.md)
- [Operations](docs/operations.md)
- [Bot management](docs/bot-management.md)
- [CCXP meeting retrieval and password rotation](docs/ccxp-meetings.md)
- [Durable-state backup and restore](docs/operations.md#durable-state-backup-and-restore)

(Slops, better let agents read it :skull:)

## Voice credits

Her voice chat uses **VOICEVOX:猫使ビィ**.
See the [VOICEVOX terms](https://voicevox.hiroshiba.jp/term/) and
[猫使 voice library terms](https://nekotukarb.wixsite.com/nekonohako/利用規約).

When hosting the bot, link this credits section from its Discord profile so
listeners can find the attribution.
