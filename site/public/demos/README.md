# Discord demo fixtures

Captured image and spreadsheet results came from MiniSago tests in Sago Lab's `mini-sago` channel on
2026-10-12, using public MiniSago artwork and the sample CSV in this directory.

- `registration.csv`: uploaded sample data, 48 people across three groups.
- `python-539d1000-5711-4473-b722-73a64b3a80ad.zip`: the bot's actual response,
  containing `registration_summary.csv` and `registration_bar_chart.png`.
- `sago-site-demo.webp`: the `sago_site_demo` emoji created by the bot.
- `minisago-128.webp`: Discord's lossless WebP representation of the bot's
  transparent 128 × 128 PNG response.

The landing carousel combines these captured assets with illustrative flows for
image resizing and emoji migration, discussion summaries, and campus activities.
The document, image, and expression feature examples use the captured results.
The carousel's migration, campus lookup, and reminder dialogue is illustrative,
not a transcript of additional bot tests. The campus source link points to NTHU's
official shuttle information; the example does not specify current departures.
Other conversations illustrate capabilities; the calendar confirmation embed and
buttons follow `src/chatbot/calendar/calendar-message.ts`.

`meeting-sample.txt`, `threads-sample.txt`, and `welcome-plan.md` are fictional
source documents for the example conversations. They contain no private meeting,
Drive, or social-post data. PR numbers and people in the development flows are
illustrative; the examples do not create external work or publish changes.

The reminder delivery was checked with a one-time 45-second request in Sago Lab
on 2026-10-12. Its mention and clock prefix follow `src/server.ts`. The private
response's command context, blue edge, tint, and visibility footer were observed
in Discord web through an existing app's ephemeral command response; MiniSago's
`/ask` was not registered in that test guild. `visibility.svg` is the native eye
icon from that footer. Quiet mode follows the source's suppressed acknowledgement,
and the voice scenario labels illustrative transcripts and Japanese-only output.

`discord-avatar.png` is Discord's default blurple user avatar from
`https://cdn.discordapp.com/embed/avatars/0.png`, used consistently for example
users and their reply previews.

`discord-icons/` contains static composer SVG artwork observed in Discord web.
The demo uses Discord's native icon shapes with the neutral dark-theme color.
Discord and its interface artwork belong to Discord Inc.
