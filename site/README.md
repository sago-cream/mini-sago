# MiniSago website

A Next.js landing page and an interactive feature guide, scaffolded with
`npm create rail`. The landing page introduces natural-language use with
three animated Discord examples, each focused on emoji management, discussion
summaries, or spreadsheet processing. `/features/` groups detailed capabilities in a sidebar;
each selection plays a sample conversation. Examples play once when visible,
disable replay during playback, and show the conversation without animation for
reduced motion. Calendar examples wait for confirmation or cancellation; their
buttons affect only the local demonstration. Slash-command replies use Discord's
private-response layout. Time skips show reminders arriving and subscriptions
posting again; explanatory captions and sample sources identify illustrative data.

The guide groups features by task: conversation, information lookup, file
processing, office work, Discord tools, and development. Settings are a separate
sidebar item. Conversation summaries include older channel discussions; web
search has its own example.

The temporary sidebar sorter lets reviewers drag categories and features, move
features between categories, reset the preview, and copy the proposed order.
Alt+Up/Down reorders the focused item; Alt+Left/Right moves a feature between
categories. Drafts stay in browser local storage and do not change `src/features.ts`
or the copy review page. Apply a submitted order to the catalogue only when requested.

Both pages explain access through shared Discord servers and link to the
repository's self-host guide for readers who want their own instance.

`/features/review/` shows all feature descriptions, complete conversations, and
notes together without playback, for reviewing and annotating the copy in Codex.

`/privacy/` explains the hosted bot's data processing and deletion requests;
`/terms/` explains access, acceptable use, and service limitations. Both use the
shared header and footer. The support address and policy update date live in
`src/policies.ts`. Review these pages when data handling or service scope changes;
self-hosted operators need policies that match their own setup.

From the repository root:

```sh
npm --prefix site ci
bun run dev:site
npm --prefix site run check
```

The website dev server runs at `http://localhost:3101`. Root `bun dev` starts
the Discord bot; it requires bot credentials and an owner ID.

`check` runs TypeScript, ESLint, Prettier, and a production build. The build
exports a static site to `site/out/`; serve that directory with any static host.
No bot credentials or backend connection are needed.

Update `src/features.ts` when capabilities or access requirements change, including
the example conversations and any setup notes. `SELF_HOST_URL` links to the
README's self-host section.

The hero and avatar use the original `public/images/minisago3.png` artwork.
Keep the asset unchanged.

The GitHub logo is from [SVGL](https://svgl.app/); its license is in
`public/logos/SVGL-LICENSE.txt`.
