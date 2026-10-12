# MiniSago

<img src="assets/minisago.png" alt="MiniSago icon" width="160">

A Codex-powered Discord assistant for conversations, files, reminders, and development.

[Website](https://minisago.sagocream.com/) ·
[Feature guide](https://minisago.sagocream.com/features/) ·
[Privacy](https://minisago.sagocream.com/privacy/) ·
[Terms](https://minisago.sagocream.com/terms/)

The website introduces MiniSago, shows how to use her through Discord examples,
and explains access. This repository covers self-hosting, configuration, and development.

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

## Website development

The website lives in [`site/`](site/README.md). From the repository root:

```sh
npm --prefix site ci
bun run dev:site
npm --prefix site run check
```

The dev server runs at `http://localhost:3101`. Root `bun dev` starts the Discord
bot and requires the configuration described in [Discord setup](docs/discord-setup.md).
The website exports static files to `site/out/` and needs no bot credentials.

## Voice credits

MiniSago's voice chat uses **VOICEVOX:猫使ビィ**.
See the [VOICEVOX terms](https://voicevox.hiroshiba.jp/term/) and
[猫使 voice library terms](https://nekotukarb.wixsite.com/nekonohako/利用規約).

When hosting the bot, link this credits section from its Discord profile so
listeners can find the attribution.
