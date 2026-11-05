# MiniSago website

A Next.js landing page and an interactive feature guide, scaffolded with
`npm create rail`. The landing page introduces natural-language use with
four animated Discord examples covering playful chat, emoji management, discussion
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
repository's self-host guide for readers who want their own instance. The feature
guide fills the viewport, with independent scrolling for the sidebar and the
conversation; a minimal footer contains the access-scope note.

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
sharing metadata use this origin. `/sitemap.xml` lists the four public pages and
`/robots.txt` allows crawling and points to the sitemap. Submit the sitemap and
request indexing of the homepage in Google Search Console after deployment.
The public ownership-verification tag lives in `src/app/layout.tsx`; keep it in
place to retain Search Console verification, or replace it for your own instance.

Update `src/features.ts` when capabilities or access requirements change, including
the example conversations and any setup notes. `SELF_HOST_URL` links to the
README's self-host section.

The hero and avatar use the original `public/images/minisago3.png` artwork.
Keep the asset unchanged.

The GitHub logo is from [SVGL](https://svgl.app/); its license is in
`public/logos/SVGL-LICENSE.txt`.

## Demo reply sources

The conversational replies in `src/demo-replies.json` are sampled model outputs,
not independently written marketing dialogue. `src/demo-copy-provenance.json`
records each request, model/effort, compiled-prompt hash and successful fixture
tools. `src/demo-reply.ts` adapts Markdown, fixture mentions and custom emoji to
the existing presentation blocks without rewriting the words.

Generate fresh candidates from the repository root:

```sh
bun scripts/generate-site-replies.ts --output /tmp/site-replies.json
# One whole conversation, preserving earlier generated replies:
bun scripts/generate-site-replies.ts --conversation memory --output /tmp/memory-replies.json
```

The runner uses the production `buildPromptPlan`, output schemas and community
chat profile; spoken samples use the production voice profile. Core tool schemas
come from the real MCP registrations. Integration results are local fixtures in
`scripts/fixtures/site-demo-copy.ts`; media, Mac and campus tools have local
fixture schemas. No Discord, Google, file-upload or image-generation action runs.
The Codex CLI needs an existing ChatGPT sign-in; `--codex`, `--codex-home`,
`MINISAGO_CODEX_PATH` and `MINISAGO_CODEX_HOME` select the local runtime.

Review candidate facts and successful tool calls before replacing the selected
reply text and provenance. Sampling is nondeterministic. Keep fixture account IDs
consistent across turns and keep user prompts aligned with the shown replies.
Do not add a separate personality prompt, copy an old demo answer into model
context, or force jokes into ordinary task results. Automated reminders, webhook
notices, Calendar confirmation cards and T3/Codex updates use their own delivery
formats; the calendar example has no extra chat acknowledgement when the tool
already delivered its card. All sample data stays labelled as illustrative.
