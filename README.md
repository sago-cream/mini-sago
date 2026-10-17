# mini sago

<img src="site/public/images/minisago3.png" alt="mini sago icon" width="160">

An AI-powered Discord bot for... everything? From chatting, channel summary, moving emotes between server, to development. She can totally change how you use Discord.

Check out the full feature list on our [site](https://mini.sagocream.com/).

Mention MiniSago or reply to her message to continue a conversation. Automatic
90-second follow-ups are off in every guild by default; the owner can opt a guild
in through [`automatic_followups` registration](docs/feature-registration.md).

Owner development threads can work across accessible GitHub repositories in one
conversation, keeping each task’s checkouts and progress for follow-ups across
service restarts. See
[development workers](docs/workers.md).

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
