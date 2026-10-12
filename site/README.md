# MiniSago website

A Next.js landing page and an interactive feature guide, scaffolded with
`npm create rail`. The landing page introduces natural-language use with an
three animated Discord examples. `/features/` groups detailed capabilities in a sidebar;
each selection plays a sample conversation. Examples play once when visible,
support pause/replay, and show the complete conversation for reduced motion.

Both pages explain access through shared Discord servers and link to the
repository's self-host guide for readers who want their own instance.

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
