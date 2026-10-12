# Discord demo fixtures

These files came from MiniSago tests in Sago Lab's `mini-sago` channel on
2026-10-12, using public MiniSago artwork and the sample CSV in this directory.

- `registration.csv`: uploaded sample data, 48 people across three groups.
- `python-539d1000-5711-4473-b722-73a64b3a80ad.zip`: the bot's actual response,
  containing `registration_summary.csv` and `registration_bar_chart.png`.
- `sago-site-demo.webp`: the `sago_site_demo` emoji created by the bot.
- `minisago-128.webp`: Discord's lossless WebP representation of the bot's
  transparent 128 × 128 PNG response.

The landing page and document, image, and expression examples use these results.
Other conversations illustrate capabilities; the calendar confirmation embed and
buttons follow `src/chatbot/calendar/calendar-message.ts`.

`discord-icons/` contains static composer SVG artwork observed in Discord web.
The demo uses Discord's native icon shapes with the neutral dark-theme color.
Discord and its interface artwork belong to Discord Inc.
