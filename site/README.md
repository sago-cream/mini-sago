# MiniSago website

A Next.js landing page and an interactive feature guide, scaffolded with
`npm create rail`. The landing page introduces natural-language use with
three animated Discord examples covering emoji management, discussion
summaries, and spreadsheet processing. `/features/` groups detailed capabilities in a sidebar;
each selection plays a sample conversation. Examples play once when visible,
disable replay during playback, and show the conversation without animation for
reduced motion. Calendar examples wait for confirmation or cancellation; their
buttons affect only the local demonstration. Slash-command replies use Discord's
private-response layout. Time skips show reminders arriving and subscriptions
posting again; explanatory captions and sample sources identify illustrative data.

The guide groups features by task: conversation, information lookup, office work,
Discord tools, and development. Office work includes file processing, Mac file
retrieval, calendar actions, and feature settings. Conversation summaries include
older channel discussions; web search has its own example.

The landing page explains access through shared Discord servers and links to the
website's `/self-host/` guide for readers who want their own instance. The feature
guide fills the viewport, with independent scrolling for the sidebar and the
conversation; a minimal footer contains the access-scope note. On mobile, a
modal picker gives the feature categories their own scrollable space and returns
focus to the selector when dismissed. Feature notes and access scope share a
usage disclosure below the conversation, leaving more room to read the demo.

`/self-host/` walks through prerequisites, Discord setup, core configuration,
worker authentication, verification, troubleshooting, and ongoing operation in
Traditional Chinese. It links to `docs/self-host.md` for the English walkthrough
and to the detailed repository runbooks. Keep both walkthroughs aligned when
the setup changes. The shared navigation, homepage, and terms page link here.

`/privacy/` explains the hosted bot's data processing and deletion requests;
`/terms/` explains access, acceptable use, service limitations, and the
`VOICEVOX:猫使ビィ` voice credit at `/terms/#voice-credits`. Both use the
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

The production origin is `https://mini.sagocream.com`. Canonical URLs and social
sharing metadata use this origin. `/sitemap.xml` lists the five public pages and
`/robots.txt` allows crawling and points to the sitemap. Submit the sitemap and
request indexing of the homepage in Google Search Console after deployment.
The public ownership-verification tag lives in `src/app/layout.tsx`; keep it in
place to retain Search Console verification, or replace it for your own instance.

Update `src/features.ts` when capabilities or access requirements change, including
the example conversations and any setup notes. `SELF_HOST_URL` links to the
website's `/self-host/` page.

The hero and avatar use the original `public/images/minisago3.png` artwork.
Keep the asset unchanged.

The GitHub logo is from [SVGL](https://svgl.app/); its license is in
`public/logos/SVGL-LICENSE.txt`.
