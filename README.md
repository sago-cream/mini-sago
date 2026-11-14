# mini sago

<img src="site/public/images/minisago3.png" alt="mini sago icon" width="160">

An AI-powered Discord bot for conversation, channel summaries, emoji management,
and development through T3 coding sessions.

Set `OPENAI_API_KEY` on the worker to run chat, voice replies, routing, and
digests through the regular OpenAI Responses API. Without a key, chat uses the
worker's ChatGPT-authenticated Codex runtime. See [API chat setup](docs/workers.md#openai-api-chat).

Check out the full feature list on our [site](https://mini.sagocream.com/).

Mention MiniSago or reply to her message to continue a conversation. Automatic
90-second follow-ups are off in every guild by default; the owner can opt a guild
in through [`automatic_followups` registration](docs/feature-registration.md).

Sago resolves names inside server nicknames such as `工作組_小明` when matching
channel participants or explicitly requested mentions. Ambiguous names stay
unresolved. See [member lookup](docs/configuration.md#discord-member-lookup).

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

Reply to a poll message and ask who reacted. Sago reads live reaction counts and
voter accounts, including server nicknames, without screenshots. See
[reaction lookup](docs/configuration.md#discord-reaction-lookup).

When shared public links are relevant to an answer, Sago reads the pages before
making claims about their contents and cites the sources. Websites and original
or fixed-preview Threads, X/Twitter, and Instagram links use one reader. X profile
links read up to 20 recent authored posts, including replies and media URLs, via
FxTwitter; this limited window is not a complete timeline. Failed
or truncated reads are reported; previews do not establish full articles or
unseen videos. Protected sources use their authorized tools. Broader Threads
searches (`海巡脆`) still require an explicit request. See
[link reading configuration](docs/configuration.md#shared-links-and-threads-search).

Gamer forum subscriptions forward new Mahjong Soul gift-code posts and send each
recognized code in its own plain-text message for easy copying on mobile. See
[Gamer forum notifications](docs/configuration.md#gamer-forum-notifications).

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

Start with the [self-host guide](docs/self-host.md), or read the
[Traditional Chinese guide on the website](https://mini.sagocream.com/self-host/).
It walks through the requirements, Discord application, bot configuration,
separate chat worker, first-response checks, and ongoing operation.

The basic setup needs a Discord application, [Bun](https://bun.sh/), a host for
the bot, and an authenticated chat worker. Owner coding also needs a separate
T3 environment. Optional integrations can be added after chat is working.

Before submitting code, run `bun run build`, `bun run --cwd worker build`,
`bun run format:check`, and the tests relevant to your change. See the
[website README](site/README.md) for its independent setup and checks.

## Voice credits

Her voice chat uses **VOICEVOX:猫使ビィ**.
See the [VOICEVOX terms](https://voicevox.hiroshiba.jp/term/) and
[猫使 voice library terms](https://nekotukarb.wixsite.com/nekonohako/利用規約).

When hosting the bot, link this credits section from its Discord profile so
listeners can find the attribution.
